/**
 * Reptile species data layer.
 *
 * Wraps the Tarantuverse API's /api/v1/reptile-species/* endpoints. The backend
 * serializes Decimal fields as strings (Pydantic default), so numeric temps /
 * sizes / weights come through as `string | null`. Integer fields (humidity,
 * lifespan, uvb months) come through as `number | null`.
 *
 * Using server-side `fetch` with `revalidate` — care content changes rarely
 * (content_last_reviewed_at is usually months apart), so 5-minute ISR is a
 * fine default. Admin edits propagate within the revalidation window.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

// Revalidation window (seconds). Species content is stable; 5 min is fine.
const REVALIDATE_SECONDS = 300

// ---------------------------------------------------------------------------
// Types. Mirrors apps/api/app/schemas/reptile_species.py ReptileSpeciesResponse.
// Kept intentionally close to the wire shape — no renaming.
// ---------------------------------------------------------------------------

export type CareLevel = 'beginner' | 'intermediate' | 'advanced'
export type Handleability = 'docile' | 'defensive' | 'nippy' | 'hands_off'
export type ActivityPeriod = 'diurnal' | 'nocturnal' | 'crepuscular'
export type EnclosureType =
  | 'terrestrial'
  | 'arboreal'
  | 'semi_arboreal'
  | 'fossorial'
export type DietType =
  | 'strict_carnivore'
  | 'insectivore'
  | 'omnivore'
  | 'herbivore'
export type UvbType = 'T5_HO' | 'T8' | 'not_required'
export type IucnStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD'
export type CitesAppendix = 'I' | 'II' | 'III'
export type MorphComplexity = 'none' | 'simple' | 'moderate' | 'complex'

export interface Citation {
  source_type?: string
  title?: string
  author?: string
  url?: string
  publication_date?: string
  summary?: string
  ref_key?: string
}

/**
 * One row of the species feeding-ratio table (Sprint 5).
 *
 * Mirrors the JSONB shape validated in `apps/api/app/schemas/reptile_species.py`.
 * The adult bracket uses `weight_g_max: null` to mean open-ended upper bound.
 * Ratios are percentages of the snake's body weight; intervals are days
 * between feedings.
 */
export interface LifeStageFeedingBracket {
  stage: 'hatchling' | 'juvenile' | 'subadult' | 'adult'
  weight_g_max: number | null
  ratio_pct_min: number
  ratio_pct_max: number
  interval_days_min: number
  interval_days_max: number
}

export interface ReptileSpecies {
  id: string
  scientific_name: string
  /**
   * URL slug for the public `/species/{slug}` care-sheet route. Backfilled
   * by `slg_20260423` migration from common_names[0] → scientific_name.
   * Stable once indexed — don't derive on the fly (see migration docstring).
   */
  slug: string
  common_names: string[]
  genus: string | null
  family: string | null
  order_name: string | null

  care_level: CareLevel | null
  handleability: Handleability | null
  activity_period: ActivityPeriod | null

  native_region: string | null
  adult_length_min_in: string | null
  adult_length_max_in: string | null
  adult_weight_min_g: string | null
  adult_weight_max_g: string | null

  temp_cool_min: string | null
  temp_cool_max: string | null
  temp_warm_min: string | null
  temp_warm_max: string | null
  temp_basking_min: string | null
  temp_basking_max: string | null
  temp_night_min: string | null
  temp_night_max: string | null
  humidity_min: number | null
  humidity_max: number | null
  humidity_shed_boost_min: number | null
  humidity_shed_boost_max: number | null

  uvb_required: boolean
  uvb_type: UvbType | null
  uvb_distance_min_in: string | null
  uvb_distance_max_in: string | null
  uvb_replacement_months: number | null

  enclosure_type: EnclosureType | null
  enclosure_min_hatchling: string | null
  enclosure_min_juvenile: string | null
  enclosure_min_adult: string | null
  bioactive_suitable: boolean

