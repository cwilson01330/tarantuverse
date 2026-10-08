'use client'

/**
 * A collection shared with you (co-keepers, PRD-shared-keeping rung 3).
 *
 * What's due, a one-tap Fed / Refused for loggers and up, and every animal —
 * each opening the ordinary detail page, which shows only what your role can
 * do. Someone else's animals never appear in your own Reptiles list: a shared
 * collection is kept separate so counts, caps and exports stay clear.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/apiClient'
import { useAuth } from '@/lib/auth'
import {
  ANIMAL_TAXA,
  isAnimalTaxon,
  type Animal,
  type AnimalFeedingStatus,
  animalTitle,
} from '@/lib/animals'
import { MEMBER_APP, ROLE_HELP, ROLE_LABEL, can, loadSharedWithMe, type SharedCollection } from '@/lib/coKeepers'

const BTN = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-50'
const CARD = 'p-3 rounded-xl border border-neutral-800 bg-neutral-900/40'

function isDue(a: AnimalFeedingStatus): boolean {
  if (a.is_feeding_paused || a.is_brumating) return false
  return a.status_mode === 'daily' ? !a.fed_today : a.is_overdue
}

export default function SharedCollectionPage() {
  const { ownerId } = useParams<{ ownerId: string }>()
  const router = useRouter()
  const { token, isLoading } = useAuth()
  const [membership, setMembership] = useState<SharedCollection | null | undefined>(undefined)
  const [status, setStatus] = useState<AnimalFeedingStatus[] | null>(null)
  const [animals, setAnimals] = useState<Animal[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const q = `collection=${encodeURIComponent(ownerId)}`

  const load = useCallback(async () => {
    if (!token) return
    const shared = await loadSharedWithMe(token, true)
    const m = shared?.collections.find((c) => c.owner.id === ownerId && c.app === MEMBER_APP) ?? null
    setMembership(m)
    if (!m) return
    const tz = new Date().getTimezoneOffset()
    const [s, a] = await Promise.all([
      apiFetch<AnimalFeedingStatus[]>(`/api/v1/animals/feeding-status?${q}&tz_offset_minutes=${tz}`).catch(() => []),
      apiFetch<Animal[]>(`/api/v1/animals/?${q}`).catch(() => []),
    ])
    setStatus(s)
    setAnimals(a)
  }, [token, ownerId, q])

  useEffect(() => {
    if (isLoading) return
    if (!token) {
      router.replace(`/login?next=/app/shared/${encodeURIComponent(ownerId)}`)
      return
    }
    void load().catch(() => setError('Could not load this collection.'))
  }, [isLoading, token, router, ownerId, load])

  const log = async (id: string, accepted: boolean) => {
    setBusy(id)
    setError(null)
    try {
      if (accepted) {
        // Reuses the animal's last meal server-side, same as Feeding Day.
        await apiFetch(`/api/v1/animals/${encodeURIComponent(id)}/quick-feed`, { method: 'POST' })
      } else {
        await apiFetch(`/api/v1/animals/${encodeURIComponent(id)}/feedings`, {
          method: 'POST',
          json: { fed_at: new Date().toISOString(), accepted: false },
        })
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
      <div className="max-w-3xl mx-auto p-6 rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <h1 className="text-xl font-bold text-white">This collection isn&apos;t shared with you</h1>
        <p className="text-neutral-400 mt-2">If you were removed or left, ask the owner for a new invite.</p>
        <Link href="/app/sharing" className="inline-block mt-4 text-herp-teal hover:text-herp-lime">Back to Sharing</Link>
      </div>
    )
  }

  const canLog = can(membership?.role, 'logger') && !membership?.read_only
  const canKeep = can(membership?.role, 'keeper') && !membership?.read_only
  const due = (status ?? []).filter(isDue)

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="space-y-2">
        <Link href="/app/sharing" className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime">
          <span aria-hidden="true">←</span> Sharing
        </Link>
        <h1 className="text-3xl font-bold text-white">
          {membership ? `${membership.owner.name}'s collection` : 'Shared collection'}
        </h1>
        {membership && (
          <p className="text-neutral-400">
            You&apos;re a <strong className="text-neutral-200">{ROLE_LABEL[membership.role]}</strong> — {ROLE_HELP[membership.role]}
            {membership.read_only && membership.role !== 'viewer' && ' Read-only for now: the owner’s plan has lapsed.'}
          </p>
        )}
      </header>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm text-red-300">{error}</div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Due for feeding {status && <span className="text-neutral-500 normal-case tracking-normal">({due.length})</span>}
        </h2>
        {status === null && <div className="h-16 rounded-xl bg-neutral-900 animate-pulse" />}
        {status && due.length === 0 && <p className="text-neutral-400">Nothing due right now.</p>}
        <ul className="space-y-2">
          {due.map((a) => (
            <li key={a.id} className={`${CARD} flex items-center justify-between gap-3 flex-wrap`}>
              <Link href={`/app/reptiles/${a.id}`} className="min-w-0">
                <span className="font-medium text-neutral-100">{a.name || a.common_name || a.scientific_name || 'Unnamed'}</span>
                <span className="block text-xs text-neutral-500">
                  {a.days_since_last_feeding == null ? 'Not fed yet' : `Fed ${a.days_since_last_feeding}d ago`}
                  {a.interval_days ? ` · every ~${a.interval_days}d` : ''}
                </span>
              </Link>
              {done[a.id] ? (
                <span className="text-sm font-semibold text-herp-lime">✓ {done[a.id]}</span>
              ) : canLog ? (
                <span className="flex gap-2">
                  <button className={`${BTN} herp-gradient-bg text-herp-dark`} disabled={busy === a.id} onClick={() => log(a.id, true)}>Fed</button>
                  <button className={`${BTN} border border-neutral-700 text-neutral-200 hover:bg-neutral-800`} disabled={busy === a.id} onClick={() => log(a.id, false)}>Refused</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">Animals</h2>
          {canKeep && (
            <Link href={`/app/reptiles/add?collection=${encodeURIComponent(ownerId)}`}
              className="text-sm font-semibold text-herp-teal hover:text-herp-lime">
              + Add an animal
            </Link>
          )}
        </div>
        {animals === null && <div className="h-24 rounded-xl bg-neutral-900 animate-pulse" />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(animals ?? []).map((a) => (
            <Link key={a.id} href={`/app/reptiles/${a.id}`} className={`${CARD} hover:border-herp-teal/40 transition-colors`}>
              <span className="text-lg mr-2" aria-hidden>{isAnimalTaxon(a.taxon) ? ANIMAL_TAXA[a.taxon].glyph : '🦎'}</span>
              <span className="font-medium text-neutral-100">{animalTitle(a)}</span>
              {a.name && (a.common_name || a.scientific_name) && (
                <span className="block text-xs text-neutral-500 italic">{a.common_name || a.scientific_name}</span>
              )}
            </Link>
          ))}
        </div>
        {animals && animals.length === 0 && <p className="text-neutral-400">No animals in this collection yet.</p>}
      </section>
    </div>
  )
}
