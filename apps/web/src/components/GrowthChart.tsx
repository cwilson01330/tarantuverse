"use client";

import { useState } from "react";
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { useUnits } from "@/components/UnitsProvider";
import { formatLength, formatLengthRate, lengthValue } from "@/lib/units";

interface GrowthDataPoint {
  date: string;
  weight?: number;
  leg_span?: number;
  days_since_previous?: number;
  weight_change?: number;
  leg_span_change?: number;
}

interface GrowthAnalytics {
  tarantula_id: string;
  data_points: GrowthDataPoint[];
  total_molts: number;
  average_days_between_molts?: number;
  total_weight_gain?: number;
  total_leg_span_gain?: number;
  growth_rate_weight?: number;
  growth_rate_leg_span?: number;
  last_molt_date?: string;
  days_since_last_molt?: number;
}

interface GrowthChartProps {
  data: GrowthAnalytics;
  /** Label for the linear measurement — "Leg Span" for spiders (default),
   *  "Body Length" for scorpions/centipedes etc. (ADR-008 growth module). */
  lengthLabel?: string;
}

type DateRange = "all" | "1y" | "6m" | "3m";

// ───────────────────────────── chart grammar (README §6) ─────────────────────────────
// One stepped line per measurement: a spider's size and weight only change at a
// molt, so the line holds its value until the next one. No y-axis, no gridlines,
// no legend, no tooltip; first value left and last value right under the line;
// one sentence underneath; one aria-label. Weight (g) and length (in / cm) are
// different units, so they are two charts, never two lines on a shared axis.
// Colours come from the theme variables, so both presets and both modes follow.

const PRIMARY = "rgb(var(--user-primary))";
const BORDER = "rgb(var(--border))";
const SURFACE = "rgb(var(--surface))";
const TERTIARY = "text-gray-500 dark:text-gray-400";
const CARD = "bg-surface rounded-preset-md border-preset border-solid border-theme shadow-preset";
const TILE = "bg-surface-elevated rounded-preset-sm p-3";
/** Chart height from README §6. */
const LINE_HEIGHT = 70;

const RANGES: { id: DateRange; label: string }[] = [
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
];

interface SeriesPoint {
  /** Timestamp (ms). */
  t: number;
  /** The number drawn: grams, or the length in the keeper's units. */
  v: number;
  /** What the keeper reads: "8.4 g", "3.5 in". */
  text: string;
}

const shortDate = (t: number) => format(new Date(t), "MMM d, yyyy");
const monthYear = (t: number) => format(new Date(t), "MMM yyyy");

