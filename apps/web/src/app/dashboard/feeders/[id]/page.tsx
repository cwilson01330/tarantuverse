"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type InventoryMode = 'count' | 'life_stage'
type LogType =
  | 'fed_feeders'
  | 'cleaning'
  | 'water_change'
  | 'restock'
  | 'count_update'
  | 'note'

interface FeederColony {
  id: string
  user_id: string
  feeder_species_id: string | null
  enclosure_id: string | null
  name: string
  inventory_mode: InventoryMode
  count: number | null
  life_stage_counts: Record<string, number> | null
  last_restocked: string | null
  last_cleaned: string | null
  last_fed_date: string | null
  food_notes: string | null
  notes: string | null
  low_threshold: number | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  total_count: number | null
  is_low_stock: boolean
  species_display_name: string | null
  species_missing: boolean
}

interface FeederCareLog {
  id: string
  feeder_colony_id: string
  user_id: string
  log_type: LogType
  logged_at: string // YYYY-MM-DD
  count_delta: number | null
  notes: string | null
  created_at: string
}

interface QuickAction {
  type: LogType
  label: string
  icon: string
  needsCountInput: boolean
  allowNegative: boolean
  description: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    type: 'fed_feeders',
    label: 'Fed feeders',
    icon: '🥬',
    needsCountInput: false,
    allowNegative: false,
    description: 'You fed the colony (gut-load, veg, etc.)',
  },
  {
    type: 'cleaning',
    label: 'Cleaned',
    icon: '🧽',
    needsCountInput: false,
    allowNegative: false,
    description: 'Cleaned the bin',
  },
  {
    type: 'water_change',
    label: 'Water',
    icon: '💧',
    needsCountInput: false,
    allowNegative: false,
    description: 'Refreshed water / hydration source',
  },
  {
    type: 'restock',
    label: 'Restock',
    icon: '📦',
    needsCountInput: true,
    allowNegative: false,
    description: 'Added feeders to the colony',
  },
  {
    type: 'count_update',
    label: 'Adjust count',
    icon: '✏️',
    needsCountInput: true,
    allowNegative: true,
    description: 'Manual inventory correction (+/-)',
  },
  {
    type: 'note',
    label: 'Note',
    icon: '📝',
    needsCountInput: false,
    allowNegative: false,
    description: 'Free-form observation (no count change)',
  },
]

