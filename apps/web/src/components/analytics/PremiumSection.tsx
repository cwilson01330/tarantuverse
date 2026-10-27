'use client'

import { AlertTriangle, Home, Layers, Lock, Shell, Sparkle, TrendingUp } from 'lucide-react'
import {
  SAMPLE_ADVANCED,
  SAMPLE_NOW,
  SAMPLE_SENTENCE,
  SEMANTIC_COLORS,
  barsModel,
  formatCount,
  growthBaseline,
  previewFromCollection,
  type AdvancedAnalytics,
  type CollectionAnalytics,
  type SplitPart,
} from '@/lib/analyticsView'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import {
  CARD,
  CardHeading,
  OUTLINE_BTN,
  PREMIUM_LILAC,
  PRIMARY_BTN,
  SAMPLE_CARD,
  TERTIARY,
} from './AnalyticsParts'
import { PremiumSkeleton } from './AnalyticsSkeleton'
import { Bars, SplitBar, StepLine } from './Charts'
import MoneyCard from './MoneyCard'

export type PremiumState =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'member'; advanced: AdvancedAnalytics; onSaveCost: (value: number | null) => Promise<void> }
  | { kind: 'preview'; collection: CollectionAnalytics; onSeePremium: () => void }
  | { kind: 'sample' }

/** README §3 split palette after the fixed sex colours: primary, molt purple, success, warning, info. */
const SPLIT_COLORS = [
  'rgb(var(--user-primary))',
  SEMANTIC_COLORS.molt,
  SEMANTIC_COLORS.success,
  SEMANTIC_COLORS.warning,
  SEMANTIC_COLORS.info,
]

function splitParts(
  dist: Record<string, number> | undefined,
  labelFor: (key: string, count: number) => string,
): SplitPart[] {
  return Object.entries(dist ?? {})
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], i) => ({ key, count, color: SPLIT_COLORS[i % SPLIT_COLORS.length], label: labelFor(key, count) }))
}

/** "3 tarantulas", "2 true spiders", "1 roach": the group word, pluralised past one. */
function groupWord(name: string, count: number): string {
  if (count === 1) return name
  if (/(ch|sh|s|x)$/.test(name)) return `${name}es` // roach -> roaches, mantis -> mantises
  return `${name}s`
}

// ───────────────────────────── label row ─────────────────────────────

function LabelRow({ state }: { state: PremiumState }) {
  const member = state.kind === 'member' || state.kind === 'error'
  const text =
    state.kind === 'preview' ? 'PREMIUM · PREVIEW OF YOUR DATA' : 'PREMIUM'
  return (
    <div className="flex items-center gap-2 pt-1">
      {member ? (
        <Sparkle size={14} className={PREMIUM_LILAC} aria-hidden />
      ) : state.kind === 'loading' ? null : (
        <Lock size={14} className={TERTIARY} aria-hidden />
      )}
      <h2 className={`text-xs font-semibold tracking-[0.1em] ${TERTIARY}`}>{text}</h2>
      {state.kind === 'sample' && (
        <span
          className={`ml-auto rounded-full border border-solid border-theme px-2.5 py-0.5 text-[11px] font-bold ${TERTIARY}`}
        >
          SAMPLE DATA
        </span>
      )}
    </div>
  )
}

// ───────────────────────────── the cards ─────────────────────────────

