/**
 * <CareSheet /> — the full reptile care-sheet body.
 *
 * Shared between two host pages:
 *   • `/app/species/[id]`  — keeper-facing, inside feature-flag-gated /app
 *   • `/species/[slug]`    — public, SEO-indexed care sheet
 *
 * Each host owns its own chrome (back-link target, breadcrumbs, JSON-LD).
 * This component only renders the article body (hero + content sections +
 * content footer). Nothing here references routes or flags, so it stays
 * drop-in-reusable.
 *
 * Extracted from the original monolith at `/app/species/[id]/page.tsx` in
 * Sprint 6b (2026-04-23). If you change a section, change it once here —
 * both keeper view and public care sheet pick it up.
 */
import {
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,
  Citation,
  DIET_LABELS,
  ENCLOSURE_LABELS,
  formatIntRange,
  formatRange,
  HANDLEABILITY_LABELS,
  IUCN_LABELS,
  LifeStageFeedingBracket,
  ReptileSpecies,
  trimZeros,
  UVB_LABELS,
} from '@/lib/reptileSpecies'
import {
  CareLevelBadge,
  ChipList,
  CitesBadge,
  IucnBadge,
} from '@/components/SpeciesBadges'

export default function CareSheet({ species }: { species: ReptileSpecies }) {
  return (
    <>
      <Hero species={species} />

      {species.care_guide && (
        <Section title="Overview" category="Care guide">
          <CareGuide text={species.care_guide} />
        </Section>
      )}

      <Section title="Climate" category="Environment">
        <ClimateGrid species={species} />
        <HumidityBlock species={species} />
      </Section>

      {(species.uvb_required ||
        species.uvb_type === 'T5_HO' ||
        species.uvb_type === 'T8') && (
        <Section title="UVB lighting" category="Environment">
          <UvbBlock species={species} />
        </Section>
      )}

      <Section title="Enclosure" category="Housing">
        <EnclosureBlock species={species} />
      </Section>

      <Section title="Substrate" category="Housing">
        <SubstrateBlock species={species} />
      </Section>

      <Section title="Diet & feeding" category="Nutrition">
        <DietBlock species={species} />
      </Section>

      <Section title="Water & behavior" category="Care">
        <WaterBehaviorBlock species={species} />
      </Section>

      {(species.cites_appendix ||
        species.iucn_status ||
        species.wild_population_notes) && (
        <Section title="Conservation" category="Legal & ecology">
          <ConservationBlock species={species} />
        </Section>
      )}

      {species.has_morph_market && (
        <Section title="Morphs" category="Genetics">
          <MorphBlock species={species} />
        </Section>
      )}

      {species.sources && species.sources.length > 0 && (
        <Section title="Sources" category="Citations">
          <SourcesList sources={species.sources} />
        </Section>
      )}

      <ContentFooter species={species} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ species }: { species: ReptileSpecies }) {
  const title = species.common_names[0] || species.scientific_name
  const taxonomy = [species.family, species.order_name]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="mb-10 pb-8 border-b border-neutral-800">
      <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
        Care sheet
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-white mb-2">
        {title}
      </h1>
      <p className="text-lg italic text-neutral-300 mb-1">
        {species.scientific_name}
      </p>
      {species.common_names.length > 1 && (
        <p className="text-sm text-neutral-500 mb-3">
          Also known as: {species.common_names.slice(1).join(', ')}
        </p>
      )}
      {taxonomy && (
        <p className="text-xs text-neutral-500 uppercase tracking-wider mb-5">
          {taxonomy}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <CareLevelBadge level={species.care_level} />
        <CitesBadge appendix={species.cites_appendix} />
        <IucnBadge status={species.iucn_status} />
      </div>

      <QuickFacts species={species} />
    </header>
  )
}

function QuickFacts({ species }: { species: ReptileSpecies }) {
  const activity = species.activity_period
    ? `${ACTIVITY_ICONS[species.activity_period]} ${ACTIVITY_LABELS[species.activity_period]}`
    : null
  const handleability = species.handleability
    ? HANDLEABILITY_LABELS[species.handleability]
    : null
  const adultLength = formatRange(
    species.adult_length_min_in,
    species.adult_length_max_in,
    'in',
  )
  const adultWeight = formatRange(
    species.adult_weight_min_g,
    species.adult_weight_max_g,
    'g',
  )
  const lifespan = formatIntRange(
    species.lifespan_captivity_min_yrs,
    species.lifespan_captivity_max_yrs,
    ' yrs',
  )

  const facts: Array<[string, string | null]> = [
    ['Activity', activity],
    ['Temperament', handleability],
    ['Adult length', adultLength],
    ['Adult weight', adultWeight],
    ['Lifespan (captivity)', lifespan],
    ['Native range', species.native_region],
  ]

  const visible = facts.filter(([, v]) => v != null)
  if (visible.length === 0) return null

  return (
    <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] uppercase tracking-wider text-neutral-500 mb-0.5">
            {label}
          </dt>
          <dd className="text-neutral-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  category,
  children,
}: {
  title: string
  category: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <p className="text-[11px] tracking-[0.2em] uppercase text-herp-teal/80 mb-1.5 font-medium">
        {category}
      </p>
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      <div className="text-sm text-neutral-300 leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Care guide — tiny markdown (paragraphs + **bold**)
// ---------------------------------------------------------------------------

function CareGuide({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-neutral-200">
          {renderInline(p)}
        </p>
      ))}
    </>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part)
    if (match) {
      return (
        <strong key={i} className="text-white font-semibold">
          {match[1]}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ---------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------

function ClimateGrid({ species }: { species: ReptileSpecies }) {
  const zones: Array<[string, string | null, string]> = [
    [
      'Cool side',
      formatRange(species.temp_cool_min, species.temp_cool_max, '°F'),
      'text-herp-teal',
    ],
    [
      'Warm side',
      formatRange(species.temp_warm_min, species.temp_warm_max, '°F'),
      'text-amber-300',
    ],
    [
      'Basking spot',
      formatRange(species.temp_basking_min, species.temp_basking_max, '°F'),
      'text-orange-300',
    ],
    [
      'Nighttime',
      formatRange(species.temp_night_min, species.temp_night_max, '°F'),
      'text-indigo-300',
    ],
  ]

  const visible = zones.filter(([, v]) => v != null)
  if (visible.length === 0) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {visible.map(([label, range, tone]) => (
        <div
          key={label}
          className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40"
        >
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
            {label}
          </div>
          <div className={`text-lg font-semibold ${tone}`}>{range}</div>
        </div>
      ))}
    </div>
  )
}

function HumidityBlock({ species }: { species: ReptileSpecies }) {
  const base = formatIntRange(species.humidity_min, species.humidity_max, '%')
  const shed = formatIntRange(
    species.humidity_shed_boost_min,
    species.humidity_shed_boost_max,
    '%',
  )

  if (!base && !shed) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {base && (
        <div className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
            Humidity (ambient)
          </div>
          <div className="text-lg font-semibold text-herp-teal">{base}</div>
        </div>
      )}
      {shed && (
        <div className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
            Shed-cycle boost
          </div>
          <div className="text-lg font-semibold text-herp-lime">{shed}</div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UVB
// ---------------------------------------------------------------------------

function UvbBlock({ species }: { species: ReptileSpecies }) {
  const type = species.uvb_type ? UVB_LABELS[species.uvb_type] : null
  const distance = formatRange(
    species.uvb_distance_min_in,
    species.uvb_distance_max_in,
    'in',
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <LabeledStat
        label="Required?"
        value={
          species.uvb_required ? 'Yes — provide UVB' : 'Optional / beneficial'
        }
      />
      {type && <LabeledStat label="Fixture type" value={type} />}
      {distance && <LabeledStat label="Distance to basking" value={distance} />}
      {species.uvb_replacement_months != null && (
        <LabeledStat
          label="Replacement interval"
          value={`Every ${species.uvb_replacement_months} months`}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enclosure
// ---------------------------------------------------------------------------

function EnclosureBlock({ species }: { species: ReptileSpecies }) {
  const encType = species.enclosure_type
    ? ENCLOSURE_LABELS[species.enclosure_type]
    : null

  const ladder: Array<[string, string | null]> = [
    ['Hatchling', species.enclosure_min_hatchling],
    ['Juvenile', species.enclosure_min_juvenile],
    ['Adult', species.enclosure_min_adult],
  ]

  return (
    <>
      {(encType || species.bioactive_suitable) && (
        <div className="flex flex-wrap gap-3 mb-2">
          {encType && <LabeledStat label="Orientation" value={encType} />}
          <LabeledStat
            label="Bioactive setup"
            value={species.bioactive_suitable ? 'Suitable' : 'Not ideal'}
          />
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
          Minimum size by life stage
        </div>
        <ul className="space-y-1.5">
          {ladder.map(([stage, size]) => (
            <li
              key={stage}
              className="flex items-start gap-3 p-2.5 rounded-md border border-neutral-800 bg-neutral-900/40"
            >
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0 mt-0.5">
                {stage}
              </span>
              <span className="text-neutral-200">
                {size || <span className="text-neutral-600">Not specified</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Substrate
// ---------------------------------------------------------------------------

function SubstrateBlock({ species }: { species: ReptileSpecies }) {
  const depth = formatRange(
    species.substrate_depth_min_in,
    species.substrate_depth_max_in,
    'in',
  )

  return (
    <>
      {depth && <LabeledStat label="Depth" value={depth} />}

      {species.substrate_safe_list.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
            Safe options
          </div>
          <ChipList items={species.substrate_safe_list} tone="accent" />
        </div>
      )}

      {species.substrate_avoid_list.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
            Avoid
          </div>
          <ChipList items={species.substrate_avoid_list} tone="danger" />
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Diet
// ---------------------------------------------------------------------------

function DietBlock({ species }: { species: ReptileSpecies }) {
  const diet = species.diet_type ? DIET_LABELS[species.diet_type] : null

  const preyLadder: Array<[string, string | null]> = [
    ['Hatchling', species.prey_size_hatchling],
    ['Juvenile', species.prey_size_juvenile],
    ['Adult', species.prey_size_adult],
  ]
  const freqLadder: Array<[string, string | null]> = [
    ['Hatchling', species.feeding_frequency_hatchling],
    ['Juvenile', species.feeding_frequency_juvenile],
    ['Adult', species.feeding_frequency_adult],
  ]

  const hasPrey = preyLadder.some(([, v]) => v != null)
  const hasFreq = freqLadder.some(([, v]) => v != null)

  const hasRatioTable =
    species.life_stage_feeding != null && species.life_stage_feeding.length > 0
  const hasThresholds =
    species.hatchling_weight_min_g != null ||
    species.hatchling_weight_max_g != null ||
    species.power_feeding_threshold_pct != null ||
    species.weight_loss_concern_pct_30d != null

  return (
    <>
      {diet && <LabeledStat label="Dietary type" value={diet} />}

      {hasPrey && (
        <LadderBlock
          title="Prey size by life stage"
          rows={preyLadder.filter((r): r is [string, string] => r[1] != null)}
        />
      )}

      {hasFreq && (
        <LadderBlock
          title="Feeding frequency by life stage"
          rows={freqLadder.filter((r): r is [string, string] => r[1] != null)}
        />
      )}

      {hasRatioTable && (
        <FeedingRatioTable brackets={species.life_stage_feeding!} />
      )}

      {hasThresholds && <FeedingThresholds species={species} />}

      {species.supplementation_notes && (
        <Note title="Supplementation">{species.supplementation_notes}</Note>
      )}
    </>
  )
}

const STAGE_ORDER: Record<LifeStageFeedingBracket['stage'], number> = {
  hatchling: 0,
  juvenile: 1,
  subadult: 2,
  adult: 3,
}

const STAGE_LABEL: Record<LifeStageFeedingBracket['stage'], string> = {
  hatchling: 'Hatchling',
  juvenile: 'Juvenile',
  subadult: 'Subadult',
  adult: 'Adult',
}

function formatRatioRange(min: number, max: number): string {
  if (min === max) return `${min}%`
  return `${min}–${max}%`
}

function formatIntervalRange(min: number, max: number): string {
  if (min === max) return `${min} day${min === 1 ? '' : 's'}`
  return `${min}–${max} days`
}

function formatWeightRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—'
  if (max == null) return `${min} g+`
  if (min == null) return `up to ${max} g`
  if (min === max) return `${min} g`
  return `${min}–${max} g`
}

function FeedingRatioTable({
  brackets,
}: {
  brackets: LifeStageFeedingBracket[]
}) {
  const sorted = [...brackets].sort(
    (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage],
  )

  const rows = sorted.map((b, i) => {
    const prevMax = i === 0 ? null : sorted[i - 1].weight_g_max
    const weightMin = prevMax == null ? null : prevMax + 1
    return {
      stage: b.stage,
      weightLabel: formatWeightRange(weightMin, b.weight_g_max),
      ratioLabel: formatRatioRange(b.ratio_pct_min, b.ratio_pct_max),
      intervalLabel: formatIntervalRange(
        b.interval_days_min,
        b.interval_days_max,
      ),
    }
  })

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        Prey ratio by body weight
      </div>
      <div className="rounded-md border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="grid grid-cols-[1fr_1.2fr_1fr_1fr] gap-x-3 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800 bg-neutral-900/60">
          <div>Stage</div>
          <div>Body weight</div>
          <div>Prey (% BW)</div>
          <div>Interval</div>
        </div>
        <ul>
          {rows.map((r) => (
            <li
              key={r.stage}
              className="grid grid-cols-[1fr_1.2fr_1fr_1fr] gap-x-3 px-3 py-2.5 text-sm text-neutral-200 border-b border-neutral-800/70 last:border-b-0"
            >
              <div className="text-neutral-300">{STAGE_LABEL[r.stage]}</div>
              <div>{r.weightLabel}</div>
              <div>{r.ratioLabel}</div>
              <div>{r.intervalLabel}</div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
        Feed prey roughly the listed percentage of the snake&apos;s current
        weight, at the listed interval. Use it as a starting point — adjust
        based on body condition, not the calendar.
      </p>
    </div>
  )
}

function FeedingThresholds({ species }: { species: ReptileSpecies }) {
  const hatchling = formatRange(
    species.hatchling_weight_min_g,
    species.hatchling_weight_max_g,
    'g',
  )
  const powerFeeding =
    species.power_feeding_threshold_pct != null
      ? `> ${trimZeros(species.power_feeding_threshold_pct)}% body weight`
      : null
  const concernLoss =
    species.weight_loss_concern_pct_30d != null
      ? `> ${trimZeros(species.weight_loss_concern_pct_30d)}% in 30 days`
      : null

  const cells: Array<[string, string]> = []
  if (hatchling) cells.push(['Typical hatchling weight', hatchling])
  if (powerFeeding) cells.push(['Power-feeding line', powerFeeding])
  if (concernLoss) cells.push(['30-day weight-loss concern', concernLoss])

  if (cells.length === 0) return null

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        Feeding thresholds
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cells.map(([label, value]) => (
          <LabeledStat key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

function LadderBlock({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string]>
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        {title}
      </div>
      <ul className="space-y-1.5">
        {rows.map(([stage, value]) => (
          <li
            key={stage}
            className="flex items-start gap-3 p-2.5 rounded-md border border-neutral-800 bg-neutral-900/40"
          >
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0 mt-0.5">
              {stage}
            </span>
            <span className="text-neutral-200">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Water + behavior
// ---------------------------------------------------------------------------

function WaterBehaviorBlock({ species }: { species: ReptileSpecies }) {
  const hasAny =
    species.water_bowl_description ||
    species.soaking_behavior ||
    species.brumation_required ||
    species.brumation_notes ||
    species.defensive_displays.length > 0

  if (!hasAny) {
    return <p className="text-neutral-500">No behavioral notes recorded yet.</p>
  }

  return (
    <>
      {species.water_bowl_description && (
        <Note title="Water">{species.water_bowl_description}</Note>
      )}
      {species.soaking_behavior && (
        <Note title="Soaking behavior">{species.soaking_behavior}</Note>
      )}
      {(species.brumation_required || species.brumation_notes) && (
        <Note
          title={
            species.brumation_required
              ? 'Brumation (required)'
              : 'Brumation (optional)'
          }
        >
          {species.brumation_notes || 'See species-specific references.'}
        </Note>
      )}
      {species.defensive_displays.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
            Defensive displays
          </div>
          <ChipList items={species.defensive_displays} />
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Conservation
// ---------------------------------------------------------------------------

function ConservationBlock({ species }: { species: ReptileSpecies }) {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {species.cites_appendix && (
          <LabeledStat
            label="CITES"
            value={`Appendix ${species.cites_appendix}`}
          />
        )}
        {species.iucn_status && (
          <LabeledStat
            label="IUCN Red List"
            value={`${species.iucn_status} · ${IUCN_LABELS[species.iucn_status]}`}
          />
        )}
      </div>
      {species.wild_population_notes && (
        <Note title="Wild populations">{species.wild_population_notes}</Note>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Morphs
// ---------------------------------------------------------------------------

function MorphBlock({ species }: { species: ReptileSpecies }) {
  return (
    <div className="flex flex-wrap gap-3">
      <LabeledStat label="Morph market" value="Active" />
      {species.morph_complexity && (
        <LabeledStat
          label="Complexity"
          value={
            species.morph_complexity.charAt(0).toUpperCase() +
            species.morph_complexity.slice(1)
          }
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function SourcesList({ sources }: { sources: Citation[] }) {
  return (
    <>
      <p className="text-xs text-neutral-500">
        Every husbandry parameter on this page is backed by the references
        below. Click through to read the originals.
      </p>
      <ol className="space-y-3 list-none pl-0">
        {sources.map((s, i) => (
          <li
            key={i}
            className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40"
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="min-w-0">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-herp-teal hover:text-herp-lime transition-colors break-words"
                  >
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-neutral-200">
                    {s.title || 'Untitled source'}
                  </span>
                )}
                {s.author && (
                  <p className="text-xs text-neutral-400 mt-0.5">{s.author}</p>
                )}
              </div>
              {s.source_type && (
                <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-neutral-800 text-neutral-400 border-neutral-700">
                  {s.source_type.replace('_', ' ')}
                </span>
              )}
            </div>
            {s.summary && (
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                {s.summary}
              </p>
            )}
            {s.publication_date && (
              <p className="text-[11px] text-neutral-600 mt-1">
                Published: {s.publication_date.slice(0, 10)}
              </p>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function ContentFooter({ species }: { species: ReptileSpecies }) {
  const reviewed = species.content_last_reviewed_at
    ? new Date(species.content_last_reviewed_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null
  return (
    <footer className="mt-16 pt-6 border-t border-neutral-800 text-xs text-neutral-500">
      {reviewed && <p>Content last reviewed: {reviewed}</p>}
      {species.is_verified && (
        <p className="mt-1">
          <span className="text-herp-teal">✓</span> Verified by the Herpetoverse
          content team
        </p>
      )}
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Tiny shared primitives
// ---------------------------------------------------------------------------

function LabeledStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-neutral-200">{value}</div>
    </div>
  )
}

function Note({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="p-3 rounded-md border border-neutral-800 bg-neutral-900/40">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">
        {title}
      </div>
      <p className="text-neutral-200 leading-relaxed">{children}</p>
    </div>
  )
}
