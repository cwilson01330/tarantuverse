import { MetadataRoute } from 'next'

// Generate on-request, not during `next build`. The species lists come from the
// Render API, which cold-starts on the free tier; prerendering at build time made
// a cold start hang past Vercel's 60s budget and fail the build. As a dynamic
// route it's produced when first requested (API typically warm), and the per-fetch
// data cache below keeps repeat crawls cheap.
export const dynamic = 'force-dynamic'
export const revalidate = 3600

/**
 * XML sitemap for search engines.
 *
 * Care guides are the primary SEO surface (BRIEF-care-guide-expansion §0), so the
 * sitemap must list EVERY public care guide:
 *   - tarantulas    -> /species/{id}            (legacy `species` table)
 *   - other taxa    -> /species/inverts/{id}    (unified `invert_species`)
 *
 * Both list endpoints paginate and cap their page size (legacy `species` le=100 +
 * returns {items, has_more}; `invert-species` le=200 + returns a plain array), so
 * we loop rather than requesting one huge page (a too-large `limit` 422s and would
 * silently drop every species URL). Tarantulas are excluded from the invert pass
 * so each species appears under exactly one canonical URL.
 *
 * Fetches use ISR (revalidate daily) so newly seeded species show up within ~24h
 * without a redeploy.
 */

interface Row {
  id: string
  taxon?: string
  updated_at?: string
}

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://tarantuverse.com'
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function getJson(url: string): Promise<any | null> {
  try {
    // Hard 8s cap per request so a cold/slow API degrades gracefully (sitemap
    // falls back to static routes) instead of hanging the whole render.
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.error('[sitemap] fetch failed', url, e)
    return null
  }
}

// Legacy tarantula `species` table — paginated {items, has_more}, limit <= 100.
async function getTarantulas(): Promise<Row[]> {
  const out: Row[] = []
  const limit = 100
  for (let skip = 0; skip < 50000; skip += limit) {
    const data = await getJson(`${API}/api/v1/species/?skip=${skip}&limit=${limit}`)
    const items: Row[] = data?.items ?? (Array.isArray(data) ? data : [])
    if (!items.length) break
    out.push(...items)
    if (data?.has_more === false || items.length < limit) break
  }
  return out
}

// Unified `invert_species` — plain array, limit <= 200, all taxa.
async function getInverts(): Promise<Row[]> {
  const out: Row[] = []
  const limit = 200
  for (let skip = 0; skip < 50000; skip += limit) {
    const data = await getJson(`${API}/api/v1/invert-species/?skip=${skip}&limit=${limit}`)
    const items: Row[] = Array.isArray(data) ? data : (data?.items ?? [])
    if (!items.length) break
    out.push(...items)
    if (items.length < limit) break
  }
  return out
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}`, changeFrequency: 'daily', priority: 1.0, lastModified: now },
    { url: `${SITE}/species`, changeFrequency: 'daily', priority: 0.9, lastModified: now },
    { url: `${SITE}/features`, changeFrequency: 'monthly', priority: 0.7, lastModified: now },
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.7, lastModified: now },
    { url: `${SITE}/community`, changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: `${SITE}/blog`, changeFrequency: 'weekly', priority: 0.5, lastModified: now },
    { url: `${SITE}/help`, changeFrequency: 'monthly', priority: 0.4, lastModified: now },
    { url: `${SITE}/contact`, changeFrequency: 'yearly', priority: 0.3, lastModified: now },
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.2, lastModified: now },
  ]

  const [tarantulas, inverts] = await Promise.all([getTarantulas(), getInverts()])

  const tarantulaRoutes: MetadataRoute.Sitemap = tarantulas.map((s) => ({
    url: `${SITE}/species/${s.id}`,
    lastModified: s.updated_at ? new Date(s.updated_at) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const invertRoutes: MetadataRoute.Sitemap = inverts
    .filter((s) => s.taxon && s.taxon !== 'tarantula')
    .map((s) => ({
      url: `${SITE}/species/inverts/${s.id}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  return [...staticRoutes, ...tarantulaRoutes, ...invertRoutes]
}
