"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate } from '@/lib/date'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Pairing {
  id: string
  male_id: string
  female_id: string
  paired_date: string
  separated_date: string | null
  pairing_type: string
  outcome: string
  notes: string | null
  created_at: string
}

interface EggSac {
  id: string
  pairing_id: string
  laid_date: string
  pulled_date: string | null
  hatch_date: string | null
  spiderling_count: number | null
  viable_count: number | null
  notes: string | null
  created_at: string
}

interface Offspring {
  id: string
  egg_sac_id: string
  tarantula_id: string | null
  status: string
  status_date: string | null
  buyer_info: string | null
  price_sold: number | null
  notes: string | null
  created_at: string
}

interface BreedingAnalytics {
  totals: { pairings: number; egg_sacs: number; offspring: number }
  pairing_success_rate: number | null
  outcomes: Record<string, number>
  egg_sacs: {
    hatched: number
    hatch_rate: number | null
    avg_days_to_hatch: number | null
    avg_clutch_size: number | null
    avg_survival_rate: number | null
  }
  offspring: {
    status_breakdown: Record<string, number>
    total_revenue: number
    sold_count: number
    avg_sale_price: number | null
    revenue_per_pairing: number | null
  }
  top_females: Array<{ id: string; name: string; egg_sacs: number; offspring: number }>
  top_males: Array<{ id: string; name: string; egg_sacs: number; offspring: number }>
}

