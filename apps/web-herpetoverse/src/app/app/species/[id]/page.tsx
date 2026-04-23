/**
 * Keeper-facing species care sheet at `/app/species/[id]`.
 *
 * Lives under the feature-flag-gated `/app/*` tree — only reachable with
 * `features.herpetoverse_app_enabled` on or the `herp_preview=1` cookie.
 * Thin page: body lives in the shared <CareSheet /> component so the public
 * `/species/[slug]` route gets the same content by design.
 *
 * Route shape kept as `[id]` on purpose — internal links from the keeper
 * library still navigate by UUID. Public routes are slug-based; see
 * `src/app/species/[slug]/page.tsx`.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CareSheet from '@/components/CareSheet'
import { fetchReptileSpeciesById } from '@/lib/reptileSpecies'

interface PageProps {
  // Next.js 15: dynamic params are a Promise.
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const species = await fetchReptileSpeciesById(id)
  if (!species) return { title: 'Species not found · Herpetoverse' }
  const title = species.common_names[0] || species.scientific_name
  return {
    title: `${title} (${species.scientific_name}) · Herpetoverse`,
    description:
      species.care_guide?.slice(0, 200) ||
      `Care sheet for ${species.scientific_name}.`,
  }
}

export default async function SpeciesDetailPage({ params }: PageProps) {
  const { id } = await params
  const species = await fetchReptileSpeciesById(id)

  if (!species) {
    notFound()
  }

  return (
    <article className="max-w-4xl mx-auto">
      <Link
        href="/app/species"
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime transition-colors mb-6"
      >
        <span aria-hidden="true">←</span> Species library
      </Link>

      <CareSheet species={species} />
    </article>
  )
}