  substrate_safe_list: string[]
  substrate_avoid_list: string[]
  substrate_depth_min_in: string | null
  substrate_depth_max_in: string | null

  diet_type: DietType | null
  prey_size_hatchling: string | null
  prey_size_juvenile: string | null
  prey_size_adult: string | null
  feeding_frequency_hatchling: string | null
  feeding_frequency_juvenile: string | null
  feeding_frequency_adult: string | null
  supplementation_notes: string | null

  // Sprint 5 — feeding intelligence. Decimals come through as strings; the
  // life-stage array is JSONB so it arrives already parsed.
  hatchling_weight_min_g: string | null
  hatchling_weight_max_g: string | null
  power_feeding_threshold_pct: string | null
  weight_loss_concern_pct_30d: string | null
  life_stage_feeding: LifeStageFeedingBracket[] | null

  water_bowl_description: string | null
  soaking_behavior: string | null
  brumation_required: boolean
  brumation_notes: string | null
  defensive_displays: string[]

  lifespan_captivity_min_yrs: number | null
  lifespan_captivity_max_yrs: number | null

  cites_appendix: CitesAppendix | null
  iucn_status: IucnStatus | null
  wild_population_notes: string | null

  has_morph_market: boolean
  morph_complexity: MorphComplexity | null

  care_guide: string | null
  image_url: string | null
  source_url: string | null
  sources: Citation[] | null

  is_verified: boolean
  community_rating: number
  times_kept: number
  content_last_reviewed_at: string | null
  created_at: string
  updated_at: string | null
}

interface PaginatedResponse {
  items: ReptileSpecies[]
  total: number
  skip: number
  limit: number
  has_more: boolean
}

// ---------------------------------------------------------------------------
// Fetchers. Return `null` on failure so pages can render a degraded-but-safe
// state instead of surfacing a Next.js error boundary.
// ---------------------------------------------------------------------------

