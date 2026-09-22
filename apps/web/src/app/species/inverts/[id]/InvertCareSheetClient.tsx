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
import ShortlistButton from '@/components/ShortlistButton'

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

  // Safety for the taxa that have no venom. A millipede has no venom and can
  // still give you a chemical burn; `venom_severity` is the wrong frame, so
  // until these existed the sheet called it "harmless".
  defensive_secretion: string | null
  defensive_secretion_notes: string | null
  // The escape facts — for a roach these decide the enclosure.
  can_fly: boolean | null
  can_climb_smooth: boolean | null
  // Growth staging: sling/juvenile/adult fits three of eleven taxa.
  stage_scheme: string | null
  typical_instars_to_maturity: number | null
  // Detritivore husbandry — the two commonest ways a culture dies.
  supplemental_calcium_required: boolean | null
  moisture_gradient_required: boolean | null
  bioactive_suitable: boolean | null
  // Myriapod anatomy — seeded since launch, never rendered here.
  developmental_class: string | null
  typical_segment_count: number | null
  typical_leg_pair_count: number | null

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

// Taxon-honest copy for the green "harmless" safety callout. The previous
// version hardcoded whip-spider text for every harmless taxon (a mantis showed
// "whip spiders are completely harmless…"). Keyed by taxon with a neutral
// fallback for anything unlisted.
const HARMLESS_COPY: Record<string, { title: string; body: string }> = {
  whip_spider: {
    title: 'No venom, no sting',
    body: "Whip spiders (amblypygids) are completely harmless to humans. They're fast and can deliver a harmless pinch with their pedipalps, but have no venom and no sting.",
  },
  vinegaroon: {
    title: 'No venom, no sting',
    body: 'Vinegaroons are harmless to humans — no venom and no sting. If threatened they can spray a fine acetic-acid mist (it smells like vinegar) and give a firm pinch, but neither is dangerous. Avoid getting the spray in your eyes.',
  },
  mantis: {
    title: 'No venom, no sting',
    body: 'Mantises are harmless to humans. They have no venom or sting — the worst they can do is grip with their spined forelegs or deliver a startling but harmless nip.',
  },
  millipede: {
    title: 'No venom, no sting',
    body: "Millipedes don't bite or sting and have no venom. Many do secrete defensive chemicals when stressed, so wash your hands after handling and keep them away from your eyes and mouth.",
  },
  roach: {
    title: 'No venom, no sting',
    body: 'Pet and feeder roaches are harmless to humans — no venom, no sting, and no meaningful bite. Wash your hands after handling.',
  },
  true_spider: {
    title: 'Not medically significant',
    body: 'Like all spiders, this species has venom, but it is not considered medically significant to humans. Bites are uncommon and, at worst, comparable to a bee sting for most people. Handle minimally.',
  },
}

const DEFAULT_HARMLESS = {
  title: 'No venom, no sting',
  body: 'This species is considered harmless to humans, with no medically significant venom or sting. Handle gently and wash your hands afterward.',
}

/**
 * Chemical defences — the hazard the venom fields can't describe.
 *
 * Shown ALONGSIDE the harmless line, never instead of it: a millipede is
 * genuinely non-venomous and genuinely able to burn you, and collapsing those
 * into one verdict is how this sheet ended up saying only "harmless".
 * Hydrogen cyanide is a different hazard class from a staining quinone and
 * is named as such.
 *
 * KEEP IN LOCKSTEP with apps/mobile/app/invert-species/[id].tsx.
 */
const SECRETION_COPY: Record<
  string,
  { title: string; body: string; tone: 'red' | 'amber' }
> = {
  benzoquinone: {
    title: 'Secretes benzoquinones',
    body: "Stains skin brown for several days and stings badly in the eyes or on broken skin. Wash your hands after handling, don't rub your face, and keep it well away from small children.",
    tone: 'amber',
  },
  hydrogen_cyanide: {
    title: 'Secretes hydrogen cyanide',
    body: 'Releases small amounts of hydrogen cyanide when stressed. Harmless in an open room and in the quantities involved, but handle in ventilated space, never in a closed container held to your face, and wash your hands afterwards.',
    tone: 'red',
  },
  acetic_acid: {
    title: 'Sprays acetic acid',
    body: 'Can spray a fine, concentrated vinegar mist when threatened. Not dangerous to skin, but genuinely painful in the eyes — keep it below face level when handling.',
    tone: 'amber',
  },
  other: {
    title: 'Has a chemical defence',
    body: 'Produces a defensive secretion when stressed. Wash your hands after handling and avoid contact with your eyes.',
    tone: 'amber',
  },
}

const STAGE_SCHEME_LABELS: Record<string, string> = {
  sling_juvenile_adult: 'Sling → juvenile → adult',
  instar: 'Numbered instars',
  none: 'No distinct stages',
}

