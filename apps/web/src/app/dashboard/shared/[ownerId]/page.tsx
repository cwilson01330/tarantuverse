'use client'

/**
 * A collection shared with you (co-keepers, PRD-shared-keeping rung 3).
 *
 * What's due, a one-tap Fed / Refused for loggers and up, and every animal —
 * each opening the ordinary detail page, which shows only what your role can
 * do. The owner's own animals never appear in your own collection list: a
 * shared collection is kept separate so counts, caps and exports stay clear.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { useAuth } from '@/hooks/useAuth'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import { ROLE_HELP, ROLE_LABEL, can, loadSharedWithMe, type SharedCollection } from '@/lib/coKeepers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const BTN = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-50'

interface Due {
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string
  photo_url: string | null
  days_since_last_feeding: number | null
  is_feeding_paused: boolean
  is_overdue: boolean
  interval_days: number | null
}
interface Row { id: string; name: string | null; common_name: string | null; scientific_name: string | null; taxon: string; photo_url: string | null }

function title(r: { name: string | null; common_name: string | null; scientific_name: string | null }): string {
  return r.name || r.common_name || r.scientific_name || 'Unnamed'
}

export default function SharedCollectionPage() {
  const { ownerId } = useParams<{ ownerId: string }>()
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()
  const [membership, setMembership] = useState<SharedCollection | null | undefined>(undefined)
  const [due, setDue] = useState<Due[] | null>(null)
  const [inverts, setInverts] = useState<Row[] | null>(null)
  const [colonies, setColonies] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const q = `collection=${encodeURIComponent(ownerId)}`

  const load = useCallback(async () => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const shared = await loadSharedWithMe(token, true)
    const m = shared?.collections.find((c) => c.owner.id === ownerId && c.app === 'tarantuverse') ?? null
    setMembership(m)
    if (!m) return
    const tz = new Date().getTimezoneOffset()
    const [d, i, c] = await Promise.all([
      fetch(`${API_URL}/api/v1/inverts/feeding-status?${q}&tz_offset_minutes=${tz}`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/api/v1/inverts/?${q}`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/api/v1/colonies/?${q}`, { headers }).then((r) => (r.ok ? r.json() : [])),
    ])
    setDue(d)
    setInverts(i)
    setColonies(c)
  }, [token, ownerId, q])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push(`/login?redirect=/dashboard/shared/${ownerId}`)
      return
    }
    void load().catch(() => setError('Could not load this collection.'))
  }, [isLoading, isAuthenticated, token, router, ownerId, load])

  const log = async (id: string, accepted: boolean) => {
    if (!token) return
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}/feedings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fed_at: new Date().toISOString(), accepted }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : "That didn't save.")
      }
      setDone((d) => ({ ...d, [id]: accepted ? 'Fed' : 'Refused' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.")
    } finally {
      setBusy(null)
    }
  }

  if (membership === null) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-surface border border-theme">
          <h1 className="text-xl font-bold text-theme-primary">This collection isn&apos;t shared with you</h1>
          <p className="text-theme-secondary mt-2">If you were removed or left, ask the owner for a new invite.</p>
          <Link href="/dashboard/sharing" className="inline-block mt-4 text-purple-700 dark:text-purple-300 underline">Back to Sharing</Link>
        </div>
      </DashboardLayout>
    )
  }

  const role = membership?.role
  const canLog = can(role, 'logger') && !membership?.read_only
  const canKeep = can(role, 'keeper') && !membership?.read_only
  const dueNow = (due ?? []).filter((d) => d.is_overdue && !d.is_feeding_paused)

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <Link href="/dashboard/sharing" className="text-sm text-purple-700 dark:text-purple-300 hover:underline">← Sharing</Link>
          <h1 className="text-2xl font-bold text-theme-primary">{membership ? `${membership.owner.name}'s collection` : 'Shared collection'}</h1>
          {membership && (
            <p className="text-theme-secondary">
              You&apos;re a <strong>{ROLE_LABEL[membership.role]}</strong> — {ROLE_HELP[membership.role]}
              {membership.read_only && membership.role !== 'viewer' && ' Read-only for now: the owner’s plan has lapsed.'}
            </p>
          )}
        </header>

        {error && <div role="alert" className="p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">{error}</div>}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-theme-primary">Due for feeding {due && <span className="text-theme-tertiary font-normal">({dueNow.length})</span>}</h2>
          {due === null && <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />}
          {due && dueNow.length === 0 && <p className="text-theme-secondary">Nothing overdue right now.</p>}
          <ul className="space-y-2">
            {dueNow.map((d) => (
              <li key={d.id} className="p-3 rounded-xl bg-surface border border-theme flex items-center justify-between gap-3 flex-wrap">
                <Link href={`/dashboard/inverts/${d.id}`} className="min-w-0">
                  <span className="font-medium text-theme-primary">{title(d)}</span>
                  <span className="block text-xs text-theme-tertiary">
                    {d.days_since_last_feeding == null ? 'Not fed yet' : `Fed ${d.days_since_last_feeding}d ago`}
                    {d.interval_days ? ` · every ${d.interval_days}d` : ''}
                  </span>
                </Link>
                {done[d.id] ? (
                  <span className="text-sm font-semibold text-green-700 dark:text-green-300">✓ {done[d.id]}</span>
                ) : canLog ? (
                  <span className="flex gap-2">
                    <button className={`${BTN} bg-green-700 text-white hover:bg-green-800`} disabled={busy === d.id} onClick={() => log(d.id, true)}>Fed</button>
                    <button className={`${BTN} border border-theme text-theme-primary`} disabled={busy === d.id} onClick={() => log(d.id, false)}>Refused</button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-theme-primary">Animals</h2>
            {canKeep && (
              <Link href={`/dashboard/inverts/add?taxon=tarantula&collection=${encodeURIComponent(ownerId)}`}
                className="text-sm font-semibold text-purple-700 dark:text-purple-300 hover:underline">
                + Add an animal
              </Link>
            )}
          </div>
          {inverts === null && <div className="h-24 rounded-xl bg-surface-elevated animate-pulse" />}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(inverts ?? []).map((r) => (
              <Link key={r.id} href={`/dashboard/inverts/${r.id}`}
                className="p-3 rounded-xl bg-surface border border-theme hover:shadow-md transition">
                <span className="text-lg mr-2" aria-hidden>{isInvertTaxon(r.taxon) ? INVERT_TAXA[r.taxon].glyph : '🐾'}</span>
                <span className="font-medium text-theme-primary">{title(r)}</span>
                {r.name && (r.common_name || r.scientific_name) && (
                  <span className="block text-xs text-theme-tertiary italic">{r.common_name || r.scientific_name}</span>
                )}
              </Link>
            ))}
            {(colonies ?? []).map((r) => (
              <Link key={r.id} href={`/dashboard/colonies/${r.id}`}
                className="p-3 rounded-xl bg-surface border border-theme hover:shadow-md transition">
                <span className="font-medium text-theme-primary">{title(r)}</span>
                <span className="block text-xs text-theme-tertiary">Colony</span>
              </Link>
            ))}
          </div>
          {inverts && colonies && inverts.length + colonies.length === 0 && (
            <p className="text-theme-secondary">No animals in this collection yet.</p>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
