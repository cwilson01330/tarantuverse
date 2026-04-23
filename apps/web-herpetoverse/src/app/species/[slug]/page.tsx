/**
 * Public care sheet at `/species/{slug}` — the whole SEO marketing theory.
 *
 * Lives outside `/app/*` on purpose so it renders regardless of the
 * `herpetoverse_app_enabled` feature flag. Google can crawl these from day
 * one; the keeper app ships behind the gate independently.
 *
 * SEO surface area:
 *   • Rich <Metadata> — title, description, canonical, OG image (if species
 *     has one), twitter card.
 *   • JSON-LD (Article + BreadcrumbList) so the page qualifies for rich
 *     results. FAQ schema intentionally deferred — current care sheets
 *     don't ship with Q/A content.
 *   • Same article body as the keeper view via <CareSheet /> — no content
 *     fork between public and signed-in readers.
 *
 * Keep URLs stable. The `slug` column is unique and non-nullable; editing
 * it is an admin-only operation (see backend `slg_20260423` migration).
 */
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CareSheet from '@/components/CareSheet'
import {
  displayTitle,
  fetchReptileSpeciesBySlug,
  ReptileSpecies,
} from '@/lib/reptileSpecies'

// Canonical host for absolute URLs in metadata + JSON-LD. Matches the OG
// URL declared in the root layout. Override with NEXT_PUBLIC_SITE_URL in the
// Vercel environment if the production hostname ever changes.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://herpetoverse.com'
).replace(/\/$/, '')

// Public pages: re-use the same 5-minute ISR window as the underlying fetch.
export const revalidate = 300

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const species = await fetchReptileSpeciesBySlug(slug)
  if (!species) {
    return {
      title: 'Species not found — Herpetoverse',
      robots: { index: false, follow: false },
    }
  }

  const title = displayTitle(species)
  const pageTitle = `${title} (${species.scientific_name}) care sheet — Herpetoverse`
  const description = buildDescription(species)
  const canonical = `${SITE_URL}/species/${species.slug}`

  // OG image: prefer the species hero image; fall back to site-default (the
  // root layout already declares one implicitly). Only pass a URL we
  // actually have — Google's OG debugger dislikes empty og:image strings.
  const ogImage = species.image_url

  return {
    title: pageTitle,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} care sheet`,
      description,
      url: canonical,
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage, alt: title }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: `${title} care sheet`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function PublicSpeciesSlugPage({ params }: PageProps) {
  const { slug } = await params
  const species = await fetchReptileSpeciesBySlug(slug)

  if (!species) {
    notFound()
  }

  const title = displayTitle(species)
  const canonical = `${SITE_URL}/species/${species.slug}`

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <PublicNav />

      {/* Structured data — rendered as <script> tags so Googlebot can parse
          the same HTML we ship to humans. Two JSON-LD blocks:
          - Article: marks the page as editorial content.
          - BreadcrumbList: helps search rich results show the hierarchy. */}
      <JsonLd data={buildArticleJsonLd(species, canonical, title)} />
      <JsonLd data={buildBreadcrumbJsonLd(title, canonical)} />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12">
        <Link
          href="/species"
          className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime transition-colors mb-6"
        >
          <span aria-hidden="true">←</span> All care sheets
        </Link>

        <article>
          <CareSheet species={species} />
        </article>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Meta helpers
// ---------------------------------------------------------------------------

/**
 * Builds a ~160-char description suitable for <meta description> + OG.
 * Prefers the first paragraph of the care guide; strips markdown **bold**.
 * Falls back to a factual summary so pages without a care_guide still ship
 * with crawlable metadata.
 */
function buildDescription(species: ReptileSpecies): string {
  if (species.care_guide) {
    const firstPara = species.care_guide
      .split(/\n\n+/)[0]
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim()
    if (firstPara) return truncate(firstPara, 200)
  }
  const title = displayTitle(species)
  const pieces = [
    `${title} (${species.scientific_name}) care sheet.`,
    species.native_region ? `Native to ${species.native_region}.` : null,
    species.activity_period ? `${species.activity_period} activity.` : null,
  ].filter(Boolean)
  return truncate(pieces.join(' '), 200)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org)
// ---------------------------------------------------------------------------

function buildArticleJsonLd(
  species: ReptileSpecies,
  canonical: string,
  title: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${title} (${species.scientific_name}) care sheet`,
    description: buildDescription(species),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    url: canonical,
    ...(species.image_url ? { image: [species.image_url] } : {}),
    author: {
      '@type': 'Organization',
      name: 'Herpetoverse content team',
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Herpetoverse',
      url: SITE_URL,
    },
    ...(species.content_last_reviewed_at
      ? { dateModified: species.content_last_reviewed_at }
      : {}),
    ...(species.created_at ? { datePublished: species.created_at } : {}),
    about: {
      '@type': 'Taxon',
      name: species.scientific_name,
      alternateName: species.common_names,
    },
  }
}

function buildBreadcrumbJsonLd(title: string, canonical: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Herpetoverse',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Care sheets',
        item: `${SITE_URL}/species`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: title,
        item: canonical,
      },
    ],
  }
}

/**
 * Inline JSON-LD script. Using `dangerouslySetInnerHTML` is the canonical
 * Next.js pattern for structured data; Googlebot parses the same HTML we
 * ship so the script does not need to be executable JS.
 */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is safe here — we built `data` server-side from
      // typed inputs, so there's no user-controlled content to escape.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// ---------------------------------------------------------------------------
// Public shell
// ---------------------------------------------------------------------------

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
