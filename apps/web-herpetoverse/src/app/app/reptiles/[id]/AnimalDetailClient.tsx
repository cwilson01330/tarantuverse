'use client'

/**
 * Animal detail — the taxon-agnostic reptile/amphibian detail screen.
 *
 * ADR-003 follow-through: snakes and lizards used to have byte-identical
 * detail clients behind separate route trees. They're one component now —
 * the only taxon-specific bits (the QR/photo `taxon` prop, the empty-state
 * glyph upstream) read off `animal.taxon`. Frog detail rides this same
 * screen for free.
 *
 * Exercises the model end-to-end:
 *   - Header: identity + current weight + life stage (server-computed)
 *   - Weight section: 30-day weight-loss alert, trend chart, log form, list
 *   - Feeding intelligence: consumes /prey-suggestion (server-computed)
 *   - Feeding log: form with live prey:BW ratio hint, history
 *   - Shed log: form + history
 *
 * Notes:
 *   - We lean on the backend for computed values (alert thresholds, stage,
 *     suggested ranges) — the UI is a renderer, not a calculator.
 *   - After any mutation we refetch the affected slices so derived values
 *     (trend, prey suggestion, last_fed_at) stay honest.
 *   - Error handling is per-section: one failing call shouldn't blank the
 *     page.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError } from '@/lib/apiClient'
import PhotoGallery from '@/components/PhotoGallery'
import { PauseFeedingDialog } from '@/components/PauseFeedingDialog'
import ReptileQRModal from '@/components/ReptileQRModal'
import {
  type Animal,
  type CreateFeedingPayload,
  type CreateShedPayload,
  type CreateWeightLogPayload,
  type FeedingLog,
  type PreySuggestion,
  type ShedLog,
  WEIGHT_CONTEXT_LABELS,
  type WeightContext,
  type WeightLog,
  type WeightTrendResponse,
  animalTitle,
  createFeeding,
  createShed,
  createWeightLog,
  deleteFeeding,
  deleteShed,
  deleteWeightLog,
  fmtDate,
  fmtDecimal,
  fmtGrams,
  getAnimal,
  getPreySuggestion,
  getWeightTrend,
  listFeedings,
  listSheds,
  listWeightLogs,
  relativeDays,
} from '@/lib/animals'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnimalDetailClient({ animalId }: { animalId: string }) {
  // Animal record
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [animalError, setAnimalError] = useState<string | null>(null)

  // Weight slice
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [trend, setTrend] = useState<WeightTrendResponse | null>(null)
  const [weightError, setWeightError] = useState<string | null>(null)

  // Feeding slice
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [preySuggestion, setPreySuggestion] = useState<PreySuggestion | null>(null)
  const [feedingError, setFeedingError] = useState<string | null>(null)

  // Shed slice
  const [sheds, setSheds] = useState<ShedLog[]>([])
  const [shedError, setShedError] = useState<string | null>(null)

  // Loading flags, coarse
  const [loading, setLoading] = useState(true)

  // QR upload-session modal
  const [qrOpen, setQrOpen] = useState(false)

  const refetchAll = useCallback(async () => {
    const [animalR, weightsR, trendR, preyR, feedingsR, shedsR] =
      await Promise.allSettled([
        getAnimal(animalId),
        listWeightLogs(animalId),
        getWeightTrend(animalId),
        getPreySuggestion(animalId),
        listFeedings(animalId),
        listSheds(animalId),
      ])

    if (animalR.status === 'fulfilled') {
      setAnimal(animalR.value)
      setAnimalError(null)
    } else {
      setAnimalError(errMsg(animalR.reason, 'Could not load this reptile.'))
    }

    if (weightsR.status === 'fulfilled') {
      setWeightLogs(weightsR.value)
      if (trendR.status === 'fulfilled') {
        setTrend(trendR.value)
        setWeightError(null)
      } else {
        setWeightError(errMsg(trendR.reason, 'Could not load weight trend.'))
      }
    } else {
      setWeightError(errMsg(weightsR.reason, 'Could not load weights.'))
    }

    if (feedingsR.status === 'fulfilled') {
      setFeedings(feedingsR.value)
      if (preyR.status === 'fulfilled') {
        setPreySuggestion(preyR.value)
        setFeedingError(null)
      } else {
        setFeedingError(
          errMsg(preyR.reason, 'Could not load feeding suggestion.'),
        )
      }
    } else {
      setFeedingError(errMsg(feedingsR.reason, 'Could not load feedings.'))
    }

    if (shedsR.status === 'fulfilled') {
      setSheds(shedsR.value)
      setShedError(null)
    } else {
      setShedError(errMsg(shedsR.reason, 'Could not load sheds.'))
    }
  }, [animalId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetchAll().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetchAll])

  // Mutation refetch helpers — scoped so a form doesn't have to refetch the
  // whole page for changes it can't affect.
  const refetchWeights = useCallback(async () => {
    const [w, t, a, p] = await Promise.allSettled([
      listWeightLogs(animalId),
      getWeightTrend(animalId),
      getAnimal(animalId),
      getPreySuggestion(animalId),
    ])
    if (w.status === 'fulfilled') setWeightLogs(w.value)
    if (t.status === 'fulfilled') setTrend(t.value)
    if (a.status === 'fulfilled') setAnimal(a.value)
    if (p.status === 'fulfilled') setPreySuggestion(p.value)
  }, [animalId])

  const refetchFeedings = useCallback(async () => {
    const [f, a, p] = await Promise.allSettled([
      listFeedings(animalId),
      getAnimal(animalId),
      getPreySuggestion(animalId),
    ])
    if (f.status === 'fulfilled') setFeedings(f.value)
    if (a.status === 'fulfilled') setAnimal(a.value)
    if (p.status === 'fulfilled') setPreySuggestion(p.value)
  }, [animalId])

  const refetchSheds = useCallback(async () => {
    const [sh, a] = await Promise.allSettled([
      listSheds(animalId),
      getAnimal(animalId),
    ])
    if (sh.status === 'fulfilled') setSheds(sh.value)
    if (a.status === 'fulfilled') setAnimal(a.value)
  }, [animalId])

  // Photo mutations don't touch weights, feedings, or sheds — they just shift
  // Animal.photo_url when the main photo changes or the first upload auto-
  // promotes. An animal-only refetch keeps the main-photo badge honest
  // without re-pulling the whole page.
  const refetchAnimalOnly = useCallback(async () => {
    try {
      const a = await getAnimal(animalId)
      setAnimal(a)
    } catch {
      // Swallow — the photo mutation itself already succeeded; worst case
      // the main-photo highlight drifts until the next full refetch.
    }
  }, [animalId])

  if (loading && !animal) return <LoadingShell />
  if (animalError && !animal) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink />
        <div
          role="alert"
          className="mt-6 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {animalError}
        </div>
      </div>
    )
  }
  if (!animal) return null

  return (
    <article className="max-w-4xl mx-auto space-y-8">
      <BackLink />
      <AnimalHeader animal={animal} suggestion={preySuggestion} />

      {/* Photos section — heading + QR action live in a flex row so the
          existing PhotoGallery styling stays untouched. The QR button
          opens a modal that generates a 20-min upload session a guest
          can scan from another phone. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
            Photos
          </h2>
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-herp-lime hover:border-herp-teal/40 transition-colors"
            aria-label="Generate QR code for photo upload"
          >
            <span aria-hidden="true">📱</span>
            QR upload
          </button>
        </div>
        <PhotoGallery
          animalId={animal.id}
          taxon={animal.taxon}
          mainPhotoUrl={animal.photo_url}
          onMainChanged={refetchAnimalOnly}
        />
      </section>

      {qrOpen && (
        <ReptileQRModal
          taxon={animal.taxon}
          animalId={animal.id}
          animalName={animalTitle(animal)}
          scientificName={animal.scientific_name}
          commonName={animal.common_name}
          sex={animal.sex}
          sheds={sheds}
          onClose={() => setQrOpen(false)}
          onPhotoAdded={refetchAnimalOnly}
        />
      )}

      <Section title="Weight">
        {weightError && <InlineError message={weightError} />}
        {trend && <WeightLossBanner trend={trend} />}
        <WeightChart logs={weightLogs} />
        <WeightStats animal={animal} logs={weightLogs} trend={trend} />
        <LogWeightForm animalId={animal.id} onCreated={refetchWeights} />
        <WeightLogList logs={weightLogs} onDelete={refetchWeights} />
      </Section>

      <Section title="Feeding intelligence">
        {feedingError && !preySuggestion && (
          <InlineError message={feedingError} />
        )}
        {preySuggestion && (
          <FeedingIntelligence
            suggestion={preySuggestion}
            animal={animal}
            feedings={feedings}
          />
        )}
      </Section>

      <Section title="Feeding log">
        <LogFeedingForm
          animal={animal}
          suggestion={preySuggestion}
          onCreated={refetchFeedings}
          onPauseChanged={refetchAll}
        />
        <FeedingList
          feedings={feedings}
          animalWeightG={animal.current_weight_g}
          onDelete={refetchFeedings}
        />
      </Section>

      <Section title="Sheds">
        {shedError && <InlineError message={shedError} />}
        <LogShedForm animalId={animal.id} onCreated={refetchSheds} />
        <ShedList sheds={sheds} onDelete={refetchSheds} />
      </Section>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function AnimalHeader({
  animal,
  suggestion,
}: {
  animal: Animal
  suggestion: PreySuggestion | null
}) {
  const weight = fmtGrams(animal.current_weight_g)
  const stage = suggestion?.stage && suggestion.stage !== 'unknown'
    ? STAGE_LABEL[suggestion.stage]
    : null
  const hatched = fmtDate(animal.hatch_date)

  return (
    <header>
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime font-medium">
          Reptile
        </p>
        <Link
          href={`/app/reptiles/${animal.id}/edit`}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700 transition-colors"
        >
          <span aria-hidden="true">✎</span> Edit
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-1 break-words">
            {animalTitle(animal)}
          </h1>
          {animal.scientific_name && (
            <p className="text-sm italic text-neutral-400">
              {animal.herp_species_id ? (
                <Link
                  href={`/app/species/${animal.herp_species_id}`}
                  className="text-herp-teal hover:text-herp-lime transition-colors"
                >
                  {animal.scientific_name}
                </Link>
              ) : (
                animal.scientific_name
              )}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Weight" value={weight || '—'} />
          <Stat label="Stage" value={stage || '—'} />
          <Stat label="Sex" value={capitalize(animal.sex) || '—'} />
          <Stat label="Hatched" value={hatched || '—'} />
        </dl>
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-md border border-neutral-800 bg-neutral-900/40 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-neutral-100 truncate">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weight section
// ---------------------------------------------------------------------------

function WeightLossBanner({ trend }: { trend: WeightTrendResponse }) {
  if (!trend.alert) return null
  const pct = fmtDecimal(trend.loss_pct_30d, 1)
  const threshold = fmtDecimal(trend.alert_threshold_pct, 1)
  return (
    <div
      role="alert"
      className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200"
    >
      <div className="font-semibold mb-0.5">
        Weight loss over 30 days: {pct}%
      </div>
      <div className="text-xs text-amber-200/80">
        Above the species-level threshold of {threshold}%. Check body
        condition, feeding refusals, and husbandry before assuming normal
        variation.
      </div>
    </div>
  )
}

function WeightChart({ logs }: { logs: WeightLog[] }) {
  const data = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) =>
        new Date(a.weighed_at).getTime() - new Date(b.weighed_at).getTime(),
    )
    return sorted.map((l) => ({
      // Recharts tolerates dates as epoch ms; formatting is owned by axes.
      ts: new Date(l.weighed_at).getTime(),
      dateLabel: shortDate(l.weighed_at),
      grams: Number(l.weight_g),
    }))
  }, [logs])

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center rounded-md border border-dashed border-neutral-800 bg-neutral-900/20 text-xs text-neutral-500">
        No weights recorded yet. Log one below to start the chart.
      </div>
    )
  }

  return (
    <div className="h-60 rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
          <XAxis
            dataKey="dateLabel"
            stroke="#525252"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#262626' }}
          />
          <YAxis
            stroke="#525252"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#262626' }}
            width={48}
            tickFormatter={(v) => `${v}g`}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#404040' }} />
          <Line
            type="monotone"
            dataKey="grams"
            stroke="#5eead4"
            strokeWidth={2}
            dot={{ r: 3, fill: '#5eead4', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload as { dateLabel: string; grams: number }
  return (
    <div className="px-2.5 py-1.5 rounded-md border border-neutral-800 bg-neutral-950/95 text-xs">
      <div className="text-neutral-400">{p.dateLabel}</div>
      <div className="text-herp-teal font-medium">{p.grams} g</div>
    </div>
  )
}

function WeightStats({
  animal,
  logs,
  trend,
}: {
  animal: Animal
  logs: WeightLog[]
  trend: WeightTrendResponse | null
}) {
  const latest = trend?.latest_weight_g ?? animal.current_weight_g
  const latestLog = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) =>
        new Date(b.weighed_at).getTime() - new Date(a.weighed_at).getTime(),
    )
    return sorted[0] || null
  }, [logs])

  // Backend semantics: `loss_pct_30d` is POSITIVE when the animal lost
  // weight, NEGATIVE when it gained. Convert to a properly-signed
  // change-percent and display "+X%" / "−X%" / "0%" so a keeper can
  // tell a gain from a loss at a glance.
  const lossPct = trend?.loss_pct_30d != null
    ? Number(trend.loss_pct_30d)
    : null
  const changeDisplay =
    lossPct == null || !Number.isFinite(lossPct)
      ? '—'
      : lossPct === 0
        ? '0%'
        : lossPct > 0
          ? `−${fmtDecimal(lossPct, 1)}%`        // lost
          : `+${fmtDecimal(Math.abs(lossPct), 1)}%` // gained

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
      <Stat label="Latest" value={fmtGrams(latest) || '—'} />
      {/* Label says "30-day" but the backend actually compares against the
          OLDEST point within the last 30 days — for an animal with two
          weeks of data, this is a 14-day change. Calling it "Net change"
          honestly reflects what we're computing without lying about the
          window. */}
      <Stat label="Net change" value={changeDisplay} />
      <Stat label="Logs" value={String(logs.length)} />
      <Stat
        label="Last weighed"
        value={relativeDays(latestLog?.weighed_at) || '—'}
      />
    </dl>
  )
}

