'use client'

/**
 * Interactive pricing cards with self-serve Stripe Checkout.
 *
 * Three tiers: Free, Premium (app='herpetoverse'), and All-Access
 * (app='both' — unlocks Tarantuverse + Herpetoverse). Premium and All-Access
 * post to POST /api/v1/subscriptions/create-checkout-session with a `plan`
 * key + `price_type`; the backend selects the Stripe price and stamps the plan
 * into session metadata so the webhook grants the correct app-scoped entitlement.
 *
 * Display prices mirror the seeded subscription_plans rows (herpetoverse_premium
 * / bundle_premium). The source of truth for what a customer is actually charged
 * is the Stripe price you configure — keep these in sync if you change prices.
 */

import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/apiClient'
import { getToken } from '@/lib/auth'
import {
  sourceFromParam,
  trackUpgrade,
  UPGRADE_EVENTS,
  type UpgradeSource,
} from '@/lib/upgrade-tracking'

type Period = 'monthly' | 'yearly' | 'lifetime'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'lifetime', label: 'Lifetime' },
]

// Display prices — must match the seeded plan rows / your Stripe prices.
const PRICE: Record<'herpetoverse_premium' | 'bundle_premium', Record<Period, string>> = {
  herpetoverse_premium: { monthly: '$4.99', yearly: '$44.99', lifetime: '$149.99' },
  bundle_premium: { monthly: '$6.99', yearly: '$69.99', lifetime: '$249' },
}

const PERIOD_SUFFIX: Record<Period, string> = {
  monthly: '/ month',
  yearly: '/ year',
  lifetime: 'once',
}

const FREE_FEATURES = [
  'Up to 5 animals in your collection',
  'Unlimited feeding, weight, and shed logs',
  'Species care sheets & prey suggestions',
  'Feeding Day bulk logging',
  'Photos, sheds, and growth trends',
  'Collection import & data export',
  'Notifications & feeding reminders',
  'Sitter links (2 at a time)',
  'Join a collection shared with you',
]

const PREMIUM_FEATURES = [
  'Everything in Free',
  'Unlimited animals — no collection cap',
  'Feeder inventory tracking',
  'Breeding: pairings, clutches & offspring',
  'Co-keepers — share with up to 10 people',
  'Sitter logging + unlimited sitter links',
  'Supports ongoing development',
]

const ALL_ACCESS_FEATURES = [
  'Everything in Herpetoverse Premium',
  'Unlocks Tarantuverse Premium too',
  'One subscription across both apps',
  'Best value for multi-taxon keepers',
]

