'use client'

/**
 * The four analytics charts (README §6): Bars, StepLine, SplitBar, RankedRows.
 * One grammar: no y-axis, no gridlines, no repeating legend, one sentence
 * underneath, and an aria-label that states the series in words. Geometry and
 * every sentence come from `@/lib/analyticsView`; recharts only draws.
 *
 * `tone="sample"` is the grey sample a zero-animal free keeper sees: bars and
 * line in grey, stubs stay `border`.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, Cell, LabelList, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import {
  barsModel,
  formatCount,
  splitModel,
  stepModel,
  type RankedRow,
  type SplitPart,
} from '@/lib/analyticsView'
import { TERTIARY } from './AnalyticsParts'

export type ChartTone = 'normal' | 'sample'

const PRIMARY = 'rgb(var(--user-primary))'
const SECONDARY = 'rgb(var(--user-secondary))'
const BORDER = 'rgb(var(--border))'
const SURFACE = 'rgb(var(--surface))'
// Sample: grey via currentColor (set on the wrapper: gray-600 dark, gray-400 light).
const SAMPLE_GREY = 'currentColor'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthIndexOf(key: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(key)
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : 0
}

function Sentence({ children }: { children: ReactNode }) {
  return <p className={`text-[13px] leading-[18px] ${TERTIARY}`}>{children}</p>
}

// ───────────────────────────── Bars ─────────────────────────────

const BAR_PLOT_H = 56 // BAR_MAX_H in the lib: the tallest bar
const BAR_TOP = 14 // room for the printed value above the tallest bar
const BAR_LABELS_H = 16

/** Twelve monthly counts. 0 total: sentence only. 1: one bar. Many: all twelve. */
export function Bars({
  series,
  now,
  tone = 'normal',
  sentence,
}: {
  /** Sparse `{month: "YYYY-MM", count}` (months with no molts are absent). */
  series: { month: string; count: number }[]
  now: Date
  tone?: ChartTone
  /** Replaces the lib's sentence (the grey sample's own line). */
  sentence?: string
}) {
  const model = barsModel(series, 300, now)
  const line = sentence ?? model.sentence
  if (model.bars.length === 0) return <Sentence>{line}</Sentence>

  const data = model.bars.map((b) => ({ label: b.label, plot: b.h, value: b.value, isMax: b.isMax, month: b.month }))
  const fillFor = (d: { value: number; isMax: boolean }) =>
    d.value === 0 ? BORDER : tone === 'sample' ? SAMPLE_GREY : d.isMax ? SECONDARY : PRIMARY
  const many = data.length > 1

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={model.a11y}
        className={tone === 'sample' ? 'text-gray-400 dark:text-gray-600' : 'text-theme-primary'}
        style={{ height: BAR_TOP + BAR_PLOT_H + BAR_LABELS_H }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: BAR_TOP, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={many ? 6 : 0}
            accessibilityLayer={false}
          >
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              height={BAR_LABELS_H}
              tick={{ fontSize: 10, className: 'fill-gray-500 dark:fill-gray-400' }}
            />
            <YAxis hide domain={[0, BAR_PLOT_H]} />
            <Bar dataKey="plot" radius={[3, 3, 0, 0]} maxBarSize={many ? 40 : 24} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={fillFor(d)} />
              ))}
              <LabelList
                dataKey="plot"
                content={(p: any) => {
                  const d = data[p.index]
                  if (!d || !d.isMax || d.value === 0) return null
                  return (
                    <text
                      x={Number(p.x) + Number(p.width) / 2}
                      y={Number(p.y) - 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="currentColor"
                    >
                      {formatCount(d.value)}
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Sentence>{line}</Sentence>
    </div>
  )
}

// ───────────────────────────── StepLine ─────────────────────────────

const STEP_H = 70

/**
 * A running count as a stepped line (`stepAfter`), area at 14%, end dot r4 with
 * a 2pt surface ring, first value left and last value right. 1 point: a flat
 * track with a dot and the month under it. Flat: a straight line.
 * `series` is animals ADDED per month; `baseline` is the animals already owned
 * before the first month (`growthBaseline`).
 */
export function StepLine({
  series,
  baseline = 0,
  tone = 'normal',
  sentence,
}: {
  series: { month: string; count: number }[]
  baseline?: number
  tone?: ChartTone
  sentence?: string
}) {
  const model = stepModel(series, 300, STEP_H, baseline)
  const line = sentence ?? model.sentence
  const stroke = tone === 'sample' ? SAMPLE_GREY : PRIMARY
  const wrap = tone === 'sample' ? 'text-gray-400 dark:text-gray-600' : 'text-theme-primary'

  if (model.points.length === 0) return <Sentence>{line}</Sentence>

  if (model.points.length === 1) {
    const monthName = MONTHS[monthIndexOf(model.points[0].month) % 12]
    return (
      <div className="flex flex-col gap-2">
        <div role="img" aria-label={model.a11y} className={`${wrap} flex flex-col gap-1.5`}>
          <div className="relative h-[30px]">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ background: BORDER }} />
            <div
              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: stroke, boxShadow: `0 0 0 2px ${SURFACE}` }}
            />
          </div>
          <div className={`text-center text-[10px] ${TERTIARY}`}>{monthName}</div>
        </div>
        <Sentence>{line}</Sentence>
      </div>
    )
  }

  const data = model.points.map((p) => ({ m: monthIndexOf(p.month), v: p.value }))
  // With animals already owned, the line starts at that count and steps up.
  if (model.first !== data[0].v) data.unshift({ m: data[0].m, v: model.first })
  const values = data.map((d) => d.v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const domain: [number, number] = hi === lo ? [lo - 1, hi + 1] : [lo, hi]
  const first = data[0]
  const last = data[data.length - 1]

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={model.a11y} className={wrap} style={{ height: STEP_H }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 10, bottom: 6, left: 10 }} accessibilityLayer={false}>
            <XAxis type="number" dataKey="m" hide domain={['dataMin', 'dataMax']} />
            <YAxis hide domain={domain} />
            <Area
              type="stepAfter"
              dataKey="v"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinejoin="round"
              fill={stroke}
              fillOpacity={0.14}
              baseValue={domain[0]}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={first.m}
              y={first.v}
              r={0}
              ifOverflow="visible"
              shape={(p: any) => (
                <text x={Number(p.cx)} y={Number(p.cy) - 9} textAnchor="start" fontSize={10} className="fill-gray-500 dark:fill-gray-400">
                  {formatCount(first.v)}
                </text>
              )}
            />
            <ReferenceDot
              x={last.m}
              y={last.v}
              r={4}
              ifOverflow="visible"
              shape={(p: any) => (
                <g>
                  <text x={Number(p.cx)} y={Number(p.cy) - 9} textAnchor="end" fontSize={10} fontWeight={600} fill="currentColor">
                    {formatCount(last.v)}
                  </text>
                  <circle cx={Number(p.cx)} cy={Number(p.cy)} r={4} fill={stroke} stroke={SURFACE} strokeWidth={2} />
                </g>
              )}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Sentence>{line}</Sentence>
    </div>
  )
}