function LogWeightForm({
  animalId,
  onCreated,
}: {
  animalId: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayISO())
  const [grams, setGrams] = useState('')
  const [context, setContext] = useState<WeightContext>('routine')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setDate(todayISO())
    setGrams('')
    setContext('routine')
    setNotes('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const g = Number(grams)
    if (!Number.isFinite(g) || g <= 0) {
      setError('Enter a weight greater than zero.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const payload: CreateWeightLogPayload = {
        weighed_at: new Date(date).toISOString(),
        weight_g: g,
        context,
        notes: notes.trim() || null,
      }
      await createWeightLog(animalId, payload)
      reset()
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(errMsg(err, 'Could not save weight.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-herp-teal hover:text-herp-lime transition-colors"
      >
        ＋ Log a weight
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Weight (g)">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            required
            placeholder="e.g. 145"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Context">
          <select
            value={context}
            onChange={(e) => setContext(e.target.value as WeightContext)}
            className={INPUT_CLS}
          >
            {(Object.keys(WEIGHT_CONTEXT_LABELS) as WeightContext[]).map(
              (k) => (
                <option key={k} value={k}>
                  {WEIGHT_CONTEXT_LABELS[k]}
                </option>
              ),
            )}
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={INPUT_CLS}
          placeholder="Pre-feed, looked a little thin, etc."
        />
      </Field>
      {error && <InlineError message={error} />}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="herp-gradient-bg text-herp-dark font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save weight'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-sm text-neutral-400 hover:text-neutral-200 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function WeightLogList({
  logs,
  onDelete,
}: {
  logs: WeightLog[]
  onDelete: () => void
}) {
  const sorted = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          new Date(b.weighed_at).getTime() - new Date(a.weighed_at).getTime(),
      ),
    [logs],
  )
  // Preview slice. Toggle below the list lets a keeper see the full
  // history when they want it instead of only the most recent N.
  const PREVIEW_COUNT = 10
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT)
  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        Recent weigh-ins
      </div>
      <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-900/40">
        {visible.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="text-neutral-500 w-24 flex-shrink-0">
              {fmtDate(l.weighed_at)}
            </span>
            <span className="text-neutral-100 font-medium w-20 flex-shrink-0">
              {fmtDecimal(l.weight_g, 1)} g
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-800/60 flex-shrink-0">
              {WEIGHT_CONTEXT_LABELS[l.context] || l.context}
            </span>
            <span className="text-neutral-400 text-xs truncate flex-1">
              {l.notes}
            </span>
            <DeleteRowButton
              label="weight"
              onDelete={() => deleteWeightLog(l.id).then(onDelete)}
            />
          </li>
        ))}
      </ul>
      {sorted.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline-offset-2 hover:underline"
        >
          {showAll
            ? `Show only the most recent ${PREVIEW_COUNT}`
            : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feeding intelligence card — consumes /prey-suggestion
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<string, string> = {
  hatchling: 'Hatchling',
  juvenile: 'Juvenile',
  subadult: 'Subadult',
  adult: 'Adult',
  unknown: 'Unknown',
}

function FeedingIntelligence({
  suggestion,
  animal,
  feedings,
}: {
  suggestion: PreySuggestion
  animal: Animal
  feedings: FeedingLog[]
}) {
  // All hooks run before any early return — React requires a stable hook
  // order across renders. (The old snake-only client called these useMemos
  // *after* the empty-state returns; consolidating was the chance to fix it.)
  const nextWindow = useMemo(() => {
    if (!animal.last_fed_at || suggestion.interval_days_min == null)
      return null
    const last = new Date(animal.last_fed_at)
    const min = new Date(last)
    min.setDate(min.getDate() + (suggestion.interval_days_min ?? 0))
    const max = new Date(last)
    max.setDate(
      max.getDate() +
        (suggestion.interval_days_max ?? suggestion.interval_days_min ?? 0),
    )
    return { min, max }
  }, [animal.last_fed_at, suggestion])

  const overdue = useMemo(() => {
    if (!nextWindow) return false
    return Date.now() > nextWindow.max.getTime()
  }, [nextWindow])

  // Power-feeding check against the most recent accepted feeding — if its
  // prey_weight_g / body weight exceeds the threshold, flag it. The wire
  // field is `snake_weight_g` for backward-compat; for any taxon it's that
  // animal's weight.
  const powerWarning = useMemo(() => {
    const lastAccepted = feedings
      .filter((f) => f.accepted && f.prey_weight_g != null)
      .sort(
        (a, b) =>
          new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
      )[0]
    if (
      !lastAccepted ||
      !lastAccepted.prey_weight_g ||
      !suggestion.power_feeding_threshold_g ||
      !suggestion.snake_weight_g
    ) {
      return null
    }
    const prey = Number(lastAccepted.prey_weight_g)
    const thresholdG = Number(suggestion.power_feeding_threshold_g)
    if (!Number.isFinite(prey) || !Number.isFinite(thresholdG)) return null
    if (prey < thresholdG) return null
    const bw = Number(suggestion.snake_weight_g)
    const pct = bw > 0 ? (prey / bw) * 100 : null
    return {
      preyG: prey,
      pct: pct != null ? Number(pct.toFixed(1)) : null,
      date: fmtDate(lastAccepted.fed_at),
    }
  }, [feedings, suggestion])

  if (!suggestion.is_data_available) {
    return (
      <div className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-400">
        We don&rsquo;t have feeding-ratio data for this species yet.
        The feeding log still works; quantitative suggestions will appear
        once the species sheet gains bracket data.
      </div>
    )
  }

  if (suggestion.warning && !suggestion.suggested_min_g) {
    return (
      <div className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 text-sm text-neutral-400">
        {suggestion.warning}
      </div>
    )
  }

  const preyRange =
    suggestion.suggested_min_g && suggestion.suggested_max_g
      ? `${fmtDecimal(suggestion.suggested_min_g, 0)}–${fmtDecimal(
          suggestion.suggested_max_g,
          0,
        )} g`
      : null

  const intervalRange =
    suggestion.interval_days_min != null && suggestion.interval_days_max != null
      ? suggestion.interval_days_min === suggestion.interval_days_max
        ? `${suggestion.interval_days_min} days`
        : `${suggestion.interval_days_min}–${suggestion.interval_days_max} days`
      : null

  return (
    <div className="p-4 rounded-md border border-herp-teal/30 bg-neutral-900/40 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wider text-herp-lime">
          Current stage
        </span>
        <span className="text-neutral-100 font-medium">
          {STAGE_LABEL[suggestion.stage] || suggestion.stage}
        </span>
        {suggestion.snake_weight_g && (
          <span className="text-xs text-neutral-500">
            · {fmtGrams(suggestion.snake_weight_g)}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoBlock label="Recommended prey weight" value={preyRange || '—'} />
        <InfoBlock label="Interval" value={intervalRange || '—'} />
        <InfoBlock
          label="Next feed window"
          value={
            nextWindow
              ? `${shortDate(nextWindow.min.toISOString())} – ${shortDate(
                  nextWindow.max.toISOString(),
                )}`
              : 'Log a feeding to start the clock'
          }
          tone={overdue ? 'warn' : 'neutral'}
        />
      </dl>

      {overdue && (
        <p className="text-xs text-amber-300">
          ⚠ Overdue against the upper interval. Refusal is often fine —
          check body condition + temps before pushing another offer.
        </p>
      )}

      {powerWarning && (
        <div className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200">
          <div className="font-semibold mb-0.5">
            Last feeding was above the power-feeding line
          </div>
          <div className="text-xs text-amber-200/80">
            {fmtDecimal(powerWarning.preyG, 0)} g prey on {powerWarning.date}
            {powerWarning.pct != null
              ? ` — roughly ${powerWarning.pct}% of body weight.`
              : '.'}{' '}
            Power-feeding trades health risk for growth speed.
          </div>
        </div>
      )}

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer hover:text-neutral-400">
          How we compute this
        </summary>
        <div className="mt-2 leading-relaxed">
          Stage is derived from current weight against the species&rsquo;
          life-stage brackets. Prey weight range = body weight ×
          bracket&rsquo;s min/max percentage. Interval comes from the same
          bracket. For insectivorous taxa the ratio numbers are crude
          proxies — the authoritative protocol lives in the species
          sheet&rsquo;s supplementation + frequency fields. Everything is
          advisory — body condition over calendar.
        </div>
      </details>
    </div>
  )
}

function InfoBlock({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warn'
}) {
  const valueCls = tone === 'warn' ? 'text-amber-300' : 'text-neutral-100'
  return (
    <div className="p-3 rounded-md border border-neutral-800 bg-neutral-950/40">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </div>
      <div className={`text-sm ${valueCls}`}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feeding log section
// ---------------------------------------------------------------------------

function LogFeedingForm({
  animal,
  suggestion,
  onCreated,
  onPauseChanged,
}: {
  animal: Animal
  suggestion: PreySuggestion | null
  onCreated: () => void
  /** Called after pausing/resuming so the parent refetches the animal
   *  (and the FeedingIntelligence/banner reflect the new state). */
  onPauseChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayISO())
  const [foodType, setFoodType] = useState('')
  const [preyWeight, setPreyWeight] = useState('')
  const [accepted, setAccepted] = useState<'yes' | 'no' | 'regurg'>('yes')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseHelpOpen, setPauseHelpOpen] = useState(false)

  // Live prey:BW hint
  const preyHint = useMemo(() => {
    const preyG = Number(preyWeight)
    const bwG = Number(animal.current_weight_g)
    if (!Number.isFinite(preyG) || preyG <= 0) return null
    if (!Number.isFinite(bwG) || bwG <= 0)
      return { tone: 'neutral' as const, text: 'No weight on file — log a weight to see the ratio.' }
    const pct = (preyG / bwG) * 100
    const pctLabel = pct.toFixed(1).replace(/\.?0+$/, '')
    const thresholdG = suggestion?.power_feeding_threshold_g
      ? Number(suggestion.power_feeding_threshold_g)
      : null
    const min = suggestion?.suggested_min_g ? Number(suggestion.suggested_min_g) : null
    const max = suggestion?.suggested_max_g ? Number(suggestion.suggested_max_g) : null

    if (thresholdG != null && preyG >= thresholdG) {
      return {
        tone: 'warn' as const,
        text: `${pctLabel}% of body weight — above the power-feeding line.`,
      }
    }
    if (min != null && max != null && (preyG < min || preyG > max)) {
      return {
        tone: 'caution' as const,
        text: `${pctLabel}% of body weight — outside the suggested range for this stage.`,
      }
    }
    return {
      tone: 'ok' as const,
      text: `${pctLabel}% of body weight.`,
    }
  }, [preyWeight, animal.current_weight_g, suggestion])

  const reset = () => {
    setDate(todayISO())
    setFoodType('')
    setPreyWeight('')
    setAccepted('yes')
    setNotes('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const payload: CreateFeedingPayload = {
        fed_at: new Date(date).toISOString(),
        food_type: foodType.trim() || null,
        accepted: accepted === 'yes',
        prey_weight_g: preyWeight ? Number(preyWeight) : null,
        notes:
          accepted === 'regurg'
            ? `Regurgitation. ${notes.trim()}`.trim()
            : notes.trim() || null,
      }
      await createFeeding(animal.id, payload)
      reset()
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(errMsg(err, 'Could not save feeding.'))
    } finally {
      setSubmitting(false)
    }
  }

  // Friendly label for the current pause reason (shown both in the
  // collapsed and open form states so the keeper always sees it).
  const PAUSE_REASON_LABELS: Record<string, string> = {
    hunger_strike: 'Hunger strike',
    post_rehouse: 'Post-rehouse',
    recovering: 'Recovering',
    breeding_season: 'Breeding season',
    other: 'Paused',
  }
  const pauseLabel = animal.feeding_paused_reason
    ? PAUSE_REASON_LABELS[animal.feeding_paused_reason] ?? 'Paused'
    : null

  if (!open) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-herp-teal hover:text-herp-lime transition-colors"
        >
          ＋ Log a feeding
        </button>
        {pauseLabel && (
          <button
            onClick={() => setPauseOpen(true)}
            className="text-xs text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
            title="Edit or resume pause"
          >
            ⏸ {pauseLabel} — tap to edit
          </button>
        )}
        <PauseFeedingDialog
          open={pauseOpen}
          onClose={() => setPauseOpen(false)}
          animalId={animal.id}
          animalName={animalTitle(animal)}
          currentReason={animal.feeding_paused_reason}
          currentUntil={animal.feeding_paused_until}
          onChange={onPauseChanged}
        />
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Prey type">
          <input
            type="text"
            value={foodType}
            onChange={(e) => setFoodType(e.target.value)}
            placeholder="e.g. frozen-thawed rat, dubia roaches"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Outcome">
          <select
            value={accepted}
            onChange={(e) =>
              setAccepted(e.target.value as 'yes' | 'no' | 'regurg')
            }
            className={INPUT_CLS}
          >
            <option value="yes">Accepted</option>
            <option value="no">Refused</option>
            <option value="regurg">Regurgitated</option>
          </select>
        </Field>
      </div>

      <Field label="Prey weight (g, optional)">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={preyWeight}
          onChange={(e) => setPreyWeight(e.target.value)}
          placeholder="e.g. 52"
          className={INPUT_CLS}
        />
        {preyHint && (
          <p
            className={`mt-1.5 text-xs ${
              preyHint.tone === 'warn'
                ? 'text-amber-300'
                : preyHint.tone === 'caution'
                ? 'text-amber-200/80'
                : preyHint.tone === 'ok'
                ? 'text-herp-teal'
                : 'text-neutral-500'
            }`}
          >
            {preyHint.text}
          </p>
        )}
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={INPUT_CLS}
          placeholder="Feeding response, supplementation, anything notable…"
        />
      </Field>

      {error && <InlineError message={error} />}

      {/* Pause feedings — surfaces in-context with logging because
          "it just refused" is the natural moment to mute reminders.
          Mirrors the mobile pattern. Migration pse_20260502. */}
      <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
            {pauseLabel ? 'Feeding paused' : 'Going off feed?'}
          </span>
          <button
            type="button"
            onClick={() => setPauseHelpOpen((v) => !v)}
            aria-label={pauseHelpOpen ? 'Hide pause help' : 'What is this?'}
            className="text-neutral-500 hover:text-neutral-300 text-xs leading-none"
          >
            ⓘ
          </button>
        </div>
        {pauseHelpOpen && (
          <p className="text-xs text-neutral-400 leading-relaxed">
            Reptiles and amphibians can refuse food for weeks during hunger
            strikes, brumation prep, post-rehouse settling, or breeding
            season. Pause to mute &quot;overdue&quot; reminders so they
            don&apos;t drown out real ones on your other animals. You
            can resume any time.
          </p>
        )}
        <button
          type="button"
          onClick={() => setPauseOpen(true)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition ${
            pauseLabel
              ? 'border-indigo-500/40 bg-indigo-900/20 hover:bg-indigo-900/30'
              : 'border-neutral-800 hover:bg-neutral-900/60'
          }`}
        >
          <span className="text-base leading-none">
            {pauseLabel ? '⏸' : '◯'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-white">
              {pauseLabel ?? 'Pause feeding reminders'}
            </span>
            <span className="block text-xs text-neutral-400 mt-0.5">
              {pauseLabel
                ? animal.feeding_paused_until
                  ? `Auto-resumes ${fmtDate(animal.feeding_paused_until) ?? animal.feeding_paused_until} — tap to edit`
                  : 'Indefinite — tap to edit or resume'
                : 'Mute overdue alerts during hunger strikes or fasting'}
            </span>
          </span>
          <span className="text-neutral-600">›</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="herp-gradient-bg text-herp-dark font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save feeding'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-sm text-neutral-400 hover:text-neutral-200 px-3 py-2"
        >
          Cancel
        </button>
      </div>

      <PauseFeedingDialog
        open={pauseOpen}
        onClose={() => setPauseOpen(false)}
        animalId={animal.id}
        animalName={animalTitle(animal)}
        currentReason={animal.feeding_paused_reason}
        currentUntil={animal.feeding_paused_until}
        onChange={onPauseChanged}
      />
    </form>
  )
}

function FeedingList({
  feedings,
  animalWeightG,
  onDelete,
}: {
  feedings: FeedingLog[]
  animalWeightG: string | null
  onDelete: () => void
}) {
  const sorted = useMemo(
    () =>
      [...feedings].sort(
        (a, b) =>
          new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime(),
      ),
    [feedings],
  )
  // Preview slice + toggle, matching the weigh-ins section pattern.
  const PREVIEW_COUNT = 10
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT)
  if (sorted.length === 0) return null

  const bwG = animalWeightG ? Number(animalWeightG) : null

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        Recent feedings
      </div>
      <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-900/40">
        {visible.map((f) => {
          const preyG = f.prey_weight_g ? Number(f.prey_weight_g) : null
          const pct =
            preyG != null && bwG != null && bwG > 0
              ? Number(((preyG / bwG) * 100).toFixed(1))
              : null
          return (
            <li
              key={f.id}
              className="flex items-center gap-3 px-3 py-2 text-sm flex-wrap"
            >
              <span className="text-neutral-500 w-24 flex-shrink-0">
                {fmtDate(f.fed_at)}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
                  f.accepted
                    ? 'bg-herp-green/20 text-herp-lime'
                    : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {f.accepted ? 'Accepted' : 'Refused'}
              </span>
              {f.food_type && (
                <span className="text-neutral-200 text-xs">{f.food_type}</span>
              )}
              {preyG != null && (
                <span className="text-neutral-400 text-xs">
                  {fmtDecimal(preyG, 1)} g
                  {pct != null && (
                    <span className="ml-1 text-neutral-500">
                      ({pct}% BW)
                    </span>
                  )}
                </span>
              )}
              <span className="text-neutral-400 text-xs truncate flex-1 min-w-0">
                {f.notes}
              </span>
              <DeleteRowButton
                label="feeding"
                onDelete={() => deleteFeeding(f.id).then(onDelete)}
              />
            </li>
          )
        })}
      </ul>
      {sorted.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline-offset-2 hover:underline"
        >
          {showAll
            ? `Show only the most recent ${PREVIEW_COUNT}`
            : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shed section
// ---------------------------------------------------------------------------

function LogShedForm({
  animalId,
  onCreated,
}: {
  animalId: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayISO())
  const [complete, setComplete] = useState(true)
  const [retained, setRetained] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setDate(todayISO())
    setComplete(true)
    setRetained(false)
    setNotes('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const payload: CreateShedPayload = {
        shed_at: new Date(date).toISOString(),
        is_complete_shed: complete,
        has_retained_shed: retained,
        notes: notes.trim() || null,
      }
      await createShed(animalId, payload)
      reset()
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(errMsg(err, 'Could not save shed.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-herp-teal hover:text-herp-lime transition-colors"
      >
        ＋ Log a shed
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Complete?">
          <select
            value={complete ? 'yes' : 'no'}
            onChange={(e) => setComplete(e.target.value === 'yes')}
            className={INPUT_CLS}
          >
            <option value="yes">One piece</option>
            <option value="no">Broken up</option>
          </select>
        </Field>
        <Field label="Retained stuck shed?">
          <select
            value={retained ? 'yes' : 'no'}
            onChange={(e) => setRetained(e.target.value === 'yes')}
            className={INPUT_CLS}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={INPUT_CLS}
          placeholder="Soaked overnight, eye caps / toe tips retained, etc."
        />
      </Field>
      {error && <InlineError message={error} />}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="herp-gradient-bg text-herp-dark font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save shed'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-sm text-neutral-400 hover:text-neutral-200 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ShedList({
  sheds,
  onDelete,
}: {
  sheds: ShedLog[]
  onDelete: () => void
}) {
  const sorted = useMemo(
    () =>
      [...sheds].sort(
        (a, b) =>
          new Date(b.shed_at).getTime() - new Date(a.shed_at).getTime(),
      ),
    [sheds],
  )
  // Sheds preview at 5 (lower than weigh-ins/feedings since sheds
  // are rarer events and the full list is more reasonable to expose
  // by default once a keeper has been at it for years).
  const PREVIEW_COUNT = 5
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT)
  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        Recent sheds
      </div>
      <ul className="divide-y divide-neutral-800 rounded-md border border-neutral-800 bg-neutral-900/40">
        {visible.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 px-3 py-2 text-sm flex-wrap"
          >
            <span className="text-neutral-500 w-24 flex-shrink-0">
              {fmtDate(s.shed_at)}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
                s.is_complete_shed
                  ? 'bg-herp-green/20 text-herp-lime'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {s.is_complete_shed ? 'One piece' : 'Broken up'}
            </span>
            {s.has_retained_shed && (
              <span className="text-[10px] uppercase tracking-wider text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/10 flex-shrink-0">
                Retained
              </span>
            )}
            <span className="text-neutral-400 text-xs truncate flex-1 min-w-0">
              {s.notes}
            </span>
            <DeleteRowButton
              label="shed"
              onDelete={() => deleteShed(s.id).then(onDelete)}
            />
          </li>
        ))}
      </ul>
      {sorted.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline-offset-2 hover:underline"
        >
          {showAll
            ? `Show only the most recent ${PREVIEW_COUNT}`
            : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-sm text-neutral-100 placeholder-neutral-600'

function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
    >
      {message}
    </div>
  )
}

function DeleteRowButton({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  async function handle() {
    if (busy) return
    if (!window.confirm(`Delete this ${label}?`)) return
    setBusy(true)
    try {
      await onDelete()
    } catch {
      // Swallow — caller surfaces errors through refetch state.
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      title={`Delete ${label}`}
      className="text-xs text-neutral-500 hover:text-red-300 disabled:opacity-40 px-1.5 flex-shrink-0"
    >
      ✕
    </button>
  )
}

function BackLink() {
  return (
    <Link
      href="/app/reptiles"
      className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime transition-colors"
    >
      <span aria-hidden="true">←</span> Collection
    </Link>
  )
}

function LoadingShell() {
  return (
    <div className="max-w-4xl mx-auto">
      <BackLink />
      <div className="mt-6 space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-1/3 bg-neutral-900 rounded animate-pulse" />
        <div className="h-4 w-1/2 bg-neutral-900/70 rounded animate-pulse" />
        <div className="h-40 bg-neutral-900 rounded animate-pulse" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  // YYYY-MM-DD in local time (HTML date input wants local).
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shortDate(iso: string): string {
  // "Apr 22" — for compact chart axis + next-feed window.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function capitalize(s: string | null | undefined): string | null {
  if (!s) return null
  return s[0].toUpperCase() + s.slice(1)
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message || fallback
  return fallback
}
