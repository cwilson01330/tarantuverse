/**
 * The species catalog, normalised across all taxa.
 *
 * WHY TWO SOURCES
 * ---------------
 * Tarantulas come from /species and everything else from /invert-species/.
 * It would be tidier to read the unified invert_species catalog for all ten
 * taxa — except all 197 mirrored tarantula rows have `venom_severity = NULL`.
 * Tarantula danger lives in `species.medically_significant_venom`, which
 * invert_species doesn't carry. Reading one source would silently drop the
 * "Hot venom" flag from Poecilotheria, Stromatopelma and Heteroscodra.
 * Merge the two until that data gap is backfilled.
 *
 * Shared by the species browser and the add flow so the taxon a species
 * belongs to — and the husbandry defaults it carries — are resolved the same
 * way in both places.
 */
import { apiClient } from '../services/api';

export interface CatalogSpecies {
  id: string;
  taxon: string;
  scientific_name: string;
  common_names: string[];
  care_level: string | null;
  /**
   * Free text from the catalog, NOT the `enclosure_type` enum.
   *
   * This comment used to claim "terrestrial / arboreal / fossorial" and the
   * add flow believed it, copying the value straight into `enclosure_type`.
   * Production disagrees: `semi-arboreal`, `terrestrial/semi-arboreal`,
   * `terrestrial/fossorial`, `scansorial`, `psammophile`, `orb-weaver (web)`
   * and `cobweb (terrestrial)` all exist. Anything but the three bare enum
   * values 422s on create. Run it through `normalizeEnclosureType()` before
   * it goes anywhere near a payload.
   */
  type: string | null;
  adult_size: string | null;
  native_region: string | null;
  image_url: string | null;
  is_verified: boolean;
  times_kept: number;
  hotVenom: boolean;
  communal: boolean;

  // Husbandry defaults — the reason the add flow can prefill instead of
  // asking the keeper to retype what the care sheet already knows.
  enclosure_size_sling: string | null;
  enclosure_size_juvenile: string | null;
  enclosure_size_adult: string | null;
  substrate_type: string | null;
  substrate_depth: string | null;
  temperature_min: number | null;
  temperature_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  water_dish_required: boolean | null;
}

function normalise(s: any, taxon: string, hotVenom: boolean, communal: boolean): CatalogSpecies {
  return {
    id: s.id,
    taxon,
    scientific_name: s.scientific_name,
    common_names: s.common_names ?? [],
    care_level: s.care_level ?? null,
    type: s.type ?? null,
    adult_size: s.adult_size ?? null,
    native_region: s.native_region ?? null,
    image_url: s.image_url ?? null,
    is_verified: !!s.is_verified,
    times_kept: s.times_kept ?? 0,
    hotVenom,
    communal,
    enclosure_size_sling: s.enclosure_size_sling ?? null,
    enclosure_size_juvenile: s.enclosure_size_juvenile ?? null,
    enclosure_size_adult: s.enclosure_size_adult ?? null,
    substrate_type: s.substrate_type ?? null,
    substrate_depth: s.substrate_depth ?? null,
    temperature_min: s.temperature_min ?? null,
    temperature_max: s.temperature_max ?? null,
    humidity_min: s.humidity_min ?? null,
    humidity_max: s.humidity_max ?? null,
    water_dish_required:
      typeof s.water_dish_required === 'boolean' ? s.water_dish_required : null,
  };
}

export interface CatalogResult {
  species: CatalogSpecies[];
  /** True when at least one source failed — lets callers say so honestly
   *  instead of presenting a partial catalog as complete. */
  partial: boolean;
}