/** "Leg Span" / "BODY LENGTH" -> "Leg span", for the middle of a sentence. */
function sentenceCase(label: string): string {
  const s = (label ?? "").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Points sharing one timestamp (or a single point) draw as one dot. */
function collapseSamePoint(points: SeriesPoint[]): SeriesPoint[] {
  if (points.length < 2) return points;
  return points[0].t === points[points.length - 1].t ? [points[points.length - 1]] : points;
}

/** The one sentence under a chart, and its aria-label (0 / 1 / flat / many). */
function describeSeries(name: string, points: SeriesPoint[]): { sentence: string; label: string } {
  const subject = sentenceCase(name);
  if (points.length === 0) {
    const sentence = `No ${subject.toLowerCase()} measurements in this range.`;
    return { sentence, label: sentence };
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) {
    const sentence = `${subject} was ${last.text} on ${shortDate(last.t)}.`;
    return { sentence, label: sentence };
  }
  if (points.every((p) => p.v === first.v)) {
    const sentence = `No change in ${subject.toLowerCase()} since ${shortDate(first.t)}: still ${last.text}.`;
    return { sentence, label: `${subject} over ${points.length} measurements: ${sentence}` };
  }
  const span = `${monthYear(first.t)} to ${monthYear(last.t)}`;
  return {
    sentence: `${subject} went from ${first.text} to ${last.text} across ${points.length} measurements (${span}).`,
    label: `${subject} over ${points.length} measurements, ${span}, from ${first.text} to ${last.text}`,
  };
}

/** One measurement as a stepped line (`stepAfter`), area at 14%, end dot r4 with a 2px surface ring. */
function GrowthLine({ title, points }: { title: string; points: SeriesPoint[] }) {
  const drawn = collapseSamePoint(points);
  const { sentence, label } = describeSeries(title, points);
  const single = drawn.length === 1;

  let chart: React.ReactNode = null;
  if (single) {
    // 1 point: a flat track with a dot and the month under it.
    chart = (
      <div className="flex flex-col gap-1.5">
        <div className="relative h-[30px]" aria-hidden>
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ background: BORDER }} />
          <div
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: PRIMARY, boxShadow: `0 0 0 2px ${SURFACE}` }}
          />
        </div>
        <div className={`text-center text-[10px] ${TERTIARY}`}>{monthYear(drawn[0].t)}</div>
      </div>
    );
  } else if (drawn.length > 1) {
    const values = drawn.map((p) => p.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const domain: [number, number] = hi === lo ? [lo - 1, hi + 1] : [lo, hi];
    const last = drawn[drawn.length - 1];
    chart = (
      <div className="flex flex-col gap-1">
        <div style={{ height: LINE_HEIGHT }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawn} margin={{ top: 8, right: 10, bottom: 8, left: 10 }} accessibilityLayer={false}>
              <XAxis type="number" dataKey="t" hide domain={["dataMin", "dataMax"]} />
              <YAxis hide domain={domain} />
              <Area
                type="stepAfter"
                dataKey="v"
                stroke={PRIMARY}
                strokeWidth={2.5}
                strokeLinejoin="round"
                fill={PRIMARY}
                fillOpacity={0.14}
                baseValue={domain[0]}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={last.t}
                y={last.v}
                r={4}
                ifOverflow="visible"
                shape={(p: any) => (
                  <circle cx={Number(p.cx)} cy={Number(p.cy)} r={4} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
                )}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between px-2.5 text-[10px]">
          <span className={TERTIARY}>{drawn[0].text}</span>
          <span className="font-semibold text-theme-primary">{last.text}</span>
        </div>
      </div>
    );
  }

  return (
    <figure role="img" aria-label={label} className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-theme-primary">{title}</figcaption>
      {chart}
      <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>{sentence}</p>
    </figure>
  );
}

