/**
 * API Client for Mobile App
 */
import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { EventEmitter } from 'events'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

/** Emitted when a 401 is received — AuthContext listens and forces logout */
export const authEvents = new EventEmitter()
export const AUTH_EXPIRED_EVENT = 'auth:expired'

/**
 * Endpoints where a 401 means "bad credentials" or "bad token supplied manually"
 * (login, register, forgot-password, reset-password). Getting a 401 from these
 * does NOT mean the user's current session has expired, so we must not auto-logout.
 */
const AUTH_ENDPOINTS_NO_AUTO_LOGOUT = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
]

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // Handle unauthorized - clear token and signal AuthContext to redirect.
    // Skip the auth endpoints in AUTH_ENDPOINTS_NO_AUTO_LOGOUT: a 401 there means
    // "wrong password" / "bad reset token", not "your session expired".
    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? ''
      const isCredentialCheckEndpoint = AUTH_ENDPOINTS_NO_AUTO_LOGOUT.some(
        (endpoint) => url.includes(endpoint)
      )
      if (!isCredentialCheckEndpoint) {
        await AsyncStorage.removeItem('auth_token')
        await AsyncStorage.removeItem('user')
        authEvents.emit(AUTH_EXPIRED_EVENT)
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