function categoryEmoji(name: string | null): string {
  if (!name) return '🦗'
  const n = name.toLowerCase()
  if (n.includes('cricket')) return '🦗'
  if (n.includes('roach') || n.includes('dubia') || n.includes('hisser')) return '🪳'
  if (n.includes('meal') || n.includes('super') || n.includes('worm') || n.includes('larva')) return '🐛'
  return '🦗'
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date()
  const ms = now.getTime() - then.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function formatDaysLabel(days: number | null, zeroLabel: string, neverLabel: string): string {
  if (days == null) return neverLabel
  if (days === 0) return zeroLabel
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function formatLogType(t: LogType): string {
  switch (t) {
    case 'fed_feeders':
      return 'Fed feeders'
    case 'cleaning':
      return 'Cleaned'
    case 'water_change':
      return 'Water change'
    case 'restock':
      return 'Restocked'
    case 'count_update':
      return 'Count update'
    case 'note':
      return 'Note'
  }
}

function formatLogDate(iso: string): string {
  // logged_at is a YYYY-MM-DD date; avoid TZ drift by parsing locally.
  const parts = iso.split('-').map((p) => Number.parseInt(p, 10))
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [y, m, d] = parts
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return iso
}

export default function FeederColonyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const colonyId = params?.id
  const { token, isAuthenticated, isLoading } = useAuth()

  const [colony, setColony] = useState<FeederColony | null>(null)
  const [logs, setLogs] = useState<FeederCareLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Quick-log panel state
  const [activeAction, setActiveAction] = useState<LogType | null>(null)
  const [panelDelta, setPanelDelta] = useState('')
  const [panelNotes, setPanelNotes] = useState('')
  const [panelSubmitting, setPanelSubmitting] = useState(false)
  const [panelError, setPanelError] = useState('')

  // Delete state
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchColony = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const [colonyRes, logsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/feeder-colonies/${colonyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/v1/feeder-colonies/${colonyId}/care-logs`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (!colonyRes.ok) {
        if (colonyRes.status === 404) {
          throw new Error('Colony not found')
        }
        throw new Error('Failed to load colony')
      }
      const colonyData = (await colonyRes.json()) as FeederColony
      setColony(colonyData)

      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as FeederCareLog[]
        setLogs(logsData)
      } else {
        setLogs([])
      }
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [colonyId, token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchColony()
  }, [isLoading, isAuthenticated, router, fetchColony])

  const openAction = (type: LogType) => {
    setActiveAction((prev) => (prev === type ? null : type))
    setPanelDelta('')
    setPanelNotes('')
    setPanelError('')
  }

  const closePanel = () => {
    setActiveAction(null)
    setPanelDelta('')
    setPanelNotes('')
    setPanelError('')
  }

  const submitLog = async () => {
    if (!token || !colony || !activeAction) return
    const action = QUICK_ACTIONS.find((a) => a.type === activeAction)
    if (!action) return

    let deltaNum: number | null = null
    if (action.needsCountInput) {
      if (panelDelta.trim() === '') {
        setPanelError('Enter a number.')
        return
      }
      const parsed = Number.parseInt(panelDelta, 10)
      if (!Number.isFinite(parsed)) {
        setPanelError('That doesn’t look like a number.')
        return
      }
      if (!action.allowNegative && parsed < 0) {
        setPanelError('Restock amounts must be positive — use Adjust count to remove.')
        return
      }
      deltaNum = parsed
    }

    const payload: Record<string, unknown> = { log_type: activeAction }
    if (deltaNum !== null) payload.count_delta = deltaNum
    if (panelNotes.trim()) payload.notes = panelNotes.trim()

    setPanelSubmitting(true)
    setPanelError('')
    try {
      const res = await fetch(
        `${API_URL}/api/v1/feeder-colonies/${colony.id}/care-logs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to log care event')
      }
      closePanel()
      await fetchColony()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setPanelSubmitting(false)
    }
  }

  const deleteLog = async (logId: string) => {
    if (!token || !colony) return
    if (!confirm('Delete this log entry? Inventory changes it caused will NOT be reverted.')) {
      return
    }
    try {
      const res = await fetch(
        `${API_URL}/api/v1/feeder-colonies/care-logs/${logId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to delete log')
      }
      await fetchColony()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const deleteColony = async () => {
    if (!token || !colony) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-colonies/${colony.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to delete colony')
      }
      router.push('/dashboard/feeders')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const totalCountLabel = useMemo(() => {
    if (!colony) return '—'
    if (colony.total_count == null) return '—'
    return colony.total_count.toLocaleString()
  }, [colony])

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-6 w-32 rounded bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-64 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError || !colony) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🦗</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError || 'Colony not found'}
          </h1>
          <p className="text-theme-secondary mb-6">
            It may have been deleted, or you may not have access to it.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/feeders"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Back to Feeders
            </Link>
            {loadError && (
              <button
                onClick={() => {
                  setLoading(true)
                  setLoadError('')
                  fetchColony()
                }}
                className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const fedDays = daysSince(colony.last_fed_date)
  const cleanedDays = daysSince(colony.last_cleaned)
  const restockedDays = daysSince(colony.last_restocked)
  const speciesLabel = colony.species_missing
    ? 'Species removed'
    : colony.species_display_name || 'No species set'
  const lifeStageEntries =
    colony.inventory_mode === 'life_stage' && colony.life_stage_counts
      ? Object.entries(colony.life_stage_counts)
      : []

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard/feeders"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back to Feeders
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-2 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-4xl flex-shrink-0" aria-hidden="true">
              {categoryEmoji(colony.species_display_name)}
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-theme-primary truncate">
                {colony.name}
              </h1>
              <p
                className={`mt-1 ${
                  colony.species_missing
                    ? 'italic text-theme-tertiary'
                    : 'text-theme-secondary'
                }`}
              >
                {speciesLabel}
              </p>
              {!colony.is_active && (
                <span
                  className="inline-block mt-2 text-xs font-semibold px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  aria-label="Archived colony"
                >
                  Archived
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/dashboard/feeders/${colony.id}/edit`}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Edit
            </Link>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Low-stock banner */}
        {colony.is_low_stock && (
          <div
            role="status"
            className="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-600/60 bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3"
          >
            <span aria-hidden="true" className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Running low
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200/80">
                Total count{' '}
                {colony.total_count == null ? 'unknown' : colony.total_count.toLocaleString()}{' '}
                is below your threshold of {colony.low_threshold}. Log a restock or adjust the threshold.
              </p>
            </div>
          </div>
        )}

        {/* Inventory card */}
        <section
          aria-labelledby="inventory-heading"
          className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
        >
          <h2
            id="inventory-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Inventory
          </h2>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-theme-primary">
              {totalCountLabel}
            </span>
            <span className="text-sm text-theme-tertiary">
              {colony.inventory_mode === 'life_stage' ? 'across stages' : 'total'}
            </span>
          </div>

          {lifeStageEntries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {lifeStageEntries.map(([stage, n]) => (
                <div
                  key={stage}
                  className="p-3 rounded-xl border border-theme bg-surface-elevated"
                >
                  <div className="text-xs capitalize text-theme-tertiary">{stage}</div>
                  <div className="text-xl font-semibold text-theme-primary">
                    {n.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-theme-tertiary">Last fed</div>
              <div className="text-theme-primary font-medium">
                {formatDaysLabel(fedDays, 'Today', 'Never')}
              </div>
            </div>
            <div>
              <div className="text-theme-tertiary">Last cleaned</div>
              <div className="text-theme-primary font-medium">
                {formatDaysLabel(cleanedDays, 'Today', 'Never')}
              </div>
            </div>
            <div>
              <div className="text-theme-tertiary">Last restocked</div>
              <div className="text-theme-primary font-medium">
                {formatDaysLabel(restockedDays, 'Today', 'Never')}
              </div>
            </div>
          </div>

          {colony.low_threshold != null && (
            <div className="mt-4 text-xs text-theme-tertiary">
              Low-stock alert at {colony.low_threshold.toLocaleString()}.
            </div>
          )}
        </section>

        {/* Quick-log actions */}
        <section aria-labelledby="quicklog-heading" className="mb-6">
          <h2
            id="quicklog-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Quick log
          </h2>
          <div
            role="group"
            aria-label="Quick-log actions"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2"
          >
            {QUICK_ACTIONS.map((action) => {
              const isActive = activeAction === action.type
              return (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => openAction(action.type)}
                  aria-pressed={isActive}
                  aria-label={`${action.label}: ${action.description}`}
                  className={`
                    p-3 rounded-xl border transition text-left
                    ${isActive
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-theme bg-surface hover:bg-surface-elevated'
                    }
                  `}
                >
                  <div className="text-2xl leading-none" aria-hidden="true">
                    {action.icon}
                  </div>
                  <div className="mt-2 text-sm font-medium text-theme-primary">
                    {action.label}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Expanded panel for the active action */}
          {activeAction && (
            <div className="mt-4 p-4 rounded-xl border border-theme bg-surface-elevated">
              {(() => {
                const action = QUICK_ACTIONS.find((a) => a.type === activeAction)
                if (!action) return null
                return (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-semibold text-theme-primary">
                          {action.icon} {action.label}
                        </div>
                        <div className="text-xs text-theme-tertiary mt-0.5">
                          {action.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closePanel}
                        aria-label="Cancel"
                        className="text-theme-tertiary hover:text-theme-primary transition px-2"
                      >
                        ✕
                      </button>
                    </div>

                    {panelError && (
                      <div
                        role="alert"
                        className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                      >
                        {panelError}
                      </div>
                    )}

                    {action.needsCountInput && (
                      <div className="mb-3">
                        <label
                          htmlFor="quicklog-delta"
                          className="block text-sm font-medium text-theme-primary mb-1"
                        >
                          {action.type === 'restock'
                            ? 'How many did you add?'
                            : 'Change amount (use − for removal)'}
                          {colony.inventory_mode === 'life_stage' && (
                            <span className="text-xs font-normal text-theme-tertiary ml-2">
                              — life-stage buckets must be updated separately in Edit.
                            </span>
                          )}
                        </label>
                        <input
                          id="quicklog-delta"
                          type="text"
                          inputMode={action.allowNegative ? 'text' : 'numeric'}
                          pattern={action.allowNegative ? '-?\\d*' : '\\d*'}
                          value={panelDelta}
                          onChange={(e) => {
                            const v = e.target.value
                            if (
                              v === '' ||
                              (action.allowNegative ? /^-?\d*$/ : /^\d*$/).test(v)
                            ) {
                              setPanelDelta(v)
                            }
                          }}
                          placeholder={action.type === 'restock' ? 'e.g. 100' : 'e.g. -10'}
                          className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                        />
                      </div>
                    )}

                    <div className="mb-3">
                      <label
                        htmlFor="quicklog-notes"
                        className="block text-sm font-medium text-theme-primary mb-1"
                      >
                        Notes {action.type === 'note' && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        id="quicklog-notes"
                        rows={2}
                        maxLength={2000}
                        value={panelNotes}
                        onChange={(e) => setPanelNotes(e.target.value)}
                        placeholder={
                          action.type === 'note'
                            ? 'What did you notice?'
                            : 'Optional — e.g. "fresh carrots + water crystals"'
                        }
                        className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={closePanel}
                        className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitLog}
                        disabled={
                          panelSubmitting ||
                          (action.type === 'note' && !panelNotes.trim())
                        }
                        className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {panelSubmitting ? 'Saving…' : 'Log it'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </section>

        {/* Notes section */}
        {(colony.food_notes || colony.notes) && (
          <section
            aria-labelledby="details-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="details-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
            >
              Details
            </h2>
            {colony.food_notes && (
              <div className="mb-3">
                <div className="text-xs text-theme-tertiary mb-1">Food / gut-load</div>
                <div className="text-theme-primary whitespace-pre-wrap">
                  {colony.food_notes}
                </div>
              </div>
            )}
            {colony.notes && (
              <div>
                <div className="text-xs text-theme-tertiary mb-1">Notes</div>
                <div className="text-theme-primary whitespace-pre-wrap">
                  {colony.notes}
                </div>
              </div>
            )}
          </section>
        )}

        {/* History */}
        <section aria-labelledby="history-heading" className="mb-10">
          <h2
            id="history-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            History
          </h2>
          {logs.length === 0 ? (
            <div className="p-6 rounded-2xl border border-theme bg-surface text-center text-theme-secondary">
              No care events yet. Use Quick log above to record your first one.
            </div>
          ) : (
            <ul className="divide-y divide-theme rounded-2xl border border-theme bg-surface overflow-hidden">
              {logs.map((log) => {
                const action = QUICK_ACTIONS.find((a) => a.type === log.log_type)
                return (
                  <li key={log.id} className="p-4 flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0" aria-hidden="true">
                      {action?.icon ?? '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-medium text-theme-primary">
                          {formatLogType(log.log_type)}
                          {log.count_delta != null && (
                            <span
                              className={`ml-2 text-sm font-semibold ${
                                log.count_delta > 0
                                  ? 'text-green-700 dark:text-green-400'
                                  : log.count_delta < 0
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-theme-tertiary'
                              }`}
                            >
                              {log.count_delta > 0 ? '+' : ''}
                              {log.count_delta.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-tertiary flex-shrink-0">
                          {formatLogDate(log.logged_at)}
                        </div>
                      </div>
                      {log.notes && (
                        <p className="mt-1 text-sm text-theme-secondary whitespace-pre-wrap">
                          {log.notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteLog(log.id)}
                      aria-label={`Delete ${formatLogType(log.log_type)} log`}
                      className="flex-shrink-0 text-theme-tertiary hover:text-red-600 dark:hover:text-red-400 transition px-2"
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Delete confirm modal */}
        {confirmDelete && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-heading"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => !deleting && setConfirmDelete(false)}
          >
            <div
              className="max-w-md w-full p-6 rounded-2xl bg-surface border border-theme shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="delete-dialog-heading"
                className="text-lg font-bold text-theme-primary mb-2"
              >
                Delete this colony?
              </h3>
              <p className="text-sm text-theme-secondary mb-5">
                All care logs for <strong>{colony.name}</strong> will be permanently deleted.
                This can’t be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteColony}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
