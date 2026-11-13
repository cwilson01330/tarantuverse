// Egg sac -> sling group -> split-out: types and the pure logic behind the
// web screens (web copy of the mobile apps/mobile/src/lib/egg-sacs.ts). The
// server decides every rule (taxa, caps, access); this file only shapes
// payloads and wording.
//
// NO IMPORTS on purpose: node's type-stripping test runner can't resolve
// extensionless sibling imports, so anything that needs the taxon registry
// or broods.ts takes the already-computed value as a parameter.

export interface EggSac {
  id: string
  user_id: string
  pairing_id: string | null
  mother_invert_id: string | null
  laid_date: string
  pulled_date: string | null
  expected_hatch_date: string | null
  hatch_date: string | null
  spiderling_count: number | null
  viable_count: number | null
  notes: string | null
  photo_url: string | null
  created_at: string
  outcome: 'hatched' | 'failed' | null
  hatched_colony: { id: string; name: string } | null
}

export interface CapDetail {
  message?: string
  current_count?: number
  limit?: number
  is_premium?: boolean
  can_add?: number
}

export interface SplitResult {
  created: { id: string; name: string }[]
  colony_total: number
}

export interface Parentage {
  egg_sac_id: string
  mother: { id: string; name: string } | null
  colony: { id: string; name: string } | null
}

export interface FromEggSac {
  id: string
  laid_date: string
  mother: { id: string; name: string } | null
}

export type SplitLifeStage = 'sling' | 'juvenile' | 'adult'
export const SPLIT_STAGES: { value: SplitLifeStage; label: string }[] = [
  { value: 'sling', label: 'Sling' },
  { value: 'juvenile', label: 'Juvenile' },
  { value: 'adult', label: 'Adult' },
]

export const HATCH_MAX = 2000

/** Whole number in [min, max] from a text field; null when blank or invalid. */
export function parseWholeNumber(raw: string, min: number, max: number): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= min && n <= max ? n : null
}

/** Body for POST /egg-sacs/{id}/hatch, or an error sentence. */
export function buildHatchPayload(input: {
  countText: string
  estimated: boolean
  hatchedOn: string
}):
  | { ok: true; payload: { count: number; count_is_estimated: boolean; hatched_on: string } }
  | { ok: false; error: string } {
  const count = parseWholeNumber(input.countText, 1, HATCH_MAX)
  if (count == null) return { ok: false, error: `Enter a whole number from 1 to ${HATCH_MAX}.` }
  if (!input.hatchedOn) return { ok: false, error: 'Pick the date it hatched.' }
  return { ok: true, payload: { count, count_is_estimated: input.estimated, hatched_on: input.hatchedOn } }
}

/** Body for POST /inverts/{id}/egg-sacs. Blank optionals are omitted. */
export function buildSacPayload(input: {
  laidDate: string
  expectedHatch: string | null
  countText: string
  notes: string
  liveBirth: boolean
}): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!input.laidDate) return { ok: false, error: 'Pick a date.' }
  const payload: Record<string, unknown> = { laid_date: input.laidDate }
  if (!input.liveBirth && input.expectedHatch) payload.expected_hatch_date = input.expectedHatch
  if (input.liveBirth && input.countText.trim()) {
    const n = parseWholeNumber(input.countText, 0, HATCH_MAX)
    if (n == null) return { ok: false, error: `Count should be a whole number up to ${HATCH_MAX}.` }
    payload.spiderling_count = n
  }
  const notes = input.notes.trim()
  if (notes) payload.notes = notes
  return { ok: true, payload }
}

/** The 402 `detail` object from a parsed error body (`{detail: {...}}`). */
export function capDetailFromBody(body: unknown): CapDetail {
  const d = (body as { detail?: unknown } | null)?.detail
  return d && typeof d === 'object' ? (d as CapDetail) : {}
}

/** Egg sac card: keepers only, female or unknown sex, taxa with the module. */
export function showEggSacsCard(hasEggSacsModule: boolean, sex: string | null | undefined, canKeep: boolean): boolean {
  return canKeep && sex !== 'male' && hasEggSacsModule
}