export async function fetchReptileSpecies(): Promise<ReptileSpecies[] | null> {
  try {
    const res = await fetch(
      // Trailing slash — matches the router mount. FastAPI redirects slashes
      // off, so calling without it can 307 and drop headers.
      `${API_URL}/api/v1/reptile-species/?verified_only=true&limit=100`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as PaginatedResponse
    return data.items
  } catch {
    return null
  }
}

export async function fetchReptileSpeciesById(
  id: string,
): Promise<ReptileSpecies | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/v1/reptile-species/${encodeURIComponent(id)}`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    )
    if (!res.ok) return null
    return (await res.json()) as ReptileSpecies
  } catch {
    return null
  }
}

/**
 * Fetch a reptile species by its URL slug. Public, unauthenticated — backs
 * the `/species/{slug}` SEO route. Backend normalizes via `.strip().lower()`
 * and is case-insensitive, but we lowercase here too so the CDN cache key
 * stays stable for visually-identical URLs.
 *
 * Returns null for 404 so the page can surface Next's `notFound()` without a
 * Sentry error.
 */
export async function fetchReptileSpeciesBySlug(
  slug: string,
): Promise<ReptileSpecies | null> {
  try {
    const normalized = slug.trim().toLowerCase()
    if (!normalized) return null
    const res = await fetch(
      `${API_URL}/api/v1/reptile-species/by-slug/${encodeURIComponent(normalized)}`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    )
    if (!res.ok) return null
    return (await res.json()) as ReptileSpecies
  } catch {
    return null
  }
}

/**
 * Lightweight search result for the autocomplete picker. Matches
 * ReptileSpeciesSearchResult on the backend. Kept separate from
 * ReptileSpecies so we don't pay for the full care-sheet payload on every
 * keystroke.
 */
export interface ReptileSpeciesSearchResult {
  id: string
  slug: string
  scientific_name: string
  common_names: string[]
  care_level: CareLevel | null
  image_url: string | null
}

/**
 * Autocomplete search — returns at most `limit` matches. Unauthenticated
 * endpoint, so we use plain fetch (no bearer). Called client-side from the
 * autocomplete component, so we skip Next's fetch cache.
 */
export async function searchReptileSpecies(
  q: string,
  limit = 10,
): Promise<ReptileSpeciesSearchResult[]> {
  if (q.trim().length < 2) return []
  const url =
    `${API_URL}/api/v1/reptile-species/search` +
    `?q=${encodeURIComponent(q.trim())}&limit=${limit}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`)
  }
  return (await res.json()) as ReptileSpeciesSearchResult[]
}

// ---------------------------------------------------------------------------
// Display helpers. Kept here so list + detail pages format consistently.
// ---------------------------------------------------------------------------

/** "Python" | "Python — Royal Python" depending on what's populated. */
export function displayTitle(species: ReptileSpecies): string {
  return species.common_names[0] || species.scientific_name
}

/** Format a Decimal-as-string range into a human label. */
export function formatRange(
  min: string | null,
  max: string | null,
  unit: string,
): string | null {
  if (min == null && max == null) return null
  const fmt = (v: string | null) => (v == null ? '—' : trimZeros(v))
  if (min != null && max != null && min === max) return `${fmt(min)} ${unit}`
  return `${fmt(min)}–${fmt(max)} ${unit}`
}

export function formatIntRange(
  min: number | null,
  max: number | null,
  unit: string,
): string | null {
  if (min == null && max == null) return null
  const fmt = (v: number | null) => (v == null ? '—' : String(v))
  if (min != null && max != null && min === max) return `${fmt(min)}${unit}`
  return `${fmt(min)}–${fmt(max)}${unit}`
}

export function trimZeros(v: string): string {
  // "72.00" → "72", "1.50" → "1.5"
  return v.replace(/\.?0+$/, '')
}

/**
 * URL-safe slug: lowercase, ASCII-folded, hyphen-separated. Mirrors the
 * backend `app/utils/slugs.py` implementation so local sitemap fallbacks or
 * optimistic link previews match what the server would produce.
 *
 * Used as a defensive fallback only — authoritative slugs come from the DB
 * (`species.slug`). Don't use this to *generate* a canonical URL in a
 * component: read it off `species.slug` so editorial overrides are honored.
 */
export function slugify(text: string): string {
  if (!text) return ''
  // NFKD normalize, strip combining marks, ASCII-fold. `normalize` is widely
  // supported in modern Node + evergreen browsers — safe for server/client.
  const ascii = text
    .normalize('NFKD')
    // Drop combining marks ("café" → "cafe") and anything non-ASCII.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7f]/g, '')
    .toLowerCase()
  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const HANDLEABILITY_LABELS: Record<Handleability, string> = {
  docile: 'Docile',
  defensive: 'Defensive',
  nippy: 'Nippy',
  hands_off: 'Hands-off',
}

export const ACTIVITY_LABELS: Record<ActivityPeriod, string> = {
  diurnal: 'Diurnal',
  nocturnal: 'Nocturnal',
  crepuscular: 'Crepuscular',
}

export const ENCLOSURE_LABELS: Record<EnclosureType, string> = {
  terrestrial: 'Terrestrial',
  arboreal: 'Arboreal',
  semi_arboreal: 'Semi-arboreal',
  fossorial: 'Fossorial (burrowing)',
}

export const DIET_LABELS: Record<DietType, string> = {
  strict_carnivore: 'Strict carnivore',
  insectivore: 'Insectivore',
  omnivore: 'Omnivore',
  herbivore: 'Herbivore',
}

export const UVB_LABELS: Record<UvbType, string> = {
  T5_HO: 'T5 HO',
  T8: 'T8',
  not_required: 'Not required',
}

/** IUCN Red List status labels. */
export const IUCN_LABELS: Record<IucnStatus, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
}

/** Activity period → emoji hint for card headers. */
export const ACTIVITY_ICONS: Record<ActivityPeriod, string> = {
  diurnal: '☀️',
  nocturnal: '🌙',
  crepuscular: '🌆',
}
