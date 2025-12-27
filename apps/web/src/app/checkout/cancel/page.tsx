'use client'

import Link from 'next/link'
import { TarantuverseLogoTransparent } from '@/components/TarantuverseLogo'

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl">
          {/* Cancel Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Logo */}
          <TarantuverseLogoTransparent className="w-16 h-16 mx-auto mb-4" />

          <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
            Checkout Cancelled
          </h1>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            No worries! Your checkout was cancelled and you haven't been charged.
            You can try again whenever you're ready.
          </p>

          <div className="space-y-3">
            <Link
              href="/pricing"
              className="block w-full py-3 bg-gradient-brand text-white rounded-xl hover:shadow-lg transition font-semibold"
            >
              Back to Pricing
            </Link>

            <Link
              href="/dashboard"
              className="block w-full py-3 border-2 border-purple-600 dark:border-purple-500 text-purple-600 dark:text-purple-400 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition font-semibold"
            >
              Go to Dashboard
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
              Have questions about our plans?
            </p>
            <Link
              href="/contact"
              className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
