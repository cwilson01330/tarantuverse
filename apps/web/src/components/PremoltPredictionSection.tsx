'use client'

import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'

interface PremoltPrediction {
  tarantula_id: string
  tarantula_name: string
  is_premolt_likely: boolean
  confidence: 'high' | 'medium' | 'low' | 'none'
  days_since_last_molt: number | null
  average_molt_interval: number | null
  molt_interval_progress: number | null
  recent_refusal_streak: number
  refusal_rate_last_30_days: number | null
  estimated_molt_window_days: number | null
  data_quality: 'good' | 'fair' | 'insufficient'
  last_molt_date: string | null
  last_feeding_date: string | null
}

interface Props {
  tarantulaId: string
}

export default function PremoltPredictionSection({ tarantulaId }: Props) {
  const { token } = useAuth()
  const [prediction, setPrediction] = useState<PremoltPrediction | null>(null)
  const [loading, setLoading] = useState(true)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchPrediction()
  }, [tarantulaId, token])

  const fetchPrediction = async () => {
    if (!token) return
    try {
      const response = await fetch(`${API_URL}/api/v1/premolt/tarantulas/${tarantulaId}/prediction`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setPrediction(data)
      }
    } catch (err) {
      console.error('Failed to fetch premolt prediction:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (!prediction) {
    return null
  }

  // Insufficient data state
  if (prediction.data_quality === 'insufficient') {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-800 p-6">
        <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
          💡 Premolt Prediction
        </h2>
        <p className="text-blue-800 dark:text-blue-200">
          Need more data — log feedings and molts to enable predictions
        </p>
      </div>
    )
  }

  const getBgColor = () => {
    if (!prediction.is_premolt_likely) return 'bg-green-50 dark:bg-green-900/20'
    if (prediction.confidence === 'high') return 'bg-red-50 dark:bg-red-900/20'
    if (prediction.confidence === 'medium') return 'bg-amber-50 dark:bg-amber-900/20'
    return 'bg-gray-50 dark:bg-gray-900/20'
  }

  const getBorderColor = () => {
    if (!prediction.is_premolt_likely) return 'border-green-200 dark:border-green-800'
    if (prediction.confidence === 'high') return 'border-red-200 dark:border-red-800'
    if (prediction.confidence === 'medium') return 'border-amber-200 dark:border-amber-800'
    return 'border-gray-200 dark:border-gray-700'
  }

  const getStatusColor = () => {
    if (!prediction.is_premolt_likely) return 'text-green-900 dark:text-green-100'
    if (prediction.confidence === 'high') return 'text-red-900 dark:text-red-100'
    if (prediction.confidence === 'medium') return 'text-amber-900 dark:text-amber-100'
    return 'text-gray-900 dark:text-gray-100'
  }

  const getIndicatorColor = () => {
    if (!prediction.is_premolt_likely) return 'bg-green-100 dark:bg-green-900/30'
    if (prediction.confidence === 'high') return 'bg-red-100 dark:bg-red-900/30'
    if (prediction.confidence === 'medium') return 'bg-amber-100 dark:bg-amber-900/30'
    return 'bg-gray-100 dark:bg-gray-900/30'
  }

  const getConfidenceBadgeColor = () => {
    if (prediction.confidence === 'high') return 'bg-red-500'
    if (prediction.confidence === 'medium') return 'bg-amber-500'
    if (prediction.confidence === 'low') return 'bg-gray-400'
    return 'bg-green-500'
  }

  return (
    <div className={`rounded-2xl shadow-sm border p-6 ${getBgColor()} ${getBorderColor()}`}>
      <div className="flex items-start justify-between mb-4">
        <h2 className={`text-2xl font-bold flex items-center gap-2 ${getStatusColor()}`}>
          🔮 Premolt Prediction
        </h2>
        {prediction.confidence !== 'none' && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getConfidenceBadgeColor()}`}>
            {prediction.confidence}
          </span>
        )}
      </div>

      {/* Status Message */}
      <div className={`mb-4 p-3 rounded-xl ${getIndicatorColor()}`}>
        <p className="font-semibold text-gray-900 dark:text-white">
          {prediction.is_premolt_likely ? '🦋 Likely in premolt' : '✅ No premolt signs'}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="space-y-3">
        {/* Refusal Streak */}
        {prediction.recent_refusal_streak > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Feeding refusals</span>
            <span className="text-lg font-bold text-red-600 dark:text-red-400">{prediction.recent_refusal_streak}</span>
          </div>
        )}

        {/* Days Since Last Molt */}
        {prediction.days_since_last_molt !== null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Days since last molt</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{prediction.days_since_last_molt}</span>
          </div>
        )}

        {/* Molt Interval Progress */}
        {prediction.molt_interval_progress !== null && prediction.average_molt_interval && (
          <div className="p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Molt interval progress</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {Math.round(prediction.molt_interval_progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  prediction.is_premolt_likely ? 'bg-red-500' :
                  prediction.confidence === 'medium' ? 'bg-amber-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(prediction.molt_interval_progress, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Avg interval: {prediction.average_molt_interval.toFixed(0)} days
            </p>
          </div>
        )}

        {/* Refusal Rate */}
        {prediction.refusal_rate_last_30_days !== null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Refusal rate (30d)</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {(prediction.refusal_rate_last_30_days * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Estimated Molt Window */}
        {prediction.estimated_molt_window_days !== null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated molt window</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              ~{prediction.estimated_molt_window_days} days
            </span>
          </div>
        )}
      </div>

      {/* Data Quality Note */}
      {prediction.data_quality === 'fair' && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-4 pt-4 border-t border-gray-300 dark:border-gray-700">
          💡 Log more feedings and molts to improve prediction accuracy
        </p>
      )}
    </div>
  )
}
