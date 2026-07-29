/**
 * Generic invert API client + taxon registry — ADR-007.
 *
 * Replaces the per-taxon libs (scorpions.ts / centipedes.ts / whip-spiders.ts)
 * with one config-driven surface that the generic mobile invert screens read.
 * Adding a taxon = one entry in INVERT_TAXA + a backend seed + facade routers.
 *
 * Data plane:
 *  - Animal CRUD reads the unified table: list/get/delete via /inverts/,
 *    create via the per-taxon facade POST /{prefix}/ (the InvertCreate schema
 *    forces taxon there and avoids the generic taxon-pattern coupling).
 *  - Logs + species use the per-taxon facade prefix.
 *
 * apiClient baseURL already includes /api/v1 — paths start at the resource.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Taxon registry — the single source of truth for the generic screens.
// ---------------------------------------------------------------------------

export type InvertTaxon =
  // Tarantula IS an invert taxon. It was left out of this union originally
  // because it predates the registry and had its own bespoke screens; the
  // result was a slow accumulation of `taxon === 'tarantula' ? … : …` special
  // cases at every lookup site, and ultimately two detail screens that drifted
  // apart (see ADR-013). Membership here is what makes it stop being special.
  //
  // NOTE: this union is now "every taxon that exists", NOT "every taxon a
  // picker should offer". Use PICKER_TAXA for the latter.
  | 'tarantula'
  | 'scorpion'
  | 'centipede'
  | 'whip_spider'
  | 'vinegaroon'
  | 'true_spider'
  | 'millipede'
  | 'mantis'
  | 'roach'
  | 'other';

export type FeedingMode = 'predator' | 'detritivore' | 'omnivore';
export type Safety = 'harmless' | 'venom';

export interface InvertTaxonMeta {
  key: InvertTaxon;
  label: string;
  /** Bottom-left collection card stamp + add-picker glyph. */
  glyph: string;
  /** Per-animal facade prefix for logs/photos/create, e.g. 'whip-spiders'. */
  prefix: string;
  /** Per-taxon species catalog prefix, e.g. 'whip-spider-species'. */
  speciesPrefix: string;
  /** "Leg span" for whip spiders, "Length" for the rest. */
  sizeLabel: string;
  /** Default husbandry framing. Detritivores skip live-prey cadence. */
  feedingMode: FeedingMode;
  /** Drives the care-sheet safety treatment. */
  safety: Safety;
  /** Default enclosure orientation for the add/edit chip group. */
  defaultEnclosureType: 'arboreal' | 'terrestrial' | 'fossorial';
  /** 'other' is the freehand catch-all (no required species match). */
  freeform?: boolean;
}

export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = {
  tarantula: {
    key: 'tarantula', label: 'Tarantula', glyph: '🕷️', prefix: 'tarantulas',
    speciesPrefix: 'species', sizeLabel: 'Leg span (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'terrestrial',
  },
  scorpion: {
    key: 'scorpion', label: 'Scorpion', glyph: '🦂', prefix: 'scorpions',
    speciesPrefix: 'scorpion-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'fossorial',
  },
  centipede: {
    key: 'centipede', label: 'Centipede', glyph: '🐛', prefix: 'centipedes',
    speciesPrefix: 'centipede-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'fossorial',
  },
  whip_spider: {
    key: 'whip_spider', label: 'Whip spider', glyph: '🕸️', prefix: 'whip-spiders',
    speciesPrefix: 'whip-spider-species', sizeLabel: 'Leg span (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'arboreal',
  },
  vinegaroon: {
    key: 'vinegaroon', label: 'Vinegaroon', glyph: '🦂', prefix: 'vinegaroons',
    speciesPrefix: 'vinegaroon-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'fossorial',
  },
  true_spider: {
    key: 'true_spider', label: 'True spider', glyph: '🕷', prefix: 'true-spiders',
    speciesPrefix: 'true-spider-species', sizeLabel: 'Leg span (mm)', feedingMode: 'predator',
    safety: 'venom', defaultEnclosureType: 'arboreal',
  },
  millipede: {
    key: 'millipede', label: 'Millipede', glyph: '🪱', prefix: 'millipedes',
    speciesPrefix: 'millipede-species', sizeLabel: 'Length (mm)', feedingMode: 'detritivore',
    safety: 'harmless', defaultEnclosureType: 'terrestrial',
  },
  mantis: {
    key: 'mantis', label: 'Mantis', glyph: '🦗', prefix: 'mantises',
    speciesPrefix: 'mantis-species', sizeLabel: 'Length (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'arboreal',
  },
  roach: {
    key: 'roach', label: 'Roach', glyph: '🪳', prefix: 'roaches',
    speciesPrefix: 'roach-species', sizeLabel: 'Length (mm)', feedingMode: 'omnivore',
    safety: 'harmless', defaultEnclosureType: 'terrestrial',
  },
  other: {
    key: 'other', label: 'Other invertebrate', glyph: '🐾', prefix: 'other-inverts',
    speciesPrefix: 'other-invert-species', sizeLabel: 'Size (mm)', feedingMode: 'predator',
    safety: 'harmless', defaultEnclosureType: 'terrestrial', freeform: true,
  },
};