/** "Log egg sac" / "Log ootheca" from the singular noun ("Egg sac"). */
export function logSacLabel(singularNoun: string): string {
  return `Log ${singularNoun.toLowerCase()}`
}

/** "From Sally's egg sac · laid Jun 3, 2026" (date text supplied by the caller). */
export function colonyBannerText(singularNoun: string, mother: string | null, laidText: string): string {
  const noun = singularNoun.toLowerCase()
  const who = mother ? `${mother}'s ${noun}` : `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`
  return `From ${who} · laid ${laidText}`
}

/** After a split: "5 spiders added". */
export function splitToastText(n: number, noun: string): string {
  return `${n} ${noun} added`
}

/** Split 402 wording: the owner can upgrade; a co-keeper is pointed at the owner.
 *  `capText` is broods.ts `splitCapText(canAdd)`. */
export function splitCapMessage(capText: string, isOwner: boolean): string {
  const tail = isOwner ? 'Nothing was added.' : 'Nothing was added. Ask the owner to upgrade to add more.'
  return `${capText}. ${tail}`
}

/** Hatch 402 wording. Co-keepers can't upgrade the owner's plan. */
export function hatchCapMessage(capText: string, isOwner: boolean): string {
  return isOwner
    ? `${capText}. Nothing was started.`
    : 'This collection is at its free-plan limit. The owner can upgrade to add more.'
}

/** Body for PUT /egg-sacs/{id} (partial) from the edit form: same checks as
 *  the create form, but a field the keeper emptied is sent as null so it is
 *  cleared. The date is always sent (it can't be cleared). Live birth edits
 *  the count; egg layers edit the expected hatch date. */
export function buildSacEditPayload(input: {
  laidDate: string
  expectedHatch: string | null
  countText: string
  notes: string
  liveBirth: boolean
}): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const built = buildSacPayload(input)
  if (!built.ok) return built
  const payload: Record<string, unknown> = { ...built.payload }
  if (!input.liveBirth && !('expected_hatch_date' in payload)) payload.expected_hatch_date = null
  if (input.liveBirth && !('spiderling_count' in payload)) payload.spiderling_count = null
  if (!('notes' in payload)) payload.notes = null
  return { ok: true, payload }
}

/** The parent an offspring's new animal copies (taxon, species). */
export interface OffspringParent {
  taxon: string
  scientific_name: string | null
  species_id: string | null
}

/** Reads one API path under /api/v1 ("/inverts/{id}"); null on any failure. */
export type GetJson = (path: string) => Promise<any | null>

function asParent(row: any): OffspringParent | null {
  if (!row || typeof row.taxon !== 'string' || !row.taxon) return null
  return {
    taxon: row.taxon,
    scientific_name: row.scientific_name ?? null,
    species_id: row.species_id ?? null,
  }
}

/** Who an offspring came from, for "Add to collection": the sac's mother
 *  first (sacs logged on a female have no pairing), then the pairing's male,
 *  then its female. Null when none can be read -- the caller must then refuse
 *  rather than guess a taxon (guessing is how bred jumpers became tarantulas). */
export async function resolveOffspringParent(
  sac: { mother_invert_id: string | null; pairing_id: string | null },
  get: GetJson,
): Promise<OffspringParent | null> {
  if (sac.mother_invert_id) {
    const mother = asParent(await get(`/inverts/${sac.mother_invert_id}`))
    if (mother) return mother
  }
  if (!sac.pairing_id) return null
  const pairing = await get(`/pairings/${sac.pairing_id}`)
  if (!pairing) return null
  // Prefer the *_invert_id columns: male_id/female_id are NULL for every
  // non-tarantula.
  const keys = [
    pairing.male_invert_id || pairing.male_id,
    pairing.female_invert_id || pairing.female_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0)
  for (const key of keys) {
    const parent = asParent(await get(`/inverts/${key}`))
    if (parent) return parent
  }
  return null
}

/** Shown instead of the add form when no parent could be read. */
export const NO_PARENT_MESSAGE =
  "We couldn't find this offspring's mother or pairing, so we can't tell what kind of animal it is. Add it from the Collection page instead."
