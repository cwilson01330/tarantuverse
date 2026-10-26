/**
 * Auth context for Herpetoverse mobile.
 *
 * Talks to the shared Tarantuverse auth endpoints (`/auth/login`,
 * `/auth/register`, `/auth/me`). Session is cached in AsyncStorage under
 * the `hv_token` / `hv_user` keys so it never collides with a Tarantuverse
 * mobile install on the same device.
 *
 * v1 scope: email/password only. OAuth (Google / Apple) can be added in a
 * later bundle once we know what the reptile-keeper signup funnel looks
 * like in PostHog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  apiClient,
  AUTH_EXPIRED_EVENT,
  authEvents,
  TOKEN_KEY,
  USER_KEY,
} from '../services/api';
import { getExpoPushToken } from '../services/notifications';
import { signInWithGoogle, signInWithApple, type OAuthResult } from '../services/google-signin';
import { HV_WEB_ORIGIN } from '../lib/web-origin';
import { getErrorMessage } from '../utils/errors';
import { clearSharedCache } from '../lib/co-keepers';
import { deviceDefaultUnits, isUnits, type Units } from '../lib/units';
import {
  createSessionEpoch,
  isNoAccountError,
  isSignInMethod,
  makeNoAccountError,
  shouldRefresh,
  type SignInMethod,
} from '../lib/session';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_admin?: boolean;
  is_superuser?: boolean;
  /** Display units, shared with Tarantuverse (one setting per keeper).
   *  null = never chosen (the device region decides and is saved once);
   *  undefined = an API too old to know the field. */
  measurement_units?: Units | null;
}

