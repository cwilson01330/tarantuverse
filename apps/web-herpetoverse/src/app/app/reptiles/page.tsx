export default function ReptilesPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Collection
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Your reptiles
        </h1>
        <p className="text-neutral-400">
          This is where your collection will live. Nothing here yet.
        </p>
      </header>

      <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
        <div className="text-4xl mb-4" aria-hidden="true">
          🦎
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          No reptiles yet
        </h2>
        <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
          Collection management is being built. You&rsquo;ll be able to add
          geckos, snakes, monitors, and more — with full husbandry tracking
          per enclosure.
        </p>
        <button
          disabled
          className="herp-gradient-bg px-5 py-2.5 rounded-md font-semibold text-sm tracking-wide opacity-40 cursor-not-allowed"
        >
          Add reptile — coming soon
        </button>
      </div>
    </div>
  )
}
