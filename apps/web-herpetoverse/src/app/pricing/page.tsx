import Link from 'next/link'
import type { Metadata } from 'next'

/**
 * Herpetoverse pricing / premium info page.
 *
 * Reached from the in-app UpgradeModal ("Learn more") and the import
 * cap-reached callout, so it's styled in the HV dark palette to read
 * coherently coming out of the app.
 *
 * HONESTY NOTE: Herpetoverse has NO self-serve checkout yet. Premium is an
 * Appalachian Tarantulas membership perk. The premium CTA is intentionally
 * NOT a working purchase — it's a "coming soon" / contact link. Do not wire a
 * fake buy flow here.
 */

export const metadata: Metadata = {
  title: 'Pricing · Herpetoverse',
  description:
    'Herpetoverse is free to use. Track unlimited feedings, weights, and sheds. A premium membership lifts the free-tier animal cap.',
}

const FREE_FEATURES = [
  'Up to 5 animals in your collection',
  'Unlimited feeding, weight, and shed logs',
  'Species care sheets & prey suggestions',
  'Feeding Day bulk logging',
  'Photos, sheds, and growth trends',
  'Collection import & data export',
  'Notifications & feeding reminders',
]

const PREMIUM_FEATURES = [
  'Everything in Free',
  'Unlimited animals — no collection cap',
  'Supports ongoing development',
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-herp-dark text-neutral-100">
      {/* Nav */}
      <nav className="border-b border-neutral-900 sticky top-0 z-40 bg-herp-dark/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🦎</span>
            <span className="text-xl font-bold tracking-wide bg-gradient-to-r from-herp-green to-herp-teal bg-clip-text text-transparent">
              Herpetoverse
            </span>
          </Link>
          <Link
            href="/app/reptiles"
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Open app
          </Link>
        </div>
      </nav>

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

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8">
            <h2 className="text-lg font-semibold text-white">Free</h2>
            <p className="mt-2 text-3xl font-bold text-white">
              $0
              <span className="text-base font-normal text-neutral-500"> / forever</span>
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              Everything you need to track a small collection.
            </p>
            <ul className="mt-6 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/app/reptiles"
              className="mt-8 block text-center px-6 py-3 rounded-xl border border-neutral-700 text-neutral-200 font-medium hover:border-neutral-500 hover:text-white transition-colors"
            >
              Start free
            </Link>
          </section>

          {/* Premium */}
          <section className="rounded-2xl border border-herp-teal/40 bg-herp-teal/[0.06] p-8 relative">
            <span className="absolute top-6 right-6 text-[11px] uppercase tracking-wider px-2 py-1 rounded-full bg-herp-teal/15 text-herp-lime font-semibold">
              Premium
            </span>
            <h2 className="text-lg font-semibold text-white">Premium</h2>
            <p className="mt-2 text-3xl font-bold text-white">
              Unlimited
              <span className="text-base font-normal text-neutral-500"> animals</span>
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              For keepers whose collections have outgrown the free cap.
            </p>
            <ul className="mt-6 space-y-3">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="text-herp-lime mt-0.5" aria-hidden="true">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* Honest CTA — no checkout exists yet. */}
            <button
              type="button"
              disabled
              className="mt-8 w-full px-6 py-3 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide opacity-60 cursor-not-allowed"
            >
              Coming soon
            </button>
            <p className="mt-3 text-xs text-neutral-500 text-center">
              Premium is part of an{' '}
              <span className="text-neutral-300">Appalachian Tarantulas</span>{' '}
              membership. There&apos;s no self-serve checkout yet — questions?{' '}
              <a
                href="mailto:hello@appalachiantarantulas.com?subject=Herpetoverse%20Premium"
                className="text-herp-teal underline"
              >
                Get in touch
              </a>
              .
            </p>
          </section>
        </div>

        {/* Footnote */}
        <p className="mt-12 text-center text-sm text-neutral-500 max-w-2xl mx-auto">
          The free-tier cap only limits how many animals you can add — it never
          takes away features you already rely on. We&apos;d rather be honest
          about what&apos;s available than promise a checkout that isn&apos;t
          built yet.
        </p>
      </main>
    </div>
  )
}
