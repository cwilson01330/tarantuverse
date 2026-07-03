import { MetadataRoute } from 'next'

// Generate on-request, not during `next build`. The species lists come from the
// Render API, which cold-starts on the free tier; prerendering at build time made
// a cold start hang past Vercel's 60s budget and fail the build. As a dynamic
// route it's produced when first requested (API typically warm), and the per-fetch
// data cache below keeps repeat crawls cheap.
// Generated at runtime (never at build — the Render API cold-starts and would
// hang the build past Vercel's budget). Give the function room to wake a cold
// dyno before giving up.
export const dynamic = 'force-dynamic'
export const revalidate = 3600
// Vercel Pro allows up to 300s; give the function ample room to wake a cold
// Render dyno (30-60s) and complete the paginated pulls + retries.
export const maxDuration = 120

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

// The Render API cold-starts (free tier spins down after ~15 min idle; a cold
// start can take 30-60s). An 8s timeout was SHORTER than a cold start, so a
// Googlebot fetch during a cold spell silently produced a static-only sitemap
// (200 OK) that told Google every care-guide URL was gone. Now: a generous
// timeout + retries so the first (cold) request wakes the dyno and a retry
// succeeds while it's warm.
async function getJson(
  url: string,
  { timeoutMs = 30000, retries = 2 }: { timeoutMs?: number; retries?: number } = {},
): Promise<any | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.json()
    } catch (e) {
      console.error(`[sitemap] fetch failed (attempt ${attempt + 1})`, url, e)
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}

// Legacy tarantula `species` table — paginated {items, has_more}, limit <= 100.
async function getTarantulas(): Promise<Row[]> {
  const out: Row[] = []
  const limit = 100
  for (let skip = 0; skip < 50000; skip += limit) {
    const data = await getJson(`${API}/api/v1/species/?skip=${skip}&limit=${limit}`)
    // A null result = fetch failed after retries. Throw rather than `break`,
    // so we never silently emit a TRUNCATED species list (that's what caused
    // the 273-vs-410 discovered-pages gap). A 5xx just makes Google retry.
    if (data == null) throw new Error(`[sitemap] tarantula page failed at skip=${skip}`)
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
    if (data == null) throw new Error(`[sitemap] invert page failed at skip=${skip}`)
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

  // Safety net: care guides ARE the SEO surface, and we always have hundreds of
  // them. If BOTH lists came back empty, the API was unreachable (cold start) —
  // do NOT emit a static-only sitemap, which would tell Google every care-guide
  // URL is gone. Throw so the route returns 5xx and Google simply retries later,
  // keeping the previously-discovered URLs intact.
  if (tarantulas.length === 0 && inverts.length === 0) {
    throw new Error('[sitemap] species API unreachable — refusing to emit a species-less sitemap')
  }

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
