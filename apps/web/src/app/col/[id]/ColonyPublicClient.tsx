'use client'

/**
 * Public profile for a population colony — the destination for its QR code.
 *
 * Modelled on `/i/{id}` and exactly as private: the API applies the same rule
 * (owner sees their own; everyone else only when the keeper's collection is
 * public). A colony's headline fact is its population rather than a sex or a
 * last-fed date, so that is what the card leads with.
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUnits } from '@/components/UnitsProvider'
import { formatTempRange } from '@/lib/units'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PublicPhoto {
  id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
}

interface PublicColony {
  id: string
  taxon: string
  name: string
  display_name: string
  common_name: string | null
  scientific_name: string | null
  photo_url: string | null
  is_owner: boolean
  owner_username: string | null
  population: {
    total: number
    stage_counts: Record<string, number>
    is_estimated: boolean
  }
  species: {
    id: string
    scientific_name: string
    common_names: string[]
    care_level: string | null
    temperature_min: number | null
    temperature_max: number | null
    humidity_min: number | null
    humidity_max: number | null
    venom_severity: string | null
    defensive_secretion: string | null
    can_fly: boolean | null
    can_climb_smooth: boolean | null
    image_url: string | null
  } | null
  photos: PublicPhoto[]
}

const TAXON_LABEL: Record<string, string> = {
  tarantula: 'Tarantula',
  scorpion: 'Scorpion',
  centipede: 'Centipede',
  whip_spider: 'Whip spider',
  vinegaroon: 'Vinegaroon',
  true_spider: 'Spider',
  millipede: 'Millipede',
  mantis: 'Mantis',
  roach: 'Roach',
  isopod: 'Isopod',
  other: 'Invertebrate',
}

const SECRETION_LABEL: Record<string, string> = {
  benzoquinone: 'Secretes benzoquinones — stains and stings. Wash your hands.',
  hydrogen_cyanide: 'Secretes hydrogen cyanide when stressed. Handle in ventilated space.',
  acetic_acid: 'Sprays acetic acid. Keep it below face level.',
  other: 'Has a chemical defence. Wash your hands after handling.',
}

function stageLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export default function ColonyPublicClient() {
  // The VIEWER's units (their setting, or their browser region when signed out).
  const { units } = useUnits()
  const params = useParams()
  const id = params?.id as string

  const [colony, setColony] = useState<PublicColony | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Sent when present so the owner is recognised, but the page works
      // unauthenticated — that's the point of a QR code.
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      const res = await fetch(`${API_URL}/api/v1/col/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 403) throw new Error('This keeper’s collection is private.')
      if (res.status === 404) throw new Error('No colony with that code.')
      if (!res.ok) throw new Error('Could not load this colony.')
      setColony(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-xl mx-auto">
          <div className="h-56 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="h-8 w-52 mt-4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>
      </main>
    )
  }

  if (error || !colony) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{error || 'Not found.'}</p>
          <Link href="/" className="inline-block mt-4 text-sm font-semibold text-primary-600 hover:underline">
            Go to Tarantuverse
          </Link>
        </div>
      </main>
    )
  }

  const sp = colony.species
  const hero = colony.photo_url || colony.photos[0]?.url || sp?.image_url || null
  const secretion =
    sp?.defensive_secretion && sp.defensive_secretion !== 'none'
      ? SECRETION_LABEL[sp.defensive_secretion] ?? SECRETION_LABEL.other
      : null
  const stages = Object.entries(colony.population.stage_counts).filter(([, n]) => n > 0)
  const total = colony.population.total.toLocaleString()

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-16">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt={colony.display_name} className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">No photo yet</span>
            </div>
          )}

          <div className="p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {TAXON_LABEL[colony.taxon] ?? colony.taxon}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300">
                Colony
              </span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{colony.display_name}</h1>
            {colony.scientific_name && (
              <p className="text-sm italic text-gray-500 dark:text-gray-400">{colony.scientific_name}</p>
            )}
            {colony.owner_username && (
              <p className="text-xs text-gray-400 mt-1">
                Kept by{' '}
                <Link href={`/keeper/${colony.owner_username}`} className="text-primary-600 hover:underline">
                  {colony.owner_username}
                </Link>
              </p>
            )}
          </div>
        </div>

        {(sp?.venom_severity === 'medically_significant' || secretion) && (
          <div className="mt-4 space-y-3">
            {sp?.venom_severity === 'medically_significant' && (
              <div className="rounded-xl border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
                <p className="font-bold text-sm text-red-800 dark:text-red-300">Medically significant venom</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                  A bite can require medical attention. Experienced keepers only.
                </p>
              </div>
            )}
            {secretion && (
              <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4">
                <p className="font-bold text-sm text-amber-800 dark:text-amber-300">Chemical defence</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">{secretion}</p>
              </div>
            )}
          </div>
        )}

        {(sp?.can_fly === true || sp?.can_climb_smooth === true) && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              Before you open it
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
              {sp.can_fly === true && <li>· This species can fly.</li>}
              {sp.can_climb_smooth === true && <li>· Climbs smooth surfaces — check the barrier.</li>}
            </ul>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Population</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {colony.population.is_estimated ? '≈' : ''}
            {total}
          </p>
          {colony.population.is_estimated && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Estimated count</p>
          )}
          {stages.length > 0 && (
            <div className="mt-3">
              {stages.map(([key, n]) => (
                <Row key={key} label={stageLabel(key)} value={n.toLocaleString()} />
              ))}
            </div>
          )}
        </div>

        {sp && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Care at a glance
            </p>
            {(sp.temperature_min || sp.temperature_max) && (
              <Row label="Temperature" value={formatTempRange(sp.temperature_min, sp.temperature_max, units) ?? ''} />
            )}
            {(sp.humidity_min || sp.humidity_max) && (
              <Row label="Humidity" value={`${sp.humidity_min ?? '?'}–${sp.humidity_max ?? '?'}%`} />
            )}
            {sp.care_level && <Row label="Care level" value={sp.care_level} />}
            <Link
              href={`/species/inverts/${sp.id}`}
              className="inline-block mt-3 text-sm font-semibold text-primary-600 hover:underline"
            >
              Full care sheet →
            </Link>
          </div>
        )}

        {colony.photos.length > 1 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {colony.photos.slice(0, 9).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.thumbnail_url || p.url}
                alt={p.caption || colony.display_name}
                className="w-full aspect-square object-cover rounded-lg"
              />
            ))}
          </div>
        )}

        {colony.is_owner && (
          <Link
            href={`/dashboard/colonies/${colony.id}`}
            className="mt-5 block w-full text-center px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition"
          >
            Open in my collection
          </Link>
        )}
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{value}</span>
    </div>
  )
}
