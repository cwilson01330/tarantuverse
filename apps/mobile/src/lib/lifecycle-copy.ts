/**
 * Copy deck and shared helpers for death + events (ADR-015).
 *
 * From the design handoff, 2026-07-31. The words are the deliverable here —
 * this screen is the only one in the app someone uses while upset, and the
 * design note was explicit that the copy matters more than the layout.
 *
 * Centralised so the sheet, the status card and the archive can't drift apart,
 * and so the NEVER_WRITE list below stays greppable.
 */
import type { DeathCause } from './inverts';
import { DEATH_CAUSE_LABELS } from './inverts';

/**
 * Phrases that must never appear on these surfaces.
 *
 * Not enforced by code — a lint rule for humans, kept here so it's findable.
 *
 *   "Successfully marked as died"   — this is not a task completed
 *   "✓ Done"  / any checkmark       — congratulatory pattern
 *   "Passed away"                   — euphemistic; absurd for a roach colony
 *   "Lost"                          — already means ESCAPED in keeper usage
 *   "Rest in peace"                 — imposes a frame on someone else's grief
 *   any celebratory colour
 */
export const NEVER_WRITE = [
  'Successfully marked as died',
  'Done',
  'Passed away',
  'Rest in peace',
] as const;

/**
 * Pronoun from recorded sex, falling back to "them".
 *
 * We use what the keeper recorded and never guess. An unsexed sling is "them",
 * which is also correct rather than merely neutral — most slings genuinely
 * aren't sexed.
 */
export interface Pronouns {
  subject: string; // she / he / they
  object: string;  // her / him / them
  possessive: string; // her / his / their
}

export function pronounsFor(sex: string | null | undefined): Pronouns {
  const s = (sex || '').toUpperCase();
  if (s === 'FEMALE') return { subject: 'she', object: 'her', possessive: 'her' };
  if (s === 'MALE') return { subject: 'he', object: 'him', possessive: 'his' };
  return { subject: 'they', object: 'them', possessive: 'their' };
}

/**
 * "4 years, 2 months" — how long the animal was in the keeper's care.
 *
 * Design note: show it flatly. It's a fact derived from two dates we already
 * have, and it turns maudlin the moment it's decorated — no heart icon, no
 * "cherished", no larger type than the row around it.
 *
 * Returns null when we can't compute it honestly (no acquisition date), rather
 * than inventing a duration from created_at — when the RECORD was made isn't
 * when the animal arrived.
 */
