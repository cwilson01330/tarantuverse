'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import ActivityFeed from '@/components/ActivityFeed'
import { SkeletonCard } from '@/components/ui/skeleton'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'
import { formatLocalDate } from '@/lib/date'

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
  // Pause state — see pst_20260502. When paused, the collection grid
  // shows a quiet purple "Paused" pill instead of the red "X days
  // overdue" treatment so a 7-month premolt sling doesn't read as a
  // husbandry emergency.
  is_feeding_paused?: boolean
  feeding_paused_reason?: string | null
}

interface PremoltPrediction {
  tarantula_id: string
  probability: number
  confidence_level: string
  status_text: string
}

// --- Multi-taxon (ADR-006) -------------------------------------------------
// The collection list shows every taxon. Tarantulas keep their rich badges
// (feeding status + premolt); the other taxa render lean cards. Non-tarantula
// detail/add pages are built in later web batches — until then those routes
// 404 (collection list parity is this batch's scope).
type TaxonKey = 'tarantula' | 'scorpion' | 'centipede' | 'whip_spider'

interface Animal {
  id: string
  taxon: TaxonKey
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  photo_url?: string
}

const TAXA: {
  key: TaxonKey
  label: string
  glyph: string
  listEndpoint: string
  addPath: string
  detailPath: (id: string) => string
}[] = [
  { key: 'tarantula', label: 'Tarantulas', glyph: '🕷', listEndpoint: '/api/v1/tarantulas/', addPath: '/dashboard/tarantulas/add', detailPath: (id) => `/dashboard/tarantulas/${id}` },
  { key: 'scorpion', label: 'Scorpions', glyph: '🦂', listEndpoint: '/api/v1/scorpions/', addPath: '/dashboard/inverts/add?taxon=scorpion', detailPath: (id) => `/dashboard/inverts/${id}` },
  { key: 'centipede', label: 'Centipedes', glyph: '🐛', listEndpoint: '/api/v1/centipedes/', addPath: '/dashboard/inverts/add?taxon=centipede', detailPath: (id) => `/dashboard/inverts/${id}` },
  { key: 'whip_spider', label: 'Whip spiders', glyph: '🕸️', listEndpoint: '/api/v1/whip-spiders/', addPath: '/dashboard/inverts/add?taxon=whip_spider', detailPath: (id) => `/dashboard/inverts/${id}` },
]

const TAXON_CONFIG: Record<TaxonKey, (typeof TAXA)[number]> = TAXA.reduce(
  (acc, t) => ({ ...acc, [t.key]: t }),
  {} as Record<TaxonKey, (typeof TAXA)[number]>,
)

