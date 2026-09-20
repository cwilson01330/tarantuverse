"use client"

/**
 * New pairing, from the breeding hub.
 *
 * WHAT CHANGED AND WHY (2026-09-20)
 * ---------------------------------
 * This page used to fetch `/tarantulas/`, so it could only ever pair
 * tarantulas. A keeper who enabled breeding for another taxon found the hub
 * offering an empty dropdown and no explanation — the animal simply wasn't
 * there. That's how the first jumping-spider pairing failed.
 *
 * It now fetches `/inverts/`, which is every taxon on the unified surface, and
 * POSTs to `/inverts/pairings` — the taxon-agnostic endpoint. That endpoint is
 * also the only one with server-side guards (same-taxon, same-sex, swapped
 * slots); the legacy `/pairings/` route has none, so routing everything
 * through the generic one removes a second code path rather than adding one.
 *
 * SCOPING, FOR COLLECTIONS THAT AREN'T SMALL
 * ------------------------------------------
 * The largest account here holds 1,221 animals. An unfiltered "pick a mate"
 * list is unusable at that size, so the candidate list narrows in three steps:
 *
 *   1. taxon — once either slot is filled. The server refuses a mixed-taxon
 *      pairing outright, so offering one is purely a way to waste a click.
 *   2. species — DEFAULT, not mandatory. Same species is what a breeder wants
 *      almost every time.
 *   3. free-text search — because one species can still be a long list.
 *
 * Step 2 is a default rather than a filter on purpose. Roughly 40% of animals
 * have no linked species, and a strict species filter would hide every one of
 * them with no explanation — the keeper would conclude their animal had
 * vanished. "Show all <taxon>" widens it, and an animal with no species is
 * always offered, since absence of data isn't evidence of a mismatch.
 */

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'
import DateInput from '@/components/DateInput'
import { toISODateLocal } from '@/lib/date'
import { INVERT_TAXA, isInvertTaxon, taxonHasModule } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Animal {
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  sex: string | null
  taxon: string
  species_id: string | null
}

/**
 * 'male' | 'female' | null. Case-insensitive defensively, not to fix a bug. The DB stores the
 * enum NAME ('FEMALE') because SQLEnum has no values_callable, but SQLAlchemy
 * loads it back as the Sex enum and Pydantic serialises .value — so the API
 * returns lowercase. Normalising means a change at either layer can't silently
 * make this match nothing. 'unknown' maps to null: it means "no information",
 * not a third sex.
 */
function sexOf(a: Animal): 'male' | 'female' | null {
  const s = (a.sex ?? '').toLowerCase()
  return s === 'male' || s === 'female' ? s : null
}

function displayName(a: Animal): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed'
}

/**
 * Same species? species_id first, scientific_name as a fallback for animals
 * added before the autocomplete existed. Returns null — not false — when
 * either side lacks the data, so callers can distinguish "different" from
 * "can't tell" and treat the latter as offerable.
 */
function sameSpecies(a: Animal, b: Animal): boolean | null {
  if (a.species_id && b.species_id) return a.species_id === b.species_id
  const an = a.scientific_name?.trim().toLowerCase()
  const bn = b.scientific_name?.trim().toLowerCase()
  if (an && bn) return an === bn
  return null
}

