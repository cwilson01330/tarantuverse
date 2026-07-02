'use client'

/**
 * Colony detail (web) — ADR-010 Colony mode.
 *
 * Shows a colony's total population + per-life-stage breakdown, husbandry info,
 * and a colony_events timeline with an inline "add event" quick form. Events
 * with a count_delta adjust a stage bucket server-side.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import {
  COLONY_EVENT_TYPES,
  colonyEventMeta,
  createColonyEvent,
  deleteColony,
  deleteColonyEvent,
  getColony,
  listColonyEvents,
  type ColonyEventResponse,
  type ColonyEventType,
  type ColonyResponse,
} from '@/lib/colonies'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getImageUrl(url?: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_URL}${url}`
}

function taxonGlyph(taxon: string): string {
  return isInvertTaxon(taxon) ? INVERT_TAXA[taxon].glyph : '🐾'
}
function taxonLabel(taxon: string): string {
  return isInvertTaxon(taxon) ? INVERT_TAXA[taxon].label : 'Invertebrate'
}

// occurred_at is a YYYY-MM-DD date; parse locally to avoid TZ drift.
function formatEventDate(iso: string): string {
  const parts = iso.split('-').map((p) => Number.parseInt(p, 10))
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [y, m, d] = parts
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return iso
}

function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

export default function ColonyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const colonyId = params?.id
  const { token, isAuthenticated, isLoading } = useAuth()

  const [colony, setColony] = useState<ColonyResponse | null>(null)
  const [events, setEvents] = useState<ColonyEventResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Add-event form
  const [evtType, setEvtType] = useState<ColonyEventType>('added')
  const [evtStage, setEvtStage] = useState('')
  const [evtDelta, setEvtDelta] = useState('')
  const [evtDate, setEvtDate] = useState(todayIso())
  const [evtSeverity, setEvtSeverity] = useState('')
  const [evtNotes, setEvtNotes] = useState('')
  const [evtSubmitting, setEvtSubmitting] = useState(false)
  const [evtError, setEvtError] = useState('')

  // Delete colony
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const [c, evs] = await Promise.all([
        getColony(token, colonyId),
        listColonyEvents(token, colonyId).catch(() => [] as ColonyEventResponse[]),
      ])
      setColony(c)
      setEvents(evs)
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
    fetchAll()
  }, [isLoading, isAuthenticated, router, fetchAll])

  const meta = evtType ? colonyEventMeta(evtType) : undefined
  const stageOptions = useMemo(() => {
    if (!colony?.stage_counts) return []
    return Object.keys(colony.stage_counts)
  }, [colony])

  const submitEvent = async () => {
    if (!token || !colony || !meta) return
    setEvtError('')

    let deltaNum: number | null = null
    if (meta.adjustsCount) {
      if (evtDelta.trim() === '') {
        setEvtError('Enter a count change (use − to remove).')
        return
      }
      const parsed = Number.parseInt(evtDelta, 10)
      if (!Number.isFinite(parsed)) {
        setEvtError('That doesn’t look like a number.')
        return
      }
      if (!meta.allowNegative && parsed < 0) {
        setEvtError(`${meta.label} amounts must be positive.`)
        return
      }
      deltaNum = parsed
    }

    setEvtSubmitting(true)
    try {
      await createColonyEvent(token, colony.id, {
        event_type: evtType,
        stage: evtStage.trim() || null,
        count_delta: deltaNum,
        occurred_at: evtDate || todayIso(),
        severity: meta.hasSeverity && evtSeverity ? evtSeverity : null,
        notes: evtNotes.trim() || null,
      })
      // Reset form (keep the type so logging several is quick)
      setEvtStage('')
      setEvtDelta('')
      setEvtSeverity('')
      setEvtNotes('')
      setEvtDate(todayIso())
      await fetchAll()
    } catch (e) {
      setEvtError(e instanceof Error ? e.message : 'Failed to log event')
    } finally {
      setEvtSubmitting(false)
    }
  }

  const removeEvent = async (eventId: string) => {
    if (!token || !colony) return
    if (
      !confirm(
        'Delete this event? Count changes it caused will NOT be reverted.',
      )
    ) {
      return
    }
    try {
      await deleteColonyEvent(token, eventId)
      await fetchAll()
    } catch (e) {
      setEvtError(e instanceof Error ? e.message : 'Failed to delete event')
    }
  }

  const removeColony = async () => {
    if (!token || !colony) return
    setDeleting(true)
    try {
      await deleteColony(token, colony.id)
      router.push('/dashboard/tarantulas')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const totalCountLabel = useMemo(() => {
    if (!colony || colony.total_count == null) return '—'
    const n = colony.total_count.toLocaleString()
    return colony.count_is_estimated ? `≈${n}` : n
  }, [colony])

  // ── Render ────────────────────────────────────────────────────────────────

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
          <div className="text-5xl mb-4" aria-hidden="true">🐾</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError || 'Colony not found'}
          </h1>
          <p className="text-theme-secondary mb-6">
            It may have been deleted, or you may not have access to it.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/tarantulas"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Back to collection
            </Link>
            {loadError && (
              <button
                onClick={() => {
                  setLoading(true)
                  setLoadError('')
                  fetchAll()
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

  const speciesLabel = colony.species_missing
    ? 'Species removed'
    : colony.species_display_name ||
      colony.species_scientific_name ||
      'No species set'
  const stageEntries = colony.stage_counts ? Object.entries(colony.stage_counts) : []
  const hasHusbandry =
    colony.substrate_type ||
    colony.substrate_depth ||
    colony.target_temp_min != null ||
    colony.target_temp_max != null ||
    colony.target_humidity_min != null ||
    colony.target_humidity_max != null ||
    colony.water_dish != null

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <Link
          href="/dashboard/tarantulas"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back to collection
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-2 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            {colony.photo_url ? (
              <img
                src={getImageUrl(colony.photo_url)}
                alt={colony.name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
              />
            ) : (
              <span className="text-4xl flex-shrink-0" aria-hidden="true">
                {taxonGlyph(colony.taxon)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-theme-primary truncate">
                  {colony.name}
                </h1>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200">
                  Colony
                </span>
              </div>
              <p
                className={`mt-1 ${
                  colony.species_missing
                    ? 'italic text-theme-tertiary'
                    : 'text-theme-secondary'
                }`}
              >
                {taxonGlyph(colony.taxon)} {taxonLabel(colony.taxon)} · {speciesLabel}
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
              href={`/dashboard/colonies/${colony.id}/edit`}
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

        {/* Population card */}
        <section
          aria-labelledby="population-heading"
          className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              id="population-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Population
            </h2>
            {colony.count_is_estimated && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                Estimated
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-theme-primary">{totalCountLabel}</span>
            <span className="text-sm text-theme-tertiary">total across stages</span>
          </div>

          {stageEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {stageEntries.map(([stage, n]) => (
                <span
                  key={stage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-theme bg-surface-elevated text-sm"
                >
                  <span className="capitalize text-theme-secondary">{stage}</span>
                  <span className="font-semibold text-theme-primary">
                    {n.toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-tertiary">
              No stage counts yet. Use “Log event” below to record births, additions, etc.
            </p>
          )}

          {colony.species_id && !colony.species_missing && (
            <Link
              href={`/species/inverts/${colony.species_id}`}
              className="inline-block mt-4 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              View care sheet →
            </Link>
          )}
        </section>

        {/* Husbandry card */}
        {hasHusbandry && (
          <section
            aria-labelledby="husbandry-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="husbandry-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
            >
              Husbandry
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {colony.substrate_type && (
                <div>
                  <div className="text-theme-tertiary">Substrate</div>
                  <div className="text-theme-primary font-medium">
                    {colony.substrate_type}
                    {colony.substrate_depth ? ` · ${colony.substrate_depth}` : ''}
                  </div>
                </div>
              )}
              {(colony.target_temp_min != null || colony.target_temp_max != null) && (
                <div>
                  <div className="text-theme-tertiary">Temperature</div>
                  <div className="text-theme-primary font-medium">
                    {colony.target_temp_min ?? '?'}–{colony.target_temp_max ?? '?'} °F
                  </div>
                </div>
              )}
              {(colony.target_humidity_min != null ||
                colony.target_humidity_max != null) && (
                <div>
                  <div className="text-theme-tertiary">Humidity</div>
                  <div className="text-theme-primary font-medium">
                    {colony.target_humidity_min ?? '?'}–{colony.target_humidity_max ?? '?'}%
                  </div>
                </div>
              )}
              {colony.water_dish != null && (
                <div>
                  <div className="text-theme-tertiary">Water dish</div>
                  <div className="text-theme-primary font-medium">
                    {colony.water_dish ? 'Yes' : 'No'}
                  </div>
                </div>
              )}
              {colony.last_substrate_change && (
                <div>
                  <div className="text-theme-tertiary">Last substrate change</div>
                  <div className="text-theme-primary font-medium">
                    {formatEventDate(colony.last_substrate_change)}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Notes */}
        {colony.notes && (
          <section
            aria-labelledby="notes-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="notes-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
            >
              Notes
            </h2>
            <div className="text-theme-primary whitespace-pre-wrap">{colony.notes}</div>
          </section>
        )}

        {/* Add event */}
        <section aria-labelledby="addevent-heading" className="mb-6">
          <h2
            id="addevent-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Log event
          </h2>
          <div className="p-4 rounded-2xl border border-theme bg-surface space-y-3">
            {evtError && (
              <div
                role="alert"
                className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
              >
                {evtError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evt-type"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Event type
                </label>
                <select
                  id="evt-type"
                  value={evtType}
                  onChange={(e) => setEvtType(e.target.value as ColonyEventType)}
                  className={inputCls}
                >
                  {COLONY_EVENT_TYPES.map((et) => (
                    <option key={et.type} value={et.type}>
                      {et.icon} {et.label}
                    </option>
                  ))}
                </select>
                {meta && (
                  <p className="text-xs text-theme-tertiary mt-1">{meta.description}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="evt-date"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Date
                </label>
                <input
                  id="evt-date"
                  type="date"
                  value={evtDate}
                  onChange={(e) => setEvtDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {meta?.adjustsCount && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="evt-stage"
                    className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                  >
                    Stage
                  </label>
                  {stageOptions.length > 0 ? (
                    <select
                      id="evt-stage"
                      value={evtStage}
                      onChange={(e) => setEvtStage(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— mixed —</option>
                      {stageOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="evt-stage"
                      value={evtStage}
                      onChange={(e) => setEvtStage(e.target.value)}
                      placeholder="e.g. nymphs (blank = mixed)"
                      className={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label
                    htmlFor="evt-delta"
                    className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                  >
                    Count change {meta.allowNegative ? '(use − to remove)' : ''}
                  </label>
                  <input
                    id="evt-delta"
                    type="text"
                    inputMode={meta.allowNegative ? 'text' : 'numeric'}
                    pattern={meta.allowNegative ? '-?\\d*' : '\\d*'}
                    value={evtDelta}
                    onChange={(e) => {
                      const v = e.target.value
                      if (
                        v === '' ||
                        (meta.allowNegative ? /^-?\d*$/ : /^\d*$/).test(v)
                      ) {
                        setEvtDelta(v)
                      }
                    }}
                    placeholder={meta.allowNegative ? 'e.g. -3' : 'e.g. 20'}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {meta?.hasSeverity && (
              <div>
                <label
                  htmlFor="evt-severity"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Severity
                </label>
                <select
                  id="evt-severity"
                  value={evtSeverity}
                  onChange={(e) => setEvtSeverity(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— not set —</option>
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="evt-notes"
                className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
              >
                Notes {evtType === 'observation' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                id="evt-notes"
                rows={2}
                maxLength={2000}
                value={evtNotes}
                onChange={(e) => setEvtNotes(e.target.value)}
                placeholder="Optional — what did you notice?"
                className={inputCls}
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={submitEvent}
                disabled={
                  evtSubmitting || (evtType === 'observation' && !evtNotes.trim())
                }
                className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {evtSubmitting ? 'Saving…' : 'Log it'}
              </button>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section aria-labelledby="timeline-heading" className="mb-10">
          <h2
            id="timeline-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Timeline
          </h2>
          {events.length === 0 ? (
            <div className="p-6 rounded-2xl border border-theme bg-surface text-center text-theme-secondary">
              No events yet. Use Log event above to record your first one.
            </div>
          ) : (
            <ul className="divide-y divide-theme rounded-2xl border border-theme bg-surface overflow-hidden">
              {events.map((ev) => {
                const em = colonyEventMeta(ev.event_type)
                return (
                  <li key={ev.id} className="p-4 flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0" aria-hidden="true">
                      {em?.icon ?? '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-medium text-theme-primary">
                          {em?.label ?? ev.event_type}
                          {ev.stage && (
                            <span className="ml-2 text-xs text-theme-tertiary capitalize">
                              {ev.stage}
                            </span>
                          )}
                          {ev.count_delta != null && (
                            <span
                              className={`ml-2 text-sm font-semibold ${
                                ev.count_delta > 0
                                  ? 'text-green-700 dark:text-green-400'
                                  : ev.count_delta < 0
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-theme-tertiary'
                              }`}
                            >
                              {ev.count_delta > 0 ? '+' : ''}
                              {ev.count_delta.toLocaleString()}
                            </span>
                          )}
                          {ev.severity && (
                            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 capitalize">
                              {ev.severity}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-tertiary flex-shrink-0">
                          {formatEventDate(ev.occurred_at)}
                        </div>
                      </div>
                      {ev.notes && (
                        <p className="mt-1 text-sm text-theme-secondary whitespace-pre-wrap">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvent(ev.id)}
                      aria-label={`Delete ${em?.label ?? ev.event_type} event`}
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
                All events for <strong>{colony.name}</strong> will be permanently
                deleted. This can’t be undone.
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
                  onClick={removeColony}
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
