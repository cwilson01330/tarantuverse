/**
 * Sitemap for Herpetoverse's public surface.
 *
 * Generated at build/request time via Next.js' Metadata file convention —
 * Next.js serves this at `/sitemap.xml` automatically, which is what
 * `/public/robots.txt` points Googlebot at.
 *
 * Scope: public pages only. We explicitly skip:
 *   • `/app/*`  — feature-flag gated, signed-in keeper experience.
 *   • `/login`  — low SEO value and intentionally not indexed.
 *   • `/api/*`  — JSON endpoints.
 *
 * Care sheet URLs are built from the `slug` column enforced unique + non-null
 * in migration `slg_20260423`. If `fetchReptileSpecies` fails (API down
 * during build), we fall back to just the static entries so the sitemap
 * file still generates — better a thin sitemap than a build break.
 *
 * `lastModified` is `content_last_reviewed_at` when present, otherwise
 * `updated_at`/`created_at` so Google gets an honest freshness signal.
 */
import type { MetadataRoute } from 'next'
import { fetchReptileSpecies } from '@/lib/reptileSpecies'

// Canonical host. Keep in sync with the detail-page `SITE_URL` constant.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://herpetoverse.com'
).replace(/\/$/, '')

// Regenerate the sitemap every 5 minutes — matches the underlying species
// fetch ISR window. A fresh care-sheet edit propagates to Google within a
// single revalidation cycle.
export const revalidate = 300

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/species`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  const speciesList = await fetchReptileSpecies()
  if (speciesList === null) {
    // Degraded but not broken — a future crawl + revalidation will pick up
    // the detail pages once the API recovers.
    return staticEntries
  }

  const speciesEntries: MetadataRoute.Sitemap = speciesList.map((s) => ({
    url: `${SITE_URL}/species/${s.slug}`,
    // Prefer the explicit content review timestamp — that's the signal we
    // want Google to see. Fall back through updated_at → created_at so
    // lastModified is always a real value.
    lastModified: new Date(
      s.content_last_reviewed_at || s.updated_at || s.created_at,
    ),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticEntries, ...speciesEntries]
}