export default function AddPairingPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [animals, setAnimals] = useState<Animal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [widenSpecies, setWidenSpecies] = useState(false)
  const [maleSearch, setMaleSearch] = useState('')
  const [femaleSearch, setFemaleSearch] = useState('')

  const [formData, setFormData] = useState({
    male_id: '',
    female_id: '',
    paired_date: toISODateLocal(new Date()),
    separated_date: '',
    pairing_type: 'natural',
    outcome: 'in_progress',
    notes: '',
  })

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    ;(async () => {
      try {
        // Every taxon, active only. The endpoint already excludes deceased and
        // transferred animals by default (ADR-015).
        const res = await fetch(`${API_URL}/api/v1/inverts/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load your collection')
        const data = await res.json()
        setAnimals(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Error loading collection:', err)
        setError('Could not load your collection.')
      }
    })()
  }, [router, isAuthenticated, isLoading, token])

  const male = animals.find((a) => a.id === formData.male_id) ?? null
  const female = animals.find((a) => a.id === formData.female_id) ?? null
  // Whichever slot was filled first pins the taxon for the other.
  const pinned = male ?? female

  const candidates = (slot: 'male' | 'female'): Animal[] => {
    const other = slot === 'male' ? female : male
    const search = (slot === 'male' ? maleSearch : femaleSearch).trim().toLowerCase()
    const wantSex = slot === 'male' ? 'male' : 'female'

    return animals.filter((a) => {
      if (other && a.id === other.id) return false
      // Unsexed animals stay offerable in both slots — plenty of pairings are
      // set up before sex is confirmed, and hiding them was the old bug.
      const s = sexOf(a)
      if (s && s !== wantSex) return false
      if (pinned && a.taxon !== pinned.taxon) return false
      if (!widenSpecies && other && sameSpecies(a, other) === false) return false
      if (search) {
        const haystack = [a.name, a.common_name, a.scientific_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }

  const males = useMemo(
    () => candidates('male'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animals, formData.female_id, maleSearch, widenSpecies],
  )
  const females = useMemo(
    () => candidates('female'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animals, formData.male_id, femaleSearch, widenSpecies],
  )

  // Only warn about breeding not being enabled for a taxon the keeper actually
  // picked — the server will still accept the pairing, but the detail screen
  // won't show it, which would be confusing.
  const pinnedTaxonUnsupported =
    pinned && isInvertTaxon(pinned.taxon) && !taxonHasModule(pinned.taxon, 'breeding')

  const crossSpecies = male && female ? sameSpecies(male, female) === false : false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) { setError('Not authenticated'); return }
    if (!formData.male_id || !formData.female_id) {
      setError('Pick both a male and a female.')
      return
    }
    if (formData.male_id === formData.female_id) {
      setError('An animal can’t be paired with itself.')
      return
    }

    try {
      setLoading(true)
      setError('')
      // Generic endpoint — works for every taxon, and carries the server-side
      // guards the legacy /pairings/ route lacks. It writes the legacy
      // male_id/female_id itself for tarantulas (shared primary key).
      const res = await fetch(`${API_URL}/api/v1/inverts/pairings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          male_invert_id: formData.male_id,
          female_invert_id: formData.female_id,
          paired_date: formData.paired_date,
          separated_date: formData.separated_date || null,
          pairing_type: formData.pairing_type,
          outcome: formData.outcome,
          notes: formData.notes || null,
        }),
      })

      if (res.status === 402) { setShowUpgrade(true); setLoading(false); return }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const d = body.detail
        throw new Error(typeof d === 'string' ? d : d?.message || 'Failed to create pairing')
      }
      // The server advises rather than refuses on a cross-species pairing; it
      // records what the keeper did. Show the note, don't swallow it.
      const saved = await res.json().catch(() => null)
      if (saved?.warnings?.length) alert(saved.warnings.join('\n\n'))
      router.push('/dashboard/breeding')
    } catch (err: any) {
      console.error('Error creating pairing:', err)
      setError(err.message || 'Failed to create pairing')
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-900 dark:text-white">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  const selectCls =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white'

  const renderOption = (a: Animal) => (
    <option key={a.id} value={a.id}>
      {displayName(a)}
      {sexOf(a) ? '' : ' (sex unknown)'}
      {a.scientific_name && (a.name || a.common_name) ? ` — ${a.scientific_name}` : ''}
    </option>
  )

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/dashboard/breeding" className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
            ← Back to Breeding
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">New Pairing</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Record a breeding pairing. Pick either animal first — the other list narrows to match.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {animals.length < 2 ? (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">Not enough animals yet</h3>
            <p className="text-yellow-800 dark:text-yellow-300 mb-4">
              You need at least two animals in your collection to record a pairing.
            </p>
            <Link href="/dashboard/tarantulas" className="mt-2 inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition">
              Go to your collection
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            {pinned && (
              <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
                <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                  Showing {INVERT_TAXA[pinned.taxon as keyof typeof INVERT_TAXA]?.label.toLowerCase() ?? pinned.taxon}s
                </span>
                <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={widenSpecies} onChange={(e) => setWidenSpecies(e.target.checked)} />
                  Show other species too
                </label>
              </div>
            )}

            {pinnedTaxonUnsupported && (
              <div className="mb-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                Breeding isn’t switched on for this animal group yet, so the pairing will save but won’t appear on the animal’s own page.
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Male *</label>
              <input
                type="text"
                value={maleSearch}
                onChange={(e) => setMaleSearch(e.target.value)}
                placeholder="Search by name or species…"
                className={`${selectCls} mb-2`}
              />
              <select value={formData.male_id} onChange={(e) => setFormData({ ...formData, male_id: e.target.value })} required className={selectCls}>
                <option value="">Select a male...</option>
                {males.map(renderOption)}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {males.length} {males.length === 1 ? 'match' : 'matches'}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Female *</label>
              <input
                type="text"
                value={femaleSearch}
                onChange={(e) => setFemaleSearch(e.target.value)}
                placeholder="Search by name or species…"
                className={`${selectCls} mb-2`}
              />
              <select value={formData.female_id} onChange={(e) => setFormData({ ...formData, female_id: e.target.value })} required className={selectCls}>
                <option value="">Select a female...</option>
                {females.map(renderOption)}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {females.length} {females.length === 1 ? 'match' : 'matches'}
              </p>
            </div>

            {crossSpecies && (
              <div className="mb-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                These two are different species. Cross-species pairings rarely produce viable young and are discouraged — you can still record it.
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Paired Date *</label>
              <DateInput value={formData.paired_date} onChange={(value) => setFormData({ ...formData, paired_date: value })} />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Separated Date</label>
              <DateInput value={formData.separated_date} onChange={(value) => setFormData({ ...formData, separated_date: value })} />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pairing Type *</label>
              <select value={formData.pairing_type} onChange={(e) => setFormData({ ...formData, pairing_type: e.target.value })} required className={selectCls}>
                <option value="natural">Natural</option>
                <option value="assisted">Assisted</option>
                <option value="forced">Forced</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Outcome *</label>
              <select value={formData.outcome} onChange={(e) => setFormData({ ...formData, outcome: e.target.value })} required className={selectCls}>
                <option value="in_progress">In Progress</option>
                <option value="successful">Successful</option>
                <option value="unsuccessful">Unsuccessful</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                placeholder="Any observations or notes about this pairing..."
                className={selectCls}
              />
            </div>

            <div className="flex gap-4">
              <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
                {loading ? 'Creating...' : 'Create Pairing'}
              </button>
              <Link href="/dashboard/breeding" className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-center">
                Cancel
              </Link>
            </div>
          </form>
        )}

        <UpgradeModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          feature="Breeding Module"
          description="Track pairings and offspring across the season. Upgrade to unlock breeding for your whole collection."
        />
      </div>
    </DashboardLayout>
  )
}
