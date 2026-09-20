'use client'

/**
 * A colony's population over time — the keeper's own logged counts.
 *
 * WHAT THIS DELIBERATELY DOESN'T DO
 * ---------------------------------
 * It does not project. There is no "your colony will reach N by December",
 * because for the animals this matters most to — isopods — that number can't
 * be earned. Reproduction depends on species, temperature, humidity, calcium,
 * protein, substrate depth and founding sex ratio, and nobody can sex an
 * isopod at a glance or count a colony living inside substrate. The INPUT is
 * already an estimate; a forecast on top would be a guess stacked on a guess
 * wearing a confident number.
 *
 * It shows the shape of where the colony has BEEN, which is the honest version
 * of the same question — and it gets more useful the longer someone logs,
 * which is the behaviour worth encouraging anyway.
 *
 * Three states, all of which must read well: nothing logged (invite the first
 * count, don't draw an empty axis), too sparse (show the points AND the
 * server's reason for withholding a trend), and enough data (chart + observed
 * net change). Never blank space where a number should be.
 *
 * Mirrors apps/mobile/src/components/ColonyPopulationChart.tsx.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { offspringNoun } from '@/lib/inverts'
import type { PopulationHistory } from '@/lib/colonies'

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return m && d ? `${Number(m)}/${Number(d)}` : ''
}

export default function ColonyPopulationChart({
  history,
  taxon,
}: {
  history: PopulationHistory | null
  taxon: string
}) {
  if (!history) return null

  const { points, growth, history_complete, count_is_estimated } = history
  const young = offspringNoun(taxon)

  if (points.length === 0) {
    return (
      <div>
        <p className="text-sm font-semibold text-theme-primary mb-1">No counts logged yet</p>
        <p className="text-sm text-theme-secondary leading-relaxed">
          Log a count and this becomes a picture of how your colony is doing. Every birth,
          loss and {young} you record draws another point.
        </p>
      </div>
    )
  }

  const dated = points.filter((p) => p.date)
  const chartData = dated.map((p) => ({ label: shortDate(p.date), total: p.total }))
  const positive = (growth.net_change ?? 0) >= 0

  return (
    <div>
      {chartData.length >= 2 ? (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-theme-tertiary opacity-20" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-theme-tertiary" />
              {/* allowDecimals=false: a population of 42.5 is nonsense. */}
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" className="text-theme-tertiary" />
              <Tooltip
                contentStyle={{ fontSize: 13, borderRadius: 8 }}
                formatter={(v: number) => [v.toLocaleString(), 'Population']}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#22c55e"
                strokeWidth={2}
                dot={chartData.length <= 20}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        // One point has nothing to connect. Show the number rather than a dot
        // floating on an empty axis.
        <div className="py-3">
          <p className="text-3xl font-bold text-theme-primary">
            {points[points.length - 1].total.toLocaleString()}
          </p>
          <p className="text-xs text-theme-tertiary">from one logged count</p>
        </div>
      )}

      {growth.has_rate ? (
        <p className="mt-3 text-sm text-theme-secondary leading-relaxed">
          <span className={`text-lg font-bold ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {positive ? '+' : ''}
            {growth.net_change?.toLocaleString()}
          </span>{' '}
          over {growth.days_observed} days — about {positive ? '+' : ''}
          {growth.per_30_days} a month, going by what you&apos;ve logged.
        </p>
      ) : (
        // The server states WHY it withheld a trend. Showing its reason beats
        // inventing one, and beats blank space the keeper reads as a bug.
        <p className="mt-3 text-sm text-theme-tertiary">{growth.reason}</p>
      )}

      {!history_complete && (
        <p className="mt-2 text-xs text-theme-tertiary leading-relaxed">
          This chart covers counts logged as events. Some of this colony&apos;s population was
          set directly, so the line may not reach today&apos;s total.
        </p>
      )}

      {count_is_estimated && (
        <p className="mt-2 text-xs text-theme-tertiary leading-relaxed">
          Counts are marked as estimates — which is honest for a colony you can&apos;t fully see.
        </p>
      )}
    </div>
  )
}
