'use client'

/**
 * Edit colony (web) — ADR-010 Colony mode.
 *
 * Mirrors the add form, prefilled from the existing colony, and sends a
 * partial PUT (only changed fields would be a nice-to-have; here we send the
 * full editable set, which the backend accepts as a partial update).
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import {
  getColony,
  updateColony,
  type ColonyResponse,
  type ColonySource,
} from '@/lib/colonies'

interface StageRow {
  key: string
  name: string
  count: string
}

let stageKeyCounter = 0
function makeStageRow(name: string, count = ''): StageRow {
  stageKeyCounter += 1
  return { key: `stage-${stageKeyCounter}`, name, count }
}

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

const numToStr = (n: number | null | undefined): string =>
  n == null ? '' : String(n)

export default function EditColonyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const colonyId = params?.id
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [colony, setColony] = useState<ColonyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [stages, setStages] = useState<StageRow[]>([])
  const [countEstimated, setCountEstimated] = useState(false)
  const [dateAcquired, setDateAcquired] = useState('')
  const [foundedDate, setFoundedDate] = useState('')
  const [source, setSource] = useState<ColonySource | ''>('')
  const [substrateType, setSubstrateType] = useState('')
  const [substrateDepth, setSubstrateDepth] = useState('')
  const [tempMin, setTempMin] = useState('')
  const [tempMax, setTempMax] = useState('')
  const [humidityMin, setHumidityMin] = useState('')
  const [humidityMax, setHumidityMax] = useState('')
  const [waterDish, setWaterDish] = useState(true)
  const [notes, setNotes] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')

  const load = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const c = await getColony(token, colonyId)
      setColony(c)
      setName(c.name)
      setStages(
        c.stage_counts && Object.keys(c.stage_counts).length > 0
          ? Object.entries(c.stage_counts).map(([k, v]) => makeStageRow(k, String(v)))
          : [makeStageRow('adults'), makeStageRow('juveniles'), makeStageRow('nymphs')],
      )
      setCountEstimated(c.count_is_estimated)
      setDateAcquired(c.date_acquired ?? '')
      setFoundedDate(c.founded_date ?? '')
      setSource((c.source as ColonySource) ?? '')
      setSubstrateType(c.substrate_type ?? '')
      setSubstrateDepth(c.substrate_depth ?? '')
      setTempMin(numToStr(c.target_temp_min))
      setTempMax(numToStr(c.target_temp_max))
      setHumidityMin(numToStr(c.target_humidity_min))
      setHumidityMax(numToStr(c.target_humidity_max))
      setWaterDish(c.water_dish ?? true)
      setNotes(c.notes ?? '')
      setVisibility((c.visibility as 'private' | 'public') ?? 'private')
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [colonyId, token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    load()
  }, [isLoading, isAuthenticated, router, load])

  const updateStageName = (key: string, value: string) =>
    setStages((prev) => prev.map((r) => (r.key === key ? { ...r, name: value } : r)))
  const updateStageCount = (key: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return
    setStages((prev) => prev.map((r) => (r.key === key ? { ...r, count: value } : r)))
  }
  const removeStage = (key: string) =>
    setStages((prev) => prev.filter((r) => r.key !== key))
  const addStage = (n = '') => setStages((prev) => [...prev, makeStageRow(n)])
  const hasMixed = stages.some((r) => r.name.trim().toLowerCase() === 'mixed')

  const buildStageCounts = (): Record<string, number> => {
    const map: Record<string, number> = {}
    for (const row of stages) {
      const key = row.name.trim()
      if (!key) continue
      if (row.count.trim() === '') continue
      const n = Number.parseInt(row.count, 10)
      if (Number.isFinite(n) && n >= 0) map[key] = n
    }
    return map
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!token || !colony) return
    if (!name.trim()) {
      setError('Give the colony a name.')
      return
    }

    const numOrNull = (s: string): number | null => {
      if (s.trim() === '') return null
      const n = Number.parseFloat(s)
      return Number.isFinite(n) ? n : null
    }

    const stageCounts = buildStageCounts()

    setSaving(true)
    try {
      await updateColony(token, colony.id, {
        name: name.trim(),
        stage_counts: Object.keys(stageCounts).length > 0 ? stageCounts : null,
        count_is_estimated: countEstimated,
        date_acquired: dateAcquired.trim() || null,
        founded_date: foundedDate.trim() || null,
        source: source || null,
        substrate_type: substrateType.trim() || null,
        substrate_depth: substrateDepth.trim() || null,
        target_temp_min: numOrNull(tempMin),
        target_temp_max: numOrNull(tempMax),
        target_humidity_min: numOrNull(humidityMin),
        target_humidity_max: numOrNull(humidityMax),
        water_dish: waterDish,
        notes: notes.trim() || null,
        visibility,
      })
      router.replace(`/dashboard/colonies/${colony.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-4 py-8">
          <div className="h-6 w-32 rounded bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-64 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError || !colony) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🐾</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError || 'Colony not found'}
          </h1>
          <Link
            href="/dashboard/tarantulas"
            className="inline-block mt-4 px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
          >
            Back to collection
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const glyph = isInvertTaxon(colony.taxon) ? INVERT_TAXA[colony.taxon].glyph : '🐾'

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={`/dashboard/colonies/${colony.id}`}
            className="text-sm text-theme-secondary hover:text-theme-primary transition"
          >
            ← Back to colony
          </Link>
          <h1 className="text-3xl font-bold text-theme-primary mt-2">
            {glyph} Edit colony
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {error}
            </div>
          )}

          <Field label="Colony name *">
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Life-stage buckets */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">
              Population by life stage
            </label>
            <div className="space-y-2">
              {stages.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateStageName(row.key, e.target.value)}
                    placeholder="Stage (e.g. adults)"
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={row.count}
                    onChange={(e) => updateStageCount(row.key, e.target.value)}
                    placeholder="0"
                    className={`${inputCls} w-28`}
                  />
                  <button
                    type="button"
                    onClick={() => removeStage(row.key)}
                    aria-label={`Remove ${row.name || 'stage'}`}
                    className="flex-shrink-0 text-theme-tertiary hover:text-red-600 dark:hover:text-red-400 transition px-2 text-lg"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => addStage()}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                + Add stage
              </button>
              {!hasMixed && (
                <button
                  type="button"
                  onClick={() => addStage('mixed')}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  + Add “mixed” bucket
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-theme-secondary">
              <input
                type="checkbox"
                checked={countEstimated}
                onChange={(e) => setCountEstimated(e.target.checked)}
                className="rounded border-theme"
              />
              These counts are estimates
            </label>
          </div>

          {/* Acquisition */}
          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">
            Acquisition
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date acquired">
              <input
                type="date"
                value={dateAcquired}
                onChange={(e) => setDateAcquired(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Founded date">
              <input
                type="date"
                value={foundedDate}
                onChange={(e) => setFoundedDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Source">
            <div className="flex gap-2">
              {(
                [
                  ['bred', 'Captive bred'],
                  ['bought', 'Bought'],
                  ['wild_caught', 'Wild caught'],
                ] as const
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSource(source === v ? '' : v)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    source === v
                      ? 'bg-gradient-brand text-white'
                      : 'bg-surface border border-theme text-theme-secondary'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          {/* Husbandry */}
          <h2 className="text-sm font-bold uppercase tracking-wide text-theme-secondary pt-2">
            Husbandry
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Substrate type">
              <input
                value={substrateType}
                onChange={(e) => setSubstrateType(e.target.value)}
                placeholder="e.g. coco fiber"
                className={inputCls}
              />
            </Field>
            <Field label="Substrate depth">
              <input
                value={substrateDepth}
                onChange={(e) => setSubstrateDepth(e.target.value)}
                placeholder='e.g. 3"'
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Temp min (°F)">
              <input
                value={tempMin}
                onChange={(e) => setTempMin(e.target.value)}
                inputMode="numeric"
                placeholder="72"
                className={inputCls}
              />
            </Field>
            <Field label="Temp max (°F)">
              <input
                value={tempMax}
                onChange={(e) => setTempMax(e.target.value)}
                inputMode="numeric"
                placeholder="82"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Humidity min (%)">
              <input
                value={humidityMin}
                onChange={(e) => setHumidityMin(e.target.value)}
                inputMode="numeric"
                placeholder="60"
                className={inputCls}
              />
            </Field>
            <Field label="Humidity max (%)">
              <input
                value={humidityMax}
                onChange={(e) => setHumidityMax(e.target.value)}
                inputMode="numeric"
                placeholder="75"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Water dish">
            <div className="flex gap-2">
              {(
                [
                  ['yes', true],
                  ['no', false],
                ] as const
              ).map(([lbl, val]) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setWaterDish(val)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold capitalize ${
                    waterDish === val
                      ? 'bg-gradient-brand text-white'
                      : 'bg-surface border border-theme text-theme-secondary'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>

          <Field label="Visibility">
            <div className="flex gap-2">
              {(
                [
                  ['private', 'Private'],
                  ['public', 'Public'],
                ] as const
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    visibility === v
                      ? 'bg-gradient-brand text-white'
                      : 'bg-surface border border-theme text-theme-secondary'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/dashboard/colonies/${colony.id}`}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
