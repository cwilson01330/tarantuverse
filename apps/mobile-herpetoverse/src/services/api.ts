/**
 * API client for Herpetoverse mobile.
 *
 * Points at the shared Tarantuverse backend — same user table, same auth
 * endpoints, same reptile CRUD routes. The only thing specific to
 * Herpetoverse here is the AsyncStorage key name: `hv_token` (not
 * `auth_token`) so a user signed into the Tarantuverse mobile app on the
 * same device stays independently signed in there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

export const TOKEN_KEY = 'hv_token';
export const USER_KEY = 'hv_user';

/**
 * Tiny event emitter — replaces Node's `events.EventEmitter`, which
 * doesn't ship in React Native's runtime. Older Expo SDKs polyfilled it
 * via Metro; SDK 54+ doesn't, and EAS production builds break on the
 * missing import (we hit this on Tarantuverse mobile 2026-04-24). We
 * only use .on/.off/.emit with no payload, so a 15-line implementation
 * covers the contract without a polyfill.
 */
type AuthEventHandler = () => void;
class AuthEventEmitter {
  private handlers = new Map<string, Set<AuthEventHandler>>();

  on(event: string, fn: AuthEventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
  }

  off(event: string, fn: AuthEventHandler) {
    this.handlers.get(event)?.delete(fn);
  }

  emit(event: string) {
    this.handlers.get(event)?.forEach((fn) => fn());
  }
}

/** Emitted when a 401 is received — AuthContext listens and forces logout. */
export const authEvents = new AuthEventEmitter();
export const AUTH_EXPIRED_EVENT = 'auth:expired';

/**
 * Endpoints where a 401 means "bad credentials" rather than "session
 * expired". Getting a 401 here must NOT trigger auto-logout.
 */
const AUTH_ENDPOINTS_NO_AUTO_LOGOUT = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
];

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? '';
      const isCredentialCheck = AUTH_ENDPOINTS_NO_AUTO_LOGOUT.some((endpoint) =>
        url.includes(endpoint),
      );
      if (!isCredentialCheck) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
        authEvents.emit(AUTH_EXPIRED_EVENT);
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
