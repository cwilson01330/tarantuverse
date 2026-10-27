"use client";

import { RankedRows } from "@/components/analytics/Charts";
import type { RankedRow } from "@/lib/analyticsView";

interface PreyTypeCount {
  food_type: string;
  count: number;
  percentage: number;
}

export interface FeedingStats {
  tarantula_id: string;
  total_feedings: number;
  total_accepted: number;
  total_refused: number;
  acceptance_rate: number;
  average_days_between_feedings?: number;
  last_feeding_date?: string;
  days_since_last_feeding?: number;
  next_feeding_prediction?: string;
  longest_gap_days?: number;
  current_streak_accepted: number;
  prey_type_distribution: PreyTypeCount[];
  // Pause state — see pst_20260502. When true, suppress the
  // overdue-style "Last Fed" red banner and prediction tile, and
  // surface a quiet paused indicator instead.
  is_feeding_paused?: boolean;
  feeding_paused_reason?: string | null;
  feeding_paused_until?: string | null;
  /** ADR-017 — the keeper's own cadence, when set. Its presence suppresses the
   *  offer below, since they've already answered the question. */
  feeding_interval_days?: number | null;
}

// Canonical reason → friendly prose. Free-form values fall through
// verbatim so a custom reason like "shipped in" still renders.
const PAUSE_REASON_LABELS: Record<string, string> = {
  premolt: "In premolt",
  post_rehouse: "Settling after rehouse",
  recovering: "Recovering",
  mating_season: "Mating-season pause",
  other: "Feeding paused",
};

function pauseReasonLabel(reason?: string | null): string {
  if (!reason) return "Feeding paused";
  return PAUSE_REASON_LABELS[reason] ?? reason;
}

interface FeedingStatsCardProps {
  data: FeedingStats;
  /** ADR-017 — opens the cadence dialog. Optional: pages that don't offer it
   *  simply don't pass it, and the prompt never renders. */
  onSetCadence?: () => void;
  /** Hide the "Last fed" / paused banner. The shared detail page shows its own
   *  verdict above this card, and two status banners could disagree. */
  hideStatus?: boolean;
}

// ───────────────────────────── chart grammar (README §6) ─────────────────────────────
// Acceptance is a split (8px bar, 2px gaps, radius 4, a legend that lists every
// category, a sentence instead of the bar when only one category has anything).
// The prey mix is ranked rows. No donut, no percent labels on bars. Colours come
// from the theme variables and the fixed semantic set, so both presets and both
// modes follow.

