'use client'

/**
 * Pairing detail.
 *
 * Top section: parent identity + key dates + outcome editor + privacy
 * toggle + notes. Below: clutches under this pairing, each linking to
 * its detail page where offspring + predicted-outcomes live.
 *
 * Updates are inline-mutating (no separate edit page) since the outcome
 * field is the most-changed thing here — keepers flip in_progress →
 * successful when eggs are laid, then to unsuccessful if the clutch
 * fails. Forcing a separate edit screen for that one click would be
 * friction.
 */

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type Clutch,
  type ReptilePairing,
  type ReptilePairingOutcome,
  PAIRING_OUTCOME_LABEL,
  PAIRING_TYPE_LABEL,
  deletePairing,
  getPairing,
  listClutchesForPairing,
  updatePairing,
} from '@/lib/breeding'

interface Params {
  id: string
}

export default function PairingDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [pairing, setPairing] = useState<ReptilePairing | null>(null)
  const [clutches, setClutches] = useState<Clutch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  // Initial load
  useEffect(() => {
    let cancelled = false
    Promise.all([getPairing(id), listClutchesForPairing(id)])
      .then(([p, cs]) => {
        if (cancelled) return
        setPairing(p)
        setClutches(cs)
        setNotesDraft(p.notes ?? '')
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load this pairing.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function applyUpdate(patch: Parameters<typeof updatePairing>[1]) {
    setUpdating(true)
    setError(null)
    try {
      const next = await updatePairing(id, patch)
      setPairing(next)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save changes.",
      )
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Delete this pairing? Its clutches and offspring will be removed too.',
      )
    )
      return
    setDeleting(true)
    setError(null)
    try {
      await deletePairing(id)
      router.push('/app/breeding')
    } catch (err) {
      setDeleting(false)
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete this pairing.",
      )
    }
  }

  if (!pairing && error) {
    return (
      <article className="max-w-2xl mx-auto">
        <BackLink />
        <div
          role="alert"
          className="mt-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      </article>
    )
  }
  if (!pairing) return <PairingDetailSkeleton />

  return (
    <article className="max-w-3xl mx-auto space-y-8">
      <BackLink />

      <header>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          {pairing.taxon === 'snake' ? 'Snake pairing' : 'Lizard pairing'}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
          <span className="text-sky-400">♂</span>{' '}
          {pairing.male_display_name ?? 'Male'}
          <span className="text-neutral-600 mx-3">×</span>
          <span className="text-pink-400">♀</span>{' '}
          {pairing.female_display_name ?? 'Female'}
        </h1>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Detail label="Paired" value={formatDate(pairing.paired_date)} />
          <Detail
            label="Separated"
            value={pairing.separated_date ? formatDate(pairing.separated_date) : '—'}
          />
          <Detail
            label="Type"
            value={PAIRING_TYPE_LABEL[pairing.pairing_type]}
          />
        </dl>
      </header>

      {error && pairing && (
        <div
          role="alert"
          className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {/* Outcome + privacy controls */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Status
        </h2>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            Outcome
          </label>
          <select
            value={pairing.outcome}
            disabled={updating}
            onChange={(e) =>
              applyUpdate({
                outcome: e.target.value as ReptilePairingOutcome,
              })
            }
            className={INPUT_CLS}
          >
            {(
              Object.keys(PAIRING_OUTCOME_LABEL) as ReptilePairingOutcome[]
            ).map((k) => (
              <option key={k} value={k}>
                {PAIRING_OUTCOME_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-3 p-3 rounded-md border border-neutral-800 cursor-pointer">
          <input
            type="checkbox"
            checked={pairing.is_private}
            disabled={updating}
            onChange={(e) =>
              applyUpdate({ is_private: e.target.checked })
            }
            className="mt-0.5 w-4 h-4 accent-herp-teal cursor-pointer"
          />
          <div>
            <div className="text-sm font-medium text-white">
              {pairing.is_private ? 'Private' : 'Public'}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              {pairing.is_private
                ? 'Visible only to you. Uncheck to share with the community.'
                : 'Visible to other keepers when your collection is set to public.'}
            </p>
          </div>
        </label>
      </section>

      {/* Notes — debounced inline save on blur */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Notes
        </h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const trimmed = notesDraft.trim() || null
            if (trimmed !== (pairing.notes ?? null)) {
              applyUpdate({ notes: trimmed })
            }
          }}
          rows={3}
          placeholder="Pairing observations, lock-ups, ovulation signs…"
          disabled={updating}
          className={INPUT_CLS}
        />
        <p className="text-[11px] text-neutral-500">Saved when you click away.</p>
      </section>

      {/* Clutches */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
            Clutches
          </h2>
          <Link
            href={`/app/breeding/pairings/${id}/clutches/new`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-herp-lime hover:border-herp-teal/40 transition-colors"
          >
            <span aria-hidden="true">＋</span> Log clutch
          </Link>
        </div>

        {clutches === null && <ClutchesListSkeleton />}

        {clutches !== null && clutches.length === 0 && (
          <p className="text-sm text-neutral-500 italic px-1">
            No clutches recorded yet.
          </p>
        )}

        {clutches && clutches.length > 0 && (
          <ul className="space-y-2">
            {clutches.map((c) => (
              <li key={c.id}>
                <ClutchRow clutch={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section className="pt-4 border-t border-neutral-800/60">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete this pairing'}
        </button>
        <p className="mt-1 text-[11px] text-neutral-600">
          Removes the pairing and all its clutches and offspring records.
        </p>
      </section>
    </article>
  )
}

function ClutchRow({ clutch: c }: { clutch: Clutch }) {
  return (
    <Link
      href={`/app/breeding/clutches/${c.id}`}
      className="block rounded-md border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 hover:bg-neutral-900/60 transition-colors p-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-white">
            Clutch laid {formatDate(c.laid_date)}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {c.hatch_date
              ? `Hatched ${formatDate(c.hatch_date)}`
              : c.expected_hatch_date
                ? `Expected ${formatDate(c.expected_hatch_date)}`
                : 'Incubation in progress'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          {c.expected_count != null && (
            <span>
              <span className="text-neutral-200 font-medium">
                {c.expected_count}
              </span>{' '}
              eggs
            </span>
          )}
          {c.hatched_count != null && (
            <span>
              <span className="text-neutral-200 font-medium">
                {c.hatched_count}
              </span>{' '}
              hatched
            </span>
          )}
          {c.offspring_count > 0 && (
            <span>
              <span className="text-herp-lime font-medium">
                {c.offspring_count}
              </span>{' '}
              recorded
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Mini-components
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/app/breeding"
      className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime"
    >
      <span aria-hidden="true">←</span> Pairings
    </Link>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-100">{value}</dd>
    </div>
  )
}

function PairingDetailSkeleton() {
  return (
    <article
      className="max-w-3xl mx-auto space-y-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-4 w-20 bg-neutral-900 rounded animate-pulse" />
      <div className="h-8 w-2/3 bg-neutral-900 rounded animate-pulse" />
      <div className="h-32 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      <div className="h-24 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
    </article>
  )
}

function ClutchesListSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true">
      {Array.from({ length: 2 }).map((_, i) => (
        <li
          key={i}
          className="h-16 rounded-md border border-neutral-800 bg-neutral-900/30 animate-pulse"
        />
      ))}
    </ul>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-sm text-neutral-100 placeholder-neutral-600'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