export default function TarantulasPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const { canAddTarantula, isPremium } = useSubscription()
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  // Non-tarantula animals (scorpions + centipedes + whip spiders), each tagged
  // with its taxon. Merged with tarantulas for the unified collection list.
  const [otherAnimals, setOtherAnimals] = useState<Animal[]>([])
  const [taxonFilter, setTaxonFilter] = useState<'all' | TaxonKey>('all')
  const [showAddMenu, setShowAddMenu] = useState(false)
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
    // Gate on the whole collection (cross-taxon) since the cap counts all
    // animals, not just tarantulas.
    if (!canAddTarantula(tarantulas.length + otherAnimals.length)) {
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

      // Fetch the non-tarantula taxa in parallel and tag each with its
      // taxon. Each is non-fatal — an API that lags behind one taxon just
      // shows fewer animals rather than blanking the whole list.
      const otherTaxa = TAXA.filter((t) => t.key !== 'tarantula')
      const otherResults = await Promise.all(
        otherTaxa.map(async (t) => {
          try {
            const res = await fetch(`${API_URL}${t.listEndpoint}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!res.ok) return [] as Animal[]
            const rows = await res.json()
            return (Array.isArray(rows) ? rows : []).map((r: any) => ({
              id: r.id,
              taxon: t.key,
              common_name: r.common_name || r.name || '',
              scientific_name: r.scientific_name || '',
              sex: r.sex,
              date_acquired: r.date_acquired,
              photo_url: r.photo_url,
            })) as Animal[]
          } catch {
            return [] as Animal[]
          }
        }),
      )
      setOtherAnimals(otherResults.flat())

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
              is_feeding_paused: data.is_feeding_paused,
              feeding_paused_reason: data.feeding_paused_reason,
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
    if (!status) return null

    // Paused trumps everything. Don't surface a red "21d overdue" pill
    // on a tarantula the keeper has flagged as in-premolt.
    if (status.is_feeding_paused) {
      return (
        <span className="px-3 py-1 rounded-full bg-indigo-500/90 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
          \u23F8 Paused
        </span>
      )
    }

    // `== null` catches both null (spider has no feedings yet) AND
    // undefined (status hasn't loaded). The previous `=== undefined`
    // let null through and rendered "Fed nulld ago" on new spiders.
    if (status.days_since_last_feeding == null) return null

    const days = status.days_since_last_feeding
    let bgColor = 'bg-green-500/90'
    let textColor = 'text-white'
    let emoji = '\u2713'

    if (days >= 21) {
      bgColor = 'bg-red-500/90'
      emoji = '\u26A0\uFE0F'
    } else if (days >= 14) {
      bgColor = 'bg-orange-500/90'
      emoji = '\u23F0'
    } else if (days >= 7) {
      bgColor = 'bg-yellow-500/90'
      emoji = '\uD83D\uDCC5'
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

    if (prediction.confidence_level === 'very_high') {
      bgColor = 'bg-red-500/90'
    } else if (prediction.confidence_level === 'high') {
      bgColor = 'bg-orange-500/90'
    } else if (prediction.confidence_level === 'medium') {
      bgColor = 'bg-yellow-500/90'
    }

    return (
      <span className={`px-3 py-1 rounded-full ${bgColor} backdrop-blur-sm text-white text-xs font-semibold shadow-lg`}>
        🦋 {prediction.probability}% Premolt
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
                <div className="h-4 w-24 bg-surface-elevated rounded mb-4"></div>
                <div className="h-8 w-16 bg-surface-elevated rounded"></div>
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

  // Unified collection across all taxa. Tarantulas are tagged on the fly;
  // the other taxa are already tagged in otherAnimals.
  const allAnimals: Animal[] = [
    ...tarantulas.map((t) => ({
      id: t.id,
      taxon: 'tarantula' as const,
      common_name: t.common_name,
      scientific_name: t.scientific_name,
      sex: t.sex,
      date_acquired: t.date_acquired,
      photo_url: t.photo_url,
    })),
    ...otherAnimals,
  ]

  const filteredAnimals = allAnimals.filter((a) => {
    if (taxonFilter !== 'all' && a.taxon !== taxonFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        (a.common_name || '').toLowerCase().includes(q) ||
        (a.scientific_name || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Route the "Add Animal" choice to the right add flow.
  const handleAddPick = (taxon: TaxonKey) => {
    setShowAddMenu(false)
    if (taxon === 'tarantula') {
      // Preserve the free-tier gate for the existing tarantula add flow.
      handleAddTarantula()
    } else {
      router.push(TAXON_CONFIG[taxon].addPath)
    }
  }

  return (
    <DashboardLayout
      userName={user.name ?? undefined}
      userEmail={user.email ?? undefined}
      userAvatar={user.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tarantula Count Warning */}
        {!subscriptionLimits?.is_premium &&
         allAnimals.length >= (subscriptionLimits?.max_animals ?? 20) - 5 &&
         allAnimals.length < (subscriptionLimits?.max_animals ?? 20) &&
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
                    You have <strong>{allAnimals.length} of {subscriptionLimits?.max_animals ?? 20}</strong> animals on the free plan.
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
                style={{ width: `${(allAnimals.length / (subscriptionLimits?.max_animals ?? 20)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-wrap justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-theme-primary">My Collection</h1>
            <p className="text-theme-secondary mt-1">{allAnimals.length} in your collection</p>
          </div>
        </div>

        {/* Two-column layout for collection and activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content - Collection */}
          <div className="lg:col-span-2">
            {/* Search Bar */}
            {allAnimals.length > 0 && (
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

            {/* Taxon filter */}
            {allAnimals.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {([{ key: 'all' as const, label: 'All', glyph: '' }, ...TAXA]).map((t) => {
                  const active = taxonFilter === t.key
                  const count =
                    t.key === 'all'
                      ? allAnimals.length
                      : allAnimals.filter((a) => a.taxon === t.key).length
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTaxonFilter(t.key as 'all' | TaxonKey)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                        active
                          ? 'bg-gradient-brand text-white shadow-md'
                          : 'bg-surface border border-theme text-theme-secondary hover:text-theme-primary'
                      }`}
                      aria-pressed={active}
                    >
                      {'glyph' in t && t.glyph ? `${t.glyph} ` : ''}{t.label} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Collection Grid */}
            {allAnimals.length === 0 ? (
              <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
                <div className="text-6xl mb-4">🕷️</div>
                <h2 className="text-2xl font-bold mb-3 text-theme-primary">Your Collection is Empty</h2>
                <p className="text-theme-secondary mb-8 max-w-md mx-auto">
                  Start tracking your collection by adding your first animal! Keep detailed records of feedings, molts, and husbandry.
                </p>
                <button
                  onClick={() => setShowAddMenu(true)}
                  className="px-8 py-4 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
                >
                  ➕ Add Animal
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
                    {searchQuery ? `Search Results (${filteredAnimals.length})` : 'Collection'}
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
                      onClick={() => setShowAddMenu(true)}
                      className="px-6 py-3 bg-gradient-brand text-white rounded-xl hover:brightness-90 transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
                    >
                      ➕ Add Animal
                    </button>
                    <button
                      onClick={() => router.push('/dashboard/tarantulas/import')}
                      className="px-6 py-3 bg-surface border border-theme text-theme-primary rounded-xl hover:bg-surface-elevated transition-all duration-200 font-semibold shadow-lg"
                    >
                      📥 Import
                    </button>
                  </div>
                </div>

                {filteredAnimals.length === 0 ? (
                  <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-theme-secondary">No animals match your search.</p>
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
                        {filteredAnimals.map((animal) => {
                          const isT = animal.taxon === 'tarantula'
                          const feedingStatus = isT ? feedingStatuses.get(animal.id) : undefined
                          const premoltPrediction = isT ? premoltPredictions.get(animal.id) : undefined
                          const cfg = TAXON_CONFIG[animal.taxon]
                          return (
                            <tr
                              key={animal.id}
                              onClick={() => router.push(cfg.detailPath(animal.id))}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30 flex-shrink-0">
                                  {animal.photo_url ? (
                                    <img
                                      src={getImageUrl(animal.photo_url)}
                                      alt={animal.common_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl">{cfg.glyph}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-theme-primary">
                                  {!isT && <span className="mr-1">{cfg.glyph}</span>}
                                  {animal.common_name || animal.scientific_name}
                                </div>
                                <div className="text-sm text-theme-secondary italic sm:hidden">{animal.scientific_name}</div>
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <span className="text-sm italic text-theme-secondary">{animal.scientific_name}</span>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell align-middle">
                                {animal.sex ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold whitespace-nowrap">
                                    {animal.sex === 'male' ? '♂️' : animal.sex === 'female' ? '♀️' : '?'} {animal.sex}
                                  </span>
                                ) : (
                                  <span className="text-theme-tertiary text-sm">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 align-middle">
                                {!isT ? (
                                  <span className="text-theme-tertiary text-sm">—</span>
                                ) : feedingStatus?.is_feeding_paused ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                                    ⏸ Paused
                                  </span>
                                ) : feedingStatus?.days_since_last_feeding != null ? (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                                    feedingStatus.days_since_last_feeding >= 21 ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' :
                                    feedingStatus.days_since_last_feeding >= 14 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' :
                                    feedingStatus.days_since_last_feeding >= 7 ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' :
                                    'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
                                  }`}>
                                    {feedingStatus.days_since_last_feeding}d ago
                                  </span>
                                ) : (
                                  <span className="text-theme-tertiary text-sm">Not fed yet</span>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell align-middle">
                                {isT && premoltPrediction && premoltPrediction.confidence_level !== 'low' ? (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
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
                    {filteredAnimals.map((animal) => (
                      <div
                        key={animal.id}
                        onClick={() => router.push(TAXON_CONFIG[animal.taxon].detailPath(animal.id))}
                        className="group relative overflow-hidden rounded-2xl bg-surface shadow-lg hover:shadow-lg transition-all duration-300 cursor-pointer border border-theme hover:border-electric-blue-500/40"
                      >
                        {/* Image with gradient overlay */}
                        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30">
                          {animal.photo_url ? (
                            <>
                              <img
                                src={getImageUrl(animal.photo_url)}
                                alt={animal.common_name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-7xl bg-gradient-to-br from-electric-blue-900/50 to-neon-pink-900/50">
                              {TAXON_CONFIG[animal.taxon].glyph}
                            </div>
                          )}

                          {/* Status badges */}
                          <div className="absolute top-3 left-3 right-3 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                              {/* Premolt badge (left) — tarantula only */}
                              <div>
                                {animal.taxon === 'tarantula' ? getPremoltBadge(animal.id) : null}
                              </div>

                              {/* Right badge: feeding status for tarantulas,
                                  taxon label for the other taxa. */}
                              <div>
                                {animal.taxon === 'tarantula' ? (
                                  getFeedingStatusBadge(animal.id) || (
                                    <span className="px-3 py-1 rounded-full bg-surface-elevated backdrop-blur-sm text-theme-secondary text-xs font-semibold shadow-lg border border-theme">
                                      No data
                                    </span>
                                  )
                                ) : (
                                  <span className="px-3 py-1 rounded-full bg-surface-elevated backdrop-blur-sm text-theme-secondary text-xs font-semibold shadow-lg border border-theme">
                                    {TAXON_CONFIG[animal.taxon].glyph} {TAXON_CONFIG[animal.taxon].label.replace(/s$/, '')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5">
                          <h3 className="font-bold text-lg text-theme-primary mb-1 line-clamp-1">
                            {animal.common_name || animal.scientific_name}
                          </h3>
                          <p className="text-sm italic text-theme-secondary mb-3 line-clamp-1">
                            {animal.scientific_name}
                          </p>

                          {/* Quick stats */}
                          <div className="flex flex-wrap gap-2">
                            {animal.sex && (
                              <span className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-500/30">
                                {animal.sex === 'male' ? '♂️' : animal.sex === 'female' ? '♀️' : '?'} {animal.sex}
                              </span>
                            )}
                            {animal.date_acquired && (
                              <span className="px-3 py-1 rounded-lg bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 text-xs font-semibold border border-pink-200 dark:border-pink-500/30">
                                📅 {formatLocalDate(animal.date_acquired, { year: 'numeric', month: 'short' })}
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
      {allAnimals.length > 0 && (
        <button
          onClick={() => setShowAddMenu(true)}
          className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-brand text-white shadow-2xl shadow-gradient-brand hover:scale-110 hover:shadow-2xl transition-all duration-200 flex items-center justify-center text-2xl sm:text-3xl z-50"
          aria-label="Add animal"
        >
          ➕
        </button>
      )}

      {/* Add Animal picker — choose a taxon, route to its add flow. */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="bg-surface w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl border border-theme shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-theme-primary mb-1">Add to collection</h3>
            <p className="text-sm text-theme-secondary mb-3">What are you adding?</p>
            {TAXA.map((t) => (
              <button
                key={t.key}
                onClick={() => handleAddPick(t.key)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-elevated transition text-left"
              >
                <span className="text-2xl w-8 text-center">{t.glyph}</span>
                <span className="flex-1 font-semibold text-theme-primary">{t.label.replace(/s$/, '')}</span>
                <span className="text-theme-tertiary">›</span>
              </button>
            ))}
            <button
              onClick={() => setShowAddMenu(false)}
              className="w-full mt-2 py-3 rounded-xl bg-surface-elevated text-theme-secondary font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="Unlimited Animals"
        description="You've reached the free tier limit of 20 animals. Upgrade to Premium for unlimited tracking!"
      />
    </DashboardLayout>
  )
}
