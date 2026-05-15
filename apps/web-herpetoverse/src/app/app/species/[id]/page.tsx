/**
 * Keeper-facing species care sheet at `/app/species/[id]`.
 *
 * Lives under the feature-flag-gated `/app/*` tree — only reachable with
 * `features.herpetoverse_app_enabled` on or the `herp_preview=1` cookie.
 * Thin page: body lives in the shared <CareSheet /> component so the public
 * `/species/[slug]` route gets the same content by design.
 *
 * Keeper-only chrome added here (not in the shared component): an
 * "add to collection" CTA injected just below the hero via CareSheet's
 * `afterHero` slot. Taxon is inferred from the species family so the
 * keeper lands on the add form with snake / lizard / frog pre-selected.
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

// Seeded herp families bucketed by clade — drives taxon inference for the
// "add to collection" CTA so most keepers skip the taxon picker entirely.
// Mirrors the same sets in the mobile species screen
// (apps/mobile-herpetoverse/app/species/[id].tsx). Falls back to null →
// the keeper picks the type on the add form.
const SNAKE_FAMILIES = new Set([
  'Pythonidae',
  'Boidae',
  'Colubridae',
  'Elapidae',
  'Viperidae',
  'Lamprophiidae',
])
const LIZARD_FAMILIES = new Set([
  'Agamidae',
  'Anguidae',
  'Chamaeleonidae',
  'Cordylidae',
  'Diplodactylidae',
  'Eublepharidae',
  'Gekkonidae',
  'Helodermatidae',
  'Iguanidae',
  'Lacertidae',
  'Phrynosomatidae',
  'Rhacodactylidae',
  'Scincidae',
  'Sphaerodactylidae',
  'Teiidae',
  'Varanidae',
])
// Anuran families covered by the seeded frog care sheets. Litoria is filed
// under Hylidae to match the seed data (some taxonomies split it into
// Pelodryadidae) — inference keys on the stored string.
const FROG_FAMILIES = new Set([
  'Ceratophryidae',
  'Dendrobatidae',
  'Hylidae',
  'Pyxicephalidae',
])

function taxonFromFamily(
  family: string | null,
): 'snake' | 'lizard' | 'frog' | null {
  if (!family) return null
  if (SNAKE_FAMILIES.has(family)) return 'snake'
  if (LIZARD_FAMILIES.has(family)) return 'lizard'
  if (FROG_FAMILIES.has(family)) return 'frog'
  return null
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

  // "Add to collection" CTA — pre-fills the add form with this species.
  // Taxon is inferred from family when we recognize it; otherwise the
  // keeper picks it on the add form (which defaults to snake).
  const inferredTaxon = taxonFromFamily(species.family)
  const addHref = `/app/reptiles/add?${new URLSearchParams({
    species_id: species.id,
    scientific_name: species.scientific_name,
    common_name: species.common_names[0] ?? '',
    taxon: inferredTaxon ?? 'snake',
  }).toString()}`
  const ctaLabel = inferredTaxon
    ? `Add as ${inferredTaxon}`
    : 'Add to my collection'
  const ctaHint = inferredTaxon
    ? 'Pre-fills species + scientific name. You can change anything before saving.'
    : "You'll pick the type on the next step."

  const addToCollectionCta = (
    <Link
      href={addHref}
      aria-label={ctaLabel}
      className="flex items-center gap-3 mb-10 px-5 py-4 rounded-lg herp-gradient-bg text-herp-dark transition-opacity hover:opacity-90"
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        ＋
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold tracking-wide">{ctaLabel}</span>
        <span className="block text-sm opacity-75">{ctaHint}</span>
      </span>
      <span aria-hidden="true" className="text-xl leading-none">
        →
      </span>
    </Link>
  )

  return (
    <article className="max-w-4xl mx-auto">
      <Link
        href="/app/species"
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime transition-colors mb-6"
      >
        <span aria-hidden="true">←</span> Species library
      </Link>

      <CareSheet species={species} afterHero={addToCollectionCta} />
    </article>
  )
}
