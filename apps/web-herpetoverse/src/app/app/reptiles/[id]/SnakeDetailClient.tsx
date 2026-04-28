'use client'

/**
 * Snake detail — the Sprint 5 spike.
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
 *     suggested ranges) — the UI is a renderer, not a calculator. This
 *     keeps the "how we compute" story consistent across mobile + web.
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
import ReptileQRModal from '@/components/ReptileQRModal'
import {
  CreateFeedingPayload,
  CreateShedPayload,
  CreateWeightLogPayload,
  FeedingLog,
  PreySuggestion,
  ShedLog,
  Snake,
  WEIGHT_CONTEXT_LABELS,
  WeightContext,
  WeightLog,
  WeightTrendResponse,
  createFeeding,
  createShed,
  createWeightLog,
  deleteFeeding,
  deleteShed,
  deleteWeightLog,
  fmtDate,
  fmtDecimal,
  fmtGrams,
  getPreySuggestion,
  getSnake,
  getWeightTrend,
  listFeedings,
  listSheds,
  listWeightLogs,
  relativeDays,
  snakeTitle,
} from '@/lib/snakes'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SnakeDetailClient({ snakeId }: { snakeId: string }) {
  // Snake record
  const [snake, setSnake] = useState<Snake | null>(null)
  const [snakeError, setSnakeError] = useState<string | null>(null)

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
    const [snakeR, weightsR, trendR, preyR, feedingsR, shedsR] =
      await Promise.allSettled([
        getSnake(snakeId),
        listWeightLogs(snakeId),
        getWeightTrend(snakeId),
        getPreySuggestion(snakeId),
        listFeedings(snakeId),
        listSheds(snakeId),
      ])

    if (snakeR.status === 'fulfilled') {
      setSnake(snakeR.value)
      setSnakeError(null)
    } else {
      setSnakeError(errMsg(snakeR.reason, 'Could not load this reptile.'))
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
  }, [snakeId])

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
    const [w, t, s, p] = await Promise.allSettled([
      listWeightLogs(snakeId),
      getWeightTrend(snakeId),
      getSnake(snakeId),
      getPreySuggestion(snakeId),
    ])
    if (w.status === 'fulfilled') setWeightLogs(w.value)
    if (t.status === 'fulfilled') setTrend(t.value)
    if (s.status === 'fulfilled') setSnake(s.value)
    if (p.status === 'fulfilled') setPreySuggestion(p.value)
  }, [snakeId])

  const refetchFeedings = useCallback(async () => {
    const [f, s, p] = await Promise.allSettled([
      listFeedings(snakeId),
      getSnake(snakeId),
      getPreySuggestion(snakeId),
    ])
    if (f.status === 'fulfilled') setFeedings(f.value)
    if (s.status === 'fulfilled') setSnake(s.value)
    if (p.status === 'fulfilled') setPreySuggestion(p.value)
  }, [snakeId])

  const refetchSheds = useCallback(async () => {
    const [sh, s] = await Promise.allSettled([
      listSheds(snakeId),
      getSnake(snakeId),
    ])
    if (sh.status === 'fulfilled') setSheds(sh.value)
    if (s.status === 'fulfilled') setSnake(s.value)
  }, [snakeId])

  // Photo mutations don't touch weights, feedings, or sheds — they just shift
  // Snake.photo_url when the main photo changes or the first upload auto-
  // promotes. A snake-only refetch keeps the main-photo badge honest without
  // re-pulling the whole page.
  const refetchSnakeOnly = useCallback(async () => {
    try {
      const s = await getSnake(snakeId)
      setSnake(s)
    } catch {
      // Swallow — the photo mutation itself already succeeded; worst case
      // the main-photo highlight drifts until the next full refetch.
    }
  }, [snakeId])

  if (loading && !snake) return <LoadingShell />
  if (snakeError && !snake) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink />
        <div
          role="alert"
          className="mt-6 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {snakeError}
        </div>
      </div>
    )
  }
  if (!snake) return null

  return (
    <article className="max-w-4xl mx-auto space-y-8">
      <BackLink />
      <SnakeHeader snake={snake} suggestion={preySuggestion} />

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
          animalId={snake.id}
          taxon="snake"
          mainPhotoUrl={snake.photo_url}
          onMainChanged={refetchSnakeOnly}
        />
      </section>

      {qrOpen && (
        <ReptileQRModal
          taxon="snake"
          animalId={snake.id}
          animalName={snakeTitle(snake)}
          onClose={() => setQrOpen(false)}
          onPhotoAdded={refetchSnakeOnly}
        />
      )}

      <Section title="Weight">
        {weightError && <InlineError message={weightError} />}
        {trend && <WeightLossBanner trend={trend} />}
        <WeightChart logs={weightLogs} />
        <WeightStats snake={snake} logs={weightLogs} trend={trend} />
        <LogWeightForm snakeId={snake.id} onCreated={refetchWeights} />
        <WeightLogList logs={weightLogs} onDelete={refetchWeights} />
      </Section>

      <Section title="Feeding intelligence">
        {feedingError && !preySuggestion && (
          <InlineError message={feedingError} />
        )}
        {preySuggestion && (
          <FeedingIntelligence
            suggestion={preySuggestion}
            snake={snake}
            feedings={feedings}
          />
        )}
      </Section>

      <Section title="Feeding log">
        <LogFeedingForm
          snake={snake}
          suggestion={preySuggestion}
          onCreated={refetchFeedings}
        />
        <FeedingList
          feedings={feedings}
          snakeWeightG={snake.current_weight_g}
          powerFeedingThresholdPct={preySuggestion?.power_feeding_threshold_g ? null : null}
          onDelete={refetchFeedings}
        />
      </Section>

      <Section title="Sheds">
        {shedError && <InlineError message={shedError} />}
        <LogShedForm snakeId={snake.id} onCreated={refetchSheds} />
        <ShedList sheds={sheds} onDelete={refetchSheds} />
      </Section>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function SnakeHeader({
  snake,
  suggestion,
}: {
  snake: Snake
  suggestion: PreySuggestion | null
}) {
  const weight = fmtGrams(snake.current_weight_g)
  const stage = suggestion?.stage && suggestion.stage !== 'unknown'
    ? STAGE_LABEL[suggestion.stage]
    : null
  const hatched = fmtDate(snake.hatch_date)

  return (
    <header>
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime font-medium">
          Reptile
        </p>
        <Link
          href={`/app/reptiles/${snake.id}/edit`}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700 transition-colors"
        >
          <span aria-hidden="true">✎</span> Edit
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-1 break-words">
            {snakeTitle(snake)}
          </h1>
          {snake.scientific_name && (
            <p className="text-sm italic text-neutral-400">
              {snake.reptile_species_id ? (
                <Link
                  href={`/app/species/${snake.reptile_species_id}`}
                  className="text-herp-teal hover:text-herp-lime transition-colors"
                >
                  {snake.scientific_name}
                </Link>
              ) : (
                snake.scientific_name
              )}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Weight" value={weight || '—'} />
          <Stat label="Stage" value={stage || '—'} />
          <Stat label="Sex" value={capitalize(snake.sex) || '—'} />
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
  snake,
  logs,
  trend,
}: {
  snake: Snake
  logs: WeightLog[]
  trend: WeightTrendResponse | null
}) {
  const latest = trend?.latest_weight_g ?? snake.current_weight_g
  const latestLog = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) =>
        new Date(b.weighed_at).getTime() - new Date(a.weighed_at).getTime(),
    )
    return sorted[0] || null
  }, [logs])

  // Backend semantics: `loss_pct_30d` is POSITIVE when the snake lost
  // weight, NEGATIVE when it gained. Convert to a properly-signed
  // change-percent and display "+X%" / "−X%" / "0%" so a keeper can
  // tell a gain from a loss at a glance. The previous render leaned
  // on the leading minus character for both cases — visually
  // indistinguishable.
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
          OLDEST point within the last 30 days — for a snake with two
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
  snakeId,
  onCreated,
}: {
  snakeId: string
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
      await createWeightLog(snakeId, payload)
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
            placeholder="e.g. 650"
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
  // (Replaces the silent "Showing most recent 10 of N" footer that
  // gave no way to reveal the rest.)
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
  snake,
  feedings,
}: {
  suggestion: PreySuggestion
  snake: Snake
  feedings: FeedingLog[]
}) {
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

  // Next-feed window: last_fed_at + interval_days_min .. last_fed_at + interval_days_max
  const nextWindow = useMemo(() => {
    if (!snake.last_fed_at || suggestion.interval_days_min == null)
      return null
    const last = new Date(snake.last_fed_at)
    const min = new Date(last)
    min.setDate(min.getDate() + (suggestion.interval_days_min ?? 0))
    const max = new Date(last)
    max.setDate(
      max.getDate() +
        (suggestion.interval_days_max ?? suggestion.interval_days_min ?? 0),
    )
    return { min, max }
  }, [snake.last_fed_at, suggestion])

  const overdue = useMemo(() => {
    if (!nextWindow) return false
    return Date.now() > nextWindow.max.getTime()
  }, [nextWindow])

  // Power-feeding check against the most recent accepted feeding — if its
  // prey_weight_g / snake weight exceeds the threshold, flag it.
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
          life-stage brackets. Prey weight range = snake weight ×
          bracket&rsquo;s min/max percentage. Interval comes from the same
          bracket. The power-feeding line is a species-level percentage; any
          prey that heavy triggers the warning. Everything is advisory —
          body condition over calendar.
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
  snake,
  suggestion,
  onCreated,
}: {
  snake: Snake
  suggestion: PreySuggestion | null
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => todayISO())
  const [foodType, setFoodType] = useState('')
  const [preyWeight, setPreyWeight] = useState('')
  const [accepted, setAccepted] = useState<'yes' | 'no' | 'regurg'>('yes')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live prey:BW hint
  const preyHint = useMemo(() => {
    const preyG = Number(preyWeight)
    const bwG = Number(snake.current_weight_g)
    if (!Number.isFinite(preyG) || preyG <= 0) return null
    if (!Number.isFinite(bwG) || bwG <= 0)
      return { tone: 'neutral' as const, text: 'No snake weight on file — log a weight to see the ratio.' }
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
  }, [preyWeight, snake.current_weight_g, suggestion])

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
      await createFeeding(snake.id, payload)
      reset()
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(errMsg(err, 'Could not save feeding.'))
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
        ＋ Log a feeding
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
        <Field label="Prey type">
          <input
            type="text"
            value={foodType}
            onChange={(e) => setFoodType(e.target.value)}
            placeholder="e.g. frozen-thawed rat"
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
          placeholder="Struck fast, took twenty minutes to coil, etc."
        />
      </Field>

      {error && <InlineError message={error} />}

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
    </form>
  )
}

function FeedingList({
  feedings,
  snakeWeightG,
  onDelete,
}: {
  feedings: FeedingLog[]
  snakeWeightG: string | null
  // Kept for future iteration — per-row retroactive ratio badges.
  powerFeedingThresholdPct: string | null
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

  const bwG = snakeWeightG ? Number(snakeWeightG) : null

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
  snakeId,
  onCreated,
}: {
  snakeId: string
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
      await createShed(snakeId, payload)
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
          placeholder="Soaked overnight, eye caps retained, etc."
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
      // Swallow — caller surfaces errors through refetch state. A spike
      // shouldn't have per-row error toasts; we'll add them when building
      // the production page.
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