interface RegisterResponse {
  message: string;
  requires_email_verification: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  // `allowCreate: false` (the LOGIN screen) makes the server refuse to create
  // an account: the call then throws a NoAccountError (lib/session) whose
  // `createAccount()` finishes the sign-in with the same credentials if the
  // keeper confirms. Default true = the REGISTER screen / old behaviour.
  loginWithGoogle: (options?: { allowCreate?: boolean }) => Promise<void>;
  loginWithApple: (options?: { allowCreate?: boolean }) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    display_name?: string,
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

/** How the keeper last signed in. Deliberately NOT removed by logout() - it is
 *  the whole point of the login-screen hint. `hv_` prefix like the token keys. */
const LAST_METHOD_KEY = 'hv_last_sign_in_method';
/** Epoch ms of the last /auth/refresh attempt (success or failure). */
const LAST_REFRESH_ATTEMPT_KEY = 'hv_last_token_refresh_attempt';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSignInMethod, setLastSignInMethod] = useState<SignInMethod | null>(null);

  async function rememberMethod(method: SignInMethod) {
    setLastSignInMethod(method);
    try {
      await AsyncStorage.setItem(LAST_METHOD_KEY, method);
    } catch {
      // a hint only - never block a sign-in on it
    }
  }

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
      const current = await AsyncStorage.getItem(TOKEN_KEY);
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
      const writes: Promise<void>[] = [AsyncStorage.setItem(TOKEN_KEY, fresh)];
      setToken(fresh);
      if (freshUser && typeof freshUser === 'object') {
        writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser)));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAuthExpired]);

  // Register this device's Expo push token whenever we have an auth
  // session — fresh login OR app relaunch once the stored token hydrates.
  // Previously HV mobile never registered a token at all, so the
  // server-sent daily feeding digest could not be delivered (ADR-009).
  // Fire-and-forget: returns null in Expo Go or if permission is denied,
  // and never blocks the app.
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
        // non-fatal — reminders still schedule locally; digest just won't
        // reach this device until a later successful registration.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken, userId]);

  // A keeper who has never chosen units gets the device region's default,
  // saved once so it follows them to the web and to Tarantuverse. Only when
  // the API returned the field as null (an older API omits it entirely).
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
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
          setUser(fresh);
        }
      } catch {
        // Offline: the region default still applies for display.
      }
    })();
  }, [token, user]);

  const units: Units = isUnits(user?.measurement_units) ? user!.measurement_units! : deviceDefaultUnits();

  async function setMeasurementUnits(u: Units): Promise<boolean> {
    const previous = user;
    if (user) {
      const next = { ...user, measurement_units: u };
      setUser(next);
      AsyncStorage.setItem(USER_KEY, JSON.stringify(next)).catch(() => {});
    }
    if (!token) return true;
    try {
      await apiClient.put('/auth/me/profile', { measurement_units: u });
      return true;
    } catch {
      if (previous) {
        setUser(previous);
        AsyncStorage.setItem(USER_KEY, JSON.stringify(previous)).catch(() => {});
      }
      return false;
    }
  }

  // Launch must never wait on the network. The old flow awaited GET /auth/me
  // (30 s axios timeout, cold Render starts) before releasing the root render,
  // so a slow API meant a blank screen at launch — the kind of thing App Review
  // reports. Now the cached session is enough to render; /auth/me revalidates
  // in the background, and a slow or failed network never signs anyone out
  // (only a 401 does, via the api interceptor).
  async function loadStoredAuth() {
    // Belt and braces: even if storage itself stalls, stop gating the root
    // render after a few seconds (the keeper lands on login and can sign in).
    const cap = setTimeout(() => setIsLoading(false), 4000);
    let storedToken: string | null = null;
    try {
      try {
        const method = await AsyncStorage.getItem(LAST_METHOD_KEY);
        if (isSignInMethod(method)) setLastSignInMethod(method);
      } catch {
        // hint only
      }
      storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        // Hydrate cached auth first so the app shell renders without a
        // login flash and the request interceptor has a token to attach.
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        storedToken = null;
      }
    } catch {
      storedToken = null;
    } finally {
      clearTimeout(cap);
      setIsLoading(false);
    }

    if (!storedToken) return;
    // Revalidate in the background. 401 → interceptor clears storage and
    // emits AUTH_EXPIRED (handled above). Network/5xx → keep the cached
    // session for offline-friendly reopens.
    try {
      const response = await apiClient.get('/auth/me');
      const freshUser = response.data;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      setUser(freshUser);
    } catch {
      // swallow — either handled above or transient
    }
    // Validated: renew the token if it is more than a day old. Not awaited.
    void refreshSession();
  }

  async function login(email: string, password: string) {
    sessionEpoch.bump();
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;
      sessionEpoch.bump();
      await AsyncStorage.setItem(TOKEN_KEY, access_token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
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
      // Tagged so the login screen can offer a fresh link instead of just
      // printing the error. Mirrors Tarantuverse mobile.
      if (
        error.response?.status === 403 &&
        /not verified/i.test(String(error.response?.data?.detail ?? ''))
      ) {
        err.code = 'email_not_verified';
      }
      throw err;
    }
  }

  // OAuth: run the native provider flow, exchange with the shared backend,
  // then persist the returned session exactly like email/password login.
  async function finishSocialLogin(method: 'google' | 'apple', result: OAuthResult) {
    sessionEpoch.bump();
    await AsyncStorage.setItem(TOKEN_KEY, result.accessToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setToken(result.accessToken);
    setUser(result.user as AuthUser);
    await rememberMethod(method);
  }

  async function runSocialLogin(
    method: 'google' | 'apple',
    signIn: (o: { allowCreate: boolean }) => Promise<OAuthResult>,
    failure: string,
    options?: { allowCreate?: boolean },
  ): Promise<void> {
    sessionEpoch.bump();
    try {
      const result = await signIn({ allowCreate: options?.allowCreate !== false });
      await finishSocialLogin(method, result);
    } catch (error: any) {
      if (isNoAccountError(error)) {
        // Hand the screen a retry that also persists the session.
        throw makeNoAccountError(
          { provider: error.provider, email: error.email },
          async () => finishSocialLogin(method, (await error.createAccount()) as OAuthResult),
        );
      }
      throw new Error(error?.message || failure);
    }
  }

  const loginWithGoogle = (options?: { allowCreate?: boolean }) =>
    runSocialLogin('google', signInWithGoogle, 'Google sign-in failed', options);

  const loginWithApple = (options?: { allowCreate?: boolean }) =>
    runSocialLogin('apple', signInWithApple, 'Apple sign-in failed', options);

  async function register(
    email: string,
    username: string,
    password: string,
    display_name?: string,
  ): Promise<RegisterResponse> {
    try {
      const response = await apiClient.post('/auth/register', {
        email,
        username,
        password,
        display_name: display_name || username,
        // So the verification email says "Herpetoverse" and links to
        // herpetoverse.com, not the Tarantuverse default.
        frontend_url: HV_WEB_ORIGIN,
      });
      return response.data;
    } catch (error: any) {
      // `detail` is an ARRAY on a 422 — password complexity is the common
      // case — and new Error() stringified it to "[object Object]".
      throw new Error(getErrorMessage(error, 'Registration failed'));
    }
  }

  async function logout() {
    sessionEpoch.bump();
    clearSharedCache();
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const response = await apiClient.get('/auth/me');
      const userData = response.data;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
    } catch {
      // keep cached user
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user, token, isLoading, login, loginWithGoogle, loginWithApple, register, logout, refreshUser, lastSignInMethod,
        units, setMeasurementUnits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
