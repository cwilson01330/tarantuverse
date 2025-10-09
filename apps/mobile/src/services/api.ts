/**
 * API Client for Mobile App
 */
import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

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
    // Handle unauthorized - clear token and redirect to login
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token')
      await AsyncStorage.removeItem('user')
    }
    return Promise.reject(error)
  }
)

export default apiClient
