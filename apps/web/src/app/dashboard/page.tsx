'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import ActivityFeed from '@/components/ActivityFeed'
import { SkeletonCard } from '@/components/ui/skeleton'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  photo_url?: string
}

interface FeedingStatus {
  tarantula_id: string
  days_since_last_feeding?: number
  acceptance_rate: number
}

interface PremoltPrediction {
  tarantula_id: string
  probability: number
  confidence_level: string
  status_text: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const { canAddTarantula, isPremium } = useSubscription()
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map())
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [subscriptionLimits, setSubscriptionLimits] = useState<any>(null)
  const [showWarning, setShowWarning] = useState(true)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem('collection_view_mode')
    if (savedView === 'card' || savedView === 'list') {
      setViewMode(savedView)
    }
  }, [])

  const toggleViewMode = (mode: 'card' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('collection_view_mode', mode)
  }

  const handleAddTarantula = () => {
    if (!canAddTarantula(tarantulas.length)) {
      setShowUpgradeModal(true)
    } else {
      router.push('/dashboard/tarantulas/add')
    }
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  // Helper function to handle both R2 (absolute) and local (relative) URLs
  const getImageUrl = (url?: string) => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    return `${API_URL}${url}`
  }

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return

    // Check authentication
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    // Fetch data with token
    fetchTarantulas(token)
  }, [router, isAuthenticated, isLoading, token])

  const fetchTarantulas = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setTarantulas(data)

        // Fetch feeding stats and premolt predictions for each tarantula
        fetchAllFeedingStatuses(token, data)
        fetchAllPremoltPredictions(token, data)
      }

      // Fetch subscription limits
      const limitsResponse = await fetch(`${API_URL}/api/v1/promo-codes/me/limits`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (limitsResponse.ok) {
        const limits = await limitsResponse.json()
        setSubscriptionLimits(limits)
      }
    } catch {
      // Fetch failed - user sees empty collection state
    } finally {
      setLoading(false)
    }
  }

  const fetchAllFeedingStatuses = async (token: string, tarantulasList: Tarantula[]) => {
    const statusMap = new Map<string, FeedingStatus>()

    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await fetch(`${API_URL}/api/v1/tarantulas/${t.id}/feeding-stats`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            statusMap.set(t.id, {
              tarantula_id: t.id,
              days_since_last_feeding: data.days_since_last_feeding,
              acceptance_rate: data.acceptance_rate,
            })
          }
        } catch {
          // Individual feeding stat fetch failed - skip this tarantula
        }
      })
    )

    setFeedingStatuses(statusMap)
  }

  const fetchAllPremoltPredictions = async (token: string, tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>()

    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await fetch(`${API_URL}/api/v1/tarantulas/${t.id}/premolt-prediction`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            predictionMap.set(t.id, {
              tarantula_id: t.id,
              probability: data.probability,
              confidence_level: data.confidence_level,
              status_text: data.status_text,
            })
          }
        } catch {
          // Individual premolt prediction failed - skip
        }
      })
    )

    setPremoltPredictions(predictionMap)
  }

  const getFeedingStatusBadge = (tarantulaId: string) => {
    const status = feedingStatuses.get(tarantulaId)
    if (!status || status.days_since_last_feeding === undefined) return null

    const days = status.days_since_last_feeding
    let bgColor = 'bg-green-500/90'
    let textColor = 'text-white'
    let emoji = '✓'

    if (days >= 21) {
      bgColor = 'bg-red-500/90'
      emoji = '⚠️'
    } else if (days >= 14) {
      bgColor = 'bg-orange-500/90'
      emoji = '⏰'
    } else if (days >= 7) {
      bgColor = 'bg-yellow-500/90'
      emoji = '📅'
    }

    return (
      <span className={`px-3 py-1 rounded-full ${bgColor} backdrop-blur-sm ${textColor} text-xs font-semibold shadow-lg`}>
        {emoji} Fed {days}d ago
      </span>
    )
  }

  const getPremoltBadge = (tarantulaId: string) => {
    const prediction = premoltPredictions.get(tarantulaId)
    if (!prediction) return null

    // Only show badge for medium or higher confidence
    if (prediction.confidence_level === 'low') return null

    let bgColor = 'bg-gray-500/90'
    let emoji = '🦋'

    if (prediction.confidence_level === 'very_high') {
      bgColor = 'bg-red-500/90'
    } else if (prediction.confidence_level === 'high') {
      bgColor = 'bg-orange-500/90'
    } else if (prediction.confidence_level === 'medium') {
      bgColor = 'bg-yellow-500/90'
    }

    return (
      <span className={`px-3 py-1 rounded-full ${bgColor} backdrop-blur-sm text-white text-xs font-semibold shadow-lg`}>
        {emoji} {prediction.probability}% Premolt
      </span>
    )
  }

  if (!user || loading || isLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-surface p-6 rounded-lg border border-theme animate-pulse">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>

          {/* Collection skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const filteredTarantulas = searchQuery
    ? tarantulas.filter(t =>
      t.common_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.scientific_name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : tarantulas

  return (
    <DashboardLayout
      userName={user.name ?? undefined}
      userEmail={user.email ?? undefined}
      userAvatar={user.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tarantula Count Warning */}
        {!subscriptionLimits?.is_premium &&
         tarantulas.length >= 10 &&
         tarantulas.length < 15 &&
         showWarning && (
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                    Approaching Free Tier Limit
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    You have <strong>{tarantulas.length} of 15</strong> tarantulas on the free plan.
                    Upgrade to Premium for unlimited tracking!
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push('/pricing')}
                      className="px-4 py-2 bg-gradient-brand text-white rounded-lg hover:brightness-90 transition font-semibold text-sm"
                    >
                      View Premium Plans
                    </button>
                    <button
                      onClick={() => router.push('/dashboard/settings')}
                      className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold text-sm"
                    >
                      Redeem Promo Code
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Progress bar */}
            <div className="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(tarantulas.length / 15) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                🕷️
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">My Collection</p>
                <p className="text-3xl font-bold text-primary">{tarantulas.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                🍴
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Recent Feedings</p>
                <p className="text-3xl font-bold text-gradient-brand">0</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                📊
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Upcoming Molts</p>
                <p className="text-3xl font-bold text-gradient-brand">0</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout for collection and activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content - Collection */}
          <div className="lg:col-span-2">
            {/* Search Bar */}
            {tarantulas.length > 0 && (
              <div className="mb-6">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your collection..."
                    className="w-full px-6 py-4 pl-12 bg-surface rounded-2xl shadow-lg border border-theme focus:outline-none focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent text-theme-primary placeholder-theme-tertiary"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-tertiary text-xl">
                    🔍
                  </div>
                </div>
              </div>
            )}

            {/* Collection Grid */}
            {tarantulas.length === 0 ? (
              <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
                <div className="text-6xl mb-4">🕷️</div>
                <h2 className="text-2xl font-bold mb-3 text-theme-primary">Your Collection is Empty</h2>
                <p className="text-theme-secondary mb-8 max-w-md mx-auto">
                  Start tracking your tarantulas by adding your first one! Keep detailed records of feedings, molts, and husbandry.
                </p>
                <button
                  onClick={handleAddTarantula}
                  className="px-8 py-4 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
                >
                  ➕ Add First Tarantula
                </button>
                <button
                  onClick={() => router.push('/dashboard/tarantulas/import')}
                  className="ml-4 px-8 py-4 bg-surface border border-theme text-theme-primary rounded-xl hover:bg-surface-elevated transition-all duration-200 font-semibold shadow-lg"
                >
                  📥 Import Collection
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                  <h2 className="text-2xl font-bold text-theme-primary">
                    {searchQuery ? `Search Results (${filteredTarantulas.length})` : 'My Collection'}
                  </h2>
                  <div className="flex items-center gap-3">
                    {/* View Toggle */}
                    <div className="flex bg-surface border border-theme rounded-lg p-1">
                      <button
                        onClick={() => toggleViewMode('card')}
                        className={`p-2 rounded-md transition-all ${
                          viewMode === 'card'
                            ? 'bg-gradient-brand text-white shadow-md'
                            : 'text-theme-secondary hover:text-theme-primary'
                        }`}
                        title="Card View"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleViewMode('list')}
                        className={`p-2 rounded-md transition-all ${
                          viewMode === 'list'
                            ? 'bg-gradient-brand text-white shadow-md'
                            : 'text-theme-secondary hover:text-theme-primary'
                        }`}
                        title="List View"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={handleAddTarantula}
                      className="px-6 py-3 bg-gradient-brand text-white rounded-xl hover:brightness-90 transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
                    >
                      ➕ Add Tarantula
                    </button>
                    <button
                      onClick={() => router.push('/dashboard/tarantulas/import')}
                      className="px-6 py-3 bg-surface border border-theme text-theme-primary rounded-xl hover:bg-surface-elevated transition-all duration-200 font-semibold shadow-lg"
                    >
                      📥 Import
                    </button>
                  </div>
                </div>

                {filteredTarantulas.length === 0 ? (
                  <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-theme-secondary">No tarantulas match your search.</p>
                  </div>
                ) : viewMode === 'list' ? (
                  /* List View */
                  <div className="bg-surface rounded-2xl shadow-lg border border-theme overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider">Photo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider hidden sm:table-cell">Species</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider hidden md:table-cell">Sex</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider">Last Fed</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-theme-secondary uppercase tracking-wider hidden lg:table-cell">Premolt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredTarantulas.map((tarantula) => {
                          const feedingStatus = feedingStatuses.get(tarantula.id)
                          const premoltPrediction = premoltPredictions.get(tarantula.id)
                          return (
                            <tr
                              key={tarantula.id}
                              onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30 flex-shrink-0">
                                  {tarantula.photo_url ? (
                                    <img
                                      src={getImageUrl(tarantula.photo_url)}
                                      alt={tarantula.common_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl">🕷️</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-theme-primary">{tarantula.common_name}</div>
                                <div className="text-sm text-theme-secondary italic sm:hidden">{tarantula.scientific_name}</div>
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <span className="text-sm italic text-theme-secondary">{tarantula.scientific_name}</span>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                {tarantula.sex ? (
                                  <span className="px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                                    {tarantula.sex === 'male' ? '♂️' : tarantula.sex === 'female' ? '♀️' : '⚧'} {tarantula.sex}
                                  </span>
                                ) : (
                                  <span className="text-theme-tertiary text-sm">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {feedingStatus?.days_since_last_feeding !== undefined ? (
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    feedingStatus.days_since_last_feeding >= 21 ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' :
                                    feedingStatus.days_since_last_feeding >= 14 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                                    feedingStatus.days_since_last_feeding >= 7 ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                                    'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                                  }`}>
                                    {feedingStatus.days_since_last_feeding}d ago
                                  </span>
                                ) : (
                                  <span className="text-theme-tertiary text-sm">No data</span>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                {premoltPrediction && premoltPrediction.confidence_level !== 'low' ? (
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    premoltPrediction.confidence_level === 'very_high' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' :
                                    premoltPrediction.confidence_level === 'high' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                                    'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                                  }`}>
                                    🦋 {premoltPrediction.probability}%
                                  </span>
                                ) : (
                                  <span className="text-theme-tertiary text-sm">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Card View */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredTarantulas.map((tarantula) => (
                      <div
                        key={tarantula.id}
                        onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                        className="group relative overflow-hidden rounded-2xl bg-surface shadow-lg hover:shadow-lg transition-all duration-300 cursor-pointer border border-theme hover:border-electric-blue-500/40"
                      >
                        {/* Image with gradient overlay */}
                        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30">
                          {tarantula.photo_url ? (
                            <>
                              <img
                                src={getImageUrl(tarantula.photo_url)}
                                alt={tarantula.common_name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-7xl bg-gradient-to-br from-electric-blue-900/50 to-neon-pink-900/50">
                              🕷️
                            </div>
                          )}

                          {/* Status badges */}
                          <div className="absolute top-3 left-3 right-3 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                              {/* Premolt badge (left) */}
                              <div>
                                {getPremoltBadge(tarantula.id)}
                              </div>

                              {/* Feeding status badge (right) */}
                              <div>
                                {getFeedingStatusBadge(tarantula.id) || (
                                  <span className="px-3 py-1 rounded-full bg-surface-elevated backdrop-blur-sm text-theme-secondary text-xs font-semibold shadow-lg border border-theme">
                                    No data
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5">
                          <h3 className="font-bold text-lg text-theme-primary mb-1 line-clamp-1">
                            {tarantula.common_name}
                          </h3>
                          <p className="text-sm italic text-theme-secondary mb-3 line-clamp-1">
                            {tarantula.scientific_name}
                          </p>

                          {/* Quick stats */}
                          <div className="flex flex-wrap gap-2">
                            {tarantula.sex && (
                              <span className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-500/30">
                                {tarantula.sex === 'male' ? '♂️' : tarantula.sex === 'female' ? '♀️' : '⚧'} {tarantula.sex}
                              </span>
                            )}
                            {tarantula.date_acquired && (
                              <span className="px-3 py-1 rounded-lg bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 text-xs font-semibold border border-pink-200 dark:border-pink-500/30">
                                📅 {new Date(tarantula.date_acquired).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-electric-blue-600/0 to-neon-pink-600/0 group-hover:from-electric-blue-600/10 group-hover:to-neon-pink-600/5 transition-all duration-300 pointer-events-none" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Activity Feed */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h2 className="text-2xl font-bold text-theme-primary mb-4">Recent Activity</h2>
              <ActivityFeed feedType="personalized" showFilters={false} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button (Mobile-friendly) */}
      {tarantulas.length > 0 && (
        <button
          onClick={handleAddTarantula}
          className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-brand text-white shadow-2xl shadow-gradient-brand hover:scale-110 hover:shadow-2xl transition-all duration-200 flex items-center justify-center text-2xl sm:text-3xl z-50"
          aria-label="Add tarantula"
        >
          ➕
        </button>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="Unlimited Tarantulas"
        description="You've reached the free tier limit of 15 tarantulas. Upgrade to Premium for unlimited tracking!"
      />
    </DashboardLayout>
  )
}