export default function PricingPlans() {
  const [period, setPeriod] = useState<Period>('yearly')
  const [busy, setBusy] = useState<string | null>(null) // plan key currently checking out
  const [error, setError] = useState<string | null>(null)
  // Which upgrade prompt sent the keeper here ('direct' if none). Read from
  // window so this component needs no Suspense boundary; validated, never raw.
  const [source, setSource] = useState<UpgradeSource | 'direct'>('direct')

  useEffect(() => {
    const s = sourceFromParam(new URLSearchParams(window.location.search).get('source'))
    setSource(s)
    trackUpgrade(UPGRADE_EVENTS.pricingViewed, s)
  }, [])

  async function checkout(plan: 'herpetoverse_premium' | 'bundle_premium') {
    setError(null)
    trackUpgrade(UPGRADE_EVENTS.clicked, source, { action: 'checkout', plan, price_type: period })

    // Must be signed in to attach the purchase to an account. The source
    // survives the login detour.
    const pricingReturn = `/pricing?source=${source}`
    if (!getToken()) {
      const next = encodeURIComponent(pricingReturn)
      window.location.href = `/login?next=${next}`
      return
    }

    setBusy(plan)
    try {
      const res = await fetch(`${API_URL}/api/v1/subscriptions/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          plan,
          price_type: period,
          // source/plan/period ride through Stripe so the success page can
          // attribute the purchase to the prompt that started it.
          success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&source=${source}&plan=${plan}&price_type=${period}`,
          cancel_url: `${window.location.origin}${pricingReturn}`,
        }),
      })

      if (res.status === 401) {
        const next = encodeURIComponent(pricingReturn)
        window.location.href = `/login?next=${next}`
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const detail =
          (body as { detail?: string } | null)?.detail ??
          'Could not start checkout. Please try again.'
        throw new Error(typeof detail === 'string' ? detail : 'Could not start checkout.')
      }

      const data = (await res.json()) as { checkout_url?: string }
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        throw new Error('Checkout session did not return a URL.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(null)
    }
  }

  return (
    <div>
      {/* Billing period toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-full border border-neutral-800 bg-neutral-900/50 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === p.key
                  ? 'herp-gradient-bg text-herp-dark'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-6 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {/* Free */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 flex flex-col">
          <h2 className="text-lg font-semibold text-white">Free</h2>
          <p className="mt-2 text-3xl font-bold text-white">
            $0<span className="text-base font-normal text-neutral-500"> / forever</span>
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            Everything you need to track a small collection.
          </p>
          <ul className="mt-6 space-y-3 flex-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <a
            href="/app/reptiles"
            className="mt-8 block text-center px-6 py-3 rounded-xl border border-neutral-700 text-neutral-200 font-medium hover:border-neutral-500 hover:text-white transition-colors"
          >
            Start free
          </a>
        </section>

        {/* Premium */}
        <section className="rounded-2xl border border-herp-teal/40 bg-herp-teal/[0.06] p-8 relative flex flex-col">
          <span className="absolute top-6 right-6 text-[11px] uppercase tracking-wider px-2 py-1 rounded-full bg-herp-teal/15 text-herp-lime font-semibold">
            Premium
          </span>
          <h2 className="text-lg font-semibold text-white">Herpetoverse Premium</h2>
          <p className="mt-2 text-3xl font-bold text-white">
            {PRICE.herpetoverse_premium[period]}
            <span className="text-base font-normal text-neutral-500"> {PERIOD_SUFFIX[period]}</span>
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            For keepers whose collections have outgrown the free cap.
          </p>
          <ul className="mt-6 space-y-3 flex-1">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => checkout('herpetoverse_premium')}
            disabled={busy !== null}
            className="mt-8 w-full px-6 py-3 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
          >
            {busy === 'herpetoverse_premium' ? 'Starting checkout…' : 'Go Premium'}
          </button>
        </section>

        {/* All-Access bundle */}
        <section className="rounded-2xl border border-herp-green/50 bg-herp-green/[0.08] p-8 relative flex flex-col">
          <span className="absolute top-6 right-6 text-[11px] uppercase tracking-wider px-2 py-1 rounded-full bg-herp-green/20 text-herp-lime font-semibold">
            Best value
          </span>
          <h2 className="text-lg font-semibold text-white">All-Access</h2>
          <p className="mt-2 text-3xl font-bold text-white">
            {PRICE.bundle_premium[period]}
            <span className="text-base font-normal text-neutral-500"> {PERIOD_SUFFIX[period]}</span>
          </p>
          <p className="mt-2 text-sm text-neutral-400">
            Premium on both Herpetoverse and Tarantuverse, one subscription.
          </p>
          <ul className="mt-6 space-y-3 flex-1">
            {ALL_ACCESS_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => checkout('bundle_premium')}
            disabled={busy !== null}
            className="mt-8 w-full px-6 py-3 rounded-xl bg-herp-green text-herp-dark font-bold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed transition-opacity hover:brightness-110"
          >
            {busy === 'bundle_premium' ? 'Starting checkout…' : 'Get All-Access'}
          </button>
        </section>
      </div>

      <p className="mt-8 text-center text-xs text-neutral-500">
        Secure checkout by Stripe. Cancel anytime from your account settings.
        Prices shown in USD.
      </p>
    </div>
  )
}
