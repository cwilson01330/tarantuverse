import React, { createContext, useState, useContext, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, authEvents, AUTH_EXPIRED_EVENT } from '../services/api';
import { signInWithGoogle, signInWithApple, signOutFromGoogle, isGoogleSignInAvailable, type OAuthLoginResult } from '../services/google-signin';
import { getExpoPushToken } from '../services/notifications';
import { getErrorMessage } from '../utils/errors';
import { clearSharedCache } from '../lib/co-keepers';
import { deviceDefaultUnits, isUnits, type Units } from '../lib/units';
import {
  isNoAccountError,
  createSessionEpoch,
  isSignInMethod,
  makeNoAccountError,
  shouldRefresh,
  type SignInMethod,
} from '../lib/session';

// Re-export for convenience so login screens can import from one place
export { isGoogleSignInAvailable };

interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  // Keeper-profile fields — read by app/settings.tsx and the public
  // profile screens. `collection_visibility` is required everywhere
  // else (the API always sends it); the profile_* fields and
  // social_links are optional because older payloads may omit them.
  collection_visibility: string;
  profile_bio?: string | null;
  profile_location?: string | null;
  profile_experience_level?: string | null;
  profile_years_keeping?: number | null;
  profile_specialties?: string[] | null;
  social_links?: {
    instagram?: string | null;
    youtube?: string | null;
    website?: string | null;
    tiktok?: string | null;
    facebook?: string | null;
    morphmarket?: string | null;
    arachnoboards?: string | null;
  } | null;
  is_superuser?: boolean;
  is_admin?: boolean;
  /** Display units. null = never chosen (the device region decides and is
   *  saved once); undefined = an API too old to know the field. */
  measurement_units?: Units | null;
}