export function tenureLabel(
  dateAcquired: string | null | undefined,
  diedAt: string | null | undefined,
): string | null {
  if (!dateAcquired || !diedAt) return null;
  const from = new Date(`${dateAcquired.slice(0, 10)}T12:00:00`);
  const to = new Date(`${diedAt.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to < from) return null; // bad data; say nothing rather than "-3 months"

  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;

  const years = Math.floor(months / 12);
  const rem = months % 12;

  // Under a month reads as "less than a month" rather than "0 months" — a
  // sling that died in its first weeks shouldn't get a zero.
  if (years === 0 && rem === 0) return 'less than a month';

  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/** Compact form for list rows: "4y 2m". */
export function tenureShort(
  dateAcquired: string | null | undefined,
  diedAt: string | null | undefined,
): string | null {
  const long = tenureLabel(dateAcquired, diedAt);
  if (!long) return null;
  if (long === 'less than a month') return '<1m';
  return long
    .replace(/(\d+) years?/, '$1y')
    .replace(/(\d+) months?/, '$1m')
    .replace(', ', ' ');
}

/**
 * The line that does the most work in the whole flow.
 *
 * Names the actual counts so "nothing is deleted" is concrete rather than a
 * reassurance. The detail screen already holds all three from its existing
 * fetch, so this costs no extra request.
 *
 * Falls back to the generic form when a count is genuinely unknown — a thin or
 * partially-failed record shouldn't produce "0 feedings, 0 molts and 0 photos
 * stay in your records", which reads as though there's nothing to keep.
 */
export function nothingIsDeletedLine(
  counts: { feedings: number | null; molts: number | null; photos: number | null },
  possessive: string,
): string {
  const { feedings, molts, photos } = counts;
  const known = feedings != null && molts != null && photos != null;
  const anything = known && feedings + molts + photos > 0;

  if (!known || !anything) {
    return 'Nothing is deleted — every feeding, molt and photo stays in your records, and they stop counting toward your plan.';
  }

  // Only name what actually exists. "Their 5 feedings, 2 molts and 0 photos
  // stay in your records" undercuts the sentence it's trying to make — a zero
  // in a list of things being kept reads as something missing.
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const parts = [
    feedings > 0 ? n(feedings, 'feeding', 'feedings') : null,
    molts > 0 ? n(molts, 'molt', 'molts') : null,
    photos > 0 ? n(photos, 'photo', 'photos') : null,
  ].filter(Boolean) as string[];

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  // One item takes a singular verb ("her 1 feeding stays"), several take plural.
  const stay = parts.length === 1 && (feedings === 1 || molts === 1 || photos === 1)
    ? 'stays'
    : 'stay';

  return (
    `Nothing is deleted. ${possessive.charAt(0).toUpperCase() + possessive.slice(1)} ` +
    `${list} ${stay} in your records, and ` +
    `${possessive === 'their' ? 'they stop' : possessive === 'her' ? 'she stops' : 'he stops'} ` +
    'counting toward your plan.'
  );
}

/** Status-card body once an animal is marked died. */
export function historicalRecordLine(
  cause: DeathCause | null | undefined,
  subject: string,
): string {
  const causeSentence = cause ? `${DEATH_CAUSE_LABELS[cause]}. ` : '';
  const pronoun = subject.charAt(0).toUpperCase() + subject.slice(1);
  const verb = subject === 'they' ? "'re" : "'s";
  return (
    `${causeSentence}This is a historical record — everything below is kept. ` +
    `${pronoun}${verb} out of your collection, your reminders and your animal count.`
  );
}

export const COPY = {
  menuItem: 'Mark as died',
  menuItemSub:
    'Keeps every feeding, molt and photo. Removes them from your collection, reminders and your plan’s animal count.',
  sheetTitle: (name: string) => `Mark ${name} as died`,
  dateLabel: 'Date of death',
  dateHelper: 'Backdating is fine — pick any past date.',
  optionalToggle: 'Add a cause or a note',
  causeLabel: 'Cause',
  optional: 'Optional',
  noteLabel: 'Note',
  notePlaceholder: 'Stuck in the old exoskeleton at the third leg…',
  confirm: 'Mark as died',
  cancel: 'Cancel',
  logsClosed: 'Logging is closed. Records stay readable and exportable.',
  undo: 'Undo',
  editDetails: 'Edit details',
  deleteInstead: 'Added by mistake?',
  deleteAction: 'Delete record',
  endOfRecord: 'End of record',
  archiveSub: (n: number) =>
    `${n} record${n === 1 ? '' : 's'} kept · not counted on your plan`,
  /** Offered AFTER a fatal molt saves — never as an interruption. */
  afterFatalMolt: (name: string, object: string) =>
    `If ${name} didn’t survive it, you can mark ${object} as died — ${object === 'them' ? 'their' : object === 'her' ? 'her' : 'his'} records stay either way.`,
  eventsEmpty:
    'No events recorded. Injuries, illnesses, escapes and recoveries go here.',
  /** NEVER "No events recorded" on a failed fetch — see threeState below. */
  eventsError:
    'We couldn’t load events. They’re still here — this is a connection problem.',
  retry: 'Retry',
} as const;

/**
 * Loading ≠ zero ≠ error. The rule from the design handoff, encoded so it can't
 * be fudged per-section:
 *
 *   loading → no count at all (skeleton)
 *   error   → an em dash, and copy that says we couldn't load
 *   zero    → a literal 0, which is a claim we VERIFIED
 *
 * Writing "No events recorded" on a failed fetch is the honesty violation these
 * screens must not ship: it converts "we don't know" into "there is nothing",
 * and the keeper has no way to tell the difference.
 */
export type LoadState = 'loading' | 'ok' | 'error';

export function countLabel(state: LoadState, count: number): string {
  if (state === 'loading') return '';
  if (state === 'error') return '—';
  return String(count);
}
