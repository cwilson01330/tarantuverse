/**
 * /species/all — every care guide on one server-rendered page, A–Z by group.
 *
 * Why it exists: the /species browser only puts its first page of tarantulas
 * in the initial HTML; the rest of the tarantulas and every other group
 * (scorpions, mantises, isopods, …) appear only after JavaScript runs. Search
 * and AI crawlers that don't run JS could reach those guides only through the
 * sitemap. This page gives each guide a plain link from the site itself.
 *
 * Same two sources and URL scheme as sitemap.ts: tarantulas from the legacy
 * `species` table at /species/{id}; every other taxon from `invert_species`
 * at /species/inverts/{id} (tarantulas skipped there so each guide is listed
 * once). Group names and order come from INVERT_TAXA — don't hand-copy a
 * taxon list here (tests/test_taxon_lists_in_sync.py).
 *
 * Dynamic so `next build` never waits on a cold Render API; the fetches are
 * cached for an hour, so repeat requests don't hit the API.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { INVERT_TAXA, isInvertTaxon, type InvertTaxon } from '@/lib/inverts'
import { SITE } from '@/lib/app-listing'
import PublicCareShell from '@/components/PublicCareShell'

export const dynamic = 'force-dynamic'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

const TITLE = 'All Invertebrate Care Guides A–Z | Tarantuverse'
const DESCRIPTION =
  'Every Tarantuverse care guide on one page: tarantulas, scorpions, centipedes, whip spiders, true spiders, mantises, millipedes, roaches, isopods and more.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/species/all` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/species/all`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

interface Row {
  id: string
  scientific_name: string
  common_names?: string[] | null
  taxon?: string | null
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(45000),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

// Same pagination limits as sitemap.ts: legacy species le=100, invert le=200.
async function getAll(path: string, limit: number): Promise<Row[]> {
  const out: Row[] = []
  for (let skip = 0; skip < 50000; skip += limit) {
    const data = (await getJson(`${API}${path}?skip=${skip}&limit=${limit}`)) as
      | Row[]
      | { items?: Row[]; has_more?: boolean }
      | null
    if (data == null) break
    const items = Array.isArray(data) ? data : (data.items ?? [])
    if (!items.length) break
    out.push(...items)
    const hasMore = Array.isArray(data) ? undefined : data.has_more
    if (hasMore === false || items.length < limit) break
  }
  return out
}

const byName = (a: Row, b: Row) => a.scientific_name.localeCompare(b.scientific_name)

export default async function AllCareGuidesPage() {
  const [tarantulas, inverts] = await Promise.all([
    getAll('/api/v1/species/', 100),
    getAll('/api/v1/invert-species/', 200),
  ])

  const groups: { taxon: InvertTaxon; rows: Row[]; href: (id: string) => string }[] = []
  for (const taxon of Object.keys(INVERT_TAXA) as InvertTaxon[]) {
    const rows =
      taxon === 'tarantula'
        ? tarantulas
        : inverts.filter((s) => {
            const t = s.taxon && isInvertTaxon(s.taxon) ? s.taxon : 'other'
            return t === taxon
          })
    if (!rows.length) continue
    groups.push({
      taxon,
      rows: [...rows].sort(byName),
      href: (id) => (taxon === 'tarantula' ? `/species/${id}` : `/species/inverts/${id}`),
    })
  }
  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    // Public header/footer (no signed-in sidebar): this is a crawl surface.
    <PublicCareShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <nav className="text-sm mb-6 text-gray-500 dark:text-gray-400">
          <Link href="/" className="hover:text-purple-600 dark:hover:text-purple-400">
            Tarantuverse
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/species" className="hover:text-purple-600 dark:hover:text-purple-400">
            Care guides
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-gray-700 dark:text-gray-300">All, A–Z</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          All care guides, A–Z
        </h1>
        {total > 0 ? (
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            {total} free care guides, grouped by animal. Each guide lists temperature,
            humidity, enclosure size by life stage, substrate, feeding and temperament.
            To search and filter, use the{' '}
            <Link href="/species" className="text-purple-600 dark:text-purple-400 underline">
              species browser
            </Link>
            .
          </p>
        ) : (
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            The species list could not be loaded just now. Try the{' '}
            <Link href="/species" className="text-purple-600 dark:text-purple-400 underline">
              species browser
            </Link>
            .
          </p>
        )}

        {groups.length > 1 && (
          <ul className="flex flex-wrap gap-2 mb-10">
            {groups.map((g) => (
              <li key={g.taxon}>
                <a
                  href={`#${g.taxon}`}
                  className="inline-block px-3 py-1 rounded-full text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-purple-400 dark:hover:border-purple-500"
                >
                  {INVERT_TAXA[g.taxon].label} ({g.rows.length})
                </a>
              </li>
            ))}
          </ul>
        )}

        {groups.map((g) => (
          <section key={g.taxon} id={g.taxon} className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              {INVERT_TAXA[g.taxon].label} care guides
            </h2>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {g.rows.map((s) => (
                <li key={s.id} className="text-sm">
                  <Link
                    href={g.href(s.id)}
                    className="text-purple-700 dark:text-purple-300 hover:underline italic"
                  >
                    {s.scientific_name}
                  </Link>
                  {s.common_names?.[0] && (
                    <span className="text-gray-600 dark:text-gray-400"> — {s.common_names[0]}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PublicCareShell>
  )
}
