'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TarantuverseLogoTransparent } from '@/components/TarantuverseLogo'

function CheckoutSuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = '/dashboard'
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl">
          {/* Success Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          {/* Logo */}
          <TarantuverseLogoTransparent className="w-16 h-16 mx-auto mb-4" />

          <h1 className="text-3xl font-bold mb-4 text-gradient-brand">
            Welcome to Premium!
          </h1>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Thank you for your purchase. Your premium subscription is now active
            and you have access to all features.
          </p>

          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
              <h3 className="font-semibold text-purple-600 dark:text-purple-400 mb-2">
                You now have access to:
              </h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>Unlimited tarantulas</li>
                <li>Unlimited photos</li>
                <li>Full breeding module</li>
                <li>Advanced analytics</li>
                <li>Priority support</li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="block w-full py-3 bg-gradient-brand text-white rounded-xl hover:shadow-lg transition font-semibold"
            >
              Go to Dashboard
            </Link>

            <p className="text-sm text-gray-500 dark:text-gray-500">
              Redirecting in {countdown} seconds...
            </p>
          </div>

          {sessionId && (
            <p className="mt-4 text-xs text-gray-400 dark:text-gray-600">
              Session: {sessionId.slice(0, 20)}...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  )
}
