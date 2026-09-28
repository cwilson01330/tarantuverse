'use client'

/**
 * UpgradeModal — premium prompt for Herpetoverse (web).
 *
 * Opens on any HV-premium wall: the animal cap, breeding, feeder tracking.
 * The caller passes `source` (why it opened) and, where the server sent one,
 * the 402 `message`, so the copy never drifts from the actual limit.
 *
 * History: this modal used to say "There's no self-serve checkout yet —
 * Premium is part of an Appalachian Tarantulas membership", long after Stripe
 * checkout shipped on /pricing. It also headlined every prompt "Free plan
 * limit reached" (including breeding and feeders) and claimed premium was
 * "only a count cap". Every keeper who hit a wall here was told they couldn't
 * buy. The perks below now match the server gates exactly.
 */

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { trackUpgrade, UPGRADE_EVENTS, type UpgradeSource } from '@/lib/upgrade-tracking'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  /** Why this prompt opened. Required so no prompt ships unattributed. */
  source: UpgradeSource
  /** Message from the 402 detail body. Falls back to source-specific copy. */
  message?: string | null
  /** Free-tier limit from the 402 detail body, used in the cap fallback. */
  limit?: number | null
}

const TITLES: Partial<Record<UpgradeSource, string>> = {
  collection_cap: 'Free plan limit reached',
  breeding: 'Breeding is a Premium feature',
  feeders: 'Feeder tracking is a Premium feature',
}

// Matches the server gates: enforce_animal_limit, the reptile_pairings 402,
// and enforce_hv_premium on feeder stocks. Import and export are free.
const PERKS = [
  'Unlimited animals in your collection',
  'Breeding: pairings, clutches & offspring',
  'Feeder inventory tracking',
]

export default function UpgradeModal({
  isOpen,
  onClose,
  source,
  message,
  limit,
}: UpgradeModalProps) {
  // Set when the keeper takes an action, so the close that follows isn't
  // also counted as a dismissal.
  const acted = useRef(false)

  useEffect(() => {
    if (isOpen) {
      acted.current = false
      trackUpgrade(UPGRADE_EVENTS.shown, source)
    }
  }, [isOpen, source])

  if (!isOpen) return null

  const dismiss = () => {
    if (!acted.current) trackUpgrade(UPGRADE_EVENTS.dismissed, source)
    onClose()
  }

  const title = TITLES[source] ?? 'Herpetoverse Premium'
  const fallback =
    source === 'collection_cap'
      ? `You've reached the free plan limit${
          typeof limit === 'number' ? ` of ${limit} animals` : ''
        }.`
      : 'Upgrade to Herpetoverse Premium to unlock it.'
  const headline = message && message.trim().length > 0 ? message : fallback

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl herp-gradient-bg flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl" aria-hidden="true">🦎</span>
        </div>

        {/* Title */}
        <h2
          id="upgrade-modal-title"
          className="text-2xl font-bold text-center text-white mb-2 tracking-wide"
        >
          {title}
        </h2>

        {/* Server message */}
        <p className="text-center text-neutral-400 mb-6">{headline}</p>

        {/* What premium unlocks */}
        <div className="rounded-xl border border-herp-teal/30 bg-herp-teal/10 p-4 mb-6">
          <p className="font-semibold text-white mb-2">Premium keepers get:</p>
          <ul className="space-y-2 text-sm text-neutral-300">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">
            Feeding, weight, shed and health logs, import and export stay free, always.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href={`/pricing?source=${encodeURIComponent(source)}`}
            onClick={() => {
              acted.current = true
              trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'pricing' })
              onClose()
            }}
            className="w-full text-center px-6 py-3 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
          >
            See plans
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="w-full px-6 py-3 rounded-xl text-neutral-400 hover:text-white transition-colors font-medium"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