export default function BreedingPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const { canUseBreeding, loading: subLoading } = useSubscription()
  const [activeTab, setActiveTab] = useState<'analytics' | 'pairings' | 'egg-sacs' | 'offspring'>('analytics')
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [eggSacs, setEggSacs] = useState<EggSac[]>([])
  const [offspring, setOffspring] = useState<Offspring[]>([])
  const [analytics, setAnalytics] = useState<BreedingAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Bulk offspring actions
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAddOpen, setBulkAddOpen] = useState(false)
  const [bulkAdd, setBulkAdd] = useState({ egg_sac_id: '', count: '', status: 'unknown' })
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('sold')
  const [bulkPrice, setBulkPrice] = useState('')
  // Pairings declutter: a pairing that produced a sac auto-advances to
  // "successful" (concluded), so the active view stays short. Default to
  // active; concluded/all are one click away (history is never deleted).
  const [pairingFilter, setPairingFilter] = useState<'active' | 'concluded' | 'all'>('active')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchBreedingData()
  }, [router, isAuthenticated, isLoading, token])

  const fetchBreedingData = async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      const headers = { 'Authorization': `Bearer ${token}` }

      // Fetch all breeding data in parallel
      const [pairingsRes, eggSacsRes, offspringRes, analyticsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/pairings/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/egg-sacs/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/offspring/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/analytics/breeding`, { headers }).catch(() => null),
      ])

      if (pairingsRes?.ok) {
        setPairings(await pairingsRes.json())
      }
      if (eggSacsRes?.ok) {
        setEggSacs(await eggSacsRes.json())
      }
      if (offspringRes?.ok) {
        setOffspring(await offspringRes.json())
      }
      if (analyticsRes?.ok) {
        setAnalytics(await analyticsRes.json())
      }
    } catch (err) {
      console.error('Unexpected error fetching breeding data:', err)
      setError('Unable to connect to the server. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Delete a breeding record. Honest cascade-aware confirm so the
   * keeper knows what they're nuking — pairings → egg sacs → offspring
   * all CASCADE on the backend. Refetches the lists on success so the
   * other tabs reflect the cascade too.
   *
   * Returns true on success so callers can early-return out of follow-
   * up state work.
   */
  const handleDelete = async (
    kind: 'pairing' | 'egg-sac' | 'offspring',
    id: string,
  ): Promise<boolean> => {
    if (!token) return false
    const labels = {
      pairing:
        'Delete this pairing? Any egg sacs and offspring records under it will also be deleted. This can’t be undone.',
      'egg-sac':
        'Delete this egg sac? Any offspring records under it will also be deleted. This can’t be undone.',
      offspring: 'Delete this offspring record? This can’t be undone.',
    } as const
    if (!window.confirm(labels[kind])) return false
    const paths = {
      pairing: 'pairings',
      'egg-sac': 'egg-sacs',
      offspring: 'offspring',
    } as const
    try {
      const res = await fetch(`${API_URL}/api/v1/${paths[kind]}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Delete failed (${res.status}).`)
      }
      // Refetch every list — a pairing delete cascades to egg sacs +
      // offspring on the server, so stale local state on those two
      // tabs would lie to the keeper.
      await fetchBreedingData()
      return true
    } catch (err: any) {
      window.alert(err?.message || 'Could not delete that record.')
      return false
    }
  }

  /**
   * Inline-edit a single record's field (the common case is status /
   * outcome). PUTs the change and refetches so analytics + lists stay
   * in sync. Backend PUT endpoints already exist for all three kinds.
   */
  const patchRecord = async (
    kind: 'pairing' | 'egg-sac' | 'offspring',
    id: string,
    body: Record<string, unknown>,
  ) => {
    if (!token) return
    const paths = { pairing: 'pairings', 'egg-sac': 'egg-sacs', offspring: 'offspring' } as const
    try {
      const res = await fetch(`${API_URL}/api/v1/${paths[kind]}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Update failed (${res.status}).`)
      await fetchBreedingData()
    } catch (err: any) {
      window.alert(err?.message || 'Could not save that change.')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAdd = async () => {
    if (!token || bulkBusy) return
    const count = parseInt(bulkAdd.count, 10)
    if (!bulkAdd.egg_sac_id || !Number.isFinite(count) || count < 1) {
      window.alert('Pick an egg sac and a count of 1 or more.')
      return
    }
    setBulkBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/offspring/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ egg_sac_id: bulkAdd.egg_sac_id, count, status: bulkAdd.status }),
      })
      if (!res.ok) throw new Error(`Bulk add failed (${res.status}).`)
      setBulkAddOpen(false)
      setBulkAdd({ egg_sac_id: '', count: '', status: 'unknown' })
      await fetchBreedingData()
    } catch (err: any) {
      window.alert(err?.message || 'Could not create those records.')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkUpdate = async () => {
    if (!token || bulkBusy || selected.size === 0) return
    setBulkBusy(true)
    try {
      const body: Record<string, unknown> = { ids: Array.from(selected), status: bulkStatus }
      if (bulkPrice.trim()) body.price_sold = parseFloat(bulkPrice)
      const res = await fetch(`${API_URL}/api/v1/offspring/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Bulk update failed (${res.status}).`)
      setSelected(new Set())
      setBulkPrice('')
      await fetchBreedingData()
    } catch (err: any) {
      window.alert(err?.message || 'Could not update those records.')
    } finally {
      setBulkBusy(false)
    }
  }

  // Pairing lifecycle buckets for the declutter filter.
  const activePairings = pairings.filter((p) => p.outcome === 'in_progress')
  const concludedPairings = pairings.filter((p) => p.outcome !== 'in_progress')
  const shownPairings =
    pairingFilter === 'active'
      ? activePairings
      : pairingFilter === 'concluded'
        ? concludedPairings
        : pairings

  if (isLoading || loading || subLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="mb-8 animate-pulse">
            <div className="h-10 w-64 bg-surface-elevated rounded mb-2"></div>
            <div className="h-5 w-48 bg-surface-elevated rounded"></div>
          </div>

          {/* Stats cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-surface rounded-lg shadow-md p-6 border border-theme animate-pulse">
                <div className="h-5 w-32 bg-surface-elevated rounded mb-3"></div>
                <div className="h-10 w-16 bg-surface-elevated rounded"></div>
              </div>
            ))}
          </div>

          {/* Tabs skeleton */}
          <div className="mb-6 border-b border-theme animate-pulse">
            <div className="flex gap-4 pb-2">
              <div className="h-8 w-28 bg-surface-elevated rounded"></div>
              <div className="h-8 w-24 bg-surface-elevated rounded"></div>
              <div className="h-8 w-26 bg-surface-elevated rounded"></div>
            </div>
          </div>

          {/* Content skeleton */}
          <div className="bg-surface rounded-lg shadow-md border border-theme p-6 animate-pulse">
            <div className="flex justify-between items-center mb-6">
              <div className="h-7 w-40 bg-surface-elevated rounded"></div>
              <div className="h-10 w-32 bg-surface-elevated rounded-lg"></div>
            </div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 border border-theme rounded-lg">
                  <div className="h-4 w-48 bg-surface-elevated rounded mb-2"></div>
                  <div className="h-4 w-36 bg-surface-elevated rounded mb-2"></div>
                  <div className="h-4 w-40 bg-surface-elevated rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Premium gate - show upgrade prompt if user doesn't have breeding access
  if (!canUseBreeding()) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-3xl p-12 text-center border-2 border-purple-200 dark:border-purple-800 shadow-2xl">
            {/* Premium Badge */}
            <div className="w-24 h-24 bg-gradient-brand rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
              <span className="text-5xl">💎</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Breeding Module
            </h1>
            <p className="text-xl text-purple-600 dark:text-purple-400 font-semibold mb-6">
              Premium Feature
            </p>

            {/* Description */}
            <p className="text-gray-700 dark:text-gray-300 mb-8 max-w-2xl mx-auto text-lg">
              Unlock the complete breeding management system to track pairings, egg sacs, and offspring. Perfect for serious breeders who want to maintain detailed breeding records.
            </p>

            {/* Features list */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 mb-8 border border-purple-200 dark:border-purple-700 max-w-xl mx-auto">
              <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">Breeding Module includes:</h3>
              <ul className="space-y-3 text-left">
                <li className="flex items-start gap-3">
                  <span className="text-green-500 text-xl mt-0.5">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">Pairing records with outcome tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 text-xl mt-0.5">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">Egg sac monitoring and development tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 text-xl mt-0.5">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">Offspring management with sales tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 text-xl mt-0.5">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">Complete lineage and breeding history</span>
                </li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <button
                onClick={() => router.push('/pricing')}
                className="px-8 py-4 bg-gradient-brand text-white rounded-xl hover:shadow-2xl hover:brightness-90 transition font-bold text-lg"
              >
                View Premium Plans
              </button>
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="px-8 py-4 bg-white dark:bg-gray-800 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-bold text-lg"
              >
                Redeem Promo Code
              </button>
            </div>

            {/* Back link */}
            <div className="mt-8">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Breeding Records 💎</h1>
          <p className="text-gray-600 dark:text-gray-400">Track pairings, egg sacs, and offspring</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Total Pairings</h3>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{pairings.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Egg Sacs</h3>
            <p className="text-4xl font-bold text-green-600 dark:text-green-400">{eggSacs.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Offspring</h3>
            <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{offspring.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'analytics'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('pairings')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'pairings'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Pairings ({pairings.length})
            </button>
            <button
              onClick={() => setActiveTab('egg-sacs')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'egg-sacs'
                  ? 'border-green-600 text-green-600 dark:border-green-400 dark:text-green-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Egg Sacs ({eggSacs.length})
            </button>
            <button
              onClick={() => setActiveTab('offspring')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'offspring'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Offspring ({offspring.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Breeding Analytics</h2>
              {!analytics || analytics.totals.pairings === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="text-5xl mb-4">📊</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No breeding data yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    Record a pairing, egg sac, and offspring, and your success rates, survival rates, and revenue will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Metric cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Metric label="Pairing success" value={pctLabel(analytics.pairing_success_rate)} sub="produced an egg sac" />
                    <Metric label="Hatch rate" value={pctLabel(analytics.egg_sacs.hatch_rate)} sub={`${analytics.egg_sacs.hatched} of ${analytics.totals.egg_sacs} sacs`} />
                    <Metric label="Avg survival" value={pctLabel(analytics.egg_sacs.avg_survival_rate)} sub="viable ÷ clutch" />
                    <Metric label="Avg clutch size" value={analytics.egg_sacs.avg_clutch_size != null ? String(analytics.egg_sacs.avg_clutch_size) : '—'} sub="spiderlings" />
                    <Metric label="Avg days to hatch" value={analytics.egg_sacs.avg_days_to_hatch != null ? `${analytics.egg_sacs.avg_days_to_hatch}d` : '—'} sub="laid → hatched" />
                    <Metric label="Total revenue" value={`$${analytics.offspring.total_revenue.toLocaleString()}`} sub={`${analytics.offspring.sold_count} sold`} />
                    <Metric label="Avg sale price" value={analytics.offspring.avg_sale_price != null ? `$${analytics.offspring.avg_sale_price.toLocaleString()}` : '—'} sub="per offspring" />
                    <Metric label="Revenue / pairing" value={analytics.offspring.revenue_per_pairing != null ? `$${analytics.offspring.revenue_per_pairing.toLocaleString()}` : '—'} sub="across all pairings" />
                  </div>

                  {/* Top performers */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <TopPerformers title="Top females ♀" rows={analytics.top_females} />
                    <TopPerformers title="Top males ♂" rows={analytics.top_males} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pairings Tab */}
          {activeTab === 'pairings' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Pairing Records</h2>
                <Link
                  href="/dashboard/breeding/pairings/add"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  + New Pairing
                </Link>
              </div>
              {pairings.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="text-5xl mb-4">💑</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No pairings yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Record your first pairing to track cohabitation dates, type, and outcome across breeding attempts.
                  </p>
                  <Link
                    href="/dashboard/breeding/pairings/add"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                  >
                    + Record First Pairing
                  </Link>
                </div>
              ) : (
                <>
                  {/* Lifecycle filter — keeps the active list short without
                      deleting anything. A pairing auto-concludes when it
                      produces a sac. */}
                  <div className="flex gap-2 mb-4">
                    {([
                      ['active', `Active (${activePairings.length})`],
                      ['concluded', `Concluded (${concludedPairings.length})`],
                      ['all', `All (${pairings.length})`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setPairingFilter(key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                          pairingFilter === key
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {shownPairings.length === 0 ? (
                    <div className="text-center py-10 px-4 text-gray-500 dark:text-gray-400 text-sm">
                      {pairingFilter === 'active'
                        ? 'No active pairings — every pairing has concluded. Switch to Concluded or All to see history.'
                        : 'Nothing here.'}
                    </div>
                  ) : (
                <div className="space-y-4">
                  {shownPairings.map((pairing) => (
                    // Row layout: Link wraps the textual content so the
                    // bulk of the row navigates to the detail page,
                    // while the trash button sits as a sibling. Putting
                    // a <button> inside an <a> is invalid HTML and would
                    // also steal the click anyway, so we keep them as
                    // adjacent flex children.
                    <div key={pairing.id} className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition">
                      <div className="flex justify-between items-start gap-3 p-4">
                        <Link
                          href={`/dashboard/breeding/pairings/${pairing.id}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <p className="text-sm text-gray-600 dark:text-gray-400">Paired: {formatLocalDate(pairing.paired_date)}</p>
                          <p className="text-sm text-gray-900 dark:text-white">Type: <span className="capitalize">{pairing.pairing_type}</span></p>
                          <p className="text-sm text-gray-900 dark:text-white">Outcome: <span className="capitalize">{pairing.outcome.replace(/_/g, ' ')}</span></p>
                          {pairing.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{pairing.notes}</p>}
                        </Link>
                        <select
                          value={pairing.outcome}
                          onChange={(e) => patchRecord('pairing', pairing.id, { outcome: e.target.value })}
                          aria-label="Pairing outcome"
                          className="flex-shrink-0 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 capitalize"
                        >
                          <option value="in_progress">In progress</option>
                          <option value="successful">Successful</option>
                          <option value="unsuccessful">Unsuccessful</option>
                          <option value="unknown">Unknown</option>
                        </select>
                        <button
                          onClick={() => handleDelete('pairing', pairing.id)}
                          aria-label="Delete pairing"
                          title="Delete pairing"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1 -m-1 flex-shrink-0"
                        >
                          {/* Trash icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Egg Sacs Tab */}
          {activeTab === 'egg-sacs' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Egg Sac Records</h2>
                <Link
                  href="/dashboard/breeding/egg-sacs/add"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  + New Egg Sac
                </Link>
              </div>
              {eggSacs.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="text-5xl mb-4">🥚</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No egg sacs recorded</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Log egg sacs from a successful pairing — track laid date, spiderling count, and hatch outcome.
                  </p>
                  <Link
                    href="/dashboard/breeding/egg-sacs/add"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                  >
                    + Log First Egg Sac
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {eggSacs.map((sac) => (
                    <div key={sac.id} className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm transition">
                      <div className="flex justify-between items-start gap-3 p-4">
                        <Link
                          href={`/dashboard/breeding/egg-sacs/${sac.id}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <p className="text-sm text-gray-600 dark:text-gray-400">Laid: {formatLocalDate(sac.laid_date)}</p>
                          {sac.spiderling_count && <p className="text-sm text-gray-900 dark:text-white">Count: {sac.spiderling_count} spiderlings</p>}
                          {sac.viable_count && <p className="text-sm text-gray-900 dark:text-white">Viable: {sac.viable_count}</p>}
                          {sac.hatch_date && <p className="text-sm text-gray-600 dark:text-gray-400">Hatched: {formatLocalDate(sac.hatch_date)}</p>}
                          {(() => {
                            const n = offspring.filter((o) => o.egg_sac_id === sac.id).length
                            return n > 0 ? <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">{n} offspring recorded</p> : null
                          })()}
                          {sac.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{sac.notes}</p>}
                        </Link>
                        <button
                          onClick={() => {
                            // Streamline sac → offspring: pre-fill the bulk-add
                            // modal with this sac and its viable/clutch count.
                            const prefill = sac.viable_count ?? sac.spiderling_count ?? ''
                            setBulkAdd({ egg_sac_id: sac.id, count: prefill ? String(prefill) : '', status: 'unknown' })
                            setActiveTab('offspring')
                            setBulkAddOpen(true)
                          }}
                          className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-md border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition"
                        >
                          Record offspring
                        </button>
                        <button
                          onClick={() => handleDelete('egg-sac', sac.id)}
                          aria-label="Delete egg sac"
                          title="Delete egg sac"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1 -m-1 flex-shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Offspring Tab */}
          {activeTab === 'offspring' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Offspring Records</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBulkAddOpen(true)}
                    className="px-4 py-2 border border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-500 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition"
                  >
                    + Bulk add
                  </button>
                  <Link
                    href="/dashboard/breeding/offspring/add"
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                  >
                    + New Offspring
                  </Link>
                </div>
              </div>

              {/* Bulk-action bar — appears when rows are selected */}
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{selected.size} selected</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Mark as</span>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 capitalize"
                  >
                    {['unknown', 'kept', 'sold', 'traded', 'given_away', 'died'].map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                  {bulkStatus === 'sold' && (
                    <input
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="Price each (optional)"
                      className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 w-40"
                    />
                  )}
                  <button
                    onClick={handleBulkUpdate}
                    disabled={bulkBusy}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    {bulkBusy ? 'Applying…' : 'Apply'}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                  >
                    Clear
                  </button>
                </div>
              )}
              {offspring.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="text-5xl mb-4">🕷️</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No offspring recorded</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Track individual slings after hatching — status (available, sold, kept), sale prices, and buyer notes.
                  </p>
                  <Link
                    href="/dashboard/breeding/offspring/add"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
                  >
                    + Record First Offspring
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {offspring.map((child) => (
                    <div key={child.id} className="border border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm transition">
                      <div className="flex justify-between items-start gap-3 p-4">
                        <input
                          type="checkbox"
                          checked={selected.has(child.id)}
                          onChange={() => toggleSelect(child.id)}
                          aria-label="Select offspring"
                          className="mt-1 flex-shrink-0 h-4 w-4 accent-purple-600"
                        />
                        <Link
                          href={`/dashboard/breeding/offspring/${child.id}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          {child.status_date && <p className="text-sm text-gray-600 dark:text-gray-400">{formatLocalDate(child.status_date)}</p>}
                          {child.price_sold && <p className="text-sm text-gray-900 dark:text-white">Sold for: ${child.price_sold}</p>}
                          {child.buyer_info && <p className="text-sm text-gray-600 dark:text-gray-400">Buyer: {child.buyer_info}</p>}
                          {child.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{child.notes}</p>}
                        </Link>
                        <select
                          value={child.status}
                          onChange={(e) => patchRecord('offspring', child.id, { status: e.target.value })}
                          aria-label="Offspring status"
                          className="flex-shrink-0 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 capitalize"
                        >
                          {['unknown', 'kept', 'sold', 'traded', 'given_away', 'died'].map((s) => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleDelete('offspring', child.id)}
                          aria-label="Delete offspring record"
                          title="Delete offspring record"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1 -m-1 flex-shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulk-add offspring modal */}
      {bulkAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !bulkBusy && setBulkAddOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Bulk add offspring</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Create many records at once from one egg sac.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Egg sac</label>
            <select
              value={bulkAdd.egg_sac_id}
              onChange={(e) => setBulkAdd({ ...bulkAdd, egg_sac_id: e.target.value })}
              className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select an egg sac…</option>
              {eggSacs.map((s) => (
                <option key={s.id} value={s.id}>
                  Laid {formatLocalDate(s.laid_date)}{s.spiderling_count ? ` · ${s.spiderling_count} slings` : ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Count</label>
                <input
                  value={bulkAdd.count}
                  onChange={(e) => setBulkAdd({ ...bulkAdd, count: e.target.value.replace(/[^0-9]/g, '') })}
                  inputMode="numeric"
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Status</label>
                <select
                  value={bulkAdd.status}
                  onChange={(e) => setBulkAdd({ ...bulkAdd, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white capitalize"
                >
                  {['unknown', 'kept', 'sold', 'traded', 'given_away', 'died'].map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkAddOpen(false)}
                disabled={bulkBusy}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={bulkBusy}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {bulkBusy ? 'Adding…' : 'Add offspring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

function pctLabel(v: number | null): string {
  return v != null ? `${v}%` : '—'
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function TopPerformers({
  title,
  rows,
}: {
  title: string
  rows: Array<{ id: string; name: string; egg_sacs: number; offspring: number }>
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-900 dark:text-white truncate mr-2">{r.name}</span>
              <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                {r.offspring} offspring · {r.egg_sacs} sac{r.egg_sacs === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
