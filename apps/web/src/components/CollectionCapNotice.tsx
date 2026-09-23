'use client'

/**
 * The free-tier cap notice on the collection and dashboard screens.
 *
 * WHY THIS REPLACES THE INLINE BLOCK
 * ----------------------------------
 * The previous version rendered only when
 *
 *     count >= cap - 5 && count < cap
 *
 * — a "you're getting close" nudge that DISAPPEARED the moment someone
 * reached the cap. So the keepers with the strongest reason to see it saw
 * nothing: at the time of writing, one keeper sitting at 33 animals against
 * a cap of 15 had no prompt anywhere in the app, because `33 < 15` is false.
 * The only place the cap was ever mentioned to her was the 402 on adding an
 * animal — which she can't trigger, because she isn't adding animals.
 *
 * THREE STATES, THREE DIFFERENT THINGS TO SAY
 * -------------------------------------------
 *   approaching  — gentle, with a progress bar. Nothing is wrong yet.
 *   at/over, new — you can't add more; here's what premium does.
 *   at/over, lapsed — the fix is billing, not their collection. "Renew",
 *                     not "Upgrade", and never a number that reads as an
 *                     instruction to start deleting animals.
 *
 * The lapsed distinction comes from the server (`subscription_lapsed` on
 * /promo-codes/me/limits), the same helper the 402 uses, so the two can't
 * tell the keeper different stories.
 *
 * DISMISSIBLE, AND IT STAYS DISMISSED
 * -----------------------------------
 * An over-cap keeper is over the cap every single day. A banner that can't
 * be dismissed, or that returns on every navigation, stops being information
 * and becomes something to scroll past — which is how the genuinely useful
 * version of this gets ignored too. Dismissal persists per-state, so
 * crossing from "approaching" to "over" shows once more and then rests.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isPremium: boolean
  /** -1 means unlimited. */
  cap: number
  count: number
  /** Had a subscription that has since ended. Changes the whole message. */
  lapsed: boolean
}

const DISMISS_KEY = 'collection_cap_notice_dismissed_v1'

export default function CollectionCapNotice({
  isPremium,
  cap,
  count,
  lapsed,
}: Props) {
  const router = useRouter()
  const [dismissedState, setDismissedState] = useState<string | null>(null)

  // Which of the three notices applies, or none.
  const state: 'approaching' | 'over' | null = (() => {
    if (isPremium || cap === -1) return null
    if (count >= cap) return 'over'
    if (count >= cap - 5) return 'approaching'
    return null
  })()

  // Keyed by state so crossing the cap surfaces the new message once even if
  // the softer one was dismissed.
  const key = state ? `${state}:${lapsed ? 'lapsed' : 'new'}` : null

  useEffect(() => {
    try {
      setDismissedState(localStorage.getItem(DISMISS_KEY))
    } catch {
      // Private mode — showing the notice is the harmless fallback.
    }
  }, [])

  if (!state || !key || dismissedState === key) return null

  const dismiss = () => {
    setDismissedState(key)
    try {
      localStorage.setItem(DISMISS_KEY, key)
    } catch {
      // Non-fatal; it just reappears next visit.
    }
  }

  const over = state === 'over'

  const title = lapsed
    ? 'Your subscription has ended'
    : over
      ? "You're at the free plan limit"
      : 'Approaching free tier limit'

  // Note what each version does NOT say. The over-cap copy never leads with
  // "you have 33 of 15" — to someone holding 33 animals that reads as an
  // instruction to delete 18 of them, which is not a trade worth making for
  // a subscription.
  const body = lapsed ? (
    <>
      You&rsquo;re back on the free plan&rsquo;s {cap}-animal limit.{' '}
      <strong>Nothing has been deleted or hidden</strong> — every animal you
      track stays exactly as it is, and you can keep logging feedings and
      molts as normal. You just can&rsquo;t add a new one until you renew.
    </>
  ) : over ? (
    <>
      You&rsquo;re tracking {count} animals, and the free plan covers {cap}.{' '}
      <strong>Everything you&rsquo;ve logged stays as it is</strong> — you
      just can&rsquo;t add another without premium.
    </>
  ) : (
    <>
      You have{' '}
      <strong>
        {count} of {cap}
      </strong>{' '}
      animals on the free plan. Upgrade for unlimited tracking.
    </>
  )

  return (
    <div
      className={`mb-6 rounded-xl border-2 p-4 shadow-lg ${
        over
          ? 'border-purple-400 dark:border-purple-600 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20'
          : 'border-yellow-400 dark:border-yellow-600 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20'
      }`}
      role="status"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl" aria-hidden="true">
            {over ? '💎' : '⚠️'}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">
              {title}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              {body}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push('/pricing')}
                className="px-4 py-2 bg-gradient-brand text-white rounded-lg hover:brightness-90 transition font-semibold text-sm"
              >
                {/* A lapsed subscriber knows what premium is. Selling it to
                    them as though they'd never heard of it reads as the app
                    not knowing who they are. */}
                {lapsed ? 'Renew Premium' : 'View Premium Plans'}
              </button>
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold text-sm"
              >
                Redeem Promo Code
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar only while there's progress left to make. A bar pinned
          at 100% (or 220%) on an over-cap collection is just a red line. */}
      {!over && (
        <div className="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (count / cap) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
