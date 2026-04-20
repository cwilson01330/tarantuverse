"use client"

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import FeederSpeciesAutocomplete, {
  FeederSpeciesOption,
} from '@/components/FeederSpeciesAutocomplete'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type InventoryMode = 'count' | 'life_stage'

interface EnclosureOption {
  id: string
  name: string
  purpose?: string | null
}

interface FeederColony {
  id: string
  feeder_species_id: string | null
  enclosure_id: string | null
  name: string
  inventory_mode: InventoryMode
  count: number | null
  life_stage_counts: Record<string, number> | null
  low_threshold: number | null
  food_notes: string | null
  notes: string | null
  is_active: boolean
  species_display_name: string | null
}

export default function EditFeederColonyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const colonyId = params?.id
  const { token, isAuthenticated, isLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<FeederSpeciesOption | null>(null)
  const [speciesInitialName, setSpeciesInitialName] = useState('')
  const [speciesCleared, setSpeciesCleared] = useState(false)
  const [enclosureId, setEnclosureId] = useState<string>('')
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>('count')
  const [count, setCount] = useState<string>('')
  const [lifeStageCounts, setLifeStageCounts] = useState<Record<string, string>>({})
  const [newStageName, setNewStageName] = useState('')
  const [lowThreshold, setLowThreshold] = useState<string>('')
  const [foodNotes, setFoodNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Enclosures
  const [enclosures, setEnclosures] = useState<EnclosureOption[]>([])
  const [enclosuresLoading, setEnclosuresLoading] = useState(true)

  const fetchEnclosures = useCallback(async () => {
    if (!token) return
    setEnclosuresLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/enclosures/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const all = (await res.json()) as EnclosureOption[]
        setEnclosures(all.filter((e) => (e.purpose ?? 'tarantula') === 'feeder'))
      }
    } catch {
      /* non-fatal */
    } finally {
      setEnclosuresLoading(false)
    }
  }, [token])

  const fetchColony = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-colonies/${colonyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        if (res.status === 404) throw new Error('Colony not found')
        throw new Error('Failed to load colony')
      }
      const c = (await res.json()) as FeederColony

      setName(c.name)
      setSpeciesInitialName(c.species_display_name ?? '')
      setEnclosureId(c.enclosure_id ?? '')
      setInventoryMode(c.inventory_mode)
      setCount(c.count != null ? String(c.count) : '')
      if (c.life_stage_counts) {
        const asStrings: Record<string, string> = {}
        for (const [k, v] of Object.entries(c.life_stage_counts)) {
          asStrings[k] = String(v)
        }
        setLifeStageCounts(asStrings)
      }
      setLowThreshold(c.low_threshold != null ? String(c.low_threshold) : '')
      setFoodNotes(c.food_notes ?? '')
      setNotes(c.notes ?? '')
      setIsActive(c.is_active)
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
    fetchEnclosures()
    fetchColony()
  }, [isLoading, isAuthenticated, router, fetchEnclosures, fetchColony])

  const handleSpeciesSelect = (sp: FeederSpeciesOption) => {
    setSpecies(sp)
    setSpeciesCleared(false)
    // If the user hasn't set any life-stage buckets yet and this species
    // supports them, seed the buckets. Don't overwrite existing buckets.
    if (
      sp.supports_life_stages &&
      sp.default_life_stages &&
      sp.default_life_stages.length > 0 &&
      Object.keys(lifeStageCounts).length === 0
    ) {
      const seed: Record<string, string> = {}
      sp.default_life_stages.forEach((s) => (seed[s] = ''))
      setLifeStageCounts(seed)
    }
  }

  const handleSpeciesClear = () => {
    setSpecies(null)
    setSpeciesCleared(true)
  }

  const handleModeSwitch = (next: InventoryMode) => {
    if (next === inventoryMode) return
    setInventoryMode(next)
    if (next === 'life_stage' && Object.keys(lifeStageCounts).length === 0) {
      if (species?.default_life_stages && species.default_life_stages.length > 0) {
        const seed: Record<string, string> = {}
        species.default_life_stages.forEach((s) => (seed[s] = ''))
        setLifeStageCounts(seed)
      } else {
        setLifeStageCounts({ adults: '', nymphs: '' })
      }
    }
  }

  const handleBucketChange = (key: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return
    setLifeStageCounts((prev) => ({ ...prev, [key]: value }))
  }

  const removeBucket = (key: string) => {
    setLifeStageCounts((prev) => {
      const copy = { ...prev }
      delete copy[key]
      return copy
    })
  }

  const addBucket = () => {
    const k = newStageName.trim().toLowerCase()
    if (!k) return
    if (lifeStageCounts[k] !== undefined) {
      setError(`A "${k}" bucket already exists.`)
      return
    }
    setLifeStageCounts((prev) => ({ ...prev, [k]: '' }))
    setNewStageName('')
    setError('')
  }

  const parseIntOrNull = (s: string): number | null => {
    if (s === '') return null
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token || !colonyId) {
      setError('You need to be signed in.')
      return
    }
    if (!name.trim()) {
      setError('Colony name is required.')
      return
    }
    if (inventoryMode === 'life_stage') {
      if (Object.keys(lifeStageCounts).length === 0) {
        setError('Life-stage mode needs at least one bucket.')
        return
      }
    }

    // Build PUT payload. Only include fields we manage on this form.
    const payload: Record<string, unknown> = {
      name: name.trim(),
      enclosure_id: enclosureId || null,
      inventory_mode: inventoryMode,
      low_threshold: parseIntOrNull(lowThreshold),
      food_notes: foodNotes.trim() || null,
      notes: notes.trim() || null,
      is_active: isActive,
    }

    // Species: only send if the user picked a new one or explicitly cleared it.
    if (species) {
      payload.feeder_species_id = species.id
    } else if (speciesCleared) {
      payload.feeder_species_id = null
    }
    // Otherwise omit — preserves the server-side value.

    // Inventory: preserve the other mode's data (PRD §6). We only write the
    // field matching the selected mode; the other stays untouched server-side.
    if (inventoryMode === 'count') {
      payload.count = parseIntOrNull(count)
    } else {
      const map: Record<string, number> = {}
      for (const [k, v] of Object.entries(lifeStageCounts)) {
        const n = parseIntOrNull(v)
        if (n !== null) map[k] = n
      }
      payload.life_stage_counts = map
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-colonies/${colonyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to save changes')
      }
      router.push(`/dashboard/feeders/${colonyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="h-6 w-32 rounded bg-surface-elevated animate-pulse" />
          <div className="h-10 rounded-xl bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-64 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🦗</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError}
          </h1>
          <p className="text-theme-secondary mb-6">
            It may have been deleted, or you may not have access to it.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/feeders"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Back to Feeders
            </Link>
            <button
              onClick={() => {
                setLoading(true)
                setLoadError('')
                fetchColony()
              }}
              className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/dashboard/feeders/${colonyId}`}
            className="text-sm text-theme-secondary hover:text-theme-primary transition"
          >
            ← Back to Colony
          </Link>
          <h1 className="text-3xl font-bold text-theme-primary mt-2">Edit Colony</h1>
          <p className="text-theme-secondary mt-1">
            Update inventory, species, and care details. Daily events are logged separately.
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

          {/* Name */}
          <div>
            <label htmlFor="fc-name" className="block text-sm font-medium text-theme-primary mb-1">
              Colony name <span className="text-red-500">*</span>
            </label>
            <input
              id="fc-name"
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          {/* Species */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-1">
              Feeder species
            </label>
            <FeederSpeciesAutocomplete
              onSelect={handleSpeciesSelect}
              onClear={handleSpeciesClear}
              initialValue={speciesInitialName}
            />
            <p className="text-xs text-theme-tertiary mt-1">
              Clear the field and leave it blank to unlink the species.
            </p>
          </div>

          {/* Enclosure */}
          <div>
            <label
              htmlFor="fc-enclosure"
              className="block text-sm font-medium text-theme-primary mb-1"
            >
              Enclosure
            </label>
            {enclosuresLoading ? (
              <div className="h-10 rounded-xl bg-surface-elevated animate-pulse" />
            ) : enclosures.length === 0 ? (
              <div className="p-3 rounded-xl border border-theme bg-surface-elevated text-sm text-theme-secondary">
                No feeder enclosures yet.{' '}
                <Link
                  href="/dashboard/enclosures/add?purpose=feeder"
                  className="underline text-primary-600 dark:text-primary-400 hover:opacity-80"
                >
                  Create one
                </Link>
                .
              </div>
            ) : (
              <select
                id="fc-enclosure"
                value={enclosureId}
                onChange={(e) => setEnclosureId(e.target.value)}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              >
                <option value="">— No enclosure —</option>
                {enclosures.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Inventory mode */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              Inventory mode
            </label>
            <div
              role="radiogroup"
              aria-label="Inventory mode"
              className="grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={inventoryMode === 'count'}
                onClick={() => handleModeSwitch('count')}
                className={`
                  p-4 rounded-xl border transition text-left
                  ${inventoryMode === 'count'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-theme bg-surface hover:bg-surface-elevated'
                  }
                `}
              >
                <div className="font-semibold text-theme-primary">Simple count</div>
                <div className="text-xs text-theme-tertiary mt-1">
                  One number total.
                </div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={inventoryMode === 'life_stage'}
                onClick={() => handleModeSwitch('life_stage')}
                className={`
                  p-4 rounded-xl border transition text-left
                  ${inventoryMode === 'life_stage'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-theme bg-surface hover:bg-surface-elevated'
                  }
                `}
              >
                <div className="font-semibold text-theme-primary">Life stages</div>
                <div className="text-xs text-theme-tertiary mt-1">
                  Adults, nymphs, etc. separately.
                </div>
              </button>
            </div>
            <p className="text-xs text-theme-tertiary mt-2">
              Switching modes preserves the other mode’s data so you can switch back without losing numbers.
            </p>
          </div>

          {/* Inventory inputs */}
          {inventoryMode === 'count' ? (
            <div>
              <label htmlFor="fc-count" className="block text-sm font-medium text-theme-primary mb-1">
                Current count
              </label>
              <input
                id="fc-count"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={count}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^\d+$/.test(v)) setCount(v)
                }}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                Life-stage counts
              </label>
              <div className="space-y-2">
                {Object.keys(lifeStageCounts).length === 0 && (
                  <p className="text-sm text-theme-tertiary">
                    No buckets yet. Add one below.
                  </p>
                )}
                {Object.entries(lifeStageCounts).map(([stage, value]) => (
                  <div key={stage} className="flex items-center gap-2">
                    <label
                      htmlFor={`fc-stage-${stage}`}
                      className="w-28 text-sm capitalize text-theme-secondary"
                    >
                      {stage}
                    </label>
                    <input
                      id={`fc-stage-${stage}`}
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={value}
                      onChange={(e) => handleBucketChange(stage, e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    />
                    <button
                      type="button"
                      onClick={() => removeBucket(stage)}
                      aria-label={`Remove ${stage} bucket`}
                      className="px-3 py-2 rounded-xl border border-theme bg-surface text-theme-tertiary hover:text-red-600 dark:hover:text-red-400 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add bucket */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  maxLength={30}
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Add a bucket (e.g. pinheads)"
                  className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                />
                <button
                  type="button"
                  onClick={addBucket}
                  disabled={!newStageName.trim()}
                  className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Low threshold */}
          <div>
            <label htmlFor="fc-low" className="block text-sm font-medium text-theme-primary mb-1">
              Low-stock threshold
            </label>
            <input
              id="fc-low"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={lowThreshold}
              onChange={(e) => {
                const v = e.target.value
                if (v === '' || /^\d+$/.test(v)) setLowThreshold(v)
              }}
              placeholder="Leave blank to disable low-stock alerts"
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          {/* Food notes */}
          <div>
            <label htmlFor="fc-food-notes" className="block text-sm font-medium text-theme-primary mb-1">
              Food / gut-load notes
            </label>
            <textarea
              id="fc-food-notes"
              rows={2}
              value={foodNotes}
              onChange={(e) => setFoodNotes(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="fc-notes" className="block text-sm font-medium text-theme-primary mb-1">
              Notes
            </label>
            <textarea
              id="fc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          {/* Active toggle */}
          <div className="p-4 rounded-xl border border-theme bg-surface-elevated">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-theme text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <div className="font-medium text-theme-primary">Active colony</div>
                <div className="text-xs text-theme-tertiary mt-0.5">
                  Uncheck to archive this colony. Archived colonies are hidden from the main list
                  but their history is preserved.
                </div>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/dashboard/feeders/${colonyId}`}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