const TERTIARY = "text-gray-500 dark:text-gray-400";
const CARD = "bg-surface rounded-preset-md border-preset border-solid border-theme shadow-preset";
const TILE = "bg-surface-elevated rounded-preset-sm p-3";
const SUCCESS = "#22c55e";
const ERROR = "#ef4444";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function AcceptanceSplit({ data }: { data: FeedingStats }) {
  const accepted = Math.max(0, data.total_accepted ?? 0);
  const refused = Math.max(0, data.total_refused ?? 0);
  const filled = (accepted > 0 ? 1 : 0) + (refused > 0 ? 1 : 0);

  let sentence: string;
  if (filled === 0) {
    sentence = "No accepted or refused feedings recorded yet.";
  } else if (refused === 0) {
    sentence = accepted === 1 ? "The one feeding was accepted." : `All ${accepted} feedings accepted.`;
  } else if (accepted === 0) {
    sentence = refused === 1 ? "The one feeding was refused." : `All ${refused} feedings refused.`;
  } else {
    sentence = `${accepted} of ${data.total_feedings} feedings accepted (${Math.round(data.acceptance_rate)}%).`;
  }

  const legend = [
    { key: "accepted", label: `${accepted} accepted`, color: SUCCESS },
    { key: "refused", label: `${refused} refused`, color: ERROR },
  ];

  return (
    <div role="img" aria-label={`Acceptance: ${accepted} accepted, ${refused} refused`} className="flex flex-col gap-1.5">
      {filled >= 2 && (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded" aria-hidden>
          <div style={{ flex: accepted, background: SUCCESS }} />
          <div style={{ flex: refused, background: ERROR }} />
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-secondary">
        {legend.map((l) => (
          <li key={l.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>
      <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>{sentence}</p>
    </div>
  );
}

function PreyRows({ prey }: { prey: PreyTypeCount[] }) {
  const sorted = [...prey].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((p) => p.count));
  const total = sorted.reduce((sum, p) => sum + p.count, 0);
  const rows: RankedRow[] = sorted.map((p, i) => {
    const pct = `${Math.round(p.percentage)}%`;
    const label = p.food_type ? p.food_type.charAt(0).toUpperCase() + p.food_type.slice(1) : "—";
    return {
      key: `${p.food_type}-${i}`,
      id: null,
      label,
      count: p.count,
      fraction: p.count / max,
      value: String(p.count),
      detail: pct,
      right: `${p.count} · ${pct}`,
      none: false,
      a11y: `${label}, ${plural(p.count, "feeding")}, ${pct}`,
    };
  });
  const top = sorted[0];
  const sentence =
    sorted.length === 1
      ? `Every feeding so far was ${top.food_type}.`
      : `Mostly ${top.food_type}: ${top.count} of ${total} feedings.`;
  return (
    <div className="flex flex-col gap-2">
      <RankedRows rows={rows} labelWidth={90} />
      <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>{sentence}</p>
    </div>
  );
}

export default function FeedingStatsCard({ data, onSetCadence, hideStatus = false }: FeedingStatsCardProps) {
  // Last-fed ladder (same tiers as the collection dashboard): green <7 days,
  // yellow 7-13, orange 14-20, red 21+. (`!= null`: 0 days is "fed today",
  // not "unknown".)
  const getFeedingStatusColor = (days?: number | null) => {
    if (days == null) return "gray";
    if (days < 7) return "green";
    if (days < 14) return "yellow";
    if (days < 21) return "orange";
    return "red";
  };

  const statusColor = getFeedingStatusColor(data.days_since_last_feeding);
  const colorClasses: Record<string, string> = {
    green: "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-200 border-green-300 dark:border-green-700",
    yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700",
    orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700",
    red: "bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200 border-red-300 dark:border-red-700",
    gray: "bg-surface-elevated text-theme-primary border-theme",
  };

  const getAcceptanceColor = (rate: number) => {
    if (rate >= 80) return "text-green-600 dark:text-green-400";
    if (rate >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-orange-600 dark:text-orange-400";
  };

  const title = <h3 className="text-lg font-semibold text-theme-primary">Feeding Stats</h3>;

  if (data.total_feedings === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <div className="mb-4">{title}</div>
        <p className={`${TERTIARY} text-center py-8`}>
          No feeding data recorded yet. Add feeding logs to track patterns.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6 space-y-6`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        {title}
        <span className="rounded-preset-sm bg-surface-elevated px-2.5 py-1 text-xs font-medium text-theme-secondary">
          {data.total_feedings} total
        </span>
      </div>

      {/* Paused banner — takes priority over the overdue red banner.
          When the keeper has flagged a known fasting reason (premolt,
          post-rehouse, recovering, etc.) we don't want a 200-day-old
          last feeding flashing red; we want a quiet "she's in premolt,
          we know" tile. */}
      {hideStatus ? null : data.is_feeding_paused ? (
        <div className="rounded-preset-md border border-solid border-blue-300 bg-blue-50 p-4 text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                Feeding Paused
              </div>
              <div className="text-lg font-semibold">
                {pauseReasonLabel(data.feeding_paused_reason)}
              </div>
              {data.days_since_last_feeding != null && (
                <div className="text-xs opacity-80 mt-1">
                  Last fed {data.days_since_last_feeding} days ago
                </div>
              )}
            </div>
            {data.feeding_paused_until ? (
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                  Until
                </div>
                <div className="text-sm font-semibold">
                  {new Date(data.feeding_paused_until).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="text-right text-xs opacity-70">
                Indefinite
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Status Banner — `!= null` covers both null (no accepted feedings yet)
            and undefined (data still loading). The previous `!== undefined`
            let null through and rendered "null days ago" on new spiders. */
        data.days_since_last_feeding != null && (
          <div className={`rounded-preset-md border border-solid p-4 ${colorClasses[statusColor]}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                  Last Fed
                </div>
                <div className="text-2xl font-bold">
                  {data.days_since_last_feeding} days ago
                </div>
              </div>
              {data.next_feeding_prediction && (
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                    Next Feeding
                  </div>
                  <div className="text-lg font-semibold">
                    {new Date(data.next_feeding_prediction).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>

            {/* ADR-017 Phase 2 — the offer, shown only to the person it's for.
                Appears when the animal is flagged late against a number the
                keeper never chose. Once they've set their own cadence it
                disappears: from then on a red banner means they're genuinely
                past their own intention, and that signal is worth protecting. */}
            {onSetCadence
              && statusColor === 'red'
              && !data.feeding_interval_days && (
              <button
                type="button"
                onClick={onSetCadence}
                className="mt-3 min-h-[44px] pt-3 border-t border-solid border-current/20 w-full text-left text-xs opacity-80 hover:opacity-100 underline"
              >
                Feed this one on a different schedule?
              </button>
            )}
          </div>
        )
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={TILE}>
          <div className="text-[10px] text-theme-secondary font-semibold uppercase tracking-wide mb-1">
            Acceptance Rate
          </div>
          <div className={`text-2xl font-bold ${getAcceptanceColor(data.acceptance_rate)}`}>
            {data.acceptance_rate}%
          </div>
          <div className={`text-xs mt-0.5 ${TERTIARY}`}>
            {data.total_accepted}/{data.total_feedings} accepted
          </div>
        </div>

        {data.average_days_between_feedings != null && data.average_days_between_feedings > 0 && (
          <div className={TILE}>
            <div className="text-[10px] text-theme-secondary font-semibold uppercase tracking-wide mb-1">
              Avg Interval
            </div>
            <div className="text-2xl font-bold text-theme-primary">
              {Math.round(data.average_days_between_feedings)}
            </div>
            <div className={`text-xs mt-0.5 ${TERTIARY}`}>days between</div>
          </div>
        )}

        {data.current_streak_accepted > 0 && (
          <div className={TILE}>
            <div className="text-[10px] text-theme-secondary font-semibold uppercase tracking-wide mb-1">
              Current Streak
            </div>
            <div className="text-2xl font-bold text-theme-primary">
              {data.current_streak_accepted}
            </div>
            <div className={`text-xs mt-0.5 ${TERTIARY}`}>accepted in a row</div>
          </div>
        )}

        {data.longest_gap_days != null && data.longest_gap_days > 0 && (
          <div className={TILE}>
            <div className="text-[10px] text-theme-secondary font-semibold uppercase tracking-wide mb-1">
              Longest Gap
            </div>
            <div className="text-2xl font-bold text-theme-primary">
              {data.longest_gap_days}
            </div>
            <div className={`text-xs mt-0.5 ${TERTIARY}`}>days</div>
          </div>
        )}
      </div>

      {/* Acceptance split */}
      {data.total_feedings > 1 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-theme-primary">Acceptance</h4>
          <AcceptanceSplit data={data} />
        </div>
      )}

      {/* Prey type distribution */}
      {data.prey_type_distribution.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-theme-primary">Prey types</h4>
          <PreyRows prey={data.prey_type_distribution} />
        </div>
      )}
    </div>
  );
}
