'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trackUpgrade, UPGRADE_EVENTS, type UpgradeSource } from '@/lib/upgrade-tracking'

// Keep in step with /pricing and the mobile UpgradeModal.
const PLANS: { key: 'monthly' | 'yearly' | 'lifetime'; name: string; price: string; period: string; highlight?: boolean }[] = [
  { key: 'monthly', name: 'Monthly', price: '$4.99', period: 'per month' },
  { key: 'yearly', name: 'Yearly', price: '$44.99', period: 'per year', highlight: true },
  { key: 'lifetime', name: 'Lifetime', price: '$149.99', period: 'one-time, forever' },
]

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  /** Why this prompt opened. Required so no prompt ships unattributed. */
  source: UpgradeSource
  feature: string
  description: string
}

export default function UpgradeModal({ isOpen, onClose, source, feature, description }: UpgradeModalProps) {
  const router = useRouter()
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

  const goToPricing = (priceType?: 'monthly' | 'yearly' | 'lifetime') => {
    acted.current = true
    trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'pricing', price_type: priceType ?? null })
    onClose()
    // The source rides along so /pricing can attribute the checkout.
    const qs = new URLSearchParams({ source })
    if (priceType) qs.set('plan', priceType)
    router.push(`/pricing?${qs.toString()}`)
  }

  const dismiss = () => {
    if (!acted.current) trackUpgrade(UPGRADE_EVENTS.dismissed, source)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-gray-200 dark:border-gray-700">
        {/* Icon */}
        <div className="w-16 h-16 bg-gradient-brand rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">💎</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center mb-3 text-gray-900 dark:text-white">
          Premium Feature
        </h2>

        {/* Feature name */}
        <p className="text-center font-semibold text-lg mb-2 text-purple-600 dark:text-purple-400">
          {feature}
        </p>

        {/* Description */}
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          {description}
        </p>

        {/* Benefits list */}
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-6 border border-purple-200 dark:border-purple-800">
          <p className="font-semibold mb-2 text-gray-900 dark:text-white">Upgrade to Premium for:</p>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Unlimited animals</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Unlimited photos per animal</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Full breeding module access</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Advanced analytics</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Priority support</span>
            </li>
          </ul>
        </div>

        {/* Plans — lifetime included. The prompt used to lead with
            subscriptions only; the one-time option exists on both stores and
            on Stripe, and the buyers who want it should see it here. */}
        <div className="grid grid-cols-3 gap-2 mb-6 text-center">
          {PLANS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => goToPricing(p.key)}
              className={`rounded-xl border px-2 py-3 transition hover:bg-purple-50 dark:hover:bg-purple-900/20 ${
                p.highlight
                  ? 'border-purple-500 dark:border-purple-400'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{p.name}</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{p.price}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{p.period}</div>
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => goToPricing()}
            className="w-full px-6 py-3 bg-gradient-brand text-white rounded-xl hover:shadow-lg hover:brightness-90 transition font-semibold"
          >
            View Premium Plans
          </button>
          <button
            onClick={() => {
              acted.current = true
              trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'promo_code' })
              onClose()
              router.push('/dashboard/settings')
            }}
            className="w-full px-6 py-3 bg-white dark:bg-gray-800 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold"
          >
            Redeem Promo Code
          </button>
          <button
            onClick={dismiss}
            className="w-full px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  )
}
