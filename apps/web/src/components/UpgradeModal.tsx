'use client'

import { useRouter } from 'next/navigation'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature: string
  description: string
}

export default function UpgradeModal({ isOpen, onClose, feature, description }: UpgradeModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-gray-200 dark:border-gray-700">
        {/* Icon */}
        <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
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
              <span>Unlimited tarantulas</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>Unlimited photos per tarantula</span>
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

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              onClose()
              router.push('/pricing')
            }}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition font-semibold"
          >
            View Premium Plans
          </button>
          <button
            onClick={() => {
              onClose()
              router.push('/dashboard/settings')
            }}
            className="w-full px-6 py-3 bg-white dark:bg-gray-800 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold"
          >
            Redeem Promo Code
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition font-medium"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  )
}