function MoltsBarsCard({
  series,
  now,
  sample,
}: {
  series: { month: string; count: number }[]
  now: Date
  sample?: boolean
}) {
  const total = barsModel(series, 300, now).total
  return (
    <section aria-label="Molts, last 12 months" className={`${sample ? SAMPLE_CARD : CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={Shell} title="Molts, last 12 months" trailing={`${formatCount(total)} total`} />
      <Bars series={series} now={now} tone={sample ? 'sample' : 'normal'} sentence={sample ? SAMPLE_SENTENCE : undefined} />
    </section>
  )
}

function GrowthCard({
  series,
  baseline,
  sample,
}: {
  series: { month: string; count: number }[]
  baseline: number
  sample?: boolean
}) {
  return (
    <section aria-label="Collection growth" className={`${sample ? SAMPLE_CARD : CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={TrendingUp} title="Collection growth" />
      <StepLine series={series} baseline={baseline} tone={sample ? 'sample' : 'normal'} />
    </section>
  )
}

function EnclosuresCard({ dist }: { dist: Record<string, number> | undefined }) {
  const parts = splitParts(dist, (k) => k)
  if (parts.length === 0) return null
  return (
    <section aria-label="Enclosures" className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={Home} title="Enclosures" />
      <SplitBar parts={parts} hideLegendWhenSentence />
    </section>
  )
}

function ByGroupCard({ dist }: { dist: Record<string, number> | undefined }) {
  // Only says something when there is more than one group.
  const parts = splitParts(dist, (k, n) =>
    groupWord(isInvertTaxon(k) ? INVERT_TAXA[k].label.toLowerCase() : k, n),
  )
  // Zero-count keys don't make a group: it needs two groups that have animals.
  if (parts.length <= 1) return null
  return (
    <section aria-label="By group" className={`${CARD} flex flex-col gap-3 px-5 py-[18px]`}>
      <CardHeading icon={Layers} title="By group" />
      <SplitBar parts={parts} hideLegendWhenSentence />
    </section>
  )
}

// ───────────────────────────── states ─────────────────────────────

function MemberCards({
  advanced,
  now,
  onSaveCost,
}: {
  advanced: AdvancedAnalytics
  now: Date
  onSaveCost: (value: number | null) => Promise<void>
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-3">
      <MoltsBarsCard series={advanced.molt_heatmap} now={now} />
      <GrowthCard series={advanced.collection_growth} baseline={growthBaseline(advanced)} />
      <div className="flex flex-col gap-3.5">
        <MoneyCard mode="member" data={advanced} onSaveCost={onSaveCost} />
        <EnclosuresCard dist={advanced.enclosure_type_distribution} />
        <ByGroupCard dist={advanced.taxon_distribution} />
      </div>
    </div>
  )
}

function PreviewBlock({
  collection,
  now,
  onSeePremium,
}: {
  collection: CollectionAnalytics
  now: Date
  onSeePremium: () => void
}) {
  const preview = previewFromCollection(collection, now)
  const animals = collection.total_animals ?? collection.total_tarantulas
  return (
    <div className="relative overflow-hidden rounded-preset-md">
      {/* Nothing in here is real data and nothing free sits inside it: hidden from
          screen readers and the keyboard, and blurred. */}
      <div
        aria-hidden
        className="pointer-events-none grid select-none grid-cols-1 items-start gap-3.5 lg:grid-cols-3"
        style={{ filter: 'blur(5px)' }}
      >
        <MoltsBarsCard series={preview.moltSeries} now={now} />
        <GrowthCard series={preview.growthSeries} baseline={0} />
        <MoneyCard mode="preview" paid={preview.money} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {/* Its own elevation in both presets (README: 0 8px 24px rgba(0,0,0,.25)), so no CARD shadow/border-width tokens. */}
        <div className="flex max-w-xl flex-col items-start gap-3 rounded-preset-md border border-solid border-theme bg-surface px-[22px] py-[18px] shadow-[0_8px_24px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:gap-5">
          <div>
            <h3 className="text-sm font-bold text-theme-primary">Molt timing, growth and what you spend</h3>
            <p className="text-[12.5px] text-theme-secondary">
              Computed from your {formatCount(animals)} {animals === 1 ? 'animal' : 'animals'}. Premium unlocks the detail.
            </p>
            <p className={`mt-1 text-xs ${TERTIARY}`}>No charge until you choose.</p>
          </div>
          <button type="button" onClick={onSeePremium} className={`${PRIMARY_BTN} shrink-0 whitespace-nowrap`}>
            See Premium
          </button>
        </div>
      </div>
    </div>
  )
}

function SampleBlock() {
  return (
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-3">
      <MoltsBarsCard series={SAMPLE_ADVANCED.molt_heatmap} now={SAMPLE_NOW} sample />
      <GrowthCard series={SAMPLE_ADVANCED.collection_growth} baseline={growthBaseline(SAMPLE_ADVANCED)} sample />
      <MoneyCard mode="sample" data={SAMPLE_ADVANCED} />
    </div>
  )
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={`${CARD} flex flex-col items-center gap-2 px-6 py-8 text-center`}>
      <AlertTriangle size={34} style={{ color: SEMANTIC_COLORS.warning }} aria-hidden />
      <h3 className="text-base font-bold text-theme-primary">We couldn&apos;t load your Premium insights.</h3>
      <button type="button" onClick={onRetry} className={`${OUTLINE_BTN} mt-1`}>
        Try again
      </button>
    </section>
  )
}

/** Blocks 6-10: the Premium label row and whichever of member / preview / sample / error / loading applies. */
export default function PremiumSection({ state, now }: { state: PremiumState; now: Date }) {
  return (
    <section id="premium" aria-label="Premium" className="flex scroll-mt-48 flex-col gap-3">
      <LabelRow state={state} />
      {state.kind === 'loading' && <PremiumSkeleton />}
      {state.kind === 'error' && <ErrorCard onRetry={state.onRetry} />}
      {state.kind === 'member' && <MemberCards advanced={state.advanced} now={now} onSaveCost={state.onSaveCost} />}
      {state.kind === 'preview' && <PreviewBlock collection={state.collection} now={now} onSeePremium={state.onSeePremium} />}
      {state.kind === 'sample' && <SampleBlock />}
    </section>
  )
}
