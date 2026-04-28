'use client'

/**
 * Public reptile profile — the destination of label-QR scans.
 *
 * Renders an owner-aware card:
 *   - Owner (auth matches) → quick-action grid (Full detail / Log feeding /
 *                            Log shed) routes back into the app, plus the
 *                            extended husbandry block.
 *   - Visitor               → read-only public card.
 *
 * Backend already enforces visibility — a private collection returns 403
 * which surfaces here as an "owner has set this collection to private"
 * message. We don't try to leak data that the API didn't send.
 *
 * The page is intentionally narrow + tap-friendly: this is the screen a
 * keeper sees when they scan their enclosure label, often one-handed
 * while their other hand is opening a deli cup.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type PublicReptileProfile,
  getPublicProfile,
} from '@/lib/qr'

interface Props {
  taxon: 'snake' | 'lizard'
  animalId: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: PublicReptileProfile }
  | { kind: 'private' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }

export default function ReptilePublicProfile({ taxon, animalId }: Props) {
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    getPublicProfile(taxon, animalId)
      .then((profile) => {
        if (cancelled) return
        setState({ kind: 'ready', profile })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setState({ kind: 'private' })
            return
          }
          if (err.status === 404) {
            setState({ kind: 'not_found' })
            return
          }
          setState({ kind: 'error', message: err.message })
          return
        }
        setState({
          kind: 'error',
          message: "Couldn't load this profile.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [taxon, animalId])

  // ---------------------------------------------------------------------------
  // States that can short-circuit
  // ---------------------------------------------------------------------------
  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-herp-teal border-t-transparent animate-spin" />
      </div>
    )
  }

  if (state.kind === 'private' || state.kind === 'not_found') {
    const isPrivate = state.kind === 'private'
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl mb-2">{isPrivate ? '🔒' : '🦎'}</div>
          <h1 className="text-xl font-semibold text-white">
            {isPrivate ? 'Private collection' : 'Not found'}
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {isPrivate
              ? "This keeper's collection is set to private. Ask them to share their profile if you'd like to see it."
              : "We couldn't find a reptile with this ID. The link may be wrong or the keeper may have deleted the entry."}
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-sm text-herp-teal hover:text-herp-lime"
          >
            ← Back to Herpetoverse
          </Link>
        </div>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-5xl mb-2">⚠️</div>
          <h1 className="text-xl font-semibold text-white">
            Couldn&rsquo;t load this profile
          </h1>
          <p className="text-sm text-neutral-400">{state.message}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-2 px-4 py-2 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Profile loaded
  // ---------------------------------------------------------------------------
  const p = state.profile
  const taxonGlyph = p.taxon === 'snake' ? '🐍' : '🦎'

  // Quick-action destinations for the owner. Tarantuverse uses query
  // params (?log=feeding); we keep the same shape so the dashboard pages
  // can read the param and pre-open the relevant log form.
  const detailHref =
    p.taxon === 'snake'
      ? `/app/reptiles/${p.id}`
      : `/app/reptiles/lizards/${p.id}`
  const logFeedingHref = `${detailHref}?log=feeding`
  const logShedHref = `${detailHref}?log=shed`

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Hero — photo + identity */}
        <header className="space-y-3">
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photo_url}
              alt={p.display_name}
              className="w-full aspect-[4/3] object-cover rounded-xl border border-neutral-800"
              draggable={false}
            />
          ) : (
            <div className="w-full aspect-[4/3] flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900/40 text-7xl">
              {taxonGlyph}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {p.display_name}
            </h1>
            {p.scientific_name && (
              <p className="text-sm italic text-neutral-400">
                {p.scientific_name}
              </p>
            )}
            {p.owner_username && !p.is_owner && (
              <p className="text-xs text-neutral-500">
                Kept by{' '}
                <Link
                  href={`/community/${p.owner_username}`}
                  className="text-herp-teal hover:text-herp-lime"
                >
                  {p.owner_username}
                </Link>
              </p>
            )}
          </div>

          {/* Identity chips */}
          <div className="flex flex-wrap gap-2">
            {p.sex && p.sex !== 'unknown' && (
              <Chip
                label={p.sex === 'female' ? 'Female' : 'Male'}
                tone={p.sex === 'female' ? 'pink' : 'blue'}
              />
            )}
            {p.species?.care_level && (
              <Chip label={p.species.care_level} tone="primary" />
            )}
            {p.husbandry?.brumation_active && (
              <Chip label="Brumating" tone="info" />
            )}
          </div>
        </header>

        {/* Owner quick actions — only shown when the visitor is the
            owner. Mirrors Tarantuverse /t/<id> UX. */}
        {p.is_owner && (
          <div className="grid grid-cols-3 gap-2">
            <ActionTile
              icon="📋"
              label="Full detail"
              href={detailHref}
              tone="primary"
            />
            <ActionTile
              icon="🍽️"
              label="Log feeding"
              href={logFeedingHref}
              tone="success"
            />
            <ActionTile
              icon="🐍"
              label="Log shed"
              href={logShedHref}
              tone="info"
            />
          </div>
        )}

        {/* Stats row */}
        {(p.current_weight_g != null ||
          p.last_feeding ||
          p.last_shed) && (
          <section className="grid grid-cols-3 gap-2">
            <Stat
              label="Weight"
              value={
                p.current_weight_g != null
                  ? `${formatNum(p.current_weight_g)} g`
                  : '—'
              }
            />
            <Stat
              label="Last fed"
              value={
                p.last_feeding?.date
                  ? relativeDate(p.last_feeding.date)
                  : '—'
              }
            />
            <Stat
              label="Last shed"
              value={
                p.last_shed?.date ? relativeDate(p.last_shed.date) : '—'
              }
            />
          </section>
        )}

        {/* Species snapshot — links to the full care sheet if available */}
        {p.species && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.2em] text-herp-lime font-medium">
                Species
              </h2>
              <Link
                href={`/app/species/${p.species.id}`}
                className="text-xs text-herp-teal hover:text-herp-lime"
              >
                Care sheet →
              </Link>
            </div>
            <p className="text-sm font-medium text-white">
              {p.species.common_names[0] || p.species.scientific_name}
            </p>
            <p className="text-xs italic text-neutral-400">
              {p.species.scientific_name}
            </p>
            {(p.species.temperature_min != null ||
              p.species.humidity_min != null) && (
              <dl className="grid grid-cols-2 gap-2 pt-2 text-xs">
                {p.species.temperature_min != null &&
                  p.species.temperature_max != null && (
                    <div>
                      <dt className="text-neutral-500">Temp</dt>
                      <dd className="text-neutral-200">
                        {formatNum(p.species.temperature_min)}–
                        {formatNum(p.species.temperature_max)}°F
                      </dd>
                    </div>
                  )}
                {p.species.humidity_min != null &&
                  p.species.humidity_max != null && (
                    <div>
                      <dt className="text-neutral-500">Humidity</dt>
                      <dd className="text-neutral-200">
                        {formatNum(p.species.humidity_min)}–
                        {formatNum(p.species.humidity_max)}%
                      </dd>
                    </div>
                  )}
              </dl>
            )}
          </section>
        )}

        {/* Photo gallery — visible to everyone since these were already
            uploaded as photos under this animal. Visitors get a peek. */}
        {p.photos.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.2em] text-herp-lime font-medium">
              Photos
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {p.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square rounded-md overflow-hidden border border-neutral-800 bg-neutral-900/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnail_url || photo.url}
                    alt={photo.caption || 'Reptile photo'}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Owner-only husbandry detail */}
        {p.is_owner && p.husbandry && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-[0.2em] text-herp-lime font-medium">
              Husbandry
            </h2>
            <DetailRow
              label="Feeding schedule"
              value={p.husbandry.feeding_schedule}
            />
            {p.hatch_date && (
              <DetailRow label="Hatched" value={formatDate(p.hatch_date)} />
            )}
            {p.date_acquired && (
              <DetailRow
                label="Acquired"
                value={formatDate(p.date_acquired)}
              />
            )}
            {p.source && (
              <DetailRow label="Source" value={titleCase(p.source)} />
            )}
            {p.source_breeder && (
              <DetailRow label="Breeder" value={p.source_breeder} />
            )}
            {p.notes && (
              <div className="pt-2 border-t border-neutral-800/60">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                  Notes
                </p>
                <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                  {p.notes}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="pt-4 text-center text-xs text-neutral-600">
          <Link href="/" className="hover:text-neutral-400">
            Herpetoverse
          </Link>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  tone,
}: {
  label: string
  tone: 'primary' | 'info' | 'pink' | 'blue'
}) {
  const colors: Record<typeof tone, string> = {
    primary: 'bg-herp-teal/15 text-herp-lime border-herp-teal/30',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    pink: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${colors[tone]}`}
    >
      {label}
    </span>
  )
}

function ActionTile({
  icon,
  label,
  href,
  tone,
}: {
  icon: string
  label: string
  href: string
  tone: 'primary' | 'success' | 'info'
}) {
  const bg: Record<typeof tone, string> = {
    primary: 'bg-herp-teal text-herp-dark hover:opacity-90',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500',
    info: 'bg-sky-600 text-white hover:bg-sky-500',
  }
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-semibold transition-colors ${bg[tone]}`}
    >
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      {label}
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-medium text-neutral-100 truncate">{value}</p>
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-xs uppercase tracking-wider text-neutral-500 w-28 flex-shrink-0">
        {label}
      </span>
      <span className="text-neutral-200">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNum(n: number | string): string {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return '—'
  return v
    .toFixed(1)
    .replace(/\.?0+$/, '')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Calendar-day "N days ago" formatter, matching the helper used elsewhere
 * in web-herpetoverse (lib/snakes.ts). Local-Date midnight construction
 * avoids the UTC-cutoff bug class that gave keepers in EST a "Today"
 * label after feeding the previous evening.
 */
function relativeDate(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '—'
  const now = new Date()
  const thenLocal = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  )
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round(
    (nowLocal.getTime() - thenLocal.getTime()) / 86_400_000,
  )
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return formatDate(iso)
}

function titleCase(s: string): string {
  return s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
