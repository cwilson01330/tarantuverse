'use client'

/**
 * Herpetoverse marketing landing page.
 *
 * Auth-aware: signed-in keepers see "Go to app"; everyone else gets clear
 * Sign in / Create account entry points (nav + hero + closing CTA). Screenshot-
 * free by design — the app has no landing imagery yet, so the page leans on the
 * HV gradient system (herp-* tokens) instead of referencing missing assets.
 *
 * Sections: sticky nav → hero → taxa strip → feature grid → multi-taxon
 * highlight → pricing teaser → Tarantuverse cross-promo → footer.
 */

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

const TAXA = [
  { emoji: '🐍', label: 'Snakes' },
  { emoji: '🦎', label: 'Lizards & geckos' },
  { emoji: '🐢', label: 'Turtles & tortoises' },
  { emoji: '🐸', label: 'Frogs' },
  { emoji: '🦎', label: 'Salamanders & newts' },
]

const FEATURES: { emoji: string; title: string; body: string }[] = [
  {
    emoji: '🗂️',
    title: 'One collection, every taxon',
    body: 'Snakes, lizards, geckos, turtles, tortoises, frogs, and salamanders — track them side by side with husbandry built for each.',
  },
  {
    emoji: '🍽️',
    title: 'Feeding Day',
    body: 'Cadence-aware feeding that fits every schedule — a snake every few days, a beardie three times a day. Log a whole session in one pass, one tap per animal.',
  },
  {
    emoji: '📖',
    title: 'Care sheets & prey guidance',
    body: 'Sourced husbandry for every species in your collection: temperatures, humidity, enclosure size, UVB, diet, and prey sizing at a glance.',
  },
  {
    emoji: '📈',
    title: 'Sheds, weights & growth',
    body: 'Record sheds, weigh-ins, and milestones, then watch growth trends chart themselves over time.',
  },
  {
    emoji: '🧬',
    title: 'Breeding records',
    body: 'Log pairings, track clutches through incubation, and manage offspring from hatch to placement.',
  },
  {
    emoji: '🔔',
    title: 'Reminders that respect your routine',
    body: 'Feeding reminders, low-feeder-stock alerts, and a daily digest — so nothing slips, without the app nagging.',
  },
]

export default function Home() {
  const { token, isLoading } = useAuth()
  const signedIn = !isLoading && !!token

  return (
    <div className="min-h-screen bg-herp-dark text-neutral-100">
      {/* ---------------- Nav ---------------- */}
      <nav className="border-b border-neutral-900 sticky top-0 z-40 bg-herp-dark/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={32} height={33} className="h-8 w-auto" draggable={false} />
            <span className="text-xl font-bold tracking-wide herp-gradient-text">Herpetoverse</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/pricing" className="hidden sm:inline text-sm text-neutral-400 hover:text-white transition-colors">
              Pricing
            </Link>
            {signedIn ? (
              <Link
                href="/app/reptiles"
                className="px-4 py-2 rounded-lg herp-gradient-bg text-herp-dark font-semibold text-sm"
              >
                Go to app
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-neutral-300 hover:text-white transition-colors">
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

      {/* ---------------- Hero ---------------- */}
      <header className="relative overflow-hidden">
        <div aria-hidden="true" className="herp-hero-glow absolute inset-0 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-4 font-medium">
            Husbandry tracking for reptile &amp; amphibian keepers
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-wide leading-tight mb-6">
            Keep better records.
            <br />
            <span className="herp-gradient-text">Keep healthier animals.</span>
          </h1>
          <p className="text-lg sm:text-xl text-neutral-300 leading-relaxed max-w-2xl mx-auto mb-10">
            Herpetoverse brings your whole collection into one place — feeding, sheds,
            weights, environments, care research, and breeding — across every taxon you keep.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {signedIn ? (
              <Link
                href="/app/reptiles"
                className="px-7 py-3.5 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide"
              >
                Open your collection
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="px-7 py-3.5 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide"
                >
                  Start free
                </Link>
                <Link
                  href="/login"
                  className="px-7 py-3.5 rounded-xl border border-neutral-700 text-neutral-100 font-semibold hover:border-neutral-500 transition-colors"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            Free to start · Track up to 5 animals free · No card required
          </p>

          {/* Taxa strip */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {TAXA.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 text-sm text-neutral-400">
                <span className="text-lg" aria-hidden="true">{t.emoji}</span>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ---------------- Features ---------------- */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-3">
            Everything a keeper actually tracks
          </h2>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            Purpose-built for reptiles and amphibians — not a generic pet app with scales bolted on.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 hover:border-neutral-700 transition-colors"
            >
              <div className="text-3xl mb-4" aria-hidden="true">{f.emoji}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-500">
          Plus collection import &amp; export, feeder inventory, photo galleries, and QR enclosure tags.
        </p>
      </section>

      {/* ---------------- Pricing teaser ---------------- */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-3xl border border-herp-teal/30 bg-herp-teal/[0.06] p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-wide text-white mb-3">
            Free to keep. Premium when you grow.
          </h2>
          <p className="text-neutral-300 max-w-2xl mx-auto mb-8">
            Every tracking feature is free. Go Premium for unlimited animals, feeder
            inventory, and breeding tracking — or get <span className="text-herp-lime font-medium">All-Access</span> to
            unlock Tarantuverse too, with one subscription.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/pricing"
              className="px-7 py-3.5 rounded-xl herp-gradient-bg text-herp-dark font-bold tracking-wide"
            >
              See pricing
            </Link>
            {!signedIn && (
              <Link
                href="/register"
                className="px-7 py-3.5 rounded-xl border border-neutral-700 text-neutral-100 font-semibold hover:border-neutral-500 transition-colors"
              >
                Create free account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Tarantuverse cross-promo ---------------- */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-green/90 mb-3 font-medium">
          Same universe · Different species
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-wide text-white mb-3">
          Also keep inverts?
        </h2>
        <p className="text-neutral-400 max-w-2xl mx-auto mb-6">
          Herpetoverse is built by the team behind{' '}
          <a
            href="https://tarantuverse.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-herp-teal hover:text-herp-lime underline underline-offset-4 transition-colors"
          >
            Tarantuverse
          </a>
          , the husbandry platform for tarantulas, scorpions, and other invertebrates.
          One keeper account works across both — and All-Access unlocks Premium on each.
        </p>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-neutral-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={24} height={25} className="h-6 w-auto" draggable={false} />
            <span className="text-sm font-semibold herp-gradient-text">Herpetoverse</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-400">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-white transition-colors">Create account</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </nav>
          <p className="text-xs text-neutral-600">
            © {new Date().getFullYear()} Appalachian Tarantulas, LLC
          </p>
        </div>
      </footer>
    </div>
  )
}
