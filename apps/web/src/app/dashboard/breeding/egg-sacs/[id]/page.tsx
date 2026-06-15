"use client"

/**
 * TV web egg sac detail — Sprint 6i.
 *
 * Mirror of HV clutch detail, adapted for TV. Surfaces:
 *   - Lifecycle status pill (Laid / Incubating / Hatched) inferred from
 *     dates + counts. Visual hint, never gates anything.
 *   - Survival rate when viable + spiderling counts are both present.
 *     Uses spiderling as the denominator since TV doesn't track
 *     fertile/slug separately.
 *   - KV grid (dates + counts) — only renders cells with real data, no
 *     "—" placeholders for missing fields.
 *   - Offspring sub-list filtered to this sac, each row links to its
 *     own detail page.
 *   - Delete with cascade-aware confirm; server CASCADEs offspring
 *     rows.
 *   - Link back to the parent pairing in the header crumb.
 *
 * No inline edit yet — delete + recreate is the recovery path for
 * incorrect data, same as HV clutch detail's v1.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate } from '@/lib/date'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
  price_sold: number | null
  buyer_info: string | null
}

const STATUS_LABEL: Record<string, string> = {
  kept: 'Kept',
  sold: 'Sold',
  traded: 'Traded',
  given_away: 'Given away',
  died: 'Died',
  unknown: 'Unknown',
}

export default function EggSacDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [sac, setSac] = useState<EggSac | null>(null)
  const [offspring, setOffspring] = useState<Offspring[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError('')
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [sRes, oRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/egg-sacs/${id}`, { headers }),
        fetch(`${API_URL}/api/v1/offspring/`, { headers }).catch(() => null),
      ])
      if (!sRes.ok) {
        throw new Error(`Couldn't load egg sac (${sRes.status})`)
      }
      const s: EggSac = await sRes.json()
      setSac(s)
      const oAll: Offspring[] = oRes && oRes.ok ? await oRes.json() : []
      setOffspring(oAll.filter((o) => o.egg_sac_id === id))
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load this egg sac.")
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

  async function handleDelete() {
    if (!sac || !token || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/egg-sacs/${sac.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Delete failed (${res.status})`)
      }
      // Route back to the parent pairing if we have it, otherwise overview.
      router.push(
        sac.pairing_id
          ? `/dashboard/breeding/pairings/${sac.pairing_id}`
          : '/dashboard/breeding',
      )
    } catch (err: any) {
      window.alert(err?.message || 'Could not delete the egg sac.')
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  // Lifecycle status — pure visual hint. Same heuristic as HV clutch
  // detail: hatch_date → Hatched; pulled_date or counts → Incubating;
  // otherwise → Laid.
  const lifecycle = ((): {
    label: string
    chip: string
  } | null => {
    if (!sac) return null
    if (sac.hatch_date) {
      return {
        label: 'Hatched',
        chip:
          'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700',
      }
    }
    if (sac.pulled_date || sac.spiderling_count != null) {
      return {
        label: 'Incubating',
        chip:
          'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
      }
    }
    return {
      label: 'Laid',
      chip:
        'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-700',
    }
  })()

  // Survival rate — viable / spiderling. Uses spiderling as the
  // denominator because TV doesn't track fertile vs slug separately
  // and "of the ones that emerged, how many lived" is the honest
  // framing without fabricating numbers.
  const survivalRate = ((): number | null => {
    if (!sac || sac.spiderling_count == null || sac.viable_count == null)
      return null
    const s = Number(sac.spiderling_count)
    const v = Number(sac.viable_count)
    if (!Number.isFinite(s) || !Number.isFinite(v) || s <= 0) return null
    return Math.round((v / s) * 100)
  })()

  const cascadeCopy = (() => {
    const n = offspring.length
    if (n === 0) return "This can't be undone."
    return `This will also delete ${n} offspring record${n === 1 ? '' : 's'} under it. This can't be undone.`
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

  if (loadError || !sac || !lifecycle) {
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
            {loadError || "Couldn't load this egg sac."}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout userName="" userEmail="">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/dashboard/breeding"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Breeding
          </Link>
          <span className="text-gray-400">›</span>
          <Link
            href={`/dashboard/breeding/pairings/${sac.pairing_id}`}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Pairing
          </Link>
          <span className="text-gray-400">›</span>
          <span className="text-gray-600 dark:text-gray-400">Egg sac</span>
        </div>

        {/* Hero */}
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Laid
              </p>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatLocalDate(sac.laid_date)}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider ${lifecycle.chip}`}
              >
                {lifecycle.label}
              </span>
              <button
                onClick={() => setDeleteConfirm(true)}
                aria-label="Delete egg sac"
                title="Delete egg sac"
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

          {survivalRate != null && (
            <div className="mt-6 p-4 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Survival rate
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {survivalRate}%
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                  {sac.viable_count} of {sac.spiderling_count} spiderlings
                </span>
              </p>
            </div>
          )}

          {/* KV grid — only renders cells with real data */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {sac.pulled_date && (
              <KV label="Pulled" value={formatLocalDate(sac.pulled_date)} />
            )}
            {sac.hatch_date && (
              <KV label="Hatched" value={formatLocalDate(sac.hatch_date)} />
            )}
            {sac.spiderling_count != null && (
              <KV
                label="Spiderlings"
                value={String(sac.spiderling_count)}
              />
            )}
            {sac.viable_count != null && (
              <KV label="Viable" value={String(sac.viable_count)} />
            )}
          </div>

          {sac.notes && (
            <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {sac.notes}
            </p>
          )}
        </div>

        {/* Offspring section */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Offspring ({offspring.length})
            </h2>
            <Link
              href={`/dashboard/breeding/offspring/add?egg_sac_id=${sac.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
            >
              + Add offspring
            </Link>
          </div>
          {offspring.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No offspring recorded for this sac yet. Click{' '}
                <strong>Add offspring</strong> to log a spiderling — status,
                sale info, and buyer notes per individual.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {offspring.map((o) => (
                <Link
                  key={o.id}
                  href={`/dashboard/breeding/offspring/${o.id}`}
                  className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {STATUS_LABEL[o.status] ?? o.status}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {o.status_date ? formatLocalDate(o.status_date) : ''}
                        {o.price_sold != null ? ` · $${o.price_sold}` : ''}
                        {o.buyer_info ? ` · ${o.buyer_info}` : ''}
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
                Delete egg sac?
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>Laid {formatLocalDate(sac.laid_date)}</strong>
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
