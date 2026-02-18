'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import ActivityFeed from '@/components/ActivityFeed'
import DashboardLayout from '@/components/DashboardLayout'
import DashboardTour from '@/components/DashboardTour'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import UpgradeModal from '@/components/UpgradeModal'

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
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

interface Enclosure {
  id: string
  name: string
  is_communal: boolean
  population_count: number | null
  inhabitant_count: number
  days_since_last_feeding: number | null
  photo_url: string | null
  species_name: string | null
  enclosure_type: string | null
}

export default function DashboardHub() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const { canAddTarantula, isPremium } = useSubscription()
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map())
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map())
  const [enclosures, setEnclosures] = useState<Enclosure[]>([])
  const [loading, setLoading] = useState(true)
  const [subscriptionLimits, setSubscriptionLimits] = useState<any>(null)
  const [showWarning, setShowWarning] = useState(true)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const getImageUrl = (url?: string) => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    return `${API_URL}${url}`
  }

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    fetchDashboardData(token)
  }, [router, isAuthenticated, isLoading, token])

  const fetchDashboardData = async (authToken: string) => {
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` }

      // Fetch tarantulas, enclosures, and subscription limits in parallel
      const [tarantulasRes, enclosuresRes, limitsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/tarantulas/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/enclosures/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/promo-codes/me/limits`, { headers }).catch(() => null),
      ])

      if (tarantulasRes?.ok) {
        const data = await tarantulasRes.json()
        setTarantulas(data)
        // Cascade into per-tarantula stats
        fetchAllFeedingStatuses(authToken, data)
        fetchAllPremoltPredictions(authToken, data)
      }

      if (enclosuresRes?.ok) {
        setEnclosures(await enclosuresRes.json())
      }

      if (limitsRes?.ok) {
        setSubscriptionLimits(await limitsRes.json())
      }
    } catch {
      // Dashboard data fetch failed
    } finally {
      setLoading(false)
    }
  }

  const fetchAllFeedingStatuses = async (authToken: string, tarantulasList: Tarantula[]) => {
    const statusMap = new Map<string, FeedingStatus>()
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await fetch(`${API_URL}/api/v1/tarantulas/${t.id}/feeding-stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
          })
          if (response.ok) {
            const data = await response.json()
            statusMap.set(t.id, {
              tarantula_id: t.id,
              days_since_last_feeding: data.days_since_last_feeding,
              acceptance_rate: data.acceptance_rate,
            })
          }
        } catch { /* skip */ }
      })
    )
    setFeedingStatuses(statusMap)
  }

  const fetchAllPremoltPredictions = async (authToken: string, tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>()
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await fetch(`${API_URL}/api/v1/tarantulas/${t.id}/premolt-prediction`, {
            headers: { 'Authorization': `Bearer ${authToken}` },
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
        } catch { /* skip */ }
      })
    )
    setPremoltPredictions(predictionMap)
  }

  // Computed stats
  const overdueFeedings = tarantulas.filter(t => {
    const status = feedingStatuses.get(t.id)
    return status && status.days_since_last_feeding !== undefined && status.days_since_last_feeding >= 7
  }).sort((a, b) => {
    const daysA = feedingStatuses.get(a.id)?.days_since_last_feeding ?? 0
    const daysB = feedingStatuses.get(b.id)?.days_since_last_feeding ?? 0
    return daysB - daysA
  })

  const premoltAlerts = tarantulas.filter(t => {
    const prediction = premoltPredictions.get(t.id)
    return prediction && prediction.confidence_level !== 'low'
  })

  const communalEnclosures = enclosures.filter(e => e.is_communal)

  // Loading skeleton
  if (!user || loading || isLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface rounded-2xl border border-theme p-6 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-surface-elevated"></div>
                  <div className="flex-1">
                    <div className="h-3 w-20 bg-surface-elevated rounded mb-2"></div>
                    <div className="h-8 w-12 bg-surface-elevated rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="bg-surface rounded-2xl border border-theme p-6 animate-pulse">
                <div className="h-6 w-40 bg-surface-elevated rounded mb-6"></div>
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-surface-elevated">
                      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
                      <div className="flex-1">
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
                        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="bg-surface rounded-2xl border border-theme p-6 animate-pulse">
                <div className="h-6 w-32 bg-surface-elevated rounded mb-4"></div>
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-20 bg-surface-elevated rounded-xl"></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const handleAddTarantula = () => {
    if (!canAddTarantula(tarantulas.length)) {
      setShowUpgradeModal(true)
    } else {
      router.push('/dashboard/tarantulas/add')
    }
  }

  // Empty state - no tarantulas at all
  if (tarantulas.length === 0 && !loading) {
    return (
      <DashboardLayout
        userName={user.name ?? undefined}
        userEmail={user.email ?? undefined}
        userAvatar={user.image ?? undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center max-w-2xl mx-auto">
            <div className="text-7xl mb-6">🕷️</div>
            <h1 className="text-3xl font-bold mb-4 text-theme-primary">Welcome to Tarantuverse!</h1>
            <p className="text-theme-secondary mb-8 max-w-md mx-auto text-lg">
              Start your journey by adding your first tarantula to the collection. Track feedings, molts, husbandry, and more.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={handleAddTarantula}
                className="px-8 py-4 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl text-lg"
              >
                ➕ Add First Tarantula
              </button>
              <button
                onClick={() => router.push('/species')}
                className="px-8 py-4 bg-surface border border-theme text-theme-primary rounded-xl hover:bg-surface-elevated transition-all duration-200 font-semibold shadow-lg text-lg"
              >
                📖 Browse Species
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user.name ?? undefined}
      userEmail={user.email ?? undefined}
      userAvatar={user.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Free Tier Warning Banner */}
        {!subscriptionLimits?.is_premium &&
         tarantulas.length >= 10 &&
         tarantulas.length < 15 &&
         showWarning && (
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="font-bold text-theme-primary mb-1">Approaching Free Tier Limit</h3>
                  <p className="text-sm text-theme-secondary mb-3">
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
                      className="px-4 py-2 bg-surface border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-surface-elevated transition font-semibold text-sm"
                    >
                      Redeem Promo Code
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="text-theme-tertiary hover:text-theme-primary ml-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(tarantulas.length / 15) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Announcement Banner */}
        <AnnouncementBanner />

        {/* Quick Stats Row */}
        <div data-tour="stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Collection */}
          <button
            onClick={() => router.push('/dashboard/tarantulas')}
            className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg">
                🕷️
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">My Collection</p>
                <p className="text-3xl font-bold text-theme-primary">{tarantulas.length}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-theme-tertiary group-hover:text-theme-secondary transition-colors">
              View all →
            </p>
          </button>

          {/* Needs Feeding */}
          <button
            onClick={() => router.push('/dashboard/tarantulas')}
            className={`rounded-2xl shadow-lg border p-6 hover:shadow-xl transition-all text-left ${
              overdueFeedings.length > 0
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : 'bg-surface border-theme'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg ${
                overdueFeedings.length > 0
                  ? 'bg-red-500'
                  : 'bg-gradient-brand'
              }`}>
                {overdueFeedings.length > 0 ? '⚠️' : '✅'}
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Needs Feeding</p>
                <p className="text-3xl font-bold text-theme-primary">{overdueFeedings.length}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-theme-tertiary">
              {overdueFeedings.length > 0 ? '7+ days overdue' : 'All on schedule'}
            </p>
          </button>

          {/* Recent Molts */}
          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg">
                🦋
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Total Molts</p>
                <p className="text-3xl font-bold text-theme-primary">
                  {Array.from(premoltPredictions.values()).length > 0
                    ? Array.from(premoltPredictions.values()).filter(p => p.probability > 0).length
                    : '—'
                  }
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-theme-tertiary">Tracked specimens</p>
          </div>

          {/* Premolt Alerts */}
          <button
            onClick={() => router.push('/dashboard/tarantulas')}
            className={`rounded-2xl shadow-lg border p-6 hover:shadow-xl transition-all text-left ${
              premoltAlerts.length > 0
                ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                : 'bg-surface border-theme'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg ${
                premoltAlerts.length > 0
                  ? 'bg-purple-500'
                  : 'bg-gradient-brand'
              }`}>
                🔮
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Premolt Alerts</p>
                <p className="text-3xl font-bold text-theme-primary">{premoltAlerts.length}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-theme-tertiary">
              {premoltAlerts.length > 0 ? 'Medium+ confidence' : 'No alerts'}
            </p>
          </button>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column (2/3 width) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Feeding Alerts Section */}
            <div data-tour="feeding-alerts" className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
              <h2 className="text-xl font-bold text-theme-primary mb-4 flex items-center gap-2">
                🍽️ Feeding Alerts
              </h2>
              {overdueFeedings.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-theme-secondary font-medium">All tarantulas are fed on schedule!</p>
                  <p className="text-sm text-theme-tertiary mt-1">Great job keeping up with feedings.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {overdueFeedings.slice(0, 10).map(t => {
                    const days = feedingStatuses.get(t.id)?.days_since_last_feeding ?? 0
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30 flex-shrink-0">
                            {t.photo_url ? (
                              <img
                                src={getImageUrl(t.photo_url)}
                                alt={t.common_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg">🕷️</div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-theme-primary">{t.common_name}</p>
                            <p className={`text-sm font-medium ${
                              days >= 21 ? 'text-red-600 dark:text-red-400' :
                              days >= 14 ? 'text-orange-600 dark:text-orange-400' :
                              'text-yellow-600 dark:text-yellow-400'
                            }`}>
                              {days} days since last feeding
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => router.push(`/dashboard/tarantulas/${t.id}`)}
                          className="px-4 py-2 bg-gradient-brand text-white rounded-xl text-sm font-semibold hover:brightness-90 transition flex-shrink-0"
                        >
                          Log Feeding
                        </button>
                      </div>
                    )
                  })}
                  {overdueFeedings.length > 10 && (
                    <p className="text-sm text-theme-tertiary text-center pt-2">
                      + {overdueFeedings.length - 10} more overdue
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Communal Setups Section (conditional) */}
            {communalEnclosures.length > 0 && (
              <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-theme-primary flex items-center gap-2">
                    📦 Communal Setups
                  </h2>
                  <button
                    onClick={() => router.push('/dashboard/enclosures')}
                    className="text-sm text-theme-secondary hover:text-theme-primary font-medium transition-colors"
                  >
                    All Enclosures →
                  </button>
                </div>
                <div className="space-y-3">
                  {communalEnclosures.map(enc => (
                    <div
                      key={enc.id}
                      onClick={() => router.push(`/dashboard/enclosures/${enc.id}`)}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated hover:shadow-md transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl">
                          📦
                        </div>
                        <div>
                          <p className="font-semibold text-theme-primary">{enc.name}</p>
                          <p className="text-sm text-theme-secondary">
                            👥 {enc.population_count || enc.inhabitant_count} spiders
                            {enc.species_name && ` · ${enc.species_name}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-theme-tertiary">View →</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Premolt Watch List (if any) */}
            {premoltAlerts.length > 0 && (
              <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
                <h2 className="text-xl font-bold text-theme-primary mb-4 flex items-center gap-2">
                  🔮 Premolt Watch List
                </h2>
                <div className="space-y-3">
                  {premoltAlerts.slice(0, 5).map(t => {
                    const prediction = premoltPredictions.get(t.id)!
                    return (
                      <div
                        key={t.id}
                        onClick={() => router.push(`/dashboard/tarantulas/${t.id}`)}
                        className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated hover:shadow-md transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30 flex-shrink-0">
                            {t.photo_url ? (
                              <img
                                src={getImageUrl(t.photo_url)}
                                alt={t.common_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg">🕷️</div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-theme-primary">{t.common_name}</p>
                            <p className="text-sm text-theme-secondary italic">{t.scientific_name}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                          prediction.confidence_level === 'very_high' ? 'bg-red-500' :
                          prediction.confidence_level === 'high' ? 'bg-orange-500' :
                          'bg-yellow-500'
                        }`}>
                          🦋 {prediction.probability}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right column (1/3 width) */}
          <div className="space-y-8">
            {/* Quick Actions Grid */}
            <div data-tour="quick-actions" className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
              <h2 className="text-xl font-bold text-theme-primary mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: '➕', label: 'Add Tarantula', action: handleAddTarantula },
                  { icon: '🕷️', label: 'My Collection', action: () => router.push('/dashboard/tarantulas') },
                  { icon: '📊', label: 'Analytics', action: () => router.push('/dashboard/analytics') },
                  { icon: '📖', label: 'Species DB', action: () => router.push('/species') },
                  { icon: '🥚', label: 'Breeding', action: () => router.push('/dashboard/breeding') },
                  { icon: '📥', label: 'Import', action: () => router.push('/dashboard/tarantulas/import') },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface-elevated hover:bg-gradient-brand hover:text-white transition-all group border border-theme"
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-xs font-medium text-theme-secondary group-hover:text-white">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6">
              <h2 className="text-xl font-bold text-theme-primary mb-4">Recent Activity</h2>
              <ActivityFeed feedType="personalized" showFilters={false} />
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Tour (first visit only) */}
      <DashboardTour />

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
