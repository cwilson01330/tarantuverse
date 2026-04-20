"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import FeederSpeciesAutocomplete, {
  FeederSpeciesOption,
} from '@/components/FeederSpeciesAutocomplete'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface EnclosureOption {
  id: string
  name: string
  purpose?: string | null
}

type InventoryMode = 'count' | 'life_stage'

export default function AddFeederColonyPage() {
  const router = useRouter()
  const { token, isAuthenticated, isLoading } = useAuth()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<FeederSpeciesOption | null>(null)
  const [enclosureId, setEnclosureId] = useState<string>('')
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>('count')
  const [count, setCount] = useState<string>('')
  const [lifeStageCounts, setLifeStageCounts] = useState<Record<string, string>>({})
  const [lowThreshold, setLowThreshold] = useState<string>('')
  const [foodNotes, setFoodNotes] = useState('')
  const [notes, setNotes] = useState('')

  // Enclosure options (strict: purpose='feeder', owned by user)
  const [enclosures, setEnclosures] = useState<EnclosureOption[]>([])
  const [enclosuresLoading, setEnclosuresLoading] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchEnclosures()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, token])

  const fetchEnclosures = async () => {
    if (!token) return
    setEnclosuresLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/enclosures/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const all = (await res.json()) as EnclosureOption[]
        // Strict filter: only show enclosures marked as feeder bins
        setEnclosures(all.filter((e) => (e.purpose ?? 'tarantula') === 'feeder'))
      }
    } catch {
      // non-fatal — user can still save without an enclosure
    } finally {
      setEnclosuresLoading(false)
    }
  }

  const handleSpeciesSelect = (sp: FeederSpeciesOption) => {
    setSpecies(sp)
    // Auto-configure inventory mode & buckets based on species default
    if (sp.supports_life_stages && sp.default_life_stages && sp.default_life_stages.length > 0) {
      setInventoryMode('life_stage')
      const buckets: Record<string, string> = {}
      sp.default_life_stages.forEach((stage) => {
        buckets[stage] = lifeStageCounts[stage] ?? ''
      })
      setLifeStageCounts(buckets)
    } else {
      setInventoryMode('count')
    }
  }

  const handleSpeciesClear = () => {
    setSpecies(null)
  }

  const handleModeSwitch = (next: InventoryMode) => {
    if (next === inventoryMode) return
    setInventoryMode(next)
    // Preserve both sides — PRD §6 "Always preserve"
    if (next === 'life_stage' && Object.keys(lifeStageCounts).length === 0) {
      // Seed from species default or sensible fallback
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
    // Only allow non-negative integers (or empty)
    if (value !== '' && !/^\d+$/.test(value)) return
    setLifeStageCounts((prev) => ({ ...prev, [key]: value }))
  }

  const parseIntOrNull = (s: string): number | null => {
    if (s === '') return null
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
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
    if (inventoryMode === 'life_stage') {
      const hasAnyBucket = Object.values(lifeStageCounts).some((v) => v.trim() !== '')
      if (!hasAnyBucket) {
        setError('Life-stage mode needs at least one bucket count (you can use 0).')
        return
      }
    }

    // Build payload
    const payload: Record<string, unknown> = {
      name: name.trim(),
      feeder_species_id: species?.id ?? null,
      enclosure_id: enclosureId || null,
      inventory_mode: inventoryMode,
      low_threshold: parseIntOrNull(lowThreshold),
      food_notes: foodNotes.trim() || null,
      notes: notes.trim() || null,
    }

    if (inventoryMode === 'count') {
      payload.count = parseIntOrNull(count)
      payload.life_stage_counts = null
    } else {
      // Convert string buckets to integer map, dropping empty values
      const map: Record<string, number> = {}
      for (const [k, v] of Object.entries(lifeStageCounts)) {
        const n = parseIntOrNull(v)
        if (n !== null) map[k] = n
      }
      payload.life_stage_counts = map
      payload.count = null
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/feeder-colonies/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to create colony')
      }
      const created = await res.json()
      router.push(`/dashboard/feeders/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/feeders"
            className="text-sm text-theme-secondary hover:text-theme-primary transition"
          >
            ← Back to Feeders
          </Link>
          <h1 className="text-3xl font-bold text-theme-primary mt-2">Add Feeder Colony</h1>
          <p className="text-theme-secondary mt-1">
            A colony is one container of a single feeder species.
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
              placeholder="e.g. Main hisser bin"
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
              initialValue={species?.scientific_name ?? ''}
            />
            <p className="text-xs text-theme-tertiary mt-1">
              Optional, but selecting one auto-fills life-stage buckets and care hints.
            </p>
          </div>

          {/* Enclosure (strict feeder purpose) */}
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
                </Link>{' '}
                to link this colony to a physical bin. You can skip for now.
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
            <p className="text-xs text-theme-tertiary mt-1">
              Only enclosures marked as feeder bins appear here.
            </p>
          </div>

          {/* Inventory mode toggle */}
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
                  One number (“~200 crickets”).
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
                  Track adults, nymphs, etc. separately.
                </div>
              </button>
            </div>
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
                placeholder="e.g. 200"
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
                    Pick a feeder species above to seed life-stage buckets.
                  </p>
                )}
                {Object.entries(lifeStageCounts).map(([stage, value]) => (
                  <div key={stage} className="flex items-center gap-3">
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low threshold */}
          <div>
            <label
              htmlFor="fc-low"
              className="block text-sm font-medium text-theme-primary mb-1"
            >
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
              placeholder="Alert me when total drops below this"
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
            <p className="text-xs text-theme-tertiary mt-1">
              Optional. Leave blank to skip low-stock alerts for this colony.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="fc-food-notes"
              className="block text-sm font-medium text-theme-primary mb-1"
            >
              Food / gut-load notes
            </label>
            <textarea
              id="fc-food-notes"
              rows={2}
              value={foodNotes}
              onChange={(e) => setFoodNotes(e.target.value)}
              placeholder="e.g. Dry oats + carrot slice, water crystals"
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          <div>
            <label
              htmlFor="fc-notes"
              className="block text-sm font-medium text-theme-primary mb-1"
            >
              Notes
            </label>
            <textarea
              id="fc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth remembering about this colony"
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/dashboard/feeders"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Create Colony'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
