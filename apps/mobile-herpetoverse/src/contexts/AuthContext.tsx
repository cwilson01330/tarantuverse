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
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiClient,
  AUTH_EXPIRED_EVENT,
  authEvents,
  TOKEN_KEY,
  USER_KEY,
} from '../services/api';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_admin?: boolean;
  is_superuser?: boolean;
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
  register: (
    email: string,
    username: string,
    password: string,
    display_name?: string,
  ) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleAuthExpired = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    loadStoredAuth();
    authEvents.on(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      authEvents.off(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAuthExpired]);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);

      if (!storedToken || !storedUser) {
        return;
      }

      // Hydrate cached auth first so the app shell renders without a
      // login flash and the request interceptor has a token to attach.
      setToken(storedToken);
      setUser(JSON.parse(storedUser));

      // Revalidate in the background. 401 → interceptor clears storage
      // and emits AUTH_EXPIRED (handled above). Network/5xx → keep the
      // cached session for offline-friendly reopens.
      try {
        const response = await apiClient.get('/auth/me');
        const freshUser = response.data;
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
        setUser(freshUser);
      } catch {
        // swallow — either handled above or transient
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;
      await AsyncStorage.setItem(TOKEN_KEY, access_token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      setToken(access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  }

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
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  }

  async function logout() {
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
      value={{ user, token, isLoading, login, register, logout, refreshUser }}
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
