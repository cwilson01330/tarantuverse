import Link from 'next/link'
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  displayTitle,
  ENCLOSURE_LABELS,
  fetchReptileSpecies,
  formatRange,
  ReptileSpecies,
} from '@/lib/reptileSpecies'
import { CareLevelBadge } from '@/components/SpeciesBadges'

export const metadata = {
  title: 'Species library · Herpetoverse',
  description:
    'Care sheets and husbandry profiles — seeded from keeper-verified sources.',
}

export default async function SpeciesPage() {
  const species = await fetchReptileSpecies()

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Reference
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Species library
        </h1>
        <p className="text-neutral-400 max-w-2xl">
          Care sheets and husbandry profiles. Every entry is backed by three
          or more independent sources — veterinary guides, research-based
          husbandry reviews, and long-standing keeper references.
        </p>
      </header>

      {species === null ? (
        <ApiErrorState />
      ) : species.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mb-4 text-sm text-neutral-500">
            {species.length}{' '}
            {species.length === 1 ? 'species' : 'species'} · sorted
            alphabetically
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {species.map((s) => (
              <SpeciesCard key={s.id} species={s} />
            ))}
          </div>
        </>
      )}

      <footer className="mt-12 pt-8 border-t border-neutral-800 text-xs text-neutral-500 leading-relaxed max-w-2xl">
        <p className="mb-2">
          <span className="text-neutral-400 font-medium">Content standards.</span>{' '}
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
  )
}

function SpeciesCard({ species }: { species: ReptileSpecies }) {
  const adultSize = formatRange(
    species.adult_length_min_in,
    species.adult_length_max_in,
    'in',
  )
  const activity = species.activity_period
    ? `${ACTIVITY_ICONS[species.activity_period]} ${ACTIVITY_LABELS[species.activity_period]}`
    : null
  const enclosure = species.enclosure_type
    ? ENCLOSURE_LABELS[species.enclosure_type]
    : null

  return (
    <Link
      href={`/app/species/${species.id}`}
      className="group block p-5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/40 hover:bg-neutral-900/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white mb-0.5 truncate">
            {displayTitle(species)}
          </h2>
          <p className="text-xs italic text-neutral-400 truncate">
            {species.scientific_name}
          </p>
        </div>
        <CareLevelBadge level={species.care_level} />
      </div>

      {species.common_names.length > 1 && (
        <p className="text-xs text-neutral-500 mb-3 truncate">
          Also:{' '}
          {species.common_names.slice(1).join(', ')}
        </p>
      )}

      <dl className="space-y-1.5 text-xs text-neutral-400">
        {activity && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Activity period</dt>
            <dd>{activity}</dd>
          </div>
        )}
        {enclosure && (
          <div className="flex items-center gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0">Setup</dt>
            <dd>{enclosure}</dd>
          </div>
        )}
        {adultSize && (
          <div className="flex items-center gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0">Adult</dt>
            <dd>{adultSize}</dd>
          </div>
        )}
        {species.native_region && (
          <div className="flex items-start gap-2">
            <dt className="text-neutral-600 w-16 flex-shrink-0 mt-0.5">
              Native
            </dt>
            <dd className="line-clamp-2">{species.native_region}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 text-xs text-herp-teal group-hover:text-herp-lime transition-colors">
        View care sheet →
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        📖
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No species yet
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto">
        The library is being seeded. Care sheets will appear here as they
        pass content review.
      </p>
    </div>
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
