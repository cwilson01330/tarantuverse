import Link from 'next/link'

export default function AppHomePage() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Preview banner */}
      <div className="mb-8 p-4 rounded-md border border-herp-teal/30 bg-herp-teal/5 text-sm text-herp-teal/90">
        <span className="font-semibold">Preview build.</span>{' '}
        <span className="text-neutral-300">
          This is scaffolding. Pages will light up as we build them out.
        </span>
      </div>

      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Dashboard
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2">
          Welcome to <span className="herp-gradient-text">Herpetoverse</span>
        </h1>
        <p className="text-neutral-400">
          A husbandry platform for reptile keepers. One login, one profile —
          shared with Tarantuverse.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashCard
          icon="🦎"
          title="Your reptiles"
          body="Add your first animal to start tracking environments, feedings, and sheds."
          href="/app/reptiles"
        />
        <DashCard
          icon="📖"
          title="Species library"
          body="Browse care sheets for geckos, snakes, monitors, and more."
          href="/app/species"
        />
        <DashCard
          icon="🧬"
          title="Genetics & morphs"
          body="Punnett-square morph predictor for ball pythons. More species coming."
          href="/app/breeding"
        />
        <DashCard
          icon="🏆"
          title="Achievements"
          body="Track milestones across both Tarantuverse and Herpetoverse — your account, one trophy case."
          href="/app/achievements"
        />
        <DashCard
          icon="🌡️"
          title="Habitat monitoring"
          body="Dial in temperature gradients and humidity for every enclosure."
          soon
        />
        <DashCard
          icon="🥚"
          title="Breeding records"
          body="Pair logs, clutches, hatch dates, and offspring lineage. In design now."
          soon
        />
        <DashCard
          icon="🌐"
          title="Community"
          body="Shared with Tarantuverse — forums, keepers, and discovery."
          soon
        />
      </section>
    </div>
  )
}

/**
 * Dashboard card. With `href` it renders as a clickable Link; with `soon`
 * it renders as a muted, non-interactive tile with a SOON badge.
 *
 * Live cards still use the same dimensions / vertical rhythm as soon
 * cards so the grid doesn't reflow when a card lights up — only the
 * border/hover state and clickability change.
 */
function DashCard({
  icon,
  title,
  body,
  href,
  soon,
}: {
  icon: string
  title: string
  body: string
  href?: string
  soon?: boolean
}) {
  const inner = (
    <>
      {soon && (
        <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-neutral-500">
          Soon
        </span>
      )}
      <div className="text-2xl mb-3" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-neutral-400 leading-relaxed">{body}</p>
    </>
  )

  // Live (linked) card — full-bleed Link so the entire tile is clickable.
  if (href && !soon) {
    return (
      <Link
        href={href}
        className="relative block p-5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/40 hover:bg-neutral-900/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-herp-teal/60"
      >
        {inner}
      </Link>
    )
  }

  // SOON or unlinked — non-interactive tile.
  return (
    <div
      className={`relative p-5 rounded-lg border transition-colors ${
        soon
          ? 'border-neutral-800 bg-neutral-900/30 opacity-60'
          : 'border-neutral-800 bg-neutral-900/50 hover:border-herp-teal/30'
      }`}
    >
      {inner}
    </div>
  )
}