/** Every taxon, in display order. Tarantula leads — it's the biggest surface. */
export const INVERT_TAXON_ORDER: InvertTaxon[] = [
  'tarantula', 'scorpion', 'centipede', 'whip_spider', 'vinegaroon',
  'true_spider', 'millipede', 'mantis', 'roach', 'other',
];

/**
 * Taxa a COLONY picker should offer.
 *
 * Communal tarantula keeping is a fringe practice with a poor survival record,
 * so we don't put it in front of keepers as a suggested setup — but 'tarantula'
 * remains valid at the DB level for the handful of communal setups migrated in
 * (ADR-010), which is why this is a picker-level exclusion rather than a
 * constraint.
 *
 * This constant exists so that exclusion is a NAMED, greppable decision. It
 * used to be expressed as tarantula's absence from the taxon union, which
 * meant "we chose not to offer this" and "this doesn't exist" were the same
 * fact — and any lookup of tarantula metadata silently returned undefined.
 */
export const PICKER_TAXA: InvertTaxon[] = INVERT_TAXON_ORDER.filter(
  (t) => t !== 'tarantula',
);

/**
 * Type guard for "is this a known taxon".
 *
 * NB: this now returns true for 'tarantula'. If you're using it to mean "is
 * this offerable in a colony picker", you want PICKER_TAXA.includes() instead.
 */
export function isInvertTaxon(t: string | null | undefined): t is InvertTaxon {
  return t != null && t in INVERT_TAXA;
}