export async function loadSpeciesCatalog(): Promise<CatalogResult> {
  const [tRes, iRes] = await Promise.all([
    apiClient.get<any>('/species', { params: { limit: 1000 } }).catch(() => null),
    apiClient.get<any>('/invert-species/', { params: { limit: 1000 } }).catch(() => null),
  ]);

  const tItems: any[] = Array.isArray(tRes?.data) ? tRes.data : tRes?.data?.items ?? [];
  const tarantulas = tItems.map((s) =>
    normalise(s, 'tarantula', !!s.medically_significant_venom, false),
  );

  const iItems: any[] = Array.isArray(iRes?.data) ? iRes.data : iRes?.data?.items ?? [];
  const inverts = iItems
    // Drop mirrored tarantulas — already present above WITH their venom flags,
    // which the mirror lacks.
    .filter((s) => s.taxon !== 'tarantula')
    .map((s) =>
      normalise(
        s,
        s.taxon,
        s.venom_severity === 'medically_significant',
        !!s.communal_suitable,
      ),
    );

  return {
    species: [...tarantulas, ...inverts],
    partial: !tRes || !iRes,
  };
}

/**
 * Map the catalog's free-text `type` onto the `enclosure_type` enum, or to
 * null when no honest mapping exists.
 *
 * WHY THIS EXISTS
 * ---------------
 * Brooke could add every tarantula except Psalmopoeus cambridgei, whose
 * catalog `type` is `semi-arboreal`. The add flow sent that verbatim as
 * `enclosure_type`, which is CHECK-constrained to terrestrial | arboreal |
 * fossorial on `tarantulas`, `inverts` AND `colonies`, so the create 422'd —
 * but only when "Use the care sheet's husbandry" was on, which is why it
 * looked like one broken species rather than a broken field.
 *
 * FIRST TERM WINS. `terrestrial/semi-arboreal` (GBB, OBT) is a terrestrial
 * animal that webs upward, and `terrestrial/fossorial` (C. elegans) is a
 * terrestrial animal that burrows — in both the leading word is the primary
 * habit and the enclosure it wants. Scanning left to right also makes
 * `cobweb (terrestrial)` and `orb-web (arboreal)` fall out correctly.
 *
 * Unrecognised terms return null rather than a guess. `scansorial` and
 * `psammophile` (scorpions) and `orb-weaver (web)` (true spiders) describe
 * housing this three-value enum genuinely cannot express; omitting the field
 * leaves it blank for the keeper to fill, which is honest. Inventing
 * "terrestrial" for a sand-dwelling scorpion would not be.
 *
 * 30 species across four taxa were unaddable-with-prefill before this
 * existed, not the one Brooke reported — 15 scorpions, 11 true spiders,
 * 4 tarantulas.
 */
export function normalizeEnclosureType(
  raw: string | null | undefined,
): 'terrestrial' | 'arboreal' | 'fossorial' | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  // Index of each term, -1 when absent; the earliest present term wins.
  // "arboreal" is deliberately matched as a substring so "semi-arboreal"
  // resolves to arboreal.
  const found = (['terrestrial', 'arboreal', 'fossorial'] as const)
    .map((term) => ({ term, at: s.indexOf(term) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  return found.length ? found[0].term : null;
}

/** Case-insensitive match on common OR scientific name. */
export function searchCatalog(rows: CatalogSpecies[], query: string, limit = 25): CatalogSpecies[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = rows
    .map((r) => {
      const sci = r.scientific_name.toLowerCase();
      const common = r.common_names.map((c) => c.toLowerCase());
      // Prefix matches rank above substring matches so typing "bra" surfaces
      // "Brazilian …" before "Chilean … brasiliensis".
      if (sci.startsWith(q) || common.some((c) => c.startsWith(q))) return { r, rank: 0 };
      if (sci.includes(q) || common.some((c) => c.includes(q))) return { r, rank: 1 };
      return null;
    })
    .filter(Boolean) as { r: CatalogSpecies; rank: number }[];

  return scored
    .sort((a, b) => a.rank - b.rank || b.r.times_kept - a.r.times_kept)
    .slice(0, limit)
    .map((s) => s.r);
}
