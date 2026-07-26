import type { Metadata } from 'next'
import PricingPlans from './PricingPlans'
import SiteNav from '@/components/SiteNav'

/**
 * Herpetoverse pricing page. Self-serve Stripe Checkout for Premium
 * (app='herpetoverse') and All-Access (app='both', unlocks TV + HV). The
 * interactive plan cards + checkout live in the client component PricingPlans;
 * this server component keeps the metadata, nav, header, and footnote.
 *
 * Styled in the HV dark palette so it reads coherently coming out of the app's
 * UpgradeModal ("Learn more") and the cap-reached callouts.
 */

export const metadata: Metadata = {
  title: 'Pricing · Herpetoverse',
  description:
    'Herpetoverse is free to use. Go Premium for unlimited animals, feeder inventory, and breeding tracking — or get All-Access to unlock Tarantuverse too.',
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-herp-dark text-neutral-100">
      {/* Auth-aware nav — signed-out visitors get Sign in / Create account
          rather than an "Open app" link that bounces them back here. */}
      <SiteNav hidePricing />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        {/* Header */}
        <header className="text-center mb-12">
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
            Pricing
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-wide text-white mb-4">
            Free to keep. Free to grow.
          </h1>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            Herpetoverse is free, and every tracking feature stays free. The
            only limit on the free plan is how many animals you can add.
          </p>
        </header>

        {/* Plans + self-serve checkout */}
        <PricingPlans />

        {/* Footnote */}
        <p className="mt-12 text-center text-sm text-neutral-500 max-w-2xl mx-auto">
          The free-tier cap only limits how many animals you can add — it never
          takes away features you already rely on. Cancel anytime; your logs and
          data always stay yours.
        </p>
      </main>
    </div>
  )
}
