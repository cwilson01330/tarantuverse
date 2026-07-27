'use client'

/**
 * Bookmark toggle for a species care sheet.
 *
 * Self-contained: reads its own token, resolves its own initial state, and
 * renders nothing at all for signed-out visitors — a bookmark that 401s on
 * click is worse than no bookmark. The care sheets are public SEO surfaces,
 * so signed-out traffic is the common case, not an edge case.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { addToShortlist, listShortlistIds, removeFromShortlist } from '@/lib/shortlist'

export default function ShortlistButton({
  speciesId,
  className = '',
  variant = 'light',
}: {
  speciesId: string
  className?: string
  /** 'onDark' for the tarantula hero, which is white text over a photo. */
  variant?: 'light' | 'onDark'
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    const token = localStorage.getItem('token')
    if (!token) return
    let cancelled = false
    listShortlistIds(token)
      .then((ids) => {
        if (!cancelled) {
          setSaved(ids.includes(speciesId))
          setReady(true)
        }
      })
      // Non-fatal: an un-lit bookmark beats blocking the care sheet, and the
      // POST is idempotent server-side anyway.
      .catch(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [isLoading, isAuthenticated, speciesId])

  const toggle = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token || busy) return
    const next = !saved
    setBusy(true)
    setSaved(next) // optimistic
    try {
      if (next) await addToShortlist(token, speciesId)
      else await removeFromShortlist(token, speciesId)
    } catch {
      setSaved(!next) // roll back
    } finally {
      setBusy(false)
    }
  }, [saved, busy, speciesId])

  if (isLoading || !isAuthenticated) return null

  const tone =
    variant === 'onDark'
      ? saved
        ? 'bg-amber-400/90 text-gray-900 border-amber-300'
        : 'bg-white/15 hover:bg-white/25 border-white/30 text-white backdrop-blur-sm'
      : saved
      ? 'border-amber-400 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-600'
      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700'

  return (
    <button
      onClick={toggle}
      disabled={busy || !ready}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from your shortlist' : 'Save to your shortlist'}
      title={saved ? 'Saved to your shortlist' : 'Save to your shortlist'}
      className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg border text-sm font-semibold transition disabled:opacity-60 ${tone} ${className}`}
    >
      <span aria-hidden>{saved ? '🔖' : '📑'}</span>
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}