const DEVELOPMENTAL_CLASS_LABELS: Record<string, string> = {
  anamorphic: 'Anamorphic — gains segments with each moult',
  epimorphic: 'Epimorphic — hatches with its full segment count',
}

/** Boolean facts render only when RECORDED. `null` means nobody has checked,
 *  and "No" would assert something the data doesn't say. */
function yesNo(v: boolean | null | undefined): string | null {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return null
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

  // 'none' is a recorded "we checked, it doesn't" — render nothing for it.
  const secretion =
    species?.defensive_secretion && species.defensive_secretion !== 'none'
      ? SECRETION_COPY[species.defensive_secretion] ?? SECRETION_COPY.other
      : null

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
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {species.common_names?.[0] || species.scientific_name}
                  </h1>
                  <p className="text-lg italic text-gray-600 dark:text-gray-400">
                    {species.scientific_name}
                  </p>
                </div>
                {/* Renders nothing for signed-out visitors — this is a public
                    SEO page, so most traffic here isn't logged in. */}
                <ShortlistButton speciesId={species.id} className="shrink-0 mt-1" />
              </div>
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
              <Callout
                color="green"
                title={(HARMLESS_COPY[species.taxon] ?? DEFAULT_HARMLESS).title}
              >
                {(HARMLESS_COPY[species.taxon] ?? DEFAULT_HARMLESS).body}
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

            {/* Chemical defence sits ALONGSIDE the verdict above, not instead
                of it. A millipede is genuinely non-venomous and genuinely
                able to burn you. */}
            {secretion && (
              <Callout color={secretion.tone} title={secretion.title}>
                {species.defensive_secretion_notes || secretion.body}
              </Callout>
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
              {/* Myriapod anatomy — seeded for centipedes and millipedes
                  since launch, rendered until now only on a legacy per-taxon
                  screen nothing links to. */}
              <Fact
                label="Body segments"
                value={
                  species.typical_segment_count != null
                    ? String(species.typical_segment_count)
                    : null
                }
              />
              <Fact
                label="Leg pairs"
                value={
                  species.typical_leg_pair_count != null
                    ? String(species.typical_leg_pair_count)
                    : null
                }
              />
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
              {/* sling/juvenile/adult is tarantula vocabulary and fits three
                  of eleven taxa. Saying which scheme this species uses means
                  a mantis keeper isn't translating L4 into "juvenile". */}
              <Fact
                label="Life stages"
                value={
                  species.stage_scheme
                    ? STAGE_SCHEME_LABELS[species.stage_scheme] ?? species.stage_scheme
                    : null
                }
              />
              <Fact
                label="Instars to maturity"
                value={
                  species.typical_instars_to_maturity != null
                    ? `~${species.typical_instars_to_maturity}`
                    : null
                }
              />
              <Fact
                label="Development"
                value={
                  species.developmental_class
                    ? DEVELOPMENTAL_CLASS_LABELS[species.developmental_class] ??
                      species.developmental_class
                    : null
                }
              />
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
              {/* The escape facts. For a roach these decide the enclosure
                  more than its dimensions do — a flying species needs a
                  locking lid, a smooth-climber needs a barrier. */}
              <Fact label="Can fly" value={yesNo(species.can_fly)} />
              <Fact
                label="Climbs smooth surfaces"
                value={yesNo(species.can_climb_smooth)}
              />
              {/* The two commonest ways a beginner loses a detritivore
                  culture. */}
              <Fact
                label="Moisture gradient"
                value={
                  species.moisture_gradient_required === true
                    ? 'Required — keep one end damp, one end dry'
                    : yesNo(species.moisture_gradient_required)
                }
              />
              <Fact
                label="Bioactive clean-up crew"
                value={yesNo(species.bioactive_suitable)}
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
              {/* Calcium deficiency kills isopod and millipede cultures
                  slowly enough that keepers usually blame something else. */}
              <Fact
                label="Supplemental calcium"
                value={
                  species.supplemental_calcium_required === true
                    ? 'Required — cuttlebone or a calcium powder'
                    : yesNo(species.supplemental_calcium_required)
                }
              />
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
  // `amber` exists so a staining quinone doesn't have to borrow red from
  // medically-significant venom. If everything cautionary is the same colour,
  // the colour stops carrying information.
  color: 'green' | 'red' | 'amber'
  title: string
  children: React.ReactNode
}) {
  const styles =
    color === 'green'
      ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-300'
      : color === 'amber'
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 text-amber-800 dark:text-amber-300'
        : 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-300'
  return (
    <div className={`border-l-4 rounded-r-lg p-4 mb-4 ${styles}`}>
      <p className="font-bold text-sm mb-1">{title}</p>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}
