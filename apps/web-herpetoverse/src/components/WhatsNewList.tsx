'use client'

/**
 * "What's new" entry rows and the weekly history list (spec 2026-10-23 §2).
 * Herpetoverse web, dark-only. The Home card (`WhatsNewCard`) reuses
 * `WhatsNewEntryRow`; the history page (`/app/whats-new`) renders `WhatsNewList`.
 *
 * An entry's button exists only when this app has a screen for its target
 * (`routeForTarget`); an entry whose target has no screen here (Advanced
 * Analytics, say) shows its text with no button, never a dead link.
 */
import { routeForTarget, type WhatsNewEntry, type WhatsNewWeek } from '@/lib/whatsNew'

const BTN =
  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 border border-herp-teal/40 bg-herp-teal/10 text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60'

/** "Week of Oct 19" from a Monday `YYYY-MM-DD`, read as a LOCAL date (never `new Date('YYYY-MM-DD')`, which is UTC). */
export function weekHeading(weekOf: string): string {
  const [y, m, d] = weekOf.split('-').map((p) => Number.parseInt(p, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return `Week of ${weekOf}`
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Week of ${label}`
}

export function WhatsNewEntryRow({
  entry,
  onAction,
  disabled,
}: {
  entry: WhatsNewEntry
  /** Called with the destination route when the entry's button is pressed. */
  onAction: (route: string) => void
  disabled?: boolean
}) {
  const route = entry.action ? routeForTarget(entry.action.target) : null
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-white">{entry.title}</h3>
        {entry.premium && (
          <span className="rounded-full border border-herp-lime/40 bg-herp-lime/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-herp-lime">
            Premium
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{entry.body}</p>
      {entry.action && route && (
        <button type="button" disabled={disabled} onClick={() => onAction(route)} className={`mt-3 ${BTN}`}>
          {entry.action.label}
        </button>
      )}
    </div>
  )
}

export default function WhatsNewList({
  weeks,
  onAction,
}: {
  weeks: WhatsNewWeek[]
  onAction: (route: string) => void
}) {
  return (
    <div className="space-y-8">
      {weeks.map((week) => (
        <section key={week.week_of} aria-labelledby={`week-${week.week_of}`}>
          <h2
            id={`week-${week.week_of}`}
            className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-herp-lime"
          >
            {weekHeading(week.week_of)}
          </h2>
          <div className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/40">
            {week.entries.map((entry) => (
              <div key={entry.id} className="p-5">
                <WhatsNewEntryRow entry={entry} onAction={onAction} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
