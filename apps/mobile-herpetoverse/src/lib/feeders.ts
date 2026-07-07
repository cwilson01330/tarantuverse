/**
 * HV Feeder Keeping API client (ADR-012).
 *
 * Two surfaces:
 *   • CATALOG  — public feeder species (rodents, fish, insects, chicks, other)
 *   • STOCKS   — the keeper's own supply: a LIVE colony or FROZEN freezer
 *                inventory, tracked either as a flat `count` or per-size
 *                buckets (`sized`: {"pinky":20,"hopper":8,"adult":12}).
 *
 * The killer path is frozen inventory: a "Used" on a bucket posts a log with
 * a SIGNED negative `count_delta`, and the backend decrements the matching
 * bucket (flooring at 0). "Restock" posts a positive delta.
 *
 * apiClient baseURL ALREADY includes `/api/v1` (see services/api.ts and the
 * `feedback_mobile_apiclient_baseurl_double_prefix` memory), so every path
 * here starts at the resource — never `/api/v1/hv-feeder-...`.
 *
 * Endpoint paths mirror the FastAPI routers exactly
 * (apps/api/app/routers/hv_feeder_species.py + hv_feeder_stocks.py); a wrong
 * slug 404s silently because the route just isn't registered.
 */
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Types — mirror apps/api/app/schemas/hv_feeder.py
// ---------------------------------------------------------------------------

export type FeederCategory = 'rodent' | 'fish' | 'insect' | 'chick' | 'other';
export type FeederForm = 'live' | 'frozen';
export type FeederInventoryMode = 'count' | 'sized';
export type FeederLogType =
  | 'restock'
  | 'used'
  | 'cleaned'
  | 'bred'
  | 'died'
  | 'count_correction';

export interface FeederCategoryMeta {
  key: FeederCategory;
  label: string;
  /** Plural label for filter chips / section headers. */
  plural: string;
  glyph: string;
}

/** Catalog category registry — the single source of truth for chips/glyphs. */
export const FEEDER_CATEGORIES: Record<FeederCategory, FeederCategoryMeta> = {
  rodent: { key: 'rodent', label: 'Rodent', plural: 'Rodents', glyph: '🐭' },
  fish: { key: 'fish', label: 'Fish', plural: 'Fish', glyph: '🐟' },
  insect: { key: 'insect', label: 'Insect', plural: 'Insects', glyph: '🦗' },
  chick: { key: 'chick', label: 'Chick', plural: 'Chicks', glyph: '🐣' },
  other: { key: 'other', label: 'Other', plural: 'Other', glyph: '🍽️' },
};

export const FEEDER_CATEGORY_ORDER: FeederCategory[] = [
  'rodent',
  'fish',
  'insect',
  'chick',
  'other',
];

export function feederCategoryGlyph(category: string): string {
  return FEEDER_CATEGORIES[category as FeederCategory]?.glyph ?? '🍽️';
}

/** Emoji for a stock's form (live colony vs frozen freezer). */
export function feederFormGlyph(form: FeederForm): string {
  return form === 'live' ? '🌱' : '🧊';
}

export interface HvFeederSpecies {
  id: string;
  scientific_name: string;
  common_names: string[] | null;
  category: FeederCategory;
  care_level: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  supports_sizes: boolean;
  /** Array e.g. ["pinky","fuzzy","hopper","adult"] — used to seed bucket names. */
  typical_sizes: string[] | null;
  typical_adult_size_mm: number | null;
  prey_size_notes: string | null;
  care_notes: string | null;
  handling_notes: string | null;
  image_url: string | null;
  is_verified: boolean;
}

/** A per-size bucket map, e.g. { pinky: 20, hopper: 8, adult: 12 }. */
export type SizedCounts = Record<string, number>;

export interface HvFeederStock {
  id: string;
  user_id: string;
  name: string;
  hv_feeder_species_id: string | null;
  form: FeederForm;
  inventory_mode: FeederInventoryMode;
  count: number | null;
  sized_counts: SizedCounts | null;
  storage_location: string | null;
  low_threshold: number | null;
  notes: string | null;
  last_restocked: string | null;
  last_used: string | null;
  last_cleaned: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  // Server-computed
  total_count: number | null;
  is_low_stock: boolean;
  species_display_name: string | null;
}

