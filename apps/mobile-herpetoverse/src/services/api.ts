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
import { EventEmitter } from 'events';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';

export const TOKEN_KEY = 'hv_token';
export const USER_KEY = 'hv_user';

/** Emitted when a 401 is received — AuthContext listens and forces logout. */
export const authEvents = new EventEmitter();
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