export const FEEDING_MODE_LABELS: Record<FeedingMode, string> = {
  predator: 'Predator (live prey)',
  detritivore: 'Detritivore (decaying matter)',
  omnivore: 'Omnivore',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';
export type Source = 'bred' | 'bought' | 'wild_caught';
export type Visibility = 'private' | 'public';
export type CareLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Invert {
  id: string;
  user_id: string;
  taxon: InvertTaxon;
  species_id: string | null;
  enclosure_id: string | null;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex | null;
  date_acquired: string | null;
  source: Source | null;
  price_paid: string | null;
  /** sling | juvenile | adult | null. Drives the species+stage feeding cadence
   *  and gates market-signal eligibility. */
  life_stage: string | null;
  current_instar: number | null;
  current_length_mm: string | null;
  enclosure_type: string | null;
  enclosure_size: string | null;
  substrate_type: string | null;
  substrate_depth: string | null;
  last_substrate_change: string | null;
  target_temp_min: string | null;
  target_temp_max: string | null;
  target_humidity_min: string | null;
  target_humidity_max: string | null;
  water_dish: boolean;
  misting_schedule: string | null;
  last_enclosure_cleaning: string | null;
  enclosure_notes: string | null;
  feeding_paused_reason: string | null;
  feeding_paused_until: string | null;
  photo_url: string | null;
  is_public: boolean;
  visibility: Visibility | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  // Provenance / transfer ("rehome") — BRIEF-animal-transfer-provenance
  provenance?: Record<string, any> | null;
  bred_by_user_id?: string | null;
  origin_keeper_name?: string | null;
  transferred_out_at?: string | null;
}

export interface TransferCreateResponse {
  token: string;
  claim_url: string;
  expires_at: string;
}

export type InvertCreate = Partial<Omit<Invert, 'id' | 'user_id' | 'taxon' | 'created_at' | 'updated_at' | 'is_public'>>;
export type InvertUpdate = InvertCreate;

export interface InvertSpecies {
  id: string;
  taxon: InvertTaxon;
  scientific_name: string;
  scientific_name_lower: string;
  slug: string;
  common_names: string[];
  genus: string | null;
  family: string | null;
  order_name: string | null;
  care_level: CareLevel | null;
  temperament: string | null;
  native_region: string | null;
  adult_size: string | null;
  adult_length_min_mm: string | null;
  adult_length_max_mm: string | null;
  growth_rate: string | null;
  type: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  enclosure_size_sling: string | null;
  enclosure_size_juvenile: string | null;
  enclosure_size_adult: string | null;
  substrate_depth: string | null;
  substrate_type: string | null;
  feeding_mode: FeedingMode | null;
  prey_size: string | null;
  feeding_frequency_sling: string | null;
  feeding_frequency_juvenile: string | null;
  feeding_frequency_adult: string | null;
  water_dish_required: boolean;
  communal_suitable: boolean;
  venom_severity: string | null;
  venom_notes: string | null;
  care_guide: string | null;
  image_url: string | null;
  /** CC-BY credit line. The column has existed on invert_species all along;
   *  it was just missing from this interface, so the care sheet had no way to
   *  render it. All 93 non-tarantula images are credited in the DB. */
  image_attribution: string | null;
  is_verified: boolean;
  times_kept: number;
}

export interface InvertFeedingLog { id: string; invert_id: string | null; fed_at: string; food_type: string | null; food_size: string | null; accepted: boolean; notes: string | null; }
export interface InvertMoltLog {
  id: string;
  invert_id: string | null;
  molted_at: string;
  premolt_started_at: string | null;
  notes: string | null;
  // Per-molt measurements (ADR-008 growth module). Columns are named
  // leg_span_* for legacy reasons; for non-spider taxa the value is the
  // body length — labels come from growthLengthLabel() in taxon-modules.
  leg_span_before?: number | string | null;
  leg_span_after?: number | string | null;
  weight_before?: number | string | null;
  weight_after?: number | string | null;
}

/** Optional per-molt measurements accepted by the molt endpoints. */
export interface InvertMoltMeasurements {
  /** When premolt was first observed. Optional and often genuinely unknown.
   *  Feeds premolt_service's interval analysis. */
  premolt_started_at?: string | null;
  leg_span_before?: number | null;
  leg_span_after?: number | null;
  weight_before?: number | null;
  weight_after?: number | null;
}

/** Growth analytics from /inverts/{id}/growth (mirrors GrowthChart's shape). */
export interface InvertGrowthAnalytics {
  invert_id: string;
  data_points: {
    date: string;
    weight: number | string | null;
    leg_span: number | string | null;
    days_since_previous: number | null;
    weight_change: number | string | null;
    leg_span_change: number | string | null;
  }[];
  total_molts: number;
  average_days_between_molts: number | null;
  total_weight_gain: number | string | null;
  total_leg_span_gain: number | string | null;
  growth_rate_weight: number | string | null;
  growth_rate_leg_span: number | string | null;
  last_molt_date: string | null;
  days_since_last_molt: number | null;
}
export interface InvertSubstrateChange { id: string; invert_id: string | null; changed_at: string; substrate_type: string | null; substrate_depth: string | null; reason: string | null; notes: string | null; }
export interface InvertPhoto { id: string; url: string; thumbnail_url: string | null; caption: string | null; }

// ---------------------------------------------------------------------------
// Animal CRUD
// ---------------------------------------------------------------------------

/** List the whole cross-taxon collection (every invert taxon). */
export async function listInverts(): Promise<Invert[]> {
  const { data } = await apiClient.get<Invert[]>('/inverts/');
  return data;
}

export async function getInvert(id: string): Promise<Invert> {
  const { data } = await apiClient.get<Invert>(`/inverts/${id}`);
  return data;
}

/** Create via the generic surface — taxon goes in the body (works for
 * every taxon; no per-taxon router required). */
export async function createInvert(taxon: InvertTaxon, payload: InvertCreate): Promise<Invert> {
  const { data } = await apiClient.post<Invert>('/inverts/', { taxon, ...payload });
  return data;
}

export async function updateInvert(id: string, payload: InvertUpdate): Promise<Invert> {
  const { data } = await apiClient.put<Invert>(`/inverts/${id}`, payload);
  return data;
}

export async function deleteInvert(id: string): Promise<void> {
  await apiClient.delete(`/inverts/${id}`);
}

/** Create a transfer ("rehome") claim link for an animal the caller owns. */
export async function createInvertTransfer(
  id: string,
  payload: { note?: string | null; sale_price?: number | null; include_photos?: boolean },
): Promise<TransferCreateResponse> {
  const { data } = await apiClient.post<TransferCreateResponse>(`/inverts/${id}/transfer`, payload);
  return data;
}

// ---------------------------------------------------------------------------
// Species catalog (public)
// ---------------------------------------------------------------------------

export async function listInvertSpecies(taxon: InvertTaxon, limit = 200): Promise<InvertSpecies[]> {
  const { data } = await apiClient.get<InvertSpecies[]>('/invert-species/', { params: { taxon, limit } });
  return data;
}

export async function searchInvertSpecies(taxon: InvertTaxon, q: string, limit = 8): Promise<InvertSpecies[]> {
  const { data } = await apiClient.get<InvertSpecies[]>('/invert-species/search', { params: { q, taxon, limit } });
  return data;
}

export async function getInvertSpecies(id: string): Promise<InvertSpecies> {
  // The unified catalog returns any taxon by id.
  const { data } = await apiClient.get<InvertSpecies>(`/invert-species/${id}`);
  return data;
}

// ---------------------------------------------------------------------------
// Logs (parented by invert_id, reached through the per-taxon prefix)
// ---------------------------------------------------------------------------

// Logs go through the generic /inverts/{id}/… endpoints (ADR-007). The
// `taxon` arg is kept on the signatures for call-site clarity but isn't
// needed in the URL — any owned invert works.
export async function listInvertFeedings(_taxon: InvertTaxon, id: string): Promise<InvertFeedingLog[]> {
  const { data } = await apiClient.get<InvertFeedingLog[]>(`/inverts/${id}/feedings`);
  return data;
}
/** Feeding summary for one animal — taxon-agnostic. */
export interface InvertFeedingStats {
  invert_id: string;
  total_feedings: number;
  total_accepted: number;
  acceptance_rate: number;
  last_feeding_date: string | null;
  days_since_last_feeding: number | null;
  is_feeding_paused: boolean;
  feeding_paused_reason: string | null;
  feeding_paused_until: string | null;
  /** Species + life-stage aware. null = detritivore (no live-prey cadence).
   *  NOTE: for everything else the backend supplies a fallback rather than
   *  null, so check interval_source before presenting this as a schedule. */
  interval_days: number | null;
  /** 'species' = from the care sheet; 'stage_default' / 'generic_default' = a
   *  guess. Never render a default as a species schedule. */
  interval_source: string | null;
  is_overdue: boolean;
}

export async function getInvertFeedingStats(id: string): Promise<InvertFeedingStats> {
  // Calendar days in the keeper's zone — see the endpoint's tz_offset_minutes.
  const res = await apiClient.get(`/inverts/${id}/feeding-stats`, {
    params: { tz_offset_minutes: new Date().getTimezoneOffset() },
  });
  return res.data;
}

export async function createInvertFeeding(_taxon: InvertTaxon, id: string, payload: { fed_at: string; food_type?: string | null; food_size?: string | null; accepted?: boolean; notes?: string | null }): Promise<InvertFeedingLog> {
  const { data } = await apiClient.post<InvertFeedingLog>(`/inverts/${id}/feedings`, payload);
  return data;
}
export async function listInvertMolts(_taxon: InvertTaxon, id: string): Promise<InvertMoltLog[]> {
  const { data } = await apiClient.get<InvertMoltLog[]>(`/inverts/${id}/molts`);
  return data;
}
export async function createInvertMolt(_taxon: InvertTaxon, id: string, payload: { molted_at: string; notes?: string | null } & InvertMoltMeasurements): Promise<InvertMoltLog> {
  const { data } = await apiClient.post<InvertMoltLog>(`/inverts/${id}/molts`, payload);
  return data;
}
/** Growth analytics for any invert (generic endpoint — ADR-008). */
export async function getInvertGrowth(id: string): Promise<InvertGrowthAnalytics> {
  const { data } = await apiClient.get<InvertGrowthAnalytics>(`/inverts/${id}/growth`);
  return data;
}

/** Breeding (ADR-010 Phase D) — taxon-agnostic pairings on the inverts surface. */
export interface InvertPairing {
  id: string;
  male_invert_id: string | null;
  female_invert_id: string | null;
  paired_date: string;
  separated_date: string | null;
  pairing_type: string;
  outcome: string;
  notes: string | null;
}
export async function listInvertPairings(id: string): Promise<InvertPairing[]> {
  const { data } = await apiClient.get<InvertPairing[]>(`/inverts/${id}/pairings`);
  return data;
}
export async function createInvertPairing(payload: {
  male_invert_id: string;
  female_invert_id: string;
  paired_date: string;
  pairing_type?: string;
}): Promise<InvertPairing> {
  const { data } = await apiClient.post<InvertPairing>(`/inverts/pairings`, payload);
  return data;
}
/** Same-taxon collection for the breeding mate picker. */
export async function listInvertsByTaxon(taxon: InvertTaxon): Promise<Invert[]> {
  const { data } = await apiClient.get<Invert[]>(`/inverts/?taxon=${taxon}`);
  return data;
}
/** Single molt log by id — powers measurement prefill on the edit form. */
export async function getInvertMolt(moltId: string): Promise<InvertMoltLog> {
  const { data } = await apiClient.get<InvertMoltLog>(`/molts/${moltId}`);
  return data;
}
export async function listInvertSubstrateChanges(_taxon: InvertTaxon, id: string): Promise<InvertSubstrateChange[]> {
  const { data } = await apiClient.get<InvertSubstrateChange[]>(`/inverts/${id}/substrate-changes`);
  return data;
}
export async function createInvertSubstrateChange(_taxon: InvertTaxon, id: string, payload: { changed_at: string; substrate_type?: string | null; substrate_depth?: string | null; reason?: string | null; notes?: string | null }): Promise<InvertSubstrateChange> {
  const { data } = await apiClient.post<InvertSubstrateChange>(`/inverts/${id}/substrate-changes`, payload);
  return data;
}
export async function listInvertPhotos(_taxon: InvertTaxon, id: string): Promise<InvertPhoto[]> {
  const { data } = await apiClient.get<InvertPhoto[]>(`/inverts/${id}/photos`);
  return data;
}
export async function uploadInvertPhoto(_taxon: InvertTaxon, id: string, form: FormData): Promise<InvertPhoto> {
  const { data } = await apiClient.post<InvertPhoto>(`/inverts/${id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

// ---------------------------------------------------------------------------
// Log + photo mutations (ADR-008). These hit the by-id endpoints, which are
// polymorphic on the backend (_*_owner_parent covers invert_id), so the same
// rich edit/delete + set-hero UX tarantulas have works for every taxon.
// ---------------------------------------------------------------------------

export async function updateInvertFeeding(feedingId: string, payload: { fed_at?: string; food_type?: string | null; food_size?: string | null; accepted?: boolean; notes?: string | null }): Promise<InvertFeedingLog> {
  const { data } = await apiClient.put<InvertFeedingLog>(`/feedings/${feedingId}`, payload);
  return data;
}
export async function deleteInvertFeeding(feedingId: string): Promise<void> {
  await apiClient.delete(`/feedings/${feedingId}`);
}
export async function updateInvertMolt(moltId: string, payload: { molted_at?: string; notes?: string | null } & InvertMoltMeasurements): Promise<InvertMoltLog> {
  const { data } = await apiClient.put<InvertMoltLog>(`/molts/${moltId}`, payload);
  return data;
}
export async function deleteInvertMolt(moltId: string): Promise<void> {
  await apiClient.delete(`/molts/${moltId}`);
}
export async function updateInvertSubstrateChange(changeId: string, payload: { changed_at?: string; substrate_type?: string | null; substrate_depth?: string | null; reason?: string | null; notes?: string | null }): Promise<InvertSubstrateChange> {
  const { data } = await apiClient.put<InvertSubstrateChange>(`/substrate-changes/${changeId}`, payload);
  return data;
}
export async function deleteInvertSubstrateChange(changeId: string): Promise<void> {
  await apiClient.delete(`/substrate-changes/${changeId}`);
}

/** Promote an existing photo to the invert's hero/primary image. */
export async function setInvertMainPhoto(photoId: string): Promise<void> {
  await apiClient.patch(`/photos/${photoId}/set-main`);
}
export async function deleteInvertPhoto(photoId: string): Promise<void> {
  await apiClient.delete(`/photos/${photoId}`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function invertDisplayName(i: Invert): string {
  return i.name || i.common_name || i.scientific_name || `Unnamed ${INVERT_TAXA[i.taxon]?.label.toLowerCase() ?? 'invert'}`;
}

/**
 * MaterialCommunityIcons name for a taxon, for use as real UI (placeholders,
 * list rows, filter chips) rather than decoration.
 *
 * The `glyph` field on INVERT_TAXA is an emoji. Emoji render at the platform's
 * own colours and sizes, so a row that mixes an emoji for one taxon with an
 * MDI icon for another looks broken — which is exactly what happened on the
 * dashboard, where tarantulas got a dim MDI spider next to bright emoji
 * scorpions. Use this everywhere the icon is functional; keep the emoji for
 * the add-picker, where the playfulness is deliberate.
 *
 * Takes a plain string because feeding-status rows carry `taxon: string`, and
 * 'tarantula' is not in InvertTaxon (the registry excludes it by design).
 */
/**
 * Every name below was verified present in the bundled glyph map:
 *
 *   node -e "const m=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');console.log('spider' in m)"
 *
 * `ladybug-outline` is NOT present and must not be used — an unknown name
 * renders an empty box silently rather than throwing, so a typo ships.
 *
 * Tarantula and true spider deliberately share `spider`: they're both
 * Araneae, and MDI has exactly three spider glyphs for four arachnid taxa.
 * Sharing where the animals genuinely are alike beats inventing a difference.
 */
export function taxonMdiIcon(taxon: string): string {
  switch (taxon) {
    case 'tarantula':
    case 'true_spider':
      return 'spider';
    case 'scorpion':
      return 'zodiac-scorpio';
    case 'vinegaroon':
      // Distinct from scorpion — resolves the duplicate-glyph collision the
      // emoji registry has (both were 🦂).
      return 'spider-thread';
    case 'whip_spider':
      return 'spider-web';
    case 'centipede':
      return 'bug-outline';
    case 'millipede':
      return 'slash-forward';
    case 'mantis':
      return 'grass';
    case 'roach':
      return 'dots-hexagon';
    default:
      return 'paw';
  }
}
