import { redirect } from 'next/navigation'

/**
 * Retired (B5, 2026-10-07). Tarantulas use the shared animal page, the way
 * mobile's tarantula/[id] already redirects to invert/[id] (ADR-013). The two
 * share a primary key, so the id carries over unchanged. Kept as a redirect
 * for bookmarks, notification links and older public pages; the query string
 * (e.g. `?log=molt`) is preserved.
 */
type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LegacyTarantulaDetail({ params, searchParams }: Props) {
  const { id } = await params
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x)
  }
  const q = qs.toString()
  redirect(`/dashboard/inverts/${encodeURIComponent(id)}${q ? `?${q}` : ''}`)
}
