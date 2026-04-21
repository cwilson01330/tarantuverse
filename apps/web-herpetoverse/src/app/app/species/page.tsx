export default function SpeciesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Reference
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Species library
        </h1>
        <p className="text-neutral-400">
          Care sheets and husbandry profiles — seeded from keeper-verified
          sources.
        </p>
      </header>

      <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
        <div className="text-4xl mb-4" aria-hidden="true">
          📖
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          Library is being built
        </h2>
        <p className="text-sm text-neutral-400 max-w-md mx-auto">
          We&rsquo;re sourcing and verifying care data for common captive
          reptile species. Same structure as the Tarantuverse species
          database, adapted for reptile husbandry.
        </p>
      </div>
    </div>
  )
}
