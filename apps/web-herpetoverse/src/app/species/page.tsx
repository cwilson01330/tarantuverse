/**
 * Public species library — lives *outside* `/app`, so it's unaffected by the
 * `herpetoverse_app_enabled` feature flag. This is the SEO entry point
 * referenced in the sitemap; keep it indexable and crawlable.
 *
 * Mirrors the keeper-facing list at `/app/species` but:
 *   • links to `/species/{slug}` (not `/app/species/{id}`) — stable URLs
 *   • wraps content in a minimal public shell (no AppShell / no sidebar)
 *   • omits keeper-only affordances
 *
 * Content itself is the same verified species set — shoppers and Google
 * see what keepers see. The initial (unfiltered) list is server-rendered for
 * crawlability + fast first paint; the taxon chips + search live in the
 * client <SpeciesBrowser /> and progressively enhance from there.
 */
import Link from 'next/link'
import type { Metadata } from 'next'
import { fetchReptileSpecies, type ReptileSpecies } from '@/lib/reptileSpecies'
import SpeciesBrowser from '@/components/SpeciesBrowser'

export const metadata: Metadata = {
  title: 'Reptile care sheets — Herpetoverse',
  description:
    'Free, keeper-verified care sheets for reptiles. Temperature, humidity, enclosure, diet, and lifespan — every parameter backed by published references.',
  alternates: {
    canonical: 'https://herpetoverse.com/species',
  },
  openGraph: {
    title: 'Reptile care sheets — Herpetoverse',
    description:
      'Keeper-verified husbandry parameters for common reptiles. Every species is backed by three or more independent sources.',
    url: 'https://herpetoverse.com/species',
    type: 'website',
  },
}

// Render statically. Underlying fetch already uses 5-min ISR, so the first
// visitor post-deploy will re-populate the cache.
export const revalidate = 300

export default async function PublicSpeciesListPage() {
  const species = await fetchReptileSpecies()

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <PublicNav />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
        <header className="mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
            Reference
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
            Reptile &amp; amphibian care sheets
          </h1>
          <p className="text-neutral-400 max-w-2xl">
            Free, detailed husbandry profiles. Every entry is backed by three
            or more independent sources — veterinary guides, research-based
            husbandry reviews, and long-standing keeper references.
          </p>
        </header>

        {species === null ? (
          <ApiErrorState />
        ) : (
          <SpeciesBrowser
            initialSpecies={species}
            hrefFor={(s: ReptileSpecies) => `/species/${s.slug}`}
          />
        )}

        <footer className="mt-12 pt-8 border-t border-neutral-800 text-xs text-neutral-500 leading-relaxed max-w-2xl">
          <p className="mb-2">
            <span className="text-neutral-400 font-medium">
              Content standards.
            </span>{' '}
            Husbandry numbers are expressed as ranges reflecting source
            variation. We prefer the overlap between veterinary and
            authoritative keeper references.
          </p>
          <p>
            Conservation data (CITES, IUCN) is listed for reference and may lag
            the latest official assessments — verify current status before
            making trade or transport decisions.
          </p>
        </footer>
      </div>
    </main>
  )
}

/**
 * Minimal public nav — one home link. The /app tree has its own AppShell;
 * public SEO pages get this simpler treatment so they render fast and
 * don't imply a signed-in experience.
 */
function PublicNav() {
  return (
    <nav className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-semibold tracking-wide text-white hover:text-herp-lime transition-colors"
        >
          Herpetoverse
        </Link>
        <Link
          href="/login"
          className="text-xs tracking-wider uppercase text-neutral-400 hover:text-herp-teal transition-colors"
        >
          Sign in
        </Link>
      </div>
    </nav>
  )
}

function ApiErrorState() {
  return (
    <div className="p-10 rounded-lg border border-red-500/30 bg-red-500/5 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🛰️
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        Couldn&rsquo;t reach the species API
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto">
        This usually clears up within a minute. Try refreshing — if it
        persists, the backend may be waking up from sleep.
      </p>
    </div>
  )
}
