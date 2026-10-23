'use client'

/**
 * "Pick animals" for an expense split: the keeper's living inverts grouped by
 * taxon, plus open colonies as their own "Colonies" group. Each group has a
 * Select all / Clear toggle.
 *
 * Loads with the loaders the collection page already uses — GET
 * /inverts/feeding-status (every living taxon in one call) and lib/colonies
 * listColonies — scoped to the chosen collection when a co-keeper logs into
 * someone else's. The list itself is loaded by the form (`useLivingAnimals`).
 */
import { useEffect, useMemo, useState } from 'react'
import { INVERT_TAXA, animalDisplayName, taxonMeta } from '@/lib/inverts'
import { listColonies } from '@/lib/colonies'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PickAnimal {
  id: string
  taxon: string
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
}

interface PickColony {
  id: string
  name: string
}

export interface PickedAnimals {
  inverts: string[]
  colonies: string[]
}

interface Group {
  key: string
  label: string
  kind: 'invert' | 'colony'
  items: { id: string; label: string }[]
}

const TAXON_ORDER = Object.keys(INVERT_TAXA)

async function loadInverts(token: string, collection: string | null): Promise<PickAnimal[]> {
  const qs = new URLSearchParams({ tz_offset_minutes: String(new Date().getTimezoneOffset()) })
  if (collection) qs.set('collection', collection)
  const res = await fetch(`${API_URL}/api/v1/inverts/feeding-status?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Could not load your animals')
  const rows = await res.json()
  return Array.isArray(rows) ? (rows as PickAnimal[]) : []
}

/** The keeper's living animals and open colonies for one collection. */
export interface LivingAnimals {
  inverts: PickAnimal[]
  colonies: PickColony[]
}

export interface LivingState {
  /** Null until the list for THIS collection has loaded. */
  data: LivingAnimals | null
  loading: boolean
  error: string | null
  /** Try the load again after a failure. */
  retry: () => void
}

/**
 * Loads the living list while `enabled`, again when the collection changes
 * (the old ids belong to another collection); a response for a collection the
 * keeper has since left is ignored. Lives in the form, not the picker, so the
 * form can tell which saved split targets are still living before the picker is
 * ever shown.
 */
export function useLivingAnimals(token: string, collection: string | null, enabled: boolean): LivingState {
  const key = collection ?? 'own'
  const [loaded, setLoaded] = useState<(LivingAnimals & { key: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    if (loaded && loaded.key === key) return
    let alive = true
    setError(null)
    Promise.all([
      loadInverts(token, collection),
      // No fallback: a colonies failure fails the whole list. A partial list would
      // make saved colony shares look like "no longer in your collection".
      listColonies(token, false, collection),
    ])
      .then(([a, c]) => {
        if (alive) setLoaded({ key, inverts: a, colonies: c.map((x) => ({ id: x.id, name: x.name })) })
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your animals')
      })
    return () => {
      alive = false
    }
  }, [enabled, token, collection, key, loaded, attempt])

  const data = loaded && loaded.key === key ? loaded : null
  return { data, loading: enabled && !data && !error, error: data ? null : error, retry: () => setAttempt((n) => n + 1) }
}

interface Props {
  /** The living list, loaded by the form (`useLivingAnimals`). */
  living: LivingState
  value: PickedAnimals
  onChange: (next: PickedAnimals) => void
}

export default function ExpenseAnimalPicker({ living, value, onChange }: Props) {
  const { loading, error } = living
  const inverts = useMemo(() => living.data?.inverts ?? [], [living.data])
  const colonies = useMemo(() => living.data?.colonies ?? [], [living.data])

  const groups = useMemo<Group[]>(() => {
    const byTaxon = new Map<string, Group>()
    for (const a of inverts) {
      const key = a.taxon in INVERT_TAXA ? a.taxon : 'other'
      let g = byTaxon.get(key)
      if (!g) {
        g = { key, label: taxonMeta(key).label, kind: 'invert', items: [] }
        byTaxon.set(key, g)
      }
      g.items.push({ id: a.id, label: animalDisplayName(a) })
    }
    const out: Group[] = TAXON_ORDER.filter((t) => byTaxon.has(t)).map((t) => byTaxon.get(t) as Group)
    for (const g of out) g.items.sort((x, y) => x.label.localeCompare(y.label))
    if (colonies.length) {
      out.push({
        key: '__colonies__',
        label: 'Colonies',
        kind: 'colony',
        items: colonies.map((c) => ({ id: c.id, label: c.name })).sort((x, y) => x.label.localeCompare(y.label)),
      })
    }
    return out
  }, [inverts, colonies])

  const picked = (g: Group) => new Set(g.kind === 'invert' ? value.inverts : value.colonies)

  const setGroupIds = (g: Group, ids: string[]) => {
    onChange(g.kind === 'invert' ? { ...value, inverts: ids } : { ...value, colonies: ids })
  }

  const toggleOne = (g: Group, id: string) => {
    const set = picked(g)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setGroupIds(g, Array.from(set))
  }

  const toggleGroup = (g: Group) => {
    const set = picked(g)
    const all = g.items.every((i) => set.has(i.id))
    if (all) {
      // Clear only this group's rows; ids from elsewhere stay.
      const ours = new Set(g.items.map((i) => i.id))
      setGroupIds(g, Array.from(set).filter((id) => !ours.has(id)))
    } else {
      for (const i of g.items) set.add(i.id)
      setGroupIds(g, Array.from(set))
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading your animals…</p>
  }
  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={living.retry}
          className="text-sm font-semibold text-primary-700 dark:text-primary-400 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }
  if (groups.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No living animals or open colonies to pick from.</p>
  }

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
      {groups.map((g) => {
        const set = picked(g)
        const n = g.items.filter((i) => set.has(i.id)).length
        const all = n === g.items.length
        return (
          <fieldset key={g.key} className="p-3">
            <legend className="sr-only">{g.label}</legend>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {g.label}{' '}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  ({n}/{g.items.length})
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggleGroup(g)}
                className="text-xs font-semibold text-primary-700 dark:text-primary-400 hover:underline"
              >
                {all ? 'Clear' : 'Select all'}
              </button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {g.items.map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={set.has(i.id)}
                      onChange={() => toggleOne(g, i.id)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="truncate">{i.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