function Segment({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-11 rounded-preset-sm px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] ${
        active
          ? "border border-solid border-theme bg-surface text-primary shadow-sm"
          : "border border-transparent text-theme-secondary hover:text-theme-primary disabled:cursor-not-allowed disabled:opacity-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function GrowthChart({ data, lengthLabel = "Leg Span" }: GrowthChartProps) {
  // Leg span / body length is stored in inches; shown in the keeper's units.
  const { units } = useUnits();

  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [metric, setMetric] = useState<"weight" | "leg_span" | "both">("both");

  // Filter data based on selected date range
  const filterDataByRange = (points: GrowthDataPoint[]) => {
    if (dateRange === "all") return points;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case "1y":
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case "6m":
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case "3m":
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }

    return points.filter((point) => new Date(point.date) >= cutoffDate);
  };

  const filteredData = filterDataByRange(data.data_points);

  // One list per measurement, oldest first. Lengths are stored in inches and go
  // through the units helpers; weights are grams for everyone.
  const weightPoints: SeriesPoint[] = [];
  const lengthPoints: SeriesPoint[] = [];
  for (const point of filteredData) {
    const t = new Date(point.date).getTime();
    if (!Number.isFinite(t)) continue;
    if (point.weight) {
      const grams = parseFloat(point.weight.toString());
      if (Number.isFinite(grams)) weightPoints.push({ t, v: grams, text: `${Number(grams.toFixed(1))} g` });
    }
    if (point.leg_span) {
      const shown = Number(lengthValue(point.leg_span, units));
      const text = formatLength(point.leg_span, units);
      if (Number.isFinite(shown) && text) lengthPoints.push({ t, v: shown, text });
    }
  }
  weightPoints.sort((a, b) => a.t - b.t);
  lengthPoints.sort((a, b) => a.t - b.t);

  // Whether the animal has any weight / length at all (the selector's enabled
  // state does not depend on the chosen range).
  const hasWeightData = data.data_points.some((p) => !!p.weight);
  const hasLegSpanData = data.data_points.some((p) => !!p.leg_span);

  if (data.total_molts === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <h3 className="text-lg font-semibold mb-4 text-theme-primary">Growth Tracking</h3>
        <p className={`${TERTIARY} text-center py-8`}>
          No molt data recorded yet. Add molt logs to track growth over time.
        </p>
      </div>
    );
  }

  const showWeight = (metric === "both" || metric === "weight") && hasWeightData;
  const showLength = (metric === "both" || metric === "leg_span") && hasLegSpanData;

  const lengthGain = data.total_leg_span_gain ? formatLength(data.total_leg_span_gain, units) : null;
  const lengthRate = data.growth_rate_leg_span ? formatLengthRate(data.growth_rate_leg_span, units) : null;

  return (
    <div className={`${CARD} p-6 space-y-6`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-theme-primary">Growth Tracking</h3>

        <div className="flex flex-wrap gap-2">
          {/* Metric selector */}
          <div role="group" aria-label="Measurement" className="flex gap-1 rounded-preset-sm bg-surface-elevated p-1">
            <Segment active={metric === "both"} onClick={() => setMetric("both")}>
              Both
            </Segment>
            <Segment active={metric === "weight"} disabled={!hasWeightData} onClick={() => setMetric("weight")}>
              Weight
            </Segment>
            <Segment active={metric === "leg_span"} disabled={!hasLegSpanData} onClick={() => setMetric("leg_span")}>
              {lengthLabel}
            </Segment>
          </div>

          {/* Date range selector */}
          <div role="group" aria-label="Date range" className="flex gap-1 rounded-preset-sm bg-surface-elevated p-1">
            {RANGES.map((r) => (
              <Segment key={r.id} active={dateRange === r.id} onClick={() => setDateRange(r.id)}>
                {r.label}
              </Segment>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={TILE}>
          <div className="text-xs text-theme-secondary mb-1">Total Molts</div>
          <div className="text-2xl font-bold text-theme-primary">{data.total_molts}</div>
        </div>
        {data.average_days_between_molts ? (
          <div className={TILE}>
            <div className="text-xs text-theme-secondary mb-1">Avg Days Between</div>
            <div className="text-2xl font-bold text-theme-primary">{Math.round(data.average_days_between_molts)}</div>
          </div>
        ) : null}
        {data.total_weight_gain ? (
          <div className={TILE}>
            <div className="text-xs text-theme-secondary mb-1">Weight Gain</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              +{parseFloat(data.total_weight_gain.toString()).toFixed(1)}g
            </div>
          </div>
        ) : null}
        {lengthGain ? (
          <div className={TILE}>
            <div className="text-xs text-theme-secondary mb-1">Size Gain</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">+{lengthGain}</div>
          </div>
        ) : null}
      </div>

      {/* Charts: one stepped line per measurement */}
      <div className="flex flex-col gap-6">
        {showWeight && <GrowthLine title="Weight" points={weightPoints} />}
        {showLength && <GrowthLine title={lengthLabel} points={lengthPoints} />}
        {!showWeight && !showLength && (
          <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>
            No weight or size logged with these molts yet. Add one to a molt and the chart appears.
          </p>
        )}
      </div>

      {/* Growth Rate Info */}
      {(data.growth_rate_weight || lengthRate || data.days_since_last_molt !== undefined) && (
        <div className="border-t border-solid border-theme pt-4 flex flex-wrap gap-4 text-sm">
          {data.growth_rate_weight ? (
            <div>
              <span className="text-theme-secondary">Weight Growth Rate:</span>{" "}
              <span className="font-semibold text-green-600 dark:text-green-400">
                {parseFloat(data.growth_rate_weight.toString()).toFixed(2)}g/mo
              </span>
            </div>
          ) : null}
          {lengthRate ? (
            <div>
              <span className="text-theme-secondary">Size Growth Rate:</span>{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-400">{lengthRate}</span>
            </div>
          ) : null}
          {data.days_since_last_molt !== undefined && (
            <div>
              <span className="text-theme-secondary">Days Since Last Molt:</span>{" "}
              <span className="font-semibold text-theme-primary">{data.days_since_last_molt}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
