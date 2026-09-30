'use client'

/**
 * PremiumIntroCard — the one-time "here's what you get" moment.
 *
 * Shown ONCE, right after a keeper's first completed Feeding Day batch. Not at
 * signup, not on a wall: most free keepers never hit a wall, but nearly all of
 * them feed something. It is informational and gates nothing — it says
 * plainly what stays free and what premium adds, with every plan on it
 * including lifetime. "Not now" is the primary-weight action.
 *
 * Whether to show it is the SERVER's call (`GET /auth/me/premium-intro`), and
 * every dismissal marks it seen server-side, so it can't reappear on another
 * device. Honesty-first: nothing here describes a feature that isn't shipped,
 * and "free" is what the free plan actually includes.
 */
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackUpgrade, UPGRADE_EVENTS } from '@/lib/upgrade-tracking'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SOURCE = 'feeding_day_intro' as const

/** Ask the server whether to show the card. Never throws — a failed call
 *  means "don't show", the safe default for a one-time card. */
export async function shouldShowPremiumIntro(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me/premium-intro`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const data = await res.json()
    return !!data?.show
  } catch {
    return false
  }
}

async function markSeen(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/v1/auth/me/premium-intro/seen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best effort. Worst case it's shown once more on another device.
  }
}

// The free plan, as it actually is (utils/limits.py, plan row `free`).
const FREE = [
  'Tracking for every taxon — feedings, molts, substrate, photos',
  'Feeding Day and reminders',
  'Care sheets and keeper signals',
  'Forums, messages and keeper profiles',
  'Up to 15 animals, 5 photos each',
  'Full data export, any time',
]

// Premium, as gated today (can_use_breeding / can_use_analytics / caps).
const PREMIUM = [
  'Unlimited animals and photos',
  'Breeding: pairings, egg sacs, offspring',
  'Advanced analytics',
  'Co-keepers and sitter logging',
]

interface Props {
  open: boolean
  token: string | null
  onClose: () => void
}

export default function PremiumIntroCard({ open, token, onClose }: Props) {
  const router = useRouter()
  const acted = useRef(false)

  useEffect(() => {
    if (open) {
      acted.current = false
      trackUpgrade(UPGRADE_EVENTS.shown, SOURCE)
    }
  }, [open])

  if (!open) return null

  const dismiss = () => {
    if (!acted.current) trackUpgrade(UPGRADE_EVENTS.dismissed, SOURCE)
    if (token) markSeen(token)
    onClose()
  }

  const seePlans = () => {
    acted.current = true
    trackUpgrade(UPGRADE_EVENTS.clicked, SOURCE, { action: 'pricing' })
    if (token) markSeen(token)
    onClose()
    router.push(`/pricing?source=${SOURCE}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={dismiss}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-intro-title"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          First Feeding Day logged
        </p>
        <h2 id="premium-intro-title" className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
          Here’s what you get
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Everything you just used stays free. This is the whole picture, once, so you never have to wonder.
        </p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Free, always
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-800 dark:text-gray-200">
              {FREE.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5" aria-hidden>✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Premium adds
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-800 dark:text-gray-200">
              {PREMIUM.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-400 mt-0.5" aria-hidden>★</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Monthly $4.99 · Yearly $44.99 · Lifetime $149.99, once
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-xl border-2 border-purple-600 dark:border-purple-500 px-4 py-3 font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={seePlans}
            className="w-full rounded-xl px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  )
}