export interface HvFeederLog {
  id: string;
  hv_feeder_stock_id: string;
  user_id: string;
  log_type: FeederLogType;
  size: string | null;
  count_delta: number | null;
  logged_at: string;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Catalog (public)
// ---------------------------------------------------------------------------

export interface ListFeederSpeciesParams {
  q?: string;
  category?: FeederCategory;
  limit?: number;
}

export async function listFeederSpecies(
  params: ListFeederSpeciesParams = {},
): Promise<HvFeederSpecies[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  qs.set('limit', String(params.limit ?? 200));
  const { data } = await apiClient.get<HvFeederSpecies[]>(
    `/hv-feeder-species/?${qs.toString()}`,
  );
  return data;
}

export async function getFeederSpecies(id: string): Promise<HvFeederSpecies> {
  const { data } = await apiClient.get<HvFeederSpecies>(
    `/hv-feeder-species/${encodeURIComponent(id)}`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Stocks (auth)
// ---------------------------------------------------------------------------

export async function listFeederStocks(
  includeInactive = false,
): Promise<HvFeederStock[]> {
  const qs = includeInactive ? '?include_inactive=true' : '';
  const { data } = await apiClient.get<HvFeederStock[]>(
    `/hv-feeder-stocks/${qs}`,
  );
  return data;
}

export async function getFeederStock(id: string): Promise<HvFeederStock> {
  const { data } = await apiClient.get<HvFeederStock>(
    `/hv-feeder-stocks/${encodeURIComponent(id)}`,
  );
  return data;
}

export interface CreateFeederStockPayload {
  name: string;
  hv_feeder_species_id?: string | null;
  form: FeederForm;
  inventory_mode: FeederInventoryMode;
  count?: number | null;
  sized_counts?: SizedCounts | null;
  storage_location?: string | null;
  low_threshold?: number | null;
  notes?: string | null;
}

export async function createFeederStock(
  payload: CreateFeederStockPayload,
): Promise<HvFeederStock> {
  const { data } = await apiClient.post<HvFeederStock>(
    '/hv-feeder-stocks/',
    payload,
  );
  return data;
}

export type UpdateFeederStockPayload = Partial<CreateFeederStockPayload> & {
  is_active?: boolean;
};

export async function updateFeederStock(
  id: string,
  payload: UpdateFeederStockPayload,
): Promise<HvFeederStock> {
  const { data } = await apiClient.put<HvFeederStock>(
    `/hv-feeder-stocks/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteFeederStock(id: string): Promise<void> {
  await apiClient.delete(`/hv-feeder-stocks/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Logs (used / restock / cleaned / …) — backend adjusts inventory
// ---------------------------------------------------------------------------

export async function listFeederLogs(
  stockId: string,
): Promise<HvFeederLog[]> {
  const { data } = await apiClient.get<HvFeederLog[]>(
    `/hv-feeder-stocks/${encodeURIComponent(stockId)}/logs`,
  );
  return data;
}

export interface CreateFeederLogPayload {
  log_type: FeederLogType;
  /** Which size bucket (sized mode only). */
  size?: string | null;
  /** SIGNED — negative for `used`, positive for `restock`. */
  count_delta?: number | null;
  logged_at?: string | null;
  notes?: string | null;
}

export async function createFeederLog(
  stockId: string,
  payload: CreateFeederLogPayload,
): Promise<HvFeederLog> {
  const { data } = await apiClient.post<HvFeederLog>(
    `/hv-feeder-stocks/${encodeURIComponent(stockId)}/logs`,
    payload,
  );
  return data;
}

export async function deleteFeederLog(logId: string): Promise<void> {
  await apiClient.delete(`/hv-feeder-stocks/logs/${encodeURIComponent(logId)}`);
}

// ---------------------------------------------------------------------------
// Quick-action helpers — the sized-bucket "Used"/"Restock" flow
// ---------------------------------------------------------------------------

/**
 * Mark N units USED. For sized stock, pass the bucket in `size`; for count
 * stock omit it. `amount` is a positive magnitude — we send it as a negative
 * delta so the backend decrements. Returns the updated stock so the caller
 * can re-read total_count / is_low_stock without a second fetch.
 */
export async function markFeederUsed(
  stockId: string,
  amount = 1,
  size?: string | null,
): Promise<HvFeederStock> {
  await createFeederLog(stockId, {
    log_type: 'used',
    size: size ?? undefined,
    count_delta: -Math.abs(amount),
  });
  return getFeederStock(stockId);
}

/**
 * RESTOCK N units. `amount` is positive. For sized stock pass `size`; for
 * count stock omit it. Returns the refreshed stock.
 */
export async function markFeederRestocked(
  stockId: string,
  amount = 1,
  size?: string | null,
): Promise<HvFeederStock> {
  await createFeederLog(stockId, {
    log_type: 'restock',
    size: size ?? undefined,
    count_delta: Math.abs(amount),
  });
  return getFeederStock(stockId);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Ordered [size, count] pairs for a sized stock (stable, non-zero-friendly). */
export function sizedEntries(stock: HvFeederStock): Array<[string, number]> {
  if (stock.inventory_mode !== 'sized' || !stock.sized_counts) return [];
  return Object.entries(stock.sized_counts).map(([k, v]) => [
    k,
    Number(v) || 0,
  ]);
}

/** One-line inventory summary: "Pinky 20 · Hopper 8 · Adult 12" or "42". */
export function inventorySummary(stock: HvFeederStock): string {
  if (stock.inventory_mode === 'sized') {
    const entries = sizedEntries(stock);
    if (entries.length === 0) return '0';
    return entries
      .map(([size, n]) => `${titleize(size)} ${n}`)
      .join('  ·  ');
  }
  return String(stock.total_count ?? stock.count ?? 0);
}

/** "pinky" → "Pinky", "adult_male" → "Adult Male". */
export function titleize(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function feederStockTitle(stock: HvFeederStock): string {
  return stock.name || stock.species_display_name || 'Feeder stock';
}
