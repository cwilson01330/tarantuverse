'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { alertCount, type PremoltPrediction } from '@/lib/premoltView'

interface DashboardResponse {
  total_tarantulas: number
  total_animals?: number
  premolt_likely_count: number
  predictions: PremoltPrediction[]
}

export default function PremoltAlertsCard() {
  const router = useRouter()
  const { token } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchPremoltDashboard()
  }, [token])

  const fetchPremoltDashboard = async () => {
    if (!token) return
    try {
      const response = await fetch(`${API_URL}/api/v1/premolt/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) {
        const json = await response.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch premolt dashboard:', err)
      setError('Failed to load premolt data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const likelyPredictions = data.predictions.filter(p => alertCount([p]) === 1)

  // If no sufficient data
  if ((data.total_animals ?? data.total_tarantulas) > 0 && likelyPredictions.length === 0 &&
      data.predictions.some(p => p.data_quality === 'insufficient')) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800 p-6 mb-8">
        <div className="flex items-start gap-4">
          
          <div>
            <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">Improve Premolt Predictions</h2>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Log more feedings and molts to get accurate premolt predictions for your collection.
            </p>
            <button
              onClick={() => router.push('/dashboard/tarantulas')}
              className="text-sm font-semibold text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition"
            >
              View Collection →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // If all clear
  if (likelyPredictions.length === 0) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl shadow-lg border border-green-200 dark:border-green-800 p-6 mb-8">
        <div className="flex items-center gap-4">
          
          <div>
            <h2 className="text-lg font-bold text-green-900 dark:text-green-100">All Clear</h2>
            <p className="text-sm text-green-800 dark:text-green-200">No animals showing premolt signs</p>
          </div>
        </div>
      </div>
    )
  }

  // Alert state
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border border-amber-200 dark:border-amber-800 p-6 mb-8">
      <div className="flex items-start gap-4 mb-4">
        
        <div className="flex-1">
          <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">Premolt Alerts</h2>
          <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
            {likelyPredictions.length} {likelyPredictions.length === 1 ? 'animal' : 'animals'} may be in premolt
          </p>
        </div>
      </div>

      {/* List of likely premolt tarantulas */}
      <div className="space-y-2">
        {likelyPredictions.map(prediction => (
          <button
            key={prediction.invert_id ?? prediction.tarantula_id}
            onClick={() => router.push(`/dashboard/inverts/${prediction.invert_id ?? prediction.tarantula_id}`)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-800 hover:shadow-md transition border border-amber-100 dark:border-amber-900 text-left group"
          >
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                {prediction.tarantula_name}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {prediction.reason
                  ? prediction.reason
                  : <>
                      {prediction.recent_refusal_streak > 0 ? `${prediction.recent_refusal_streak} feeding refusals` : 'Multiple indicators'}
                      {prediction.days_since_last_molt != null && ` · ${prediction.days_since_last_molt} days since molt`}
                    </>}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap ${
              prediction.confidence === 'high' ? 'bg-red-500' :
              prediction.confidence === 'medium' ? 'bg-amber-500' :
              'bg-gray-400'
            }`}>
              {prediction.confidence}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
