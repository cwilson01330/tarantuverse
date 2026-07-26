'use client'

/**
 * Auth-aware marketing nav.
 *
 * Exists because the pricing page is a server component and can't read the
 * client-side session. Previously it hardcoded an "Open app" link, which sent
 * signed-out visitors to /app/* — a route that bounces them straight back to
 * the landing page, so the button looked broken.
 *
 * Signed in  → "Go to app"
 * Signed out → "Sign in" + "Create account"
 */

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function SiteNav({
  /** Hide the Pricing link when already on /pricing. */
  hidePricing = false,
}: {
  hidePricing?: boolean
}) {
  const { token, isLoading } = useAuth()
  const signedIn = !isLoading && !!token

  return (
    <nav className="border-b border-neutral-900 sticky top-0 z-40 bg-herp-dark/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt=""
            width={28}
            height={29}
            className="h-7 w-auto"
            draggable={false}
          />
          <span className="text-xl font-bold tracking-wide herp-gradient-text">
            Herpetoverse
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {!hidePricing && (
            <Link
              href="/pricing"
              className="hidden sm:inline text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
          )}
          {signedIn ? (
            <Link
              href="/app/reptiles"
              className="px-4 py-2 rounded-lg herp-gradient-bg text-herp-dark font-semibold text-sm"
            >
              Go to app
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-neutral-300 hover:text-white transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-lg herp-gradient-bg text-herp-dark font-semibold text-sm"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
