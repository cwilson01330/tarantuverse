'use client'

/**
 * Edit colony (web) — ADR-010 Colony mode.
 *
 * Mirrors the add form, prefilled from the existing colony, and sends a
 * partial PUT (only changed fields would be a nice-to-have; here we send the
 * full editable set, which the backend accepts as a partial update).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useUnitField } from '@/hooks/useUnitField'
import { useUnits } from '@/components/UnitsProvider'
import { LocationField } from '@/components/LocationPicker'
import DashboardLayout from '@/components/DashboardLayout'
import SpeciesSuggestion, { useSpeciesMatch } from '@/components/SpeciesSuggestion'
import { INVERT_TAXA, isInvertTaxon, type InvertTaxon } from '@/lib/inverts'
import {
  getColony,
  stageKey,
  updateColony,
  type ColonyResponse,
  type ColonySource,
} from '@/lib/colonies'
import {
  bucketHint,
  enclosureSizePlaceholder,
  showsEnclosureOrientation,
  suggestedBuckets,
} from '@/lib/colony-presets'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
  // Counts as loaded, so save can emit a delta per bucket rather than
  // overwriting — see handleSubmit.
  const [originalCounts, setOriginalCounts] = useState<Record<string, number>>({})
  const [countEstimated, setCountEstimated] = useState(false)
  const [dateAcquired, setDateAcquired] = useState('')
  const [foundedDate, setFoundedDate] = useState('')
  const [source, setSource] = useState<ColonySource | ''>('')
  const [enclosureType, setEnclosureType] = useState('')
  const [enclosureSize, setEnclosureSize] = useState('')
  const [location, setLocation] = useState<string | null>(null)
  const [substrateType, setSubstrateType] = useState('')
  const [substrateDepth, setSubstrateDepth] = useState('')
  // Stored in °F; typed in the keeper's units.
  const { units } = useUnits()
  const tempMin = useUnitField('temp')
  const tempMax = useUnitField('temp')
  const loadTempMin = tempMin.load
  const loadTempMax = tempMax.load
  const [humidityMin, setHumidityMin] = useState('')
  const [humidityMax, setHumidityMax] = useState('')
  const [waterDish, setWaterDish] = useState(true)
  const [notes, setNotes] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [isActive, setIsActive] = useState(true)
  // Species link. Sent on save only when it CHANGED (like the invert edit
  // form), so a colony whose stored link is stale can still be renamed.
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [speciesText, setSpeciesText] = useState('')
  const [loadedSpeciesId, setLoadedSpeciesId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const c = await getColony(token, colonyId)
      setColony(c)
      setName(c.name)
      setStages(
        c.stage_counts && Object.keys(c.stage_counts).length > 0
          ? Object.entries(c.stage_counts).map(([k, v]) => makeStageRow(k, String(v)))
          // No buckets yet: the taxon's own suggestions, as on add.
          : suggestedBuckets(c.taxon).map((b) => makeStageRow(b)),
      )
      setSpeciesId(c.species_id ?? null)
      setLoadedSpeciesId(c.species_id ?? null)
      setSpeciesText(c.species_scientific_name ?? '')
      const baseline: Record<string, number> = {}
      for (const [k, v] of Object.entries(c.stage_counts ?? {})) baseline[k] = Number(v) || 0
      setOriginalCounts(baseline)
      setCountEstimated(c.count_is_estimated)
      setDateAcquired(c.date_acquired ?? '')
      setFoundedDate(c.founded_date ?? '')
      setSource((c.source as ColonySource) ?? '')
      setEnclosureType(c.enclosure_type ?? '')
      setEnclosureSize(c.enclosure_size ?? '')
      setLocation(c.location ?? null)
      setSubstrateType(c.substrate_type ?? '')
      setSubstrateDepth(c.substrate_depth ?? '')
      loadTempMin(c.target_temp_min)
      loadTempMax(c.target_temp_max)
      setHumidityMin(numToStr(c.target_humidity_min))
      setHumidityMax(numToStr(c.target_humidity_max))
      setWaterDish(c.water_dish ?? true)
      setNotes(c.notes ?? '')
      setVisibility((c.visibility as 'private' | 'public') ?? 'private')
      setIsActive(c.is_active)
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [colonyId, token, loadTempMin, loadTempMax])

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
  const hasMixed = stages.some((r) => stageKey(r.name) === 'mixed')
  const unusedSuggestions = colony
    ? suggestedBuckets(colony.taxon).filter((b) => !stages.some((r) => stageKey(r.name) === stageKey(b)))
    : []

  const buildStageCounts = (): Record<string, number> => {
    const map: Record<string, number> = {}
    for (const row of stages) {
      // The API's spelling, so "Adults" and "adults" are one bucket (summed)
      // here exactly as they would be on the server.
      const key = stageKey(row.name)
      if (!key) continue
      if (row.count.trim() === '') continue
      const n = Number.parseInt(row.count, 10)
      if (Number.isFinite(n) && n >= 0) map[key] = (map[key] ?? 0) + n
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
      // The new bucket map goes in the same PUT, and only when it changed.
      // The API writes a count_correction event for every bucket that moved
      // (a removed bucket corrected to zero, a rename as a move out of the old
      // name and into the new one) in the same transaction, so the history
      // always explains the numbers -- one write path, one trail.
      const original = Object.fromEntries(
        Object.entries(originalCounts).map(([k, v]) => [stageKey(k), v]),
      )
      const countsChanged =
        Object.keys(stageCounts).length !== Object.keys(original).length ||
        Object.entries(stageCounts).some(([k, v]) => original[k] !== v)

      await updateColony(token, colony.id, {
        name: name.trim(),
        ...(countsChanged
          ? { stage_counts: Object.keys(stageCounts).length > 0 ? stageCounts : null }
          : {}),
        ...(speciesId !== loadedSpeciesId ? { species_id: speciesId } : {}),
        count_is_estimated: countEstimated,
        date_acquired: dateAcquired.trim() || null,
        founded_date: foundedDate.trim() || null,
        source: source || null,
        enclosure_type: enclosureType || null,
        enclosure_size: enclosureSize.trim() || null,
        location,
        substrate_type: substrateType.trim() || null,
        substrate_depth: substrateDepth.trim() || null,
        target_temp_min: tempMin.toStorage(),
        target_temp_max: tempMax.toStorage(),
        target_humidity_min: numOrNull(humidityMin),
        target_humidity_max: numOrNull(humidityMax),
        water_dish: waterDish,
        notes: notes.trim() || null,
        visibility,
        is_active: isActive,
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

          {/* Species — within the colony's taxon. "Other" has no catalog. */}
          {isInvertTaxon(colony.taxon) && colony.taxon !== 'other' && (
            <ColonySpeciesField
              taxon={colony.taxon}
              text={speciesText}
              speciesId={speciesId}
              onText={(t) => { setSpeciesText(t); setSpeciesId(null) }}
              onPick={(sp) => {
                setSpeciesId(sp.id)
                setSpeciesText(sp.scientific_name)
              }}
              onUnlink={() => { setSpeciesId(null); setSpeciesText('') }}
            />
          )}

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
            {unusedSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {unusedSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addStage(s)}
                    aria-label={`Add ${s} bucket`}
                    className="px-3 py-1 rounded-full border border-theme bg-surface text-xs font-semibold text-theme-secondary hover:text-theme-primary hover:bg-surface-elevated transition"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
            {bucketHint(colony.taxon) && (
              <p className="text-xs text-theme-tertiary mt-2">{bucketHint(colony.taxon)}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => addStage()}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                + Add stage
              </button>
              {!hasMixed && !unusedSuggestions.some((s) => stageKey(s) === 'mixed') && (
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
            {showsEnclosureOrientation(colony.taxon) && (
            <Field label="Enclosure type">
              <select
                value={enclosureType}
                onChange={(e) => setEnclosureType(e.target.value)}
                className={inputCls}
              >
                <option value="">Not set</option>
                <option value="terrestrial">Terrestrial</option>
                <option value="arboreal">Arboreal</option>
                <option value="fossorial">Fossorial</option>
              </select>
            </Field>
            )}
            <Field label="Enclosure size">
              <input
                value={enclosureSize}
                onChange={(e) => setEnclosureSize(e.target.value)}
                placeholder={enclosureSizePlaceholder(colony.taxon)}
                className={inputCls}
              />
            </Field>
            <Field label="Location">
              <LocationField token={token} value={location} onChange={setLocation} />
            </Field>
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
            <Field label={`Temp min (${tempMin.unit})`}>
              <input
                value={tempMin.value}
                onChange={(e) => tempMin.setValue(e.target.value)}
                inputMode="decimal"
                placeholder={units === 'metric' ? '22' : '72'}
                className={inputCls}
              />
            </Field>
            <Field label={`Temp max (${tempMax.unit})`}>
              <input
                value={tempMax.value}
                onChange={(e) => tempMax.setValue(e.target.value)}
                inputMode="decimal"
                placeholder={units === 'metric' ? '28' : '82'}
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

          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-theme bg-surface">
            <div className="min-w-0">
              <div id="colony-active-label" className="text-sm font-semibold text-theme-primary">
                Active colony
              </div>
              <p className="mt-0.5 text-xs text-theme-tertiary">
                Turn off to archive. An archived colony is hidden from your collection and the
                free-plan count, and its history is kept. Find it under “Archived colonies” on
                the collection page.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-labelledby="colony-active-label"
              onClick={() => setIsActive((v) => !v)}
              className={`relative flex-shrink-0 mt-0.5 w-11 h-6 rounded-full transition focus:outline-none focus:ring-2 focus:ring-electric-blue-500 ${
                isActive ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

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

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[]
}

/**
 * Species search + link for a colony (mirrors the add form, the invert edit
 * form and mobile colony/[id]/edit.tsx). Colonies have no free-text species
 * column, so only a picked species is saved: typing clears the link, and
 * "Unlink" removes it.
 */
function ColonySpeciesField({
  taxon, text, speciesId, onText, onPick, onUnlink,
}: {
  taxon: InvertTaxon
  text: string
  speciesId: string | null
  onText: (t: string) => void
  onPick: (s: SpeciesHit) => void
  onUnlink: () => void
}) {
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [open, setOpen] = useState(false)
  const [noHits, setNoHits] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Capitals, a typo or a bare epithet find nothing in the substring search;
  // the matcher catches those. Same taxon only.
  const nameMatch = useSpeciesMatch(noHits && !speciesId ? text : '', taxon)
  const suggestion = nameMatch?.match && nameMatch.match.taxon === taxon ? nameMatch.match : null

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  const change = (value: string) => {
    onText(value)
    setOpen(true)
    setNoHits(false)
    if (debounce.current) clearTimeout(debounce.current)
    if (!value.trim()) { setHits([]); return }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/invert-species/search?q=${encodeURIComponent(value.trim())}&taxon=${taxon}&limit=8`,
        )
        const rows: SpeciesHit[] = res.ok ? await res.json() : []
        setHits(rows)
        setNoHits(rows.length === 0)
      } catch {
        setHits([])
      }
    }, 250)
  }

  const pick = (sp: SpeciesHit) => {
    onPick(sp)
    setOpen(false)
    setHits([])
    setNoHits(false)
  }

  return (
    <Field label="Species">
      <div className="relative">
        <input
          value={text}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search species… (optional)"
          autoComplete="off"
          className={inputCls}
        />
        {open && hits.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-theme rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => pick(h)}
                className="w-full text-left px-3 py-2 hover:bg-surface-elevated border-b border-theme last:border-0"
              >
                <div className="text-sm italic font-semibold text-theme-primary">{h.scientific_name}</div>
                {h.common_names?.[0] && <div className="text-xs text-theme-secondary">{h.common_names[0]}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
      {speciesId ? (
        <div className="mt-1.5 flex items-center gap-3 text-xs text-theme-secondary">
          <span>Linked to the care sheet for this species.</span>
          <button
            type="button"
            onClick={onUnlink}
            className="font-semibold text-theme-primary underline underline-offset-2 hover:opacity-80"
          >
            Unlink
          </button>
        </div>
      ) : suggestion ? (
        <SpeciesSuggestion
          match={suggestion}
          currentTaxon={taxon}
          onUse={() => pick({ id: suggestion.id, scientific_name: suggestion.scientific_name, common_names: suggestion.common_name ? [suggestion.common_name] : [] })}
        />
      ) : text.trim() ? (
        <p className="mt-1 text-xs text-theme-tertiary">
          Not linked. Pick a species from the list to link its care sheet; typed text on its own isn&apos;t saved.
        </p>
      ) : (
        <p className="mt-1 text-xs text-theme-tertiary">Optional — links a care sheet. Leave blank for mixed or unlisted colonies.</p>
      )}
    </Field>
  )
}
