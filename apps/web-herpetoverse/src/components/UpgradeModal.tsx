'use client'

/**
 * UpgradeModal — free-tier cap prompt for Herpetoverse (web).
 *
 * Mirrors the Tarantuverse UpgradeModal pattern
 * (apps/web/src/components/UpgradeModal.tsx) but restyled into the HV dark
 * palette (herp-* + neutral-* tokens) and — importantly — HONEST: HV has no
 * purchase flow yet, so this is informational only. The primary CTA links to
 * /pricing to learn more; there is NO fake "Buy now" button.
 *
 * Shown when the animal create POST returns HTTP 402 (free-tier cap reached).
 * The caller passes the server's own `message` from the 402 detail body so the
 * copy never drifts from the actual limit; `limit` is used as a fallback when
 * no message is present.
 */

import Link from 'next/link'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  /** Message from the 402 detail body. Falls back to a limit-derived line. */
  message?: string | null
  /** Free-tier limit from the 402 detail body, used to build the fallback copy. */
  limit?: number | null
}

export default function UpgradeModal({
  isOpen,
  onClose,
  message,
  limit,
}: UpgradeModalProps) {
  if (!isOpen) return null

  const headline =
    message && message.trim().length > 0
      ? message
      : `You've reached the free plan limit${
          typeof limit === 'number' ? ` of ${limit} animals` : ''
        }.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
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
          Free plan limit reached
        </h2>

        {/* Server message */}
        <p className="text-center text-neutral-400 mb-6">{headline}</p>

        {/* What premium unlocks */}
        <div className="rounded-xl border border-herp-teal/30 bg-herp-teal/10 p-4 mb-6">
          <p className="font-semibold text-white mb-2">
            Premium keepers get:
          </p>
          <ul className="space-y-2 text-sm text-neutral-300">
            <li className="flex items-start gap-2">
              <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
              <span>Unlimited animals in your collection</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
              <span>Every tracking feature stays free — this is only a count cap</span>
            </li>
          </ul>
        </div>

        {/* Honesty note — no checkout yet. */}
        <p className="text-center text-xs text-neutral-500 mb-6">
          Premium is part of an Appalachian Tarantulas membership. There&apos;s
          no self-serve checkout yet — see the details for how to get it.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/pricing"
            onClick={onClose}
            className="w-full text-center px-6 py-3 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
          >
            Learn more
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-6 py-3 rounded-xl text-neutral-400 hover:text-white transition-colors font-medium"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
