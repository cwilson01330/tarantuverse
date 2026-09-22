'use client'

/**
 * Public profile for any invert — the destination for its QR code.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/t/{id}` reads the legacy tarantula table, so it errors for a mantis,
 * jumper or isopod. Mobile has been generating enclosure labels for every
 * taxon and pointing all of them at `/t/{id}`, which meant a keeper could
 * print a label, stick it on a mantis tub, scan it, and get an error on the
 * one page that exists to say what's in the enclosure.
 *
 * DELIBERATELY SMALLER THAN THE TARANTULA PAGE
 * --------------------------------------------
 * That page has grown quick-feed, molt logging and a lineage tree. This one
 * answers the question a scan actually asks — what is this animal, what does
 * it need, when was it last fed — and sends the owner to the full detail
 * screen for anything else. A second 800-line page to keep in sync is how the
 * two drift.
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PublicPhoto {
  id: string
  url: string
  thumbnail_url: string | null
  caption: string | null
}

interface PublicInvert {
  id: string
  taxon: string
  display_name: string
  common_name: string | null
  scientific_name: string | null
  sex: string | null
  photo_url: string | null
  is_owner: boolean
  owner_username: string | null
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
  last_feeding: { date: string; food_type: string | null; accepted: boolean } | null
  last_molt: { date: string } | null
  husbandry?: Record<string, unknown>
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

function daysAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default function PublicInvertProfilePage() {
  const params = useParams()
  const id = params?.id as string

  const [animal, setAnimal] = useState<PublicInvert | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Sent when present so the owner sees their own private fields, but the
      // page works fine unauthenticated — that's the point of a QR code.
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      const res = await fetch(`${API_URL}/api/v1/i/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 403) throw new Error('This keeper’s collection is private.')
      if (res.status === 404) throw new Error('No animal with that code.')
      if (!res.ok) throw new Error('Could not load this animal.')
      setAnimal(await res.json())
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

  if (error || !animal) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {error || 'Not found.'}
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-sm font-semibold text-primary-600 hover:underline"
          >
            Go to Tarantuverse
          </Link>
        </div>
      </main>
    )
  }

  const sp = animal.species
  const hero = animal.photo_url || animal.photos[0]?.url || sp?.image_url || null
  const secretion =
    sp?.defensive_secretion && sp.defensive_secretion !== 'none'
      ? SECRETION_LABEL[sp.defensive_secretion] ?? SECRETION_LABEL.other
      : null

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-16">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt={animal.display_name} className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">No photo yet</span>
            </div>
          )}

          <div className="p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300">
                {TAXON_LABEL[animal.taxon] ?? animal.taxon}
              </span>
              {animal.sex && animal.sex !== 'unknown' && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {animal.sex === 'male' ? '♂ Male' : '♀ Female'}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              {animal.display_name}
            </h1>
            {animal.scientific_name && (
              <p className="text-sm italic text-gray-500 dark:text-gray-400">
                {animal.scientific_name}
              </p>
            )}
            {animal.owner_username && (
              <p className="text-xs text-gray-400 mt-1">
                Kept by{' '}
                <Link
                  href={`/keeper/${animal.owner_username}`}
                  className="text-primary-600 hover:underline"
                >
                  {animal.owner_username}
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* Safety first — the thing you most want to know before opening a
            tub you're standing in front of. */}
        {(sp?.venom_severity === 'medically_significant' || secretion) && (
          <div className="mt-4 space-y-3">
            {sp?.venom_severity === 'medically_significant' && (
              <div className="rounded-xl border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
                <p className="font-bold text-sm text-red-800 dark:text-red-300">
                  Medically significant venom
                </p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                  A bite can require medical attention. Experienced keepers only.
                </p>
              </div>
            )}
            {secretion && (
              <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4">
                <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
                  Chemical defence
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                  {secretion}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Escape facts, when recorded. Reaching for a tub is exactly when
            "it flies" is worth knowing. */}
        {(sp?.can_fly === true || sp?.can_climb_smooth === true) && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              Before you open it
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
              {sp.can_fly === true && <li>· This species can fly.</li>}
              {sp.can_climb_smooth === true && (
                <li>· Climbs smooth surfaces — check the barrier.</li>
              )}
            </ul>
          </div>
        )}

        {/* Recent history */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat
            label="Last fed"
            value={animal.last_feeding ? daysAgo(animal.last_feeding.date) : 'Not recorded'}
          />
          <Stat
            label="Last moult"
            value={animal.last_molt ? daysAgo(animal.last_molt.date) : 'Not recorded'}
          />
        </div>

        {sp && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Care at a glance
            </p>
            {(sp.temperature_min || sp.temperature_max) && (
              <Row label="Temperature" value={`${sp.temperature_min ?? '?'}–${sp.temperature_max ?? '?'} °F`} />
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

        {animal.photos.length > 1 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {animal.photos.slice(0, 9).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.thumbnail_url || p.url}
                alt={p.caption || animal.display_name}
                className="w-full aspect-square object-cover rounded-lg"
              />
            ))}
          </div>
        )}

        {/* The owner came here from their own enclosure label — send them to
            the screen where they can actually do something. */}
        {animal.is_owner && (
          <Link
            href={
              animal.taxon === 'tarantula'
                ? `/dashboard/tarantulas/${animal.id}`
                : `/dashboard/inverts/${animal.id}`
            }
            className="mt-5 block w-full text-center px-4 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition"
          >
            Open in my collection
          </Link>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
        {value}
      </span>
    </div>
  )
}
