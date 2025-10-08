/**
 * API Client for Mobile App
 */
import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

console.log('🔧 API Client Configuration:');
console.log('  API_URL:', API_URL);
console.log('  Base URL:', `${API_URL}/api/v1`);

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
    console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
    return config
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.config.method?.toUpperCase(), response.config.url, '→', response.status);
    return response;
  },
  async (error) => {
    console.error('❌ API Error:', error.config?.url, '→', error.message);
    if (error.response) {
      console.error('   Response Status:', error.response.status);
      console.error('   Response Data:', error.response.data);
    } else {
      console.error('   No response received. Network error or timeout.');
    }
    
    if (error.response?.status === 401) {
      // Handle unauthorized - clear token
      await AsyncStorage.removeItem('auth_token')
      // Navigate to login (implement with your navigation)
    }
    return Promise.reject(error)
  }
)

export default apiClient