// ───────────────────────────── SplitBar ─────────────────────────────

/**
 * A segmented bar (8px, 2px gaps, radius 4) with a legend that always lists
 * every category, zeros included. With one non-empty category the lib's
 * sentence replaces the bar. `mark` swaps the legend's 8px swatch for a glyph.
 */
export function SplitBar({
  parts,
  mark,
  hideLegendWhenSentence = false,
}: {
  parts: SplitPart[]
  mark?: (key: string, color: string) => ReactNode
  /** Enclosures / By group: the sentence already says it, so no legend under it. */
  hideLegendWhenSentence?: boolean
}) {
  const model = splitModel(parts)
  const showLegend = !(hideLegendWhenSentence && model.sentence)
  return (
    <div role="img" aria-label={model.a11y} className="flex flex-col gap-1.5">
      {model.segments.length > 0 && (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded">
          {model.segments.map((s, i) => (
            <div key={i} style={{ flex: s.flex, background: s.color }} />
          ))}
        </div>
      )}
      {model.sentence && <Sentence>{model.sentence}</Sentence>}
      {showLegend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-secondary">
          {model.legend.map((l) => (
            <li key={l.key} className="inline-flex items-center gap-1.5">
              {mark ? (
                mark(l.key, l.color)
              ) : (
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} aria-hidden />
              )}
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ───────────────────────────── RankedRows ─────────────────────────────

/**
 * Label (ellipsised) · 8px track with a `primary` fill scaled to the largest ·
 * right-hand value with a quiet suffix. A zero row keeps the track and reads
 * "none yet". Rows with an animal id and `hrefFor` are links (>= 44px tall).
 */
export function RankedRows({
  rows,
  labelWidth = 70,
  italic = false,
  hrefFor,
}: {
  rows: RankedRow[]
  /** Pixels, or any CSS width ("min(220px, 45%)" keeps the bar usable on a phone). */
  labelWidth?: number | string
  italic?: boolean
  hrefFor?: (row: RankedRow) => string | null
}) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const href = hrefFor?.(row) ?? null
        const body = (
          <>
            <span
              className={`shrink-0 truncate text-[13px] text-theme-secondary ${italic ? 'italic' : ''}`}
              style={{ width: labelWidth }}
              title={row.label}
            >
              {row.label}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-surface-elevated" aria-hidden>
              {!row.none && (
                <span className="block h-2 rounded bg-primary" style={{ width: `${Math.max(0, Math.min(1, row.fraction)) * 100}%` }} />
              )}
            </span>
            {row.none ? (
              <span className={`shrink-0 text-right text-[13px] ${TERTIARY}`}>{row.value}</span>
            ) : (
              <span className="shrink-0 whitespace-nowrap text-right text-[13px] font-semibold text-theme-primary">
                {row.value}
                {row.detail && <span className={`font-normal ${TERTIARY}`}> · {row.detail}</span>}
              </span>
            )}
          </>
        )
        return (
          <li key={row.key}>
            {href ? (
              <Link
                href={href}
                aria-label={row.a11y}
                className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-preset-sm px-2 transition hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
              >
                {body}
              </Link>
            ) : (
              <div aria-label={row.a11y} role="group" className="flex min-h-[28px] items-center gap-3">
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
