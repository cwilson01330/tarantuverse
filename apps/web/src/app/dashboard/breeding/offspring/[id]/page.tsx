"use client"

/**
 * TV web offspring detail — Sprint 6i.
 *
 * Mirrors HV offspring detail / TV mobile offspring detail. Surfaces:
 *   - Status pill with tap-to-edit modal (6 statuses: kept / sold /
 *     traded / given_away / died / unknown). Status is the only field
 *     edited inline; all other fields require delete + recreate, same
 *     as pairing detail's outcome-only edit pattern.
 *   - KV grid for status_date, price_sold ($), buyer_info, linked
 *     tarantula name. Cells render only when the data exists — no "—"
 *     placeholders for missing fields.
 *   - Breadcrumb back to egg sac and (when resolvable) the parent
 *     pairing.
 *   - Delete affordance. Offspring is a leaf entity so the cascade
 *     copy stays simple; we don't try to "unlink" the optional
 *     tarantula record on delete (the kept-tarantula row is its own
 *     thing and should outlive the breeding record).
 *
 * Linked tarantula is resolved by fetching /tarantulas/ once and
 * looking up tarantula_id — TV's offspring schema only returns the ID,
 * not a denormalized name. Falls through silently if the tarantula has
 * been deleted since the link was made.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate } from '@/lib/date'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Offspring {
  id: string
  egg_sac_id: string
  tarantula_id: string | null
  status: string
  status_date: string | null
  buyer_info: string | null
  price_sold: number | string | null
  notes: string | null
  created_at: string
}

interface EggSac {
  id: string
  pairing_id: string
  laid_date: string
}

interface Tarantula {
  id: string
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
}

const STATUS_OPTIONS: Array<{
  key: string
  label: string
  help: string
  chip: string
}> = [
  {
    key: 'kept',
    label: 'Kept',
    help: 'In your collection.',
    chip:
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700',
  },
  {
    key: 'sold',
    label: 'Sold',
    help: 'Sold to another keeper.',
    chip:
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700',
  },
  {
    key: 'traded',
    label: 'Traded',
    help: 'Swapped for another animal.',
    chip:
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700',
  },
  {
    key: 'given_away',
    label: 'Given away',
    help: 'Gifted at no cost.',
    chip:
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700',
  },
  {
    key: 'died',
    label: 'Died',
    help: 'Didn’t survive.',
    chip:
      'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700',
  },
  {
    key: 'unknown',
    label: 'Unknown',
    help: 'Not yet tracked.',
    chip:
      'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  },
]

const STATUS_LOOKUP: Record<string, typeof STATUS_OPTIONS[number]> =
  STATUS_OPTIONS.reduce((acc, opt) => {
    acc[opt.key] = opt
    return acc
  }, {} as Record<string, typeof STATUS_OPTIONS[number]>)

function tarantulaName(t: Tarantula): string {
  return t.name?.trim() || t.common_name?.trim() || t.scientific_name?.trim() || 'Unnamed'
}

function formatMoney(value: number | string): string {
  const num = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(num)) return String(value)
  // Trim trailing zeros for whole-dollar amounts so $50 doesn't read as
  // "$50.00" (consistent with how HV displays transaction prices).
  return Number.isInteger(num) ? `$${num}` : `$${num.toFixed(2)}`
}

export default function OffspringDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [offspring, setOffspring] = useState<Offspring | null>(null)
  const [eggSac, setEggSac] = useState<EggSac | null>(null)
  const [linkedTarantula, setLinkedTarantula] = useState<Tarantula | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError('')
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const oRes = await fetch(`${API_URL}/api/v1/offspring/${id}`, {
        headers,
      })
      if (!oRes.ok) {
        throw new Error(`Couldn't load offspring (${oRes.status})`)
      }
      const o: Offspring = await oRes.json()
      setOffspring(o)

      // Fetch parent egg sac (for breadcrumb back to pairing) and any
      // linked tarantula in parallel. Both are best-effort — if either
      // 404s we just hide that part of the UI rather than failing the
      // whole screen.
      const sacFetch = fetch(
        `${API_URL}/api/v1/egg-sacs/${o.egg_sac_id}`,
        { headers },
      ).catch(() => null)
      const tFetch = o.tarantula_id
        ? fetch(`${API_URL}/api/v1/tarantulas/${o.tarantula_id}`, {
            headers,
          }).catch(() => null)
        : Promise.resolve(null)

      const [sacRes, tRes] = await Promise.all([sacFetch, tFetch])
      if (sacRes && sacRes.ok) {
        setEggSac(await sacRes.json())
      } else {
        setEggSac(null)
      }
      if (tRes && tRes.ok) {
        setLinkedTarantula(await tRes.json())
      } else {
        setLinkedTarantula(null)
      }
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load this offspring record.")
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

  async function handlePickStatus(nextStatus: string) {
    if (!offspring || !token || statusSaving) return
    if (nextStatus === offspring.status) {
      setStatusPickerOpen(false)
      return
    }
    setStatusSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/offspring/${offspring.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Update failed (${res.status})`)
      }
      const updated: Offspring = await res.json()
      setOffspring(updated)
      setStatusPickerOpen(false)
    } catch (err: any) {
      window.alert(err?.message || 'Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleDelete() {
    if (!offspring || !token || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/offspring/${offspring.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Delete failed (${res.status})`)
      }
      // Route back to the parent egg sac (preferred), then pairing, then overview.
      if (offspring.egg_sac_id) {
        router.push(`/dashboard/breeding/egg-sacs/${offspring.egg_sac_id}`)
      } else {
        router.push('/dashboard/breeding')
      }
    } catch (err: any) {
      window.alert(err?.message || 'Could not delete the offspring record.')
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

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

  if (loadError || !offspring) {
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
            {loadError || "Couldn't load this offspring record."}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const statusInfo = STATUS_LOOKUP[offspring.status] ?? STATUS_LOOKUP.unknown

  return (
    <DashboardLayout userName="" userEmail="">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Link
            href="/dashboard/breeding"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Breeding
          </Link>
          {eggSac?.pairing_id && (
            <>
              <span className="text-gray-400">›</span>
              <Link
                href={`/dashboard/breeding/pairings/${eggSac.pairing_id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Pairing
              </Link>
            </>
          )}
          <span className="text-gray-400">›</span>
          <Link
            href={`/dashboard/breeding/egg-sacs/${offspring.egg_sac_id}`}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Egg sac
          </Link>
          <span className="text-gray-400">›</span>
          <span className="text-gray-600 dark:text-gray-400">Offspring</span>
        </div>

        {/* Hero */}
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Status
              </p>
              <button
                type="button"
                onClick={() => setStatusPickerOpen(true)}
                aria-label="Change status"
                title="Tap to change status"
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold uppercase tracking-wider transition hover:shadow-sm hover:brightness-95 dark:hover:brightness-110 ${statusInfo.chip}`}
              >
                {statusInfo.label}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {statusInfo.help}
              </p>
            </div>
            <button
              onClick={() => setDeleteConfirm(true)}
              aria-label="Delete offspring"
              title="Delete offspring"
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

          {/* KV grid — only renders cells with real data */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {offspring.status_date && (
              <KV
                label="Status date"
                value={formatLocalDate(offspring.status_date)}
              />
            )}
            {offspring.price_sold != null && (
              <KV label="Price" value={formatMoney(offspring.price_sold)} />
            )}
            {offspring.buyer_info && (
              <KV
                label={
                  offspring.status === 'sold'
                    ? 'Buyer'
                    : offspring.status === 'traded'
                      ? 'Traded with'
                      : 'Given to'
                }
                value={offspring.buyer_info}
              />
            )}
          </div>

          {/* Linked tarantula — separate card so it stands out from the
              transactional fields */}
          {offspring.tarantula_id && (
            <div className="mt-6 p-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1">
                Linked to collection
              </p>
              {linkedTarantula ? (
                <Link
                  href={`/dashboard/tarantulas/${linkedTarantula.id}`}
                  className="text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                >
                  {tarantulaName(linkedTarantula)} ›
                </Link>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Linked tarantula no longer exists in your collection.
                </p>
              )}
            </div>
          )}

          {offspring.notes && (
            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Notes
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {offspring.notes}
              </p>
            </div>
          )}

          {!offspring.status_date &&
            offspring.price_sold == null &&
            !offspring.buyer_info &&
            !offspring.tarantula_id &&
            !offspring.notes && (
              <div className="mt-6 p-4 rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No transaction details recorded yet. Tap the status pill
                  above to mark it as <strong>sold</strong>,{' '}
                  <strong>kept</strong>, or another outcome — sale, buyer,
                  and link-to-collection fields appear when relevant.
                </p>
              </div>
            )}
        </div>
      </div>

      {/* Status picker modal */}
      {statusPickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !statusSaving && setStatusPickerOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Change status
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Sale and buyer details need to be updated separately for now —
                delete and recreate the record if those fields are wrong.
              </p>
            </div>
            <div className="p-3 grid grid-cols-1 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const selected = opt.key === offspring.status
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handlePickStatus(opt.key)}
                    disabled={statusSaving}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 rounded-md border text-left transition disabled:opacity-50 ${
                      selected
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wider ${opt.chip}`}
                      >
                        {opt.label}
                      </span>
                      <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
                        {opt.help}
                      </p>
                    </div>
                    {selected && (
                      <span className="text-blue-600 dark:text-blue-400 text-sm font-semibold">
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setStatusPickerOpen(false)}
                disabled={statusSaving}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
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
                Delete offspring record?
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>{statusInfo.label}</strong>
                {offspring.status_date
                  ? ` · ${formatLocalDate(offspring.status_date)}`
                  : ''}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This can&rsquo;t be undone.
                {offspring.tarantula_id && linkedTarantula
                  ? ' The linked tarantula in your collection won’t be affected.'
                  : ''}
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
