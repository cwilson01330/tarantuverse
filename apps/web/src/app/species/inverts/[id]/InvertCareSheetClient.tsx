'use client'

/**
 * Generic invert care sheet (web) — interactive client UI.
 *
 * Renders any non-tarantula invert species (whip_spider, scorpion, centipede,
 * mantis, roach, millipede, vinegaroon, true_spider, …) from the unified
 * `invert_species` catalog via GET /api/v1/invert-species/{id}. The server
 * wrapper (page.tsx) supplies per-species SEO metadata + JSON-LD; this file is
 * the hydrated interactive view.
 *
 * Safety is taxon-honest: whip spiders show a green "Harmless" treatment
 * (no venom, no sting); scorpions + centipedes show their venom tier.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import PublicCareShell from '@/components/PublicCareShell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface InvertSpecies {
  id: string
  taxon: string
  scientific_name: string
  common_names: string[]
  genus: string | null
  family: string | null
  native_region: string | null
  care_level: string | null
  temperament: string | null
  type: string | null
  adult_size: string | null
  adult_length_min_mm: number | string | null
  adult_length_max_mm: number | string | null
  growth_rate: string | null
  temperature_min: number | null
  temperature_max: number | null
  humidity_min: number | null
  humidity_max: number | null
  enclosure_size_sling: string | null
  enclosure_size_juvenile: string | null
  enclosure_size_adult: string | null
  substrate_type: string | null
  substrate_depth: string | null
  feeding_mode: string | null
  prey_size: string | null
  feeding_frequency_sling: string | null
  feeding_frequency_juvenile: string | null
  feeding_frequency_adult: string | null
  water_dish_required: boolean
  communal_suitable: boolean
  venom_severity: string | null
  venom_notes: string | null
  care_guide: string | null
  image_url: string | null
  is_verified: boolean
  times_kept: number
  slug: string
}

const TAXON_LABELS: Record<string, string> = {
  whip_spider: 'Whip spider',
  scorpion: 'Scorpion',
  centipede: 'Centipede',
  tarantula: 'Tarantula',
  mantis: 'Mantis',
  roach: 'Roach',
  millipede: 'Millipede',
  vinegaroon: 'Vinegaroon',
  true_spider: 'True spider',
  other: 'Other',
}

const VENOM_LABELS: Record<string, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  medically_significant: 'Medically significant',
}

const FEEDING_MODE_LABELS: Record<string, string> = {
  predator: 'Predator (live prey)',
  detritivore: 'Detritivore (decaying matter)',
  omnivore: 'Omnivore',
}

export default function InvertCareSheetClient({
  initialSpecies,
}: {
  initialSpecies?: InvertSpecies | null
} = {}) {
  const params = useParams()
  const id = params?.id as string
  const { user } = useAuth()

  // Seed from the server fetch so the full care sheet ships in the SSR HTML
  // (SEO) with no loading flash; only fetch client-side if it wasn't provided.
  const [species, setSpecies] = useState<InvertSpecies | null>(initialSpecies ?? null)
  const [loading, setLoading] = useState(!initialSpecies)
  const [error, setError] = useState<string | null>(null)

  const fetchSpecies = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/invert-species/${id}`)
      if (!res.ok) throw new Error('Could not load this care sheet.')
      setSpecies(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!initialSpecies) fetchSpecies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSpecies])

  const harmless = species?.taxon === 'whip_spider' || !species?.venom_severity

  return (
    <PublicCareShell authUser={user}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/species"
          className="text-sm text-primary-600 hover:underline mb-4 inline-block"
        >
          ← Back to species
        </Link>

        {loading && (
          <p className="text-gray-600 dark:text-gray-400">Loading care sheet…</p>
        )}

        {error && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <button
              onClick={fetchSpecies}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        )}

        {species && !loading && (
          <>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {species.common_names?.[0] || species.scientific_name}
              </h1>
              <p className="text-lg italic text-gray-600 dark:text-gray-400">
                {species.scientific_name}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {TAXON_LABELS[species.taxon] ?? species.taxon}
                </Badge>
                {species.care_level && (
                  <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                    {species.care_level}
                  </Badge>
                )}
                {harmless ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Harmless
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    Venom: {VENOM_LABELS[species.venom_severity!] ?? species.venom_severity}
                  </Badge>
                )}
                {species.communal_suitable && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Communal OK
                  </Badge>
                )}
              </div>
            </div>

            {/* Safety callout */}
            {harmless ? (
              <Callout color="green" title="No venom, no sting">
                Whip spiders are completely harmless to humans. They&apos;re fast
                and can deliver a harmless pinch with the pedipalps, but have no
                venom and no sting.
              </Callout>
            ) : (
              (species.venom_notes ||
                species.venom_severity === 'medically_significant') && (
                <Callout
                  color="red"
                  title={
                    species.venom_severity === 'medically_significant'
                      ? 'Medically significant venom'
                      : 'Venom note'
                  }
                >
                  {species.venom_notes ||
                    'Venom is medically significant. Experienced keepers only — check local legality and have a protocol.'}
                </Callout>
              )
            )}

            {/* About */}
            {species.care_guide && (
              <Section title="About">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                  {species.care_guide.replace(/\*\*(.*?)\*\*/g, '$1')}
                </p>
              </Section>
            )}

            {/* Taxonomy */}
            <Section title="Taxonomy">
              <Fact label="Family" value={species.family} />
              <Fact label="Genus" value={species.genus} />
              <Fact label="Native region" value={species.native_region} />
              <Fact label="Type" value={cap(species.type)} />
              <Fact label="Temperament" value={species.temperament} />
            </Section>

            {/* Size & growth */}
            <Section title="Size & growth">
              <Fact label="Adult size" value={species.adult_size} />
              {(species.adult_length_min_mm || species.adult_length_max_mm) && (
                <Fact
                  label={species.taxon === 'whip_spider' ? 'Leg span' : 'Length'}
                  value={`${species.adult_length_min_mm ?? '?'}–${species.adult_length_max_mm ?? '?'} mm`}
                />
              )}
              <Fact label="Growth rate" value={species.growth_rate} />
            </Section>

            {/* Climate */}
            <Section title="Climate">
              {(species.temperature_min || species.temperature_max) && (
                <Fact
                  label="Temperature"
                  value={`${species.temperature_min ?? '?'}–${species.temperature_max ?? '?'} °F`}
                />
              )}
              {(species.humidity_min || species.humidity_max) && (
                <Fact
                  label="Humidity"
                  value={`${species.humidity_min ?? '?'}–${species.humidity_max ?? '?'}%`}
                />
              )}
            </Section>

            {/* Enclosure */}
            <Section title="Enclosure">
              <Fact label="Sling size" value={species.enclosure_size_sling} />
              <Fact label="Juvenile size" value={species.enclosure_size_juvenile} />
              <Fact label="Adult size" value={species.enclosure_size_adult} />
              <Fact label="Substrate" value={species.substrate_type} />
              <Fact label="Substrate depth" value={species.substrate_depth} />
              <Fact
                label="Water dish"
                value={species.water_dish_required ? 'Required' : 'Optional'}
              />
            </Section>

            {/* Feeding */}
            <Section title="Feeding">
              <Fact
                label="Feeding mode"
                value={
                  species.feeding_mode
                    ? FEEDING_MODE_LABELS[species.feeding_mode] ?? species.feeding_mode
                    : null
                }
              />
              <Fact label="Prey size" value={species.prey_size} />
              <Fact label="Sling cadence" value={species.feeding_frequency_sling} />
              <Fact label="Juvenile cadence" value={species.feeding_frequency_juvenile} />
              <Fact label="Adult cadence" value={species.feeding_frequency_adult} />
            </Section>

            <p className="text-xs text-gray-400 text-center mt-6">
              Times kept: {species.times_kept}
              {!species.is_verified && ' · Unverified community entry'}
            </p>
          </>
        )}
      </div>
    </PublicCareShell>
  )
}

function cap(s: string | null | undefined): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Badge({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${className}`}>
      {children}
    </span>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Fact({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right ml-3">
        {value}
      </span>
    </div>
  )
}

function Callout({
  color,
  title,
  children,
}: {
  color: 'green' | 'red'
  title: string
  children: React.ReactNode
}) {
  const styles =
    color === 'green'
      ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-300'
      : 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-300'
  return (
    <div className={`border-l-4 rounded-r-lg p-4 mb-4 ${styles}`}>
      <p className="font-bold text-sm mb-1">{title}</p>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}
