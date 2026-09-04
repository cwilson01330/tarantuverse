/**
 * Keeper-consensus husbandry signals (ADR-018).
 *
 * Shows what keepers on this platform ACTUALLY do with a species, beside the
 * written care sheet — never replacing it, never contradicting it in our voice.
 *
 * Three rules, inherited from ADR-014 and load-bearing:
 *
 *  1. We describe, we don't instruct. The heading says "what keepers do", never
 *     "recommended". The care sheet advises; this reports.
 *  2. The figure never appears without its evidence. Keeper count and
 *     observation count are rendered every time, not behind a tooltip.
 *  3. Below threshold we render NOTHING — not a hedge, not a platform average,
 *     not "not enough data yet" pleading for logs. Returning null is the
 *     honest answer and the component takes it.
 *
 * Deliberately says nothing about how this compares to the care sheet, even
 * when they disagree sharply. The reader draws that conclusion; drawing it for
 * them would be us claiming an authority this evidence doesn't support.
 */

export interface KeeperSignals {
  species_id: string
  meets_threshold: boolean
  median_interval_days: number | null
  keeper_count: number
  observation_count: number
  animal_count: number
  window_days: number
  min_keepers: number
  min_observations: number
}

export default function KeeperSignalsBlock({
  signals,
}: {
  signals: KeeperSignals | null
}) {
  // Rule 3. Also covers the fetch having failed — an absent block is
  // indistinguishable from a species without enough data, which is correct:
  // in both cases we have nothing honest to say.
  if (!signals?.meets_threshold || signals.median_interval_days == null) {
    return null
  }

  const { median_interval_days, keeper_count, observation_count, animal_count } =
    signals

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          What keepers actually do
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Tarantuverse keepers
        </span>
      </div>

      <p className="text-gray-900 dark:text-white">
        <span className="text-2xl font-bold">
          Every {median_interval_days} days
        </span>
      </p>

      {/* Rule 2 — the evidence travels with the number, always visible. */}
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Median across {keeper_count} keepers · {animal_count} animals ·{' '}
        {observation_count} logged feedings
      </p>

      {/* The honest caveat. These medians mix life stages, and a sling and an
          adult of the same species are on completely different schedules. Say
          so plainly rather than letting the number imply a precision it
          doesn't have. */}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Observed across all life stages, so slings and adults are combined.
        This describes what keepers log — it isn&rsquo;t a recommendation.
      </p>
    </div>
  )
}
