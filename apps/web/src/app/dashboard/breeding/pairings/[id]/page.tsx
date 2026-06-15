"use client"

/**
 * TV web pairing detail — Sprint 6i.
 *
 * Closes the parity gap with HV web. Lets keepers:
 *   - See parent names + paired/separated dates + pairing type
 *   - Tap-to-edit outcome via modal (4 values: in_progress / successful
 *     / unsuccessful / unknown)
 *   - View egg sacs filtered to this pairing (each row links to detail)
 *   - Add a new egg sac with pairing_id pre-filled
 *   - Delete the whole pairing — cascade-aware confirm names the
 *     dependent egg sacs + offspring count so the keeper knows what
 *     gets nuked
 *
 * Parent names come from a single /tarantulas/ fetch since the
 * backend Pairing schema only returns IDs. The keeper's collection
 * is cached by Collection screen anyway so this is usually warm.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate } from '@/lib/date'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
}

interface Tarantula {
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
}

const OUTCOME_ORDER = [
  'in_progress',
  'successful',
  'unsuccessful',
  'unknown',
] as const

const OUTCOME_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  successful: 'Successful',
  unsuccessful: 'Unsuccessful',
  unknown: 'Unknown',
}

const OUTCOME_HELP: Record<string, string> = {
  in_progress: "Still trying or watching for results.",
  successful: 'Egg sac dropped or live offspring confirmed.',
  unsuccessful: 'Pair did not produce — moving on.',
  unknown: "Don't have a clean answer yet.",
}

// Tailwind classes for the outcome chip. fg/bg in light + dark mode.
const OUTCOME_CHIP: Record<string, string> = {
  in_progress:
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  successful:
    'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700',
  unsuccessful:
    'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
  unknown:
    'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
}

function displayName(t: Tarantula | undefined): string {
  if (!t) return 'Unknown'
  return t.name || t.common_name || t.scientific_name || 'Unnamed'
}

function fmtSimple(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PairingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [eggSacs, setEggSacs] = useState<EggSac[]>([])
  const [offspring, setOffspring] = useState<Offspring[]>([])
  const [tarantulaMap, setTarantulaMap] = useState<Map<string, Tarantula>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [savingOutcome, setSavingOutcome] = useState(false)
  const [outcomeError, setOutcomeError] = useState<string | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError('')
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [pRes, sRes, oRes, tRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/pairings/${id}`, { headers }),
        fetch(`${API_URL}/api/v1/egg-sacs/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/offspring/`, { headers }).catch(() => null),
        fetch(`${API_URL}/api/v1/tarantulas/`, { headers }).catch(() => null),
      ])
      if (!pRes.ok) {
        throw new Error(`Couldn't load pairing (${pRes.status})`)
      }
      const p: Pairing = await pRes.json()
      setPairing(p)
      const sacsAll: EggSac[] = sRes && sRes.ok ? await sRes.json() : []
      const thisSacs = sacsAll.filter((s) => s.pairing_id === id)
      setEggSacs(thisSacs)
      const oAll: Offspring[] = oRes && oRes.ok ? await oRes.json() : []
      const sacIds = new Set(thisSacs.map((s) => s.id))
      setOffspring(oAll.filter((o) => sacIds.has(o.egg_sac_id)))
      const tList: Tarantula[] = tRes && tRes.ok ? await tRes.json() : []
      const map = new Map<string, Tarantula>()
      for (const t of tList) map.set(t.id, t)
      setTarantulaMap(map)
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load this pairing.")
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    fetchAll()
  }, [authLoading, isAuthenticated, token, router, fetchAll])

  async function handlePickOutcome(next: string) {
    if (!pairing || !token || savingOutcome) return
    if (next === pairing.outcome) {
      setOutcomeOpen(false)
      return
    }
    setOutcomeError(null)
    setSavingOutcome(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/pairings/${pairing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ outcome: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Update failed (${res.status})`)
      }
      const updated: Pairing = await res.json()
      setPairing(updated)
      setOutcomeOpen(false)
    } catch (err: any) {
      setOutcomeError(err?.message || "Couldn't update outcome.")
    } finally {
      setSavingOutcome(false)
    }
  }

  async function handleDelete() {
    if (!pairing || !token || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/pairings/${pairing.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Delete failed (${res.status})`)
      }
      router.push('/dashboard/breeding')
    } catch (err: any) {
      window.alert(err?.message || 'Could not delete the pairing.')
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  const outcomeChip = pairing
    ? OUTCOME_CHIP[pairing.outcome] ?? OUTCOME_CHIP.unknown
    : ''

  // Cascade preview for the confirm dialog — be explicit about what
  // gets nuked so keepers don't lose offspring data by accident.
  const cascadeCopy = (() => {
    const sacCount = eggSacs.length
    const offCount = offspring.length
    if (sacCount === 0) return "This can't be undone."
    return `This will also delete ${sacCount} egg sac${sacCount === 1 ? '' : 's'}${
      offCount > 0
        ? ` and ${offCount} offspring record${offCount === 1 ? '' : 's'}`
        : ''
    } under it. This can't be undone.`
  })()

  if (loading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-4" />
          <div className="h-32 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError || !pairing) {
    return (
      <DashboardLayout userName="" userEmail="">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/dashboard/breeding"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Breeding
          </Link>
          <div className="mt-6 p-4 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
            {loadError || "Couldn't load this pairing."}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout userName="" userEmail="">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/dashboard/breeding"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Breeding
        </Link>

        {/* Hero */}
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                <span className="text-sky-500 dark:text-sky-400">♂</span>{' '}
                {displayName(tarantulaMap.get(pairing.male_id))}
                <span className="text-gray-400 dark:text-gray-600 mx-2">
                  ×
                </span>
                <span className="text-pink-500 dark:text-pink-400">♀</span>{' '}
                {displayName(tarantulaMap.get(pairing.female_id))}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Paired {formatLocalDate(pairing.paired_date)}
                {pairing.separated_date
                  ? ` · separated ${formatLocalDate(pairing.separated_date)}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOutcomeError(null)
                  setOutcomeOpen(true)
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 ${outcomeChip}`}
                aria-label={`Outcome: ${OUTCOME_LABEL[pairing.outcome] ?? pairing.outcome}. Click to change.`}
              >
                {OUTCOME_LABEL[pairing.outcome] ?? pairing.outcome}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                aria-label="Delete pairing"
                title="Delete pairing"
                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* KV grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KV label="Type" value={fmtSimple(pairing.pairing_type)} />
            <KV label="Paired" value={formatLocalDate(pairing.paired_date)} />
            {pairing.separated_date && (
              <KV
                label="Separated"
                value={formatLocalDate(pairing.separated_date)}
              />
            )}
          </div>

          {pairing.notes && (
            <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {pairing.notes}
            </p>
          )}
        </div>

        {/* Egg sacs section */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Egg sacs ({eggSacs.length})
            </h2>
            <Link
              href={`/dashboard/breeding/egg-sacs/add?pairing_id=${pairing.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
            >
              + Add egg sac
            </Link>
          </div>
          {eggSacs.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No egg sacs recorded for this pairing yet. Click{' '}
                <strong>Add egg sac</strong> once she drops to start
                tracking laid date, spiderling count, and hatch outcome.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {eggSacs.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/breeding/egg-sacs/${s.id}`}
                  className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Laid {formatLocalDate(s.laid_date)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {s.spiderling_count != null
                          ? `${s.spiderling_count} spiderlings`
                          : ''}
                        {s.spiderling_count != null && s.viable_count != null
                          ? ' · '
                          : ''}
                        {s.viable_count != null
                          ? `${s.viable_count} viable`
                          : ''}
                        {s.hatch_date
                          ? ` · hatched ${formatLocalDate(s.hatch_date)}`
                          : ''}
                      </p>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500 text-xl">
                      ›
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Outcome edit modal */}
      {outcomeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !savingOutcome && setOutcomeOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Update outcome
              </h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              {OUTCOME_ORDER.map((o) => {
                const selected = o === pairing.outcome
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => handlePickOutcome(o)}
                    disabled={savingOutcome}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition ${
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    } ${savingOutcome && !selected ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`mt-1 inline-block w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        selected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {OUTCOME_LABEL[o]}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {OUTCOME_HELP[o]}
                      </div>
                    </div>
                  </button>
                )
              })}
              {outcomeError && (
                <div className="mt-2 p-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
                  {outcomeError}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setOutcomeOpen(false)}
                disabled={savingOutcome}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !deleting && setDeleteConfirm(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Delete pairing?
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>
                  {displayName(tarantulaMap.get(pairing.male_id))} ×{' '}
                  {displayName(tarantulaMap.get(pairing.female_id))}
                </strong>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {cascadeCopy}
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  )
}
