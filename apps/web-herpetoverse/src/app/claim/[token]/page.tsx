'use client'

/**
 * Public animal-claim page (Herpetoverse).
 *
 * A seller shares /claim/{token} after a sale closes elsewhere. The buyer
 * lands here, sees the animal's identity + provenance, and taps "Claim this
 * animal." Claiming requires auth — logged-out buyers route to /login or
 * /register with `next=/claim/{token}` so the token survives sign-up and the
 * claim auto-resumes.
 *
 * Ported from the Tarantuverse claim page (apps/web/src/app/claim/[token]),
 * restyled into the Herpetoverse dark theme and pointed at the animal-aware
 * transfer path. Honesty-first: dam/sire are always null for reptiles &
 * amphibians, so there is NO pedigree block — only a plain provenance block.
 *
 * This page lives OUTSIDE /app so it renders without the AppShell / auth
 * gate: a brand-new buyer must be able to see the animal before signing up.
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getToken } from '@/lib/auth'
import { ApiError } from '@/lib/apiClient'
import {
  type TransferPreview,
  claimTransfer,
  previewTransfer,
} from '@/lib/transfers'
import { ANIMAL_TAXA, type AnimalTaxon } from '@/lib/animals'

const FALLBACK_GLYPH = '🦎'

function taxonGlyph(taxon: string): string {
  const meta = ANIMAL_TAXA[taxon as AnimalTaxon]
  return meta ? meta.glyph : FALLBACK_GLYPH
}

type Phase = 'loading' | 'ready' | 'claiming' | 'error'

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [authed, setAuthed] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [preview, setPreview] = useState<TransferPreview | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  // True when the register page flagged this claim as the reason for a
  // brand-new signup (resume-path marker). Drives an authoritative
  // new_signup on the claim call.
  const [fromSignup, setFromSignup] = useState(false)

  const claimPath = `/claim/${token}`

  // Read auth on mount (client-only; token lives in localStorage).
  useEffect(() => {
    setAuthed(!!getToken())
    setAuthReady(true)
  }, [])

  const loadPreview = useCallback(async () => {
    try {
      const data = await previewTransfer(token)
      setPreview(data)
      setPhase('ready')
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'This transfer link is invalid.'
          : 'Could not load this transfer. Check your connection and try again.',
      )
      setPhase('error')
    }
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  // Consume the one-shot resume-path marker set by the register page when
  // this claim drove the signup. Consume-once so a later re-claim in the same
  // tab can't falsely reuse it. Scoped to this token via the stored value.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('hv_claim_new_signup') === claimPath) {
        setFromSignup(true)
        sessionStorage.removeItem('hv_claim_new_signup')
      }
    } catch {
      // ignore — private mode
    }
  }, [claimPath])

  const handleClaim = useCallback(async () => {
    if (!authed) {
      router.push(`/login?next=${encodeURIComponent(claimPath)}`)
      return
    }
    setPhase('claiming')
    setError(null)
    try {
      const created = await claimTransfer(token, fromSignup || undefined)
      router.push(`/app/reptiles/${created.id}?welcome=1`)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong claiming this animal. Please try again.',
      )
      setPhase('ready')
      // Refresh the preview in case the status changed underneath us
      // (e.g. someone else claimed it, or it just expired).
      await loadPreview()
    }
  }, [authed, token, claimPath, router, loadPreview, fromSignup])

  // ── render ────────────────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 shadow-xl overflow-hidden">
        {children}
      </div>
    </div>
  )

  if (phase === 'loading' || !authReady) {
    return wrap(
      <div className="p-10 text-center text-neutral-500">Loading…</div>,
    )
  }

  if (phase === 'error' || !preview) {
    return wrap(
      <div className="p-8 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">🔗</div>
        <p className="text-neutral-200 font-medium mb-4">
          {error || 'Transfer not found.'}
        </p>
        <Link href="/" className="text-herp-teal hover:text-herp-lime font-semibold transition-colors">
          Go to Herpetoverse
        </Link>
      </div>,
    )
  }

  // Non-claimable states — clear messaging per status.
  if (preview.status !== 'pending') {
    const msg =
      preview.status === 'claimed'
        ? 'This animal has already been claimed.'
        : preview.status === 'cancelled'
          ? 'The seller cancelled this transfer.'
          : 'This transfer link has expired.'
    return wrap(
      <div className="p-8 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⏳</div>
        <p className="text-neutral-200 font-medium mb-4">{msg}</p>
        <Link href="/" className="text-herp-teal hover:text-herp-lime font-semibold transition-colors">
          Explore Herpetoverse
        </Link>
      </div>,
    )
  }

  const displayName =
    preview.name ||
    preview.common_name ||
    preview.scientific_name ||
    'this animal'

  return wrap(
    <>
      {preview.photo_urls?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.photo_urls[0]}
          alt={displayName}
          className="w-full h-56 object-cover"
        />
      ) : (
        <div className="w-full h-56 flex items-center justify-center text-6xl herp-gradient-bg">
          <span aria-hidden="true">{taxonGlyph(preview.taxon)}</span>
        </div>
      )}

      <div className="p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-herp-lime font-semibold mb-1">
          You&apos;ve been sent an animal
        </p>
        <h1 className="text-2xl font-bold text-white">{displayName}</h1>
        {preview.scientific_name && (
          <p className="text-neutral-400 italic">{preview.scientific_name}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {preview.sex && preview.sex.toLowerCase() !== 'unknown' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-800 text-neutral-200 capitalize">
              {preview.sex.toLowerCase()}
            </span>
          )}
          {preview.breeder_handle && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-herp-teal/15 text-herp-teal">
              from @{preview.breeder_handle}
            </span>
          )}
        </div>

        {preview.note && (
          <p className="mt-4 text-sm text-neutral-300 bg-neutral-950/50 rounded-lg p-3 border border-neutral-800">
            &ldquo;{preview.note}&rdquo;
          </p>
        )}

        {/* Provenance block — plain, honest. Reptiles & amphibians carry no
            dam/sire pedigree, so we only render what we actually know. */}
        <div className="mt-4 rounded-lg border border-neutral-800 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Provenance
          </p>
          <dl className="text-sm text-neutral-200 space-y-1">
            {preview.breeder_handle && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">From</dt>
                <dd>@{preview.breeder_handle}</dd>
              </div>
            )}
            {preview.scientific_name && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Species</dt>
                <dd className="italic text-right">{preview.scientific_name}</dd>
              </div>
            )}
            {preview.expires_at && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Link expires</dt>
                <dd>{fmtDate(preview.expires_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={handleClaim}
          disabled={phase === 'claiming'}
          className="mt-6 w-full py-3 herp-gradient-bg text-herp-dark rounded-xl font-bold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {phase === 'claiming'
            ? 'Adding…'
            : authed
              ? 'Claim this animal'
              : 'Sign in to claim'}
        </button>

        {!authed && (
          <p className="mt-3 text-center text-sm text-neutral-500">
            New here?{' '}
            <Link
              href={`/register?next=${encodeURIComponent(claimPath)}`}
              className="text-herp-teal hover:text-herp-lime font-semibold transition-colors"
            >
              Create a free account
            </Link>{' '}
            — your new animal will be waiting.
          </p>
        )}
      </div>
    </>,
  )
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
