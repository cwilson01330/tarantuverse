/**
 * Suggested population buckets per taxon.
 *
 * `stage_counts` is free-form JSONB (ADR-010) and stays that way — a keeper can
 * name a bucket anything. These are only *suggestions*, offered as one-tap chips
 * so nobody has to invent a vocabulary from a blank "Add a bucket" field.
 *
 * WHY THEY DIFFER BY TAXON
 * ------------------------
 * The shape of a colony census isn't the same across groups, and using one
 * generic set makes the feature useless for the keepers who most need it.
 *
 * Communal tarantulas (M. balfouri, Neoholothele incei, Hapalopus sp.):
 *   Sex cuts ACROSS life stages and "unsexed" is the normal state — slings
 *   generally can't be sexed, so most of a young communal sits unsexed and
 *   moves into a sexed bucket as animals mature and are ventrally sexed or
 *   confirmed from a molt. Mature males matter operationally: keepers often
 *   pull them, both to breed and because they stop eating and become targets.
 *
 * Feeder roaches (Blaptica dubia, Gromphadorhina portentosa):
 *   Sex applies to ADULTS ONLY. Adults sex on sight — dubia males have full
 *   wings and females vestigial ones; hisser males carry pronounced pronotal
 *   horns. Nymphs can't be reliably sexed, so they're a single unsexed bucket
 *   by definition, not an oversight. The number a breeder actually manages is
 *   the adult ratio; the commonly cited target for dubia is roughly one male
 *   to three to five females, since surplus males harass females and eat
 *   without producing.
 *
 * Detritivores (millipedes, isopods kept as cleanup crews):
 *   Rarely sexed at all in practice, and often not individually countable.
 *   Adults / juveniles, or a single mixed bucket, is the honest resolution.
 *
 * Anything not listed falls back to GENERIC_BUCKETS. Adding a taxon here is
 * config, not a migration.
 */
import type { InvertTaxon } from './inverts';

export const GENERIC_BUCKETS = ['Adults', 'Juveniles', 'Mixed'];

const BUCKETS_BY_TAXON: Partial<Record<InvertTaxon, string[]>> = {
  // Sex-by-stage. Unsexed leads because it's where a new communal starts.
  tarantula: ['Unsexed', 'Females', 'Males'],
  true_spider: ['Unsexed', 'Females', 'Males'],

  // Adults sex on sight; nymphs are unsexed by definition.
  roach: ['Adult females', 'Adult males', 'Nymphs'],

  // Communal scorpions are usually tracked by instar rather than sex —
  // sexing needs a ventral look at the pectines, which isn't casual.
  scorpion: ['Adults', 'Juveniles', 'Instars'],

  // Detritivores: counting is approximate and sexing isn't practical.
  millipede: ['Adults', 'Juveniles', 'Mixed'],
};

/** Suggested bucket names for a taxon, minus any the keeper already has. */
export function suggestedBuckets(
  taxon: string | null | undefined,
  existing: Record<string, unknown> = {},
): string[] {
  const preset = (taxon && BUCKETS_BY_TAXON[taxon as InvertTaxon]) || GENERIC_BUCKETS;
  const have = new Set(Object.keys(existing).map((k) => k.toLowerCase()));
  return preset.filter((b) => !have.has(b.toLowerCase()));
}

/** One-line explanation shown under the chips, where the split isn't obvious. */
export function bucketHint(taxon: string | null | undefined): string | null {
  switch (taxon) {
    case 'tarantula':
    case 'true_spider':
      return 'Slings usually can’t be sexed — keep them in Unsexed and move them across as they mature.';
    case 'roach':
      return 'Only adults can be sexed reliably. Nymphs stay in their own bucket.';
    default:
      return null;
  }
}

/**
 * Enclosure presentation, per taxon.
 *
 * The terrestrial / arboreal / fossorial vocabulary comes from the individual
 * invert record and fits animals kept in display enclosures. It's a poor fit
 * for a feeder colony: dubia and hissers live in opaque bins or tubs, and
 * nobody describes a 32-quart tub as "fossorial" even though the roaches
 * burrow into the substrate. Asking the question at all implies a choice that
 * doesn't matter for that keeper.
 *
 * So the orientation chips are shown only where the distinction changes
 * husbandry, and the size placeholder uses the units that taxon is actually
 * kept in.
 */

/** Whether terrestrial/arboreal/fossorial is a meaningful choice here. */
export function showsEnclosureOrientation(taxon: string | null | undefined): boolean {
  // Feeder colonies are kept in bins by convention — the orientation question
  // adds a field without adding information.
  return taxon !== 'roach';
}

/** Example that matches how this taxon is actually housed. */
export function enclosureSizePlaceholder(taxon: string | null | undefined): string {
  switch (taxon) {
    case 'roach':
      // Bins are sold and discussed by volume, not dimensions.
      return 'e.g. 32-quart bin';
    case 'millipede':
      return 'e.g. 10-gallon / 20x10x12 inches';
    default:
      return 'e.g. 12x12x12 inches';
  }
}

/**
 * Is this colony kept as livestock rather than as pets?
 *
 * Feeder colonies (roaches today) are inventory: the keeper cares about
 * headcount and whether it's producing, not what it looks like. Nobody
 * photographs a dubia tub, so a photo-led card gives them a generic glyph
 * forever, and photo galleries would be effort spent on the wrong colonies.
 *
 * Communal tarantulas are the opposite — they're display animals that happen
 * to be housed as a group, and they deserve the same card as any other animal
 * in the collection.
 *
 * This drives presentation, not capability: nothing is withheld from feeder
 * colonies, they're just not pushed toward features that don't serve them.
 */
export function isFeederColony(taxon: string | null | undefined): boolean {
  return taxon === 'roach';
}

/** Card label. "Colony" reads as a pet group; feeders say what they are. */
export function colonyKindLabel(taxon: string | null | undefined): string {
  return isFeederColony(taxon) ? 'Feeders' : 'Colony';
}