interface RegisterResponse {
  message: string;
  requires_email_verification: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // Resolve to true when the sign-in created the account — the caller uses it
  // to route a new keeper through onboarding. A password login can't be new
  // (registration is a separate screen), which is why only these two return it.
  //
  // `allowCreate: false` (the LOGIN screen) makes the server refuse to create
  // an account: the call then throws a NoAccountError (lib/session) whose
  // `createAccount()` finishes the sign-in with the same credentials if the
  // keeper confirms. Default true = the REGISTER screen / old behaviour.
  loginWithGoogle: (options?: { allowCreate?: boolean }) => Promise<boolean>;
  loginWithApple: (options?: { allowCreate?: boolean }) => Promise<boolean>;
  register: (
    email: string,
    username: string,
    password: string,
    display_name?: string,
    referral_code?: string
  ) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** How this device last signed in (kept across sign-out), for the login
   *  screen's "Last time you signed in with ..." line. null = never/unknown. */
  lastSignInMethod: SignInMethod | null;
  /** The keeper's display units, resolved: their saved choice, else the
   *  device region. Display only — storage never changes. */
  units: Units;
  /** Save a new choice (optimistic). Resolves false if the save failed. */
  setMeasurementUnits: (u: Units) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Longest launch waits on GET /auth/me before opening on the cached user. */
const AUTH_CHECK_MAX_WAIT_MS = 8000;

/** How the keeper last signed in. Deliberately NOT removed by logout() - it is
 *  the whole point of the login-screen hint. */
const LAST_METHOD_KEY = 'last_sign_in_method';
/** Epoch ms of the last /auth/refresh attempt (success or failure). */
const LAST_REFRESH_ATTEMPT_KEY = 'last_token_refresh_attempt';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSignInMethod, setLastSignInMethod] = useState<SignInMethod | null>(null);

  const rememberMethod = async (method: SignInMethod) => {
    setLastSignInMethod(method);
    try {
      await AsyncStorage.setItem(LAST_METHOD_KEY, method);
    } catch {
      // a hint only - never block a sign-in on it
    }
  };

  // Trade the stored token for a fresh one once it is more than a day old, so
  // an active keeper's 14-day clock keeps restarting instead of ending in a
  // forced sign-out. Reads the token from storage (not state) so it always acts
  // on what the next request would send, and so it does nothing after a 401 has
  // already cleared the session.
  //   - 401  -> the token is dead; the api interceptor signs the keeper out
  //            (/auth/refresh is deliberately NOT in its no-auto-logout list).
  //   - any other failure (offline, 5xx, timeout) -> keep the current token.
  //
  // Session epoch: sign-in, sign-out and a forced logout bump it as their very
  // first step. The refresh takes it before it starts and saves its result only
  // if it is unchanged, so a refresh that resolves just after logout can't
  // write the old session back.
  const sessionEpoch = useRef(createSessionEpoch()).current;
  const refreshInFlight = useRef(false);
  const refreshSession = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const epoch = sessionEpoch.snapshot();
    try {
      const current = await AsyncStorage.getItem('auth_token');
      if (!current) return;
      const lastRaw = await AsyncStorage.getItem(LAST_REFRESH_ATTEMPT_KEY);
      const last = lastRaw ? Number(lastRaw) : null;
      const now = Date.now();
      if (!sessionEpoch.isCurrent(epoch)) return;
      if (!shouldRefresh(current, Number.isFinite(last as number) ? last : null, now)) return;
      await AsyncStorage.setItem(LAST_REFRESH_ATTEMPT_KEY, String(now));

      const response = await apiClient.post('/auth/refresh');
      const fresh: string | undefined = response.data?.access_token;
      if (!fresh) return;
      // Signed out / signed in as someone else while the request was in flight:
      // that session owns the storage and state now - don't overwrite them.
      // Everything below is synchronous up to the writes being queued, so a
      // logout that starts after this check queues its removal behind ours.
      if (!sessionEpoch.isCurrent(epoch)) return;
      const freshUser = response.data?.user;
      const writes: Promise<void>[] = [AsyncStorage.setItem('auth_token', fresh)];
      setToken(fresh);
      if (freshUser && typeof freshUser === 'object') {
        writes.push(AsyncStorage.setItem('user', JSON.stringify(freshUser)));
        setUser(freshUser);
      }
      await Promise.all(writes);
    } catch {
      // Non-401 failure: keep the token we have. (A 401 was handled by the
      // interceptor before it got here.)
    } finally {
      refreshInFlight.current = false;
    }
  }, [sessionEpoch]);

  // App returning to the foreground: refresh if the token has gone stale.
  // (App start is covered at the end of loadStoredAuth.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSession();
    });
    return () => sub.remove();
  }, [refreshSession]);

  // Force logout when the API interceptor detects a 401 (expired/revoked token)
  const handleAuthExpired = useCallback(() => {
    sessionEpoch.bump();
    setToken(null);
    setUser(null);
  }, [sessionEpoch]);

  useEffect(() => {
    loadStoredAuth();

    authEvents.on(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      authEvents.off(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [handleAuthExpired]);

  // Register this device's Expo push token whenever we have an auth session
  // (fresh login OR app relaunch once the stored token hydrates). Previously
  // this only happened if a user opened Settings > Notifications, so almost no
  // tokens were ever stored (ADR-009). Fire-and-forget; returns null in Expo Go
  // or if permission is denied, and never blocks the app.
  // Keyed on "signed in as this user", not on the token string, so the daily
  // token refresh doesn't re-post the push token.
  const hasToken = !!token;
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    (async () => {
      try {
        const pushToken = await getExpoPushToken();
        if (!cancelled && pushToken) {
          await apiClient.post('/notification-preferences/push-token', {
            token: pushToken,
            tz_offset_minutes: new Date().getTimezoneOffset(),
          });
        }
      } catch {
        // non-fatal — user can still enable from Settings > Notifications
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken, userId]);

  // A keeper who has never chosen units gets the device region's default,
  // saved once so it follows them to the web and other devices. Only when the
  // API returned the field as null (an older API omits it entirely).
  const unitsSyncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!token || !user || user.measurement_units !== null) return;
    if (unitsSyncedFor.current === user.id) return;
    unitsSyncedFor.current = user.id;
    const guess = deviceDefaultUnits();
    (async () => {
      try {
        const res = await apiClient.put('/auth/me/profile', { measurement_units: guess });
        const fresh = res.data;
        if (fresh && typeof fresh === 'object') {
          await AsyncStorage.setItem('user', JSON.stringify(fresh));
          setUser(fresh);
        }
      } catch {
        // Offline: the region default still applies for display.
      }
    })();
  }, [token, user]);

  const units: Units = isUnits(user?.measurement_units) ? user!.measurement_units! : deviceDefaultUnits();

  const setMeasurementUnits = async (u: Units): Promise<boolean> => {
    const previous = user;
    if (user) {
      const next = { ...user, measurement_units: u };
      setUser(next);
      AsyncStorage.setItem('user', JSON.stringify(next)).catch(() => {});
    }
    if (!token) return true;
    try {
      await apiClient.put('/auth/me/profile', { measurement_units: u });
      return true;
    } catch {
      if (previous) setUser(previous);
      return false;
    }
  };

  const loadStoredAuth = async () => {
    try {
      try {
        const method = await AsyncStorage.getItem(LAST_METHOD_KEY);
        if (isSignInMethod(method)) setLastSignInMethod(method);
      } catch {
        // hint only
      }

      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('user');

      if (!storedToken || !storedUser) {
        return;
      }

      // Hydrate cached auth first so app shell renders without a login flash,
      // and so the request interceptor has a token to attach to /auth/me.
      setToken(storedToken);
      setUser(JSON.parse(storedUser));

      // Validate the token BEFORE the dashboard fires a wave of parallel
      // requests. If it's expired or revoked, the response interceptor will
      // clear storage + emit AUTH_EXPIRED, and handleAuthExpired below will
      // reset state cleanly. If the network is down, we keep the cached
      // session (offline-friendly).
      const validate = (async () => {
        try {
          const response = await apiClient.get('/auth/me');
          const freshUser = response.data;
          await AsyncStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        } catch (error: any) {
          // 401 → interceptor already cleared storage and emitted the event;
          // state will be reset by handleAuthExpired. Any other error (network,
          // 5xx) → leave the cached session in place so offline-reopen works.
        }
      })();
      // Cap the wait: a cold or slow API used to hold launch on a loading
      // screen for up to the 30 s axios timeout. After AUTH_CHECK_MAX_WAIT_MS
      // the app opens on the cached user; the check keeps running and still
      // updates the user (or signs out on a real 401) when it lands. A slow
      // network never signs anyone out.
      await Promise.race([
        validate,
        new Promise<void>((resolve) => setTimeout(resolve, AUTH_CHECK_MAX_WAIT_MS)),
      ]);
      // Hydrated and validated: renew the token if it is more than a day old.
      // Not awaited - launch never waits on it.
      void refreshSession();
    } catch (error) {
      // AsyncStorage read failed — show login screen.
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    sessionEpoch.bump();
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;
      sessionEpoch.bump();

      await AsyncStorage.setItem('auth_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      setToken(access_token);
      setUser(userData);
      await rememberMethod('password');
    } catch (error: any) {
      const err: Error & { code?: string } = new Error(
        error.response?.data?.detail || 'Login failed',
      );
      // Wrong email/password. The login screen adds the "signed up with
      // Google or Apple?" hint to this case only.
      if (error.response?.status === 401) {
        err.code = 'invalid_credentials';
      }
      // Tagged so the login screen can offer a fresh link instead of a
      // dead-end alert. Keyed on status + wording because the API reports
      // this case as a plain 403 detail string.
      if (
        error.response?.status === 403 &&
        /not verified/i.test(String(error.response?.data?.detail ?? ''))
      ) {
        err.code = 'email_not_verified';
      }
      throw err;
    }
  };

  const register = async (email: string, username: string, password: string, display_name?: string, referral_code?: string) => {
    try {
      const registrationData: any = {
        email,
        username,
        password,
        display_name: display_name || username,
      };

      // Include referral code if provided
      if (referral_code) {
        registrationData.referral_code = referral_code;
      }

      const response = await apiClient.post('/auth/register', registrationData);

      // Registration now returns a message instead of a token
      // User must verify email before logging in
      // Return the response so the UI can handle showing the verification message
      return response.data;
    } catch (error: any) {
      // `detail` is an ARRAY of validation objects on a 422 — the password
      // complexity rules are the common case. Passing it to new Error()
      // stringified it to the literal "[object Object]", so the one message
      // explaining what was wrong got thrown away and registration became
      // impossible for anyone who didn't already know the rules.
      throw new Error(getErrorMessage(error, 'Registration failed'));
    }
  };

  const logout = async () => {
    sessionEpoch.bump();
    clearSharedCache();
    // Sign out from Google if user was signed in with OAuth
    try {
      await signOutFromGoogle();
    } catch (error) {
      // Ignore errors - user might not have been signed in with Google
    }

    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // Persist a finished social sign-in (shared by the first attempt and the
  // "Create account" retry) and report whether it created the account.
  const finishSocialLogin = async (method: 'google' | 'apple', result: OAuthLoginResult): Promise<boolean> => {
    sessionEpoch.bump();
    await AsyncStorage.setItem('auth_token', result.accessToken);
    await AsyncStorage.setItem('user', JSON.stringify(result.user));
    setToken(result.accessToken);
    setUser(result.user as User);
    await rememberMethod(method);
    return result.isNewUser;
  };

  const runSocialLogin = async (
    method: 'google' | 'apple',
    signIn: (o: { allowCreate: boolean }) => Promise<OAuthLoginResult>,
    failure: string,
    options?: { allowCreate?: boolean },
  ): Promise<boolean> => {
    sessionEpoch.bump();
    try {
      const result = await signIn({ allowCreate: options?.allowCreate !== false });
      return await finishSocialLogin(method, result);
    } catch (error: any) {
      if (isNoAccountError(error)) {
        // Hand the screen a retry that also persists the session.
        throw makeNoAccountError(
          { provider: error.provider, email: error.email },
          async () => finishSocialLogin(method, (await error.createAccount()) as OAuthLoginResult),
        );
      }
      throw new Error(error.message || failure);
    }
  };

  /**
   * Returns whether this sign-in created the account, so the caller can route
   * a genuinely new keeper to the welcome carousel. Deliberately a return
   * value rather than state: it's true for exactly one navigation and would be
   * stale (and re-trigger onboarding) if it lived on the context.
   */
  const loginWithGoogle = (options?: { allowCreate?: boolean }): Promise<boolean> =>
    runSocialLogin('google', signInWithGoogle, 'Google login failed', options);

  const loginWithApple = (options?: { allowCreate?: boolean }): Promise<boolean> =>
    runSocialLogin('apple', signInWithApple, 'Apple login failed', options);

  const refreshUser = async () => {
    try {
      const response = await apiClient.get('/auth/me');
      const userData = response.data;
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      // Silent fail - will use cached user data
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithGoogle, loginWithApple, register, logout, refreshUser, lastSignInMethod, units, setMeasurementUnits }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
