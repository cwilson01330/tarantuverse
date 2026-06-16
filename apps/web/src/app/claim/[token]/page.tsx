'use client'

/**
 * Public animal-claim page — BRIEF-animal-transfer-provenance §6.
 *
 * A seller shares /claim/{token} after a sale closes elsewhere. The buyer lands
 * here, sees the animal's species + provenance, and taps "Add to my collection."
 * Claiming requires auth — logged-out buyers are routed to login/register with
 * ?redirect=/claim/{token} so the token survives signup and the claim auto-resumes.
 *
 * This is the growth flywheel: every sold animal onboards a new keeper with a
 * populated account. Honesty-first: a full "Pedigree" block renders only when
 * dam/sire are present; otherwise a plain "Provenance" block (§4c).
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

interface Preview {
  status: string
  taxon: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  sex: string | null
  life_stage: string | null
  species_id: string | null
  photo_urls: string[]
  breeder_handle: string | null
  note: string | null
  dam_scientific_name: string | null
  sire_scientific_name: string | null
  sac_laid_date: string | null
  molt_count_at_transfer: number | null
  last_molt_at_transfer: string | null
  expires_at: string | null
}

const TAXON_GLYPH: Record<string, string> = {
  tarantula: '🕷', scorpion: '🦂', centipede: '🐛', whip_spider: '🕸️',
  vinegaroon: '🦂', true_spider: '🕷', millipede: '🪱', mantis: '🦗',
  roach: '🪳', other: '🐾',
}

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { isAuthenticated, isLoading, token: authToken } = useAuth()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'claiming' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  const claimPath = `/claim/${token}`

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/transfers/${token}`)
      if (!res.ok) {
        setError(res.status === 404 ? 'This transfer link is invalid.' : 'Could not load this transfer.')
        setState('error')
        return
      }
      const data: Preview = await res.json()
      setPreview(data)
      setState('ready')
    } catch {
      setError('Could not load this transfer. Check your connection and try again.')
      setState('error')
    }
  }, [token])

  useEffect(() => { loadPreview() }, [loadPreview])

  const handleClaim = useCallback(async () => {
    if (!isAuthenticated || !authToken) {
      router.push(`/login?redirect=${encodeURIComponent(claimPath)}`)
      return
    }
    setState('claiming')
    setError(null)
    try {
      const res = await fetch(`${API}/api/v1/transfers/${token}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        const d = body?.detail
        setError(typeof d === 'string' ? d : d?.message || 'Could not claim this animal.')
        setState('ready')
        await loadPreview()
        return
      }
      const created = await res.json()
      router.push(`/dashboard/inverts/${created.id}?welcome=1`)
    } catch {
      setError('Something went wrong claiming this animal. Please try again.')
      setState('ready')
    }
  }, [isAuthenticated, authToken, token, claimPath, router, loadPreview])

  // ── render ──────────────────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {children}
      </div>
    </div>
  )

  if (state === 'loading' || isLoading) {
    return wrap(
      <div className="p-10 text-center text-gray-500 dark:text-gray-400">Loading…</div>
    )
  }

  if (state === 'error' || !preview) {
    return wrap(
      <div className="p-8 text-center">
        <div className="text-4xl mb-3">🔗</div>
        <p className="text-gray-700 dark:text-gray-200 font-medium mb-4">{error || 'Transfer not found.'}</p>
        <Link href="/" className="text-purple-600 dark:text-purple-400 font-semibold">Go to Tarantuverse</Link>
      </div>
    )
  }

  // Non-claimable states
  if (preview.status !== 'pending') {
    const msg = preview.status === 'claimed'
      ? 'This animal has already been claimed.'
      : preview.status === 'cancelled'
        ? 'The seller cancelled this transfer.'
        : 'This transfer link has expired.'
    return wrap(
      <div className="p-8 text-center">
        <div className="text-4xl mb-3">⏳</div>
        <p className="text-gray-700 dark:text-gray-200 font-medium mb-4">{msg}</p>
        <Link href="/" className="text-purple-600 dark:text-purple-400 font-semibold">Explore Tarantuverse</Link>
      </div>
    )
  }

  const displayName = preview.name || preview.common_name || preview.scientific_name || 'this animal'
  const hasPedigree = !!(preview.dam_scientific_name || preview.sire_scientific_name)

  return wrap(
    <>
      {preview.photo_urls?.[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.photo_urls[0]} alt={displayName} className="w-full h-56 object-cover" />
      ) : (
        <div className="w-full h-56 flex items-center justify-center text-6xl bg-gradient-to-br from-purple-500 to-pink-500">
          {TAXON_GLYPH[preview.taxon] || '🐾'}
        </div>
      )}

      <div className="p-6">
        <p className="text-xs uppercase tracking-wide text-purple-600 dark:text-purple-400 font-semibold mb-1">
          You've been sent an animal
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
        {preview.scientific_name && (
          <p className="text-gray-500 dark:text-gray-400 italic">{preview.scientific_name}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {preview.sex && preview.sex !== 'UNKNOWN' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 capitalize">{preview.sex.toLowerCase()}</span>
          )}
          {preview.life_stage && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 capitalize">{preview.life_stage}</span>
          )}
          {preview.breeder_handle && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">from @{preview.breeder_handle}</span>
          )}
        </div>

        {preview.note && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
            “{preview.note}”
          </p>
        )}

        {/* Pedigree block — only when dam/sire present (§4c honesty-first). */}
        {hasPedigree ? (
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Pedigree</p>
            <dl className="text-sm text-gray-700 dark:text-gray-200 space-y-1">
              {preview.dam_scientific_name && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">Dam</dt><dd className="italic text-right">{preview.dam_scientific_name}</dd></div>}
              {preview.sire_scientific_name && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">Sire</dt><dd className="italic text-right">{preview.sire_scientific_name}</dd></div>}
              {preview.sac_laid_date && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">Sac laid</dt><dd>{preview.sac_laid_date}</dd></div>}
            </dl>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Provenance</p>
            <dl className="text-sm text-gray-700 dark:text-gray-200 space-y-1">
              {preview.breeder_handle && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">From</dt><dd>@{preview.breeder_handle}</dd></div>}
              {preview.molt_count_at_transfer != null && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">Molts logged</dt><dd>{preview.molt_count_at_transfer}</dd></div>}
              {preview.last_molt_at_transfer && <div className="flex justify-between gap-4"><dt className="text-gray-500 dark:text-gray-400">Last molt</dt><dd>{preview.last_molt_at_transfer}</dd></div>}
            </dl>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={handleClaim}
          disabled={state === 'claiming'}
          className="mt-6 w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition disabled:opacity-60"
        >
          {state === 'claiming' ? 'Adding…' : isAuthenticated ? 'Add to my collection' : 'Sign in to claim'}
        </button>
        {!isAuthenticated && (
          <p className="mt-3 text-center text-sm text-gray-500 dark:text-gray-400">
            New here?{' '}
            <Link href={`/register?redirect=${encodeURIComponent(claimPath)}`} className="text-purple-600 dark:text-purple-400 font-semibold">
              Create a free account
            </Link>{' '}
            — your new animal will be waiting.
          </p>
        )}
      </div>
    </>
  )
}
