'use client'

/**
 * Stripe Checkout success landing (HV).
 *
 * Stripe redirects here with ?session_id=... after a successful purchase. The
 * entitlement is granted asynchronously by the webhook, so we poll
 * /subscriptions/app-status a few times to reflect the new tier once it lands,
 * but we confirm success immediately regardless (Stripe only redirects here on
 * a completed payment).
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { API_URL } from '@/lib/apiClient'
import { getToken } from '@/lib/auth'

type Status = {
  is_premium: boolean
  tier?: string | null
  plan_display_name?: string | null
}

function SuccessInner() {
  const params = useSearchParams()
  const hasSession = !!params.get('session_id')
  const [status, setStatus] = useState<Status | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      setChecking(false)
      return
    }

    // Poll app-status a few times — the webhook that flips the entitlement is
    // async, so it may not be active on the first read right after redirect.
    async function poll(attempt: number) {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/subscriptions/app-status?app=herpetoverse`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = (await res.json()) as Status
          if (cancelled) return
          if (data.is_premium || attempt >= 4) {
            setStatus(data)
            setChecking(false)
            return
          }
        }
      } catch {
        /* ignore; retry */
      }
      if (attempt >= 4) {
        if (!cancelled) setChecking(false)
        return
      }
      setTimeout(() => poll(attempt + 1), 2000)
    }

    poll(0)
    return () => {
      cancelled = true
    }
  }, [])

  const premiumActive = !!status?.is_premium

  return (
    <div className="min-h-screen bg-herp-dark text-neutral-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6" aria-hidden="true">🎉</div>
        <h1 className="text-3xl font-bold tracking-wide text-white mb-3">
          You&apos;re all set!
        </h1>

        {!hasSession ? (
          <p className="text-neutral-400 mb-8">
            Thanks for subscribing. Your premium features are unlocking now.
          </p>
        ) : checking ? (
          <p className="text-neutral-400 mb-8">
            Payment received — activating your premium features…
          </p>
        ) : premiumActive ? (
          <p className="text-neutral-300 mb-8">
            Your{' '}
            <span className="text-herp-lime font-medium">
              {status?.plan_display_name ||
                (status?.tier === 'all_access' ? 'All-Access' : 'Premium')}
            </span>{' '}
            membership is active. Enjoy unlimited animals, feeder tracking, and breeding.
          </p>
        ) : (
          <p className="text-neutral-400 mb-8">
            Payment received. Your membership can take a moment to activate — it&apos;ll
            show up shortly. If it doesn&apos;t, reopen the app or contact support.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/app/reptiles"
            className="px-7 py-3.5 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide"
          >
            Go to my collection
          </Link>
          <Link
            href="/app/settings"
            className="px-7 py-3.5 rounded-xl border border-neutral-700 text-neutral-100 font-semibold hover:border-neutral-500 transition-colors"
          >
            View subscription
          </Link>
        </div>

        <p className="mt-8 text-xs text-neutral-600">
          Manage or cancel anytime from your account settings.
        </p>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  // useSearchParams requires a Suspense boundary for static generation (Next 14).
  return (
    <Suspense fallback={<div className="min-h-screen bg-herp-dark" />}>
      <SuccessInner />
    </Suspense>
  )
}
