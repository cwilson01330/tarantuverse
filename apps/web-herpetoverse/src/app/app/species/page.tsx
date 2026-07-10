import { fetchReptileSpecies } from '@/lib/reptileSpecies'
import SpeciesBrowser from '@/components/SpeciesBrowser'

export const metadata = {
  title: 'Species library · Herpetoverse',
  description:
    'Care sheets and husbandry profiles — seeded from keeper-verified sources.',
}

export default async function SpeciesPage() {
  const species = await fetchReptileSpecies()

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
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
      ) : (
        <SpeciesBrowser initialSpecies={species} linkMode="app" />
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
