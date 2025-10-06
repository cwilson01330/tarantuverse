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
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear token
      await AsyncStorage.removeItem('auth_token')
      // Navigate to login (implement with your navigation)
    }
    return Promise.reject(error)
  }
)

export default apiClient
