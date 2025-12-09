import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'

interface SubscriptionLimits {
  is_premium: boolean
  max_tarantulas: number
  can_use_breeding: boolean
  max_photos_per_tarantula: number
  has_priority_support: boolean
}

export function useSubscription() {
  const { token } = useAuth()
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    fetchLimits()
  }, [token])

  const fetchLimits = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/promo-codes/me/limits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setLimits(data)
      } else {
        // Default to free tier if endpoint fails
        setLimits({
          is_premium: false,
          max_tarantulas: 15,
          can_use_breeding: false,
          max_photos_per_tarantula: 5,
          has_priority_support: false,
        })
      }
    } catch (error) {
      console.error('Failed to fetch subscription limits:', error)
      // Default to free tier on error
      setLimits({
        is_premium: false,
        max_tarantulas: 15,
        can_use_breeding: false,
        max_photos_per_tarantula: 5,
        has_priority_support: false,
      })
    } finally {
      setLoading(false)
    }
  }

  const canAddTarantula = (currentCount: number): boolean => {
    if (!limits) return false
    if (limits.is_premium) return true
    return currentCount < limits.max_tarantulas
  }

  const canUseBreeding = (): boolean => {
    if (!limits) return false
    return limits.can_use_breeding
  }

  const canAddPhoto = (currentPhotoCount: number): boolean => {
    if (!limits) return false
    if (limits.is_premium) return true
    return currentPhotoCount < limits.max_photos_per_tarantula
  }

  const getRemainingTarantulas = (currentCount: number): number => {
    if (!limits || limits.is_premium) return Infinity
    return Math.max(0, limits.max_tarantulas - currentCount)
  }

  const getRemainingPhotos = (currentPhotoCount: number): number => {
    if (!limits || limits.is_premium) return Infinity
    return Math.max(0, limits.max_photos_per_tarantula - currentPhotoCount)
  }

  return {
    limits,
    loading,
    isPremium: limits?.is_premium ?? false,
    canAddTarantula,
    canUseBreeding,
    canAddPhoto,
    getRemainingTarantulas,
    getRemainingPhotos,
    refresh: fetchLimits,
  }
}
