'use client'

/**
 * Add colony (web) — ADR-010 Colony mode.
 *
 * Reads ?taxon= to preselect the taxon, then posts to POST /colonies/ with a
 * per-life-stage bucket editor. On 402 (free-tier cap) shows the UpgradeModal.
 *
 * useSearchParams requires a Suspense boundary for the Next static prerender,
 * so the form lives in an inner component.
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import {
  ColonyLimitError,
  createColony,
  type ColonySource,
  type ColonyTaxon,
} from '@/lib/colonies'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Colony taxon options — every invert taxon except tarantula.
const COLONY_TAXA: ColonyTaxon[] = [
  'scorpion',
  'centipede',
  'whip_spider',
  'vinegaroon',
  'true_spider',
  'millipede',
  'mantis',
  'roach',
  'other',
]

const DEFAULT_STAGES = ['adults', 'juveniles', 'nymphs']

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[]
}

interface StageRow {
  key: string // stable react key
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

function AddColonyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token } = useAuth()

  const taxonParam = searchParams.get('taxon')
  const initialTaxon: ColonyTaxon =
    taxonParam && isInvertTaxon(taxonParam) && taxonParam !== 'tarantula'
      ? (taxonParam as ColonyTaxon)
      : 'roach'

  const [taxon, setTaxon] = useState<ColonyTaxon>(initialTaxon)
  const [name, setName] = useState('')
  const [speciesId, setSpeciesId] = useState<string | null>(null)

  const [stages, setStages] = useState<StageRow[]>(
    DEFAULT_STAGES.map((s) => makeStageRow(s)),
  )
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

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null)

  // Species autocomplete (scoped to the selected taxon)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [open, setOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return
    router.prefetch?.('/dashboard/colonies')
  }, [token, router])

  const onQueryChange = (text: string) => {
    setQuery(text)
    setSpeciesId(null)
    setOpen(true)
    if (debounce.current) clearTimeout(debounce.current)
    if (!text.trim()) {
      setHits([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/invert-species/search?q=${encodeURIComponent(
            text.trim(),
          )}&taxon=${taxon}&limit=8`,
        )
        setHits(res.ok ? await res.json() : [])
      } catch {
        setHits([])
      }
    }, 250)
  }

  const pickSpecies = (s: SpeciesHit) => {
    setSpeciesId(s.id)
    setQuery(s.scientific_name)
    if (!name && s.common_names?.[0]) setName(s.common_names[0])
    setOpen(false)
    setHits([])
  }

  const updateStageName = (key: string, value: string) => {
    setStages((prev) => prev.map((r) => (r.key === key ? { ...r, name: value } : r)))
  }
  const updateStageCount = (key: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return
    setStages((prev) => prev.map((r) => (r.key === key ? { ...r, count: value } : r)))
  }
  const removeStage = (key: string) => {
    setStages((prev) => prev.filter((r) => r.key !== key))
  }
  const addStage = (name = '') => {
    setStages((prev) => [...prev, makeStageRow(name)])
  }
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
    if (!token) {
      setError('You need to be signed in.')
      return
    }
    if (!name.trim()) {
      setError('Give the colony a name.')
      return
    }

    const stageCounts = buildStageCounts()

    const numOrNull = (s: string): number | null => {
      if (s.trim() === '') return null
      const n = Number.parseFloat(s)
      return Number.isFinite(n) ? n : null
    }

    setSaving(true)
    try {
      const created = await createColony(token, {
        name: name.trim(),
        taxon,
        species_id: speciesId,
        date_acquired: dateAcquired.trim() || null,
        founded_date: foundedDate.trim() || null,
        source: source || null,
        stage_counts: Object.keys(stageCounts).length > 0 ? stageCounts : null,
        count_is_estimated: countEstimated,
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
      router.replace(`/dashboard/colonies/${created.id}`)
    } catch (err) {
      if (err instanceof ColonyLimitError) {
        const limit = err.detail?.limit
        setUpgradeMsg(
          err.detail?.message ||
            `You've reached the free plan limit${
              typeof limit === 'number' ? ` of ${limit} animals` : ''
            }. Upgrade to Premium for unlimited tracking.`,
        )
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard/tarantulas"
            className="text-sm text-theme-secondary hover:text-theme-primary transition"
          >
            ← Back to collection
          </Link>
          <h1 className="text-3xl font-bold text-theme-primary mt-2">
            {INVERT_TAXA[taxon].glyph} Add a colony
          </h1>
          <p className="text-theme-secondary mt-1">
            A colony tracks a whole population as one entry — with per-life-stage
            headcounts, not individual animals.
          </p>
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

          {/* Taxon picker */}
          <Field label="Taxon">
            <div className="flex flex-wrap gap-2">
              {COLONY_TAXA.map((t) => {
                const active = taxon === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTaxon(t)
                      setSpeciesId(null)
                    }}
                    className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                      active
                        ? 'bg-gradient-brand text-white shadow-md'
                        : 'bg-surface border border-theme text-theme-secondary hover:text-theme-primary'
                    }`}
                    aria-pressed={active}
                  >
                    {INVERT_TAXA[t].glyph} {INVERT_TAXA[t].label}
                  </button>
                )
              })}
            </div>
          </Field>

          {/* Name */}
          <Field label="Colony name *">
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dubia breeding bin"
              className={inputCls}
            />
          </Field>

          {/* Species autocomplete */}
          <Field label="Species">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
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
                      onClick={() => pickSpecies(h)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-elevated border-b border-theme last:border-0"
                    >
                      <div className="text-sm italic font-semibold text-theme-primary">
                        {h.scientific_name}
                      </div>
                      {h.common_names?.[0] && (
                        <div className="text-xs text-theme-secondary">{h.common_names[0]}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-theme-tertiary mt-1">
              Optional — links a care sheet. Leave blank for mixed or unlisted colonies.
            </p>
          </Field>

          {/* Life-stage bucket editor */}
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
              These counts are estimates (~50 is a valid answer)
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
              placeholder="Anything else worth remembering about this colony"
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/dashboard/tarantulas"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Create colony'}
            </button>
          </div>
        </form>
      </div>

      <UpgradeModal
        isOpen={upgradeMsg !== null}
        onClose={() => setUpgradeMsg(null)}
        feature="Unlimited Animals"
        description={upgradeMsg ?? ''}
      />
    </DashboardLayout>
  )
}

export default function AddColonyPage() {
  return (
    <Suspense fallback={null}>
      <AddColonyForm />
    </Suspense>
  )
}
