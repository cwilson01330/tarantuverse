/**
 * Analytics view lib (mobile copy). Pure functions only: no React, no network,
 * no clock (`now` is always passed in). The web copy is
 * `apps/web/src/lib/analyticsView.ts`; the two are identical below the marker
 * line and `apps/api/tests/test_analytics_view_in_sync.py` keeps them that way.
 * Tests: `src/lib/__tests__/analytics-view.test.ts`.
 */

// Fixed semantic colours (README §5): mobile keeps them in the token-gate
// allowlisted `src/utils/status-colors.ts`; the web copy holds the same
// literals in this spot. Kept ABOVE the marker so the shared half stays
// identical.
export { SEMANTIC_COLORS } from '../utils/status-colors';

// ---- shared below: keep identical in both copies ----
//
// Turns the analytics API responses (`GET /analytics/collection`,
// `GET /analytics/advanced/`, `GET /analytics/molts`) into the exact copy and
// chart geometry of the analytics redesign (design_handoff_analytics/README.md
// §3 card copy, §6 chart grammar). TWO COPIES, byte-identical below the marker:
//   apps/mobile/src/lib/analytics-view.ts
//   apps/web/src/lib/analyticsView.ts
//
// Rules this file keeps for every caller:
//   - A missing value is "—", never 0, never "N/A", never NaN.
//   - A field the API did not send (older API) is "not available yet", which is
//     different from a field the API sent as null/0 (a real empty answer).
//   - Money is a plain number: thousands separators, two decimals only when
//     fractional, no currency symbol.
//   - Date-only strings ("2026-10-23") are the keeper's LOCAL calendar day; they
//     are never given a time of day, so they read "today" / "3d", never "9h".
//   - Charts never use `now` for anything but the 12-month window.
//   - `recent_activity[].date` (like every other `date` the API sends) is the
//     keeper's LOCAL day because the screens send `tz_offset_minutes`; a
//     date-only string is compared with `now`'s local calendar day.

// ───────────────────────────── API types ─────────────────────────────
// Modelled on apps/api/app/schemas/analytics.py. Everything the redesign added
// is optional so a client can ship before (or without) the API.

export interface SpeciesCount {
  species_name: string;
  count: number;
}

export interface ActivityItem {
  type: string; // "feeding" | "molt" | "substrate_change"
  date: string; // YYYY-MM-DD
  tarantula_id: string;
  tarantula_name: string;
  description: string;
}

export interface LongestGap {
  tarantula_id: string;
  name: string;
  sex?: string | null;
  days: number;
  usual_interval_days?: number | null;
}

export interface LastMolt {
  tarantula_id: string;
  name: string;
  sex?: string | null;
  date: string; // the keeper's local calendar day
  molted_at?: string | null; // the instant (ISO, UTC)
  molt_number: number;
  avg_interval_days?: number | null;
}

export interface MoltRow {
  tarantula_id: string;
  name: string;
  sex?: string | null;
  count: number;
  last_date?: string | null;
  last_molted_at?: string | null;
}

export interface CollectionAnalytics {
  total_tarantulas: number;
  unique_species: number;
  sex_distribution: Record<string, number>;
  species_counts: SpeciesCount[];
  total_value: number;
  average_age_months: number;
  total_feedings: number;
  total_molts: number;
  total_substrate_changes: number;
  average_days_between_feedings: number;
  most_active_molter?: { tarantula_id: string; name: string; molt_count: number } | null;
  newest_acquisition?: { tarantula_id: string; name: string; date: string } | null;
  oldest_acquisition?: { tarantula_id: string; name: string; date: string } | null;
  recent_activity: ActivityItem[];
  // Analytics redesign (Task 1). Absent on an older API.
  feeding_due_today?: number;
  feeding_overdue?: number;
  longest_gap?: LongestGap | null;
  /** The due animal that has waited longest (same shape as `longest_gap`); null when none is due. Absent on an older API. */
  first_due?: LongestGap | null;
  last_molt?: LastMolt | null;
  priced_count?: number;
  molts_per_animal?: MoltRow[];
  total_animals?: number;
  average_months_in_collection?: number;
}

export interface AdvancedAnalytics {
  collection_value_total: number;
  collection_value_average: number;
  most_expensive_name?: string | null;
  most_expensive_price?: number | null;
  molt_heatmap: { month: string; count: number }[]; // "YYYY-MM", months with no molts are absent
  collection_growth: { month: string; count: number }[]; // animals ACQUIRED per month (not a running total)
  species_distribution: { species_name: string; count: number }[];
  sex_distribution: Record<string, number>;
  enclosure_type_distribution: Record<string, number>;
  taxon_distribution?: Record<string, number>;
  unique_species?: number;
  total_animals?: number;
  total_feedings_logged: number;
  total_molts_logged: number;
  estimated_monthly_feeding_cost: number;
  cost_per_feeding?: number;
  cost_per_feeding_is_default?: boolean;
  spent_this_month?: number;
  feeders_spent_this_month?: number;
}

// ───────────────────────────── constants ─────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DASH = '—';
const NOT_YET = 'not available yet';
const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.4375;

// ───────────────────────────── small helpers ─────────────────────────────

function num(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** "1 animal" / "3 animals" (count with thousands separators). */
function plural(n: number, one: string, many?: string): string {
  return `${formatCount(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

function animalCount(c: CollectionAnalytics): number {
  return num(c.total_animals) || num(c.total_tarantulas);
}

/** 16 -> "16"; 1221 -> "1,221". */
export function formatCount(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A plain number in the keeper's own currency: 12 -> "12", 12.5 -> "12.50", 1234.5 -> "1,234.50". No symbol. */
export function formatMoney(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DASH;
  const cents = Math.round(n * 100) / 100;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const [whole, frac] = (Number.isInteger(abs) ? abs.toString() : abs.toFixed(2)).split('.');
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
}

/** `average_age_months` as keepers read it: 16 -> "1y 4m", 3 -> "3m", 0 -> "—". Never called "age" in the UI. */
export function monthsWithYou(months: number | null | undefined): string {
  if (typeof months !== 'number' || !Number.isFinite(months) || months <= 0) return DASH;
  const total = Math.round(months);
  if (total === 0) return '<1m';
  const years = Math.floor(total / 12);
  const rest = total % 12;
  if (years === 0) return `${rest}m`;
  return rest === 0 ? `${years}y` : `${years}y ${rest}m`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function pronoun(sex?: string | null): 'she' | 'he' | 'they' {
  const s = (sex ?? '').toLowerCase();
  return s === 'female' ? 'she' : s === 'male' ? 'he' : 'they';
}

export function possessive(sex?: string | null): 'her' | 'his' | 'their' {
  const s = (sex ?? '').toLowerCase();
  return s === 'female' ? 'her' : s === 'male' ? 'his' : 'their';
}

// ───────────────────────────── relative time ─────────────────────────────

type Rel =
  | { kind: 'now' }
  | { kind: 'today' }
  | { kind: 'm' | 'h' | 'd' | 'mo' | 'y'; n: number };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function fromDays(days: number): Rel {
  if (days < 30) return { kind: 'd', n: days };
  if (days < 365) return { kind: 'mo', n: Math.max(1, Math.floor(days / AVG_MONTH_DAYS)) };
  return { kind: 'y', n: Math.floor(days / 365) };
}

/**
 * How long before `now` an ISO string was. A datetime counts elapsed time. A
 * date-only string is the keeper's local calendar day, so it counts calendar
 * days (0 = "today") and never invents an hour count.
 */
function relParts(iso: string | null | undefined, now: Date): Rel | null {
  if (typeof iso !== 'string' || !iso) return null;
  const dateOnly = DATE_ONLY.exec(iso);
  if (dateOnly) {
    const day = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
    if (!Number.isFinite(day)) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = Math.round((today - day) / DAY_MS);
    return days <= 0 ? { kind: 'today' } : fromDays(days);
  }
  // A datetime with no zone is UTC (the API sends UTC).
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const ms = new Date(/T\d{2}:\d{2}/.test(iso) && !hasZone ? `${iso}Z` : iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = now.getTime() - ms;
  if (diff < 60_000) return { kind: 'now' }; // includes clock skew (a time slightly in the future)
  if (diff < 3_600_000) return { kind: 'm', n: Math.floor(diff / 60_000) };
  if (diff < DAY_MS) return { kind: 'h', n: Math.floor(diff / 3_600_000) };
  return fromDays(Math.floor(diff / DAY_MS));
}

/** "2h", "3d", "7mo", "1y"; "now" / "today" for the very recent. */
export function relativeShort(iso: string, now: Date): string {
  const r = relParts(iso, now);
  if (!r) return DASH;
  if (r.kind === 'now') return 'now';
  if (r.kind === 'today') return 'today';
  return `${r.n}${r.kind}`;
}

const LONG_UNIT: Record<'m' | 'h' | 'd' | 'mo' | 'y', string> = {
  m: 'minute', h: 'hour', d: 'day', mo: 'month', y: 'year',
};

/** "2 hours ago", "3 days ago", "7 months ago"; "just now" / "today" for the very recent. */
export function relativeLong(iso: string, now: Date): string {
  const r = relParts(iso, now);
  if (!r) return DASH;
  if (r.kind === 'now') return 'just now';
  if (r.kind === 'today') return 'today';
  return `${r.n} ${LONG_UNIT[r.kind]}${r.n === 1 ? '' : 's'} ago`;
}

function daysText(n: number, long: boolean): string {
  return long ? `${n} ${n === 1 ? 'day' : 'days'}` : `${n}d`;
}

// ───────────────────────────── months ─────────────────────────────

/** "2026-10" -> a sortable month index (year * 12 + month0), or null. */
function monthIndex(key: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(typeof key === 'string' ? key : '');
  if (!m) return null;
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  return Number(m[1]) * 12 + month0;
}

function monthKey(index: number): string {
  const y = Math.floor(index / 12);
  return `${y}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function monthName(index: number): string {
  return MONTH_NAMES[((index % 12) + 12) % 12];
}

// ───────────────────────────── header + collection card ─────────────────────────────

/** `"{n} animals · {m} species"` (README §3 Header). */
export function headerSubtitle(c: CollectionAnalytics): string {
  const n = animalCount(c);
  if (n === 0) return 'No animals yet';
  return `${plural(n, 'animal')} · ${formatCount(num(c.unique_species))} species`;
}

/** The three Collection figures. `with you, avg` (web: `with you, average`) - never "age". */
export function collectionFigures(c: CollectionAnalytics, long: boolean) {
  return {
    animals: formatCount(animalCount(c)),
    species: formatCount(num(c.unique_species)),
    withYou: monthsWithYou(num(c.average_months_in_collection) || num(c.average_age_months)),
    withYouCaption: long ? 'with you, average' : 'with you, avg',
  };
}

// ───────────────────────────── Right now ─────────────────────────────

export type RightNowTarget = { kind: 'feeding_day' } | { kind: 'animal'; id: string } | null;

export interface RightNowTile {
  key: 'due' | 'molt' | 'gap';
  label: string;
  value: string;
  caption: string;
  target: RightNowTarget;
  /** One combined screen-reader label, always in the spoken (long) form. */
  a11y: string;
}

function tileA11y(label: string, value: string, caption: string): string {
  return value === DASH ? `${label}, ${caption}` : `${label}, ${value}, ${caption}`;
}

function dueCaption(c: CollectionAnalytics, long: boolean): string {
  const due = num(c.feeding_due_today);
  if (due === 0) return 'nothing due';
  const overdue = num(c.feeding_overdue);
  // README: "{overdue} overdue" once more than one is overdue, else the first due animal.
  if (overdue > 1) return `${formatCount(overdue)} overdue`;
  const fd = c.first_due;
  if (fd) return `${fd.name}, ${daysText(fd.days, long)}`;
  if (fd === undefined) {
    // An API from before `first_due`: name the longest-gap animal only when it
    // must be THE due animal (it is itself due, and it is the only one).
    const g = c.longest_gap;
    if (due === 1 && g && g.usual_interval_days != null && g.days >= g.usual_interval_days) {
      return `${g.name}, ${daysText(g.days, long)}`;
    }
  }
  return overdue > 0 ? `${formatCount(overdue)} overdue` : 'due today';
}

/** The three tiles under the header. Zero animals -> none. A field the API did not send -> "—" + "not available yet". */
export function rightNowTiles(c: CollectionAnalytics, now: Date, long: boolean): RightNowTile[] {
  if (animalCount(c) === 0) return [];

  // Due to eat
  const dueLabel = 'Due to eat';
  let due: RightNowTile;
  if (c.feeding_due_today == null) {
    due = { key: 'due', label: dueLabel, value: DASH, caption: NOT_YET, target: null, a11y: tileA11y(dueLabel, DASH, NOT_YET) };
  } else {
    const value = formatCount(c.feeding_due_today);
    due = {
      key: 'due',
      label: dueLabel,
      value,
      caption: dueCaption(c, long),
      target: { kind: 'feeding_day' },
      a11y: tileA11y(dueLabel, value, dueCaption(c, true)),
    };
  }

  // Last molt
  const moltLabel = 'Last molt';
  let molt: RightNowTile;
  const lm = c.last_molt;
  if (lm === undefined) {
    molt = { key: 'molt', label: moltLabel, value: DASH, caption: NOT_YET, target: null, a11y: tileA11y(moltLabel, DASH, NOT_YET) };
  } else if (lm === null) {
    const caption = 'no molts yet';
    molt = { key: 'molt', label: moltLabel, value: DASH, caption, target: null, a11y: tileA11y(moltLabel, DASH, caption) };
  } else {
    const when = lm.molted_at || lm.date;
    molt = {
      key: 'molt',
      label: moltLabel,
      value: long ? relativeLong(when, now) : relativeShort(when, now),
      caption: lm.name,
      target: { kind: 'animal', id: lm.tarantula_id },
      a11y: tileA11y(moltLabel, relativeLong(when, now), lm.name),
    };
  }

  // Longest gap
  const gapLabel = 'Longest gap';
  let gap: RightNowTile;
  const g = c.longest_gap;
  if (g === undefined) {
    gap = { key: 'gap', label: gapLabel, value: DASH, caption: NOT_YET, target: null, a11y: tileA11y(gapLabel, DASH, NOT_YET) };
  } else if (g === null) {
    const caption = 'no gap to show';
    gap = { key: 'gap', label: gapLabel, value: DASH, caption, target: null, a11y: tileA11y(gapLabel, DASH, caption) };
  } else {
    const usually = g.usual_interval_days != null
      ? `${g.name}, usually every ${g.usual_interval_days === 1 ? 'day' : g.usual_interval_days}`
      : g.name;
    gap = {
      key: 'gap',
      label: gapLabel,
      value: daysText(g.days, long),
      caption: long ? usually : g.name,
      target: { kind: 'animal', id: g.tarantula_id },
      a11y: tileA11y(gapLabel, daysText(g.days, true), usually),
    };
  }

  return [due, molt, gap];
}

// ───────────────────────────── Feeding card ─────────────────────────────

/** `feedings`, `between, avg` (`9d`; long `9 days`), `per animal`. No feedings -> "0", "—", "—". */
export function feedingFigures(c: CollectionAnalytics, long = false) {
  const total = num(c.total_feedings);
  if (total <= 0) return { feedings: '0', between: DASH, perAnimal: DASH };
  const avg = num(c.average_days_between_feedings);
  const animals = animalCount(c);
  const per = animals > 0 ? total / animals : null;
  return {
    feedings: formatCount(total),
    between: avg > 0 ? daysText(Math.max(1, Math.round(avg)), long) : DASH,
    perAnimal: per == null ? DASH : per < 10 ? per.toFixed(1) : formatCount(per),
  };
}

/** The one sentence under the Feeding figures; null when there is nothing honest to say. */
export function feedingSentence(c: CollectionAnalytics): string | null {
  if (num(c.total_feedings) <= 0) return null;
  if (c.feeding_overdue === 0) return 'Nothing is overdue.';
  const g = c.longest_gap;
  if (!g) return null; // older API, or nobody measurable (paused / never fed / no cadence)
  const interval = g.usual_interval_days;
  if (interval == null) return `${g.name} has waited longest: ${daysText(g.days, true)}.`;
  const who = pronoun(g.sex);
  const verb = who === 'they' ? 'eat' : 'eats';
  const cadence = interval === 1 ? 'day' : `${interval} days`;
  return `${g.name}'s ${g.days}-day gap is the longest right now; ${who} usually ${verb} every ${cadence}.`;
}

// ───────────────────────────── ranked rows (Molts, Species) ─────────────────────────────

export interface RankedRow {
  key: string;
  /** Animal id for a tap target; null for species rows. */
  id: string | null;
  label: string;
  count: number;
  /** count / the largest count, 0..1: the bar length. */
  fraction: number;
  /** The bold right-hand figure ("4", or "none yet"). */
  value: string;
  /** The quiet suffix ("3d"), or null. */
  detail: string | null;
  /** value + detail as one string ("4 · 3d"). */
  right: string;
  /** True for a zero row: track only, reads "none yet". */
  none: boolean;
  a11y: string;
}

/**
 * One Molts row: "4 · 3d" (long: "4 · 3 days ago"), or the track alone and
 * "none yet" for a zero. `max` is the largest count in the list being drawn, so
 * the bars compare. The Molts card and the full Molts list screens both build
 * their rows here so the words cannot drift.
 */
export function moltRow(
  id: string,
  name: string,
  count: number,
  lastIso: string | null | undefined,
  max: number,
  now: Date,
  long: boolean,
): RankedRow {
  const fraction = max > 0 ? count / max : 0;
  if (count <= 0) {
    return { key: id, id, label: name, count: 0, fraction: 0, value: 'none yet', detail: null, right: 'none yet', none: true, a11y: `${name}, no molts yet` };
  }
  const value = formatCount(count);
  const detail = lastIso ? (long ? relativeLong(lastIso, now) : relativeShort(lastIso, now)) : null;
  const spoken = lastIso ? relativeLong(lastIso, now) : null;
  const noun = count === 1 ? 'molt' : 'molts';
  return {
    key: id,
    id,
    label: name,
    count,
    fraction,
    value,
    detail: detail === DASH ? null : detail,
    right: detail && detail !== DASH ? `${value} · ${detail}` : value,
    none: false,
    a11y: `${name}, ${value} ${noun}${spoken && spoken !== DASH ? `, last molt ${spoken}` : ''}`,
  };
}

const MOLT_ROWS_ALL = 5; // up to this many animals: show them all
const MOLT_ROWS_TOP = 3; // more animals than that: show the top 3 + "All n"
const SPECIES_ROWS_TOP = 5;

export interface MoltsCardModel {
  rows: RankedRow[];
  /** Animals not shown (total animals - rows shown) when the list was cut to 3. */
  moreCount: number;
  /** "All 1,221 →" when the list was cut, else null. */
  allLabel: string | null;
  /** The designed line for a collection with no molts at all, else null. */
  emptyLine: string | null;
  /** "{total_molts} logged". */
  trailing: string;
}

/** The Molts card: per-animal ranked rows, "All n" past five animals, the empty line with no molts. */
export function moltsCard(c: CollectionAnalytics, now: Date, long: boolean): MoltsCardModel {
  const trailing = `${formatCount(num(c.total_molts))} logged`;
  if (num(c.total_molts) <= 0) {
    return {
      rows: [],
      moreCount: 0,
      allLabel: null,
      emptyLine: "No molts logged yet. Each one you log shows up here with how long it's been.",
      trailing,
    };
  }

  const source = c.molts_per_animal;
  if (source === undefined) {
    // Older API: the single most active molter is all there is.
    const m = c.most_active_molter;
    if (!m) return { rows: [], moreCount: 0, allLabel: null, emptyLine: null, trailing };
    return {
      rows: [moltRow(m.tarantula_id, m.name, num(m.molt_count), null, num(m.molt_count), now, long)],
      moreCount: 0,
      allLabel: null,
      emptyLine: null,
      trailing,
    };
  }

  const max = source.reduce((hi, r) => Math.max(hi, num(r.count)), 0);
  const animals = animalCount(c);
  const cut = animals > MOLT_ROWS_ALL;
  const shown = cut ? source.slice(0, MOLT_ROWS_TOP) : source;
  return {
    rows: shown.map((r) => moltRow(r.tarantula_id, r.name, num(r.count), r.last_molted_at || r.last_date, max, now, long)),
    moreCount: cut ? Math.max(0, animals - shown.length) : 0,
    allLabel: cut ? `All ${formatCount(animals)} →` : null,
    emptyLine: null,
    trailing,
  };
}

/**
 * Species list, most animals first: every species up to five, else the top five
 * and "n more species →" (the Collection card). `limit` changes the cap; `null`
 * (or a non-finite number) means no cap, which is what the full Species list
 * screens use: every row, `moreCount` 0. Fractions are always relative to the
 * largest count in the whole collection, so a searched list keeps its scale.
 */
export function speciesRows(
  c: CollectionAnalytics,
  limit: number | null = SPECIES_ROWS_TOP,
): { rows: RankedRow[]; moreCount: number; moreLabel: string | null } {
  const sorted = (c.species_counts ?? [])
    .map((s, i) => ({ s, i }))
    .sort((a, b) => num(b.s.count) - num(a.s.count) || a.i - b.i)
    .map((x) => x.s);
  const max = sorted.length ? num(sorted[0].count) : 0;
  const cap = limit == null || !Number.isFinite(limit) ? sorted.length : Math.max(0, Math.floor(limit));
  const rows: RankedRow[] = sorted.slice(0, cap).map((s, i) => ({
    key: `${s.species_name}-${i}`,
    id: null,
    label: s.species_name,
    count: num(s.count),
    fraction: max > 0 ? num(s.count) / max : 0,
    value: formatCount(num(s.count)),
    detail: null,
    right: formatCount(num(s.count)),
    none: false,
    a11y: `${s.species_name}, ${formatCount(num(s.count))}`,
  }));
  const moreCount = Math.max(0, sorted.length - rows.length);
  return { rows, moreCount, moreLabel: moreCount > 0 ? `${formatCount(moreCount)} more species →` : null };
}

/** "Paid in total" footer: the value and its "{priced} of {n} priced" caption. */
export function paidFooter(c: CollectionAnalytics): { value: string; caption: string | null } {
  if (c.priced_count == null) {
    // Older API: no caption, and a zero total is "—" (we can't tell "free" from "no prices").
    return { value: num(c.total_value) > 0 ? formatMoney(c.total_value) : DASH, caption: null };
  }
  if (c.priced_count === 0) return { value: DASH, caption: 'no prices entered' };
  return {
    value: formatMoney(c.total_value),
    caption: `${formatCount(c.priced_count)} of ${formatCount(animalCount(c))} priced`,
  };
}

// ───────────────────────────── Recent + Insights ─────────────────────────────

export interface RecentRow {
  kind: 'molt' | 'feeding' | 'substrate_change';
  id: string;
  name: string;
  verb: string;
  rel: string;
  text: string;
  /** The spoken label for the whole row, long form: "Juniper molted, 3 days ago". */
  a11y: string;
}

/** The foods a keeper can count: "a cricket". Everything else gets no article ("ate leaf litter"). */
const COUNTABLE_FOODS = new Set([
  'cricket', 'dubia roach', 'red runner', 'mealworm', 'superworm', 'fruit fly', 'house fly', 'blue bottle fly',
]);

/**
 * "a cricket" for the countable chips, nothing for "Other" / "prey" / empty,
 * else the keeper's own words with no article. Capitalisation is only lowered
 * when it is plain Title or Sentence case ("Leaf litter" -> "leaf litter");
 * anything with an acronym or its own casing ("BSFL") is kept as typed.
 */
function foodPhrase(food: string): string {
  const raw = food.trim().replace(/\s+/g, ' ');
  const lower = raw.toLowerCase();
  if (!raw || lower === 'other' || lower === 'prey') return '';
  if (COUNTABLE_FOODS.has(lower)) return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
  const plainCase = !/[A-Z]{2,}/.test(raw) && !/[a-z0-9)][A-Z]/.test(raw);
  return plainCase ? lower : raw;
}

function feedingVerb(description: string): string {
  const m = /^\s*fed\s+(.*?)\s*(\(refused\))?\s*$/i.exec(description || '');
  const refused = /\(refused\)/i.test(description || '');
  const verb = refused ? 'refused' : 'ate';
  const food = m ? foodPhrase(m[1]) : '';
  return food ? `${verb} ${food}` : verb;
}

const RECENT_KINDS = ['molt', 'feeding', 'substrate_change'];

/** Up to three rows: "Juniper molted", "Pepper ate a cricket", "Rosie substrate changed". */
export function recentRows(c: CollectionAnalytics, now: Date): RecentRow[] {
  const rows: RecentRow[] = [];
  for (const a of c.recent_activity ?? []) {
    if (!RECENT_KINDS.includes(a.type)) continue;
    const kind = a.type as RecentRow['kind'];
    const verb = kind === 'molt' ? 'molted' : kind === 'feeding' ? feedingVerb(a.description) : 'substrate changed';
    const text = `${a.tarantula_name} ${verb}`;
    const spoken = relativeLong(a.date, now);
    rows.push({
      kind,
      id: a.tarantula_id,
      name: a.tarantula_name,
      verb,
      rel: relativeShort(a.date, now),
      text,
      a11y: spoken === DASH ? text : `${text}, ${spoken}`,
    });
    if (rows.length === 3) break;
  }
  return rows;
}

export interface InsightModel {
  sentence: string;
  support: string | null;
  link: string;
}

/** The Home / dashboard Insights card, from `recent_activity[0]` (README §3 rotation rule). Zero animals -> null. */
export function insight(c: CollectionAnalytics, now: Date): InsightModel | null {
  const animals = animalCount(c);
  if (animals === 0) return null;
  const LINK = 'See analytics →';
  const feedings = num(c.total_feedings);
  const a0 = c.recent_activity?.[0];

  // An animal that joined in the last week, and more recently than anything logged.
  const na = c.newest_acquisition;
  if (na && na.date) {
    const r = relParts(na.date, now);
    const thisWeek = !!r && (r.kind === 'today' || (r.kind === 'd' && r.n <= 7));
    const newer = !a0 || na.date.slice(0, 10) > a0.date.slice(0, 10);
    if (thisWeek && newer) {
      return {
        sentence: `${na.name} joined ${relativeLong(na.date, now)}.`,
        support: `${plural(animals, 'animal')} · ${formatCount(num(c.unique_species))} species.`,
        link: LINK,
      };
    }
  }

  if (a0) {
    const name = a0.tarantula_name;
    const rel = relativeLong(a0.date, now);
    if (a0.type === 'molt') {
      const lm = c.last_molt && c.last_molt.tarantula_id === a0.tarantula_id ? c.last_molt : null;
      const row = (c.molts_per_animal ?? []).find((r) => r.tarantula_id === a0.tarantula_id);
      const when = lm ? relativeLong(lm.molted_at || lm.date, now) : rel;
      const number = lm ? lm.molt_number : row ? row.count : 0;
      const sex = lm ? lm.sex : row?.sex;
      const sentence = number > 0
        ? `${name} molted ${when}, ${possessive(sex)} ${ordinal(number)} with you.`
        : `${name} molted ${when}.`;
      const avg = lm && lm.molt_number >= 2 ? lm.avg_interval_days : null;
      return {
        sentence,
        support: avg ? `That's one every ${avg === 1 ? 'day' : `${avg} days`} on average.` : null,
        link: LINK,
      };
    }
    if (a0.type === 'feeding') {
      const refused = /\(refused\)/i.test(a0.description || '');
      return {
        sentence: refused ? `${name} refused a meal ${rel}.` : `${name} ate ${rel}.`,
        support: `${plural(feedings, 'feeding')} logged across ${plural(animals, 'animal')}.`,
        link: LINK,
      };
    }
    if (a0.type === 'substrate_change') {
      return {
        sentence: `${name} got fresh substrate ${rel}.`,
        support: `${plural(animals, 'animal')}, ${plural(feedings, 'feeding')} logged.`,
        link: LINK,
      };
    }
  }

  return {
    sentence: `${plural(animals, 'animal')}, ${plural(feedings, 'feeding')} logged.`,
    support: null,
    link: 'See how they compare →',
  };
}

// ───────────────────────────── chart models (README §6) ─────────────────────────────

const BAR_GAP = 6;
const BAR_AREA_H = 70; // the chart box; month initials sit 16 below it
const BAR_LABEL_H = 16;
const BAR_MAX_H = 56; // the tallest bar; the other 14 hold its printed value
const BAR_MIN_H = 4; // the shortest non-zero bar
const BAR_STUB_H = 2; // a month with no molts
const BAR_MONTHS = 12;

export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  isMax: boolean;
  /** Month initial ("N"). */
  label: string;
  value: number;
  /** "YYYY-MM". */
  month: string;
}

export interface BarsModel {
  bars: Bar[];
  total: number;
  sentence: string;
  a11y: string;
  /** Chart box height (70), label row height (16) and the gap (6), so renderers don't re-declare them. */
  height: number;
  labelHeight: number;
  gap: number;
}

const ZERO_MOLTS_SENTENCE = 'No molts logged in the last year. The chart appears after the first one.';

/**
 * Monthly counts as twelve bars. `series` is sparse (months with no molts are
 * absent). The window is the 12 months ending at `now`'s month, so `now` is
 * required: a screen that forgot it would draw stale data as current. The fixed
 * sample passes `SAMPLE_NOW`. 0 total: no bars, sentence only. 1: one bar.
 * Many: all 12.
 */
export function barsModel(series: { month: string; count: number }[], width: number, now: Date): BarsModel {
  const counts = new Map<number, number>();
  for (const s of series ?? []) {
    const idx = monthIndex(s.month);
    if (idx == null) continue;
    counts.set(idx, (counts.get(idx) ?? 0) + Math.max(0, num(s.count)));
  }
  const end = now.getFullYear() * 12 + now.getMonth();
  const base = { height: BAR_AREA_H, labelHeight: BAR_LABEL_H, gap: BAR_GAP };

  const first = end - (BAR_MONTHS - 1);
  const slots: { idx: number; value: number }[] = [];
  for (let i = 0; i < BAR_MONTHS; i++) slots.push({ idx: first + i, value: counts.get(first + i) ?? 0 });
  const total = slots.reduce((sum, w) => sum + w.value, 0);
  if (total === 0) {
    return { bars: [], total: 0, sentence: ZERO_MOLTS_SENTENCE, a11y: ZERO_MOLTS_SENTENCE, ...base };
  }

  const max = Math.max(...slots.map((w) => w.value));
  let maxAt = 0;
  let tied = 0;
  slots.forEach((w, i) => {
    if (w.value === max) {
      maxAt = i; // a tie goes to the latest month
      tied += 1;
    }
  });

  const barW = Math.max(1, (Math.max(0, num(width)) - (BAR_MONTHS - 1) * BAR_GAP) / BAR_MONTHS);
  const all: Bar[] = slots.map((w, i) => {
    const h = w.value === 0 ? BAR_STUB_H : Math.max(BAR_MIN_H, (w.value / max) * BAR_MAX_H);
    return {
      x: i * (barW + BAR_GAP),
      y: BAR_AREA_H - h,
      w: barW,
      h,
      isMax: i === maxAt,
      label: monthName(w.idx).charAt(0),
      value: w.value,
      month: monthKey(w.idx),
    };
  });

  if (total === 1) {
    const only = all[maxAt];
    const where = monthName(slots[maxAt].idx);
    const sentence = `1 molt in the last year, in ${where}.`;
    return { bars: [only], total, sentence, a11y: `Molts per month: ${sentence}`, ...base };
  }

  const busiest = monthName(slots[maxAt].idx);
  const unit = max === 1 ? 'molt' : 'molts';
  const range = `Molts per month, ${monthName(slots[0].idx)} to ${monthName(slots[BAR_MONTHS - 1].idx)}`;
  // Several months share the top count: don't claim a single busiest month.
  if (tied > 1) {
    return {
      bars: all,
      total,
      sentence: `${max} ${unit} in each of ${tied} months, most recently ${busiest}.`,
      a11y: `${range}, ${max} ${unit} in each of ${tied} months, most recently ${busiest}`,
      ...base,
    };
  }
  return {
    bars: all,
    total,
    sentence: `Busiest month was ${busiest}: ${max} ${unit}.`,
    a11y: `${range}, most in ${busiest} with ${max}`,
    ...base,
  };
}

const STEP_PAD_X = 6; // room for the end dot (r4) and its 2pt ring
const STEP_PAD_Y = 6;

export interface StepPoint {
  x: number;
  y: number;
  /** The running total at this month. */
  value: number;
  /** "YYYY-MM". */
  month: string;
}

export interface StepModel {
  points: StepPoint[];
  /** SVG path `d` for the stepped polyline ("" with fewer than two points). */
  line: string;
  /** SVG path `d` for the area under the line, closed to the baseline ("" with fewer than two points). */
  area: string;
  /** First and last running totals (the small labels at each end). */
  first: number;
  last: number;
  /** Position of the end dot; null with no points. */
  end: { x: number; y: number } | null;
  /**
   * Where the drawn line begins: the baseline's y when the line starts at the
   * animals already owned, else the first point's y (0 with no points). Labels
   * for the first value sit relative to it.
   */
  startY: number;
  sentence: string;
  a11y: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A running count as a stepped line. `series` is animals ADDED per month (what
 * `collection_growth` and `previewFromCollection().growthSeries` hold), sparse
 * and in any order; the model accumulates it. `baseline` is how many animals
 * were already there before the first month (0 when unknown; see
 * `growthBaseline`): with it the line starts AT the baseline and the first
 * label is the baseline, without it the labels count only the animals added in
 * the window. A span of more than 11 months names the years instead of saying
 * "this year". 0 points: no chart. 1: a dot. Flat: a straight line.
 */
export function stepModel(
  series: { month: string; count: number }[],
  width: number,
  height: number,
  baseline = 0,
): StepModel {
  const adds = new Map<number, number>();
  for (const s of series ?? []) {
    const idx = monthIndex(s.month);
    if (idx == null) continue;
    adds.set(idx, (adds.get(idx) ?? 0) + Math.max(0, num(s.count)));
  }
  const start = Math.max(0, num(baseline));
  const months = [...adds.keys()].sort((a, b) => a - b);
  const grandTotal = start + [...adds.values()].reduce((a, b) => a + b, 0);
  if (months.length === 0 || grandTotal === 0) {
    const sentence = 'No animals added in the last year.';
    return { points: [], line: '', area: '', first: 0, last: 0, end: null, startY: 0, sentence, a11y: sentence };
  }

  const values: number[] = [];
  let running = start;
  for (const m of months) {
    running += adds.get(m) ?? 0;
    values.push(running);
  }
  const lo = Math.min(...values, ...(start > 0 ? [start] : []));
  const hi = Math.max(...values);
  const top = STEP_PAD_Y;
  const bottom = Math.max(top, num(height) - STEP_PAD_Y);
  const innerW = Math.max(0, num(width) - 2 * STEP_PAD_X);
  const span = months[months.length - 1] - months[0];
  const yFor = (v: number) => (hi === lo ? (top + bottom) / 2 : bottom - ((v - lo) / (hi - lo)) * (bottom - top));
  const xFor = (m: number) => (span === 0 ? num(width) / 2 : STEP_PAD_X + ((m - months[0]) / span) * innerW);

  const points: StepPoint[] = months.map((m, i) => ({
    x: r2(xFor(m)),
    y: r2(yFor(values[i])),
    value: values[i],
    month: monthKey(m),
  }));
  const lastPoint = points[points.length - 1];
  // More than 11 months apart: "this year" would be false and bare month names ambiguous.
  const longSpan = months[months.length - 1] - months[0] > 11;
  const yearOf = (m: number) => Math.floor(m / 12);
  const nameOf = (m: number) => (longSpan ? `${monthName(m)} ${yearOf(m)}` : monthName(m));
  const firstName = nameOf(months[0]);
  const lastName = nameOf(months[months.length - 1]);

  if (points.length === 1) {
    const added = adds.get(months[0]) ?? 0;
    const sentence = start > 0
      ? `${formatCount(added)} new ${added === 1 ? 'animal' : 'animals'} since ${firstName}.`
      : `${plural(values[0], 'animal')} since ${firstName}.`;
    return {
      points, line: '', area: '', first: values[0], last: values[0],
      end: { x: lastPoint.x, y: lastPoint.y }, startY: lastPoint.y, sentence, a11y: `Animals in your collection: ${sentence}`,
    };
  }

  // With a baseline the line starts at the animals already owned, then steps up to the first month's total.
  const startY = start > 0 ? r2(yFor(start)) : points[0].y;
  let line = start > 0
    ? `M${points[0].x} ${startY} V${points[0].y}`
    : `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) line += ` H${points[i].x} V${points[i].y}`;
  const baselineY = r2(Math.max(num(height), bottom));
  const area = `${line} V${baselineY} H${points[0].x} Z`;

  const firstValue = start > 0 ? start : values[0];
  const lastValue = values[values.length - 1];
  const flat = firstValue === lastValue;
  let sentence: string;
  if (flat) {
    sentence = `No change since ${firstName}.`;
  } else {
    let busiest = -1;
    let busiestAdds = 0;
    months.forEach((m, i) => {
      const a = adds.get(m) ?? 0;
      if (a >= 2 && a >= busiestAdds) {
        busiest = i;
        busiestAdds = a;
      }
    });
    sentence = longSpan
      ? `${formatCount(firstValue)} → ${formatCount(lastValue)} since ${firstName}.`
      : `${formatCount(firstValue)} → ${formatCount(lastValue)} this year.`;
    if (busiest >= 0) sentence += ` ${formatCount(busiestAdds)} arrived in ${nameOf(months[busiest])}.`;
  }

  return {
    points,
    line,
    area,
    first: firstValue,
    last: lastValue,
    end: { x: lastPoint.x, y: lastPoint.y },
    startY,
    sentence,
    a11y: `Animals in your collection, ${firstName} to ${lastName}, from ${formatCount(firstValue)} to ${formatCount(lastValue)}`,
  };
}

export interface SplitPart {
  /** Stable key from the API ("terrestrial", "true_spider", "unknown"). */
  key: string;
  count: number;
  color: string;
  /**
   * The word the keeper reads. Callers must pass it whenever the API key is not
   * itself a word: `unsexed` for the sex split's "unknown", the registry taxon
   * label for By group ("True spider"), "unknown" enclosure types as they are.
   * Falls back to `key`.
   */
  label?: string;
}

export interface SplitLegendItem {
  key: string;
  /** The word alone ("terrestrial"). */
  word: string;
  /** Count and word ("3 terrestrial"). */
  label: string;
  count: number;
  color: string;
}

export interface SplitModel {
  /** Only categories with something in them, flexed by count. Empty with fewer than two. */
  segments: { flex: number; color: string }[];
  /** Every category, zeros included: "3 male". */
  legend: SplitLegendItem[];
  /** Replaces the bar when only one category has anything; else null. */
  sentence: string | null;
  a11y: string;
}

/** A segmented bar's model. One non-empty category: a sentence instead of a bar. */
export function splitModel(parts: SplitPart[]): SplitModel {
  const legend = (parts ?? []).map((p) => ({
    key: p.key,
    word: p.label ?? p.key,
    label: `${formatCount(num(p.count))} ${p.label ?? p.key}`,
    count: num(p.count),
    color: p.color,
  }));
  const filled = legend.filter((p) => p.count > 0);
  let sentence: string | null = null;
  if (filled.length === 1) {
    const only = filled[0];
    sentence = only.count === 1
      ? `1 ${only.word}. A split appears with two or more animals.`
      : `All ${formatCount(only.count)} ${only.word}.`;
  }
  return {
    segments: filled.length >= 2 ? filled.map((p) => ({ flex: p.count, color: p.color })) : [],
    legend,
    sentence,
    a11y: `Split: ${legend.map((l) => l.label).join(', ')}`,
  };
}

// ───────────────────────────── Premium: Money card + growth baseline ─────────────────────────────

/** The link under "no price entered": opens the collection. Shown when `moneyCard().paid.addLink`. */
export const ADD_PAID_LINK = 'Add what you paid';

export interface MoneyFigure {
  /** The big figure: a plain number, or "—". */
  value: string;
  /** What it is ("spent this month"), or why it is empty. */
  caption: string;
  /** The quieter line under the caption, or null. */
  sub: string | null;
}

export interface MoneyCardModel {
  spent: MoneyFigure;
  paid: MoneyFigure & { addLink: boolean };
  feeding: { label: string; value: string; caption: string | null };
  /** "your currency · private": the one place the page names a currency. */
  trailing: string;
}

/**
 * The Money card (README §3), every figure through `formatMoney`: a plain
 * number in the keeper's own currency, never a symbol, never `$0`. Zero spend
 * and no prices are `—` with their own caption; a field an older API did not
 * send is `—` + "not available yet".
 */
export function moneyCard(a: AdvancedAnalytics): MoneyCardModel {
  let spent: MoneyFigure;
  if (a.spent_this_month == null) {
    spent = { value: DASH, caption: NOT_YET, sub: null };
  } else if (!(num(a.spent_this_month) > 0)) {
    spent = { value: DASH, caption: 'nothing spent this month', sub: null };
  } else {
    spent = {
      value: formatMoney(a.spent_this_month),
      caption: 'spent this month',
      sub: num(a.feeders_spent_this_month) > 0 ? `${formatMoney(a.feeders_spent_this_month)} on feeders` : null,
    };
  }

  let paid: MoneyCardModel['paid'];
  if (num(a.collection_value_total) > 0) {
    const named = a.most_expensive_name && a.most_expensive_price != null && num(a.most_expensive_price) > 0;
    paid = {
      value: formatMoney(a.collection_value_total),
      caption: 'paid for animals',
      sub: named ? `most: ${a.most_expensive_name}, ${formatMoney(a.most_expensive_price)}` : null,
      addLink: false,
    };
  } else {
    paid = { value: DASH, caption: 'no price entered', sub: null, addLink: true };
  }

  let feedingCaption: string | null = null;
  if (a.cost_per_feeding != null) {
    const each = `${formatMoney(a.cost_per_feeding)} per feeding`;
    feedingCaption = a.cost_per_feeding_is_default ? `default, ${each}` : each;
  }
  const est = a.estimated_monthly_feeding_cost;
  return {
    spent,
    paid,
    feeding: {
      label: 'Est. feeding cost / month',
      value: typeof est === 'number' && Number.isFinite(est) ? `~${formatMoney(est)}` : DASH,
      caption: feedingCaption,
    },
    trailing: 'your currency · private',
  };
}

/**
 * Animals already owned before the first month of `collection_growth` (which
 * holds animals ADDED per month): `max(0, total_animals - sum of the adds)`.
 * Pass it as `stepModel`'s `baseline`. Approximate when animals acquired in the
 * window have since died or left.
 */
export function growthBaseline(a: AdvancedAnalytics): number {
  const added = (a.collection_growth ?? []).reduce((sum, g) => sum + Math.max(0, num(g.count)), 0);
  return Math.max(0, num(a.total_animals) - added);
}

// ───────────────────────────── Premium preview + sample ─────────────────────────────

/**
 * What the blurred Premium block draws for a free keeper with animals, computed
 * from `/collection` alone (a 402 on /advanced/ means there is no real data).
 * `moltSeries` only reaches back as far as `recent_activity` does. `growthSeries`
 * is a two-point step (animals added per month: the oldest acquisition, then the
 * rest). `money` is only what was paid in total. It is a rough picture, not
 * data: screens must hide the blurred block from screen readers (web
 * `aria-hidden`, mobile `importantForAccessibility="no-hide-descendants"`).
 */
export function previewFromCollection(c: CollectionAnalytics, now: Date) {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const buckets = new Map<number, number>();
  for (const a of c.recent_activity ?? []) {
    if (a.type !== 'molt') continue;
    const idx = monthIndex(a.date);
    if (idx == null || idx > nowIdx || idx < nowIdx - (BAR_MONTHS - 1)) continue;
    buckets.set(idx, (buckets.get(idx) ?? 0) + 1);
  }
  const moltSeries = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([idx, count]) => ({ month: monthKey(idx), count }));

  const total = animalCount(c);
  const oldest = monthIndex(c.oldest_acquisition?.date);
  const newest = monthIndex(c.newest_acquisition?.date);
  let growthSeries: { month: string; count: number }[] = [];
  if (oldest != null && newest != null && oldest !== newest) {
    growthSeries = [
      { month: monthKey(Math.min(oldest, newest)), count: 1 },
      { month: monthKey(Math.max(oldest, newest)), count: Math.max(1, total - 1) },
    ];
  } else if (oldest != null || newest != null) {
    growthSeries = [{ month: monthKey((oldest ?? newest) as number), count: Math.max(1, total) }];
  }

  const priced = c.priced_count == null ? num(c.total_value) > 0 : c.priced_count > 0;
  const money = priced
    ? { paid: formatMoney(c.total_value), caption: 'paid for animals' }
    : { paid: DASH, caption: 'no price entered' };

  return { moltSeries, growthSeries, money };
}

/**
 * The month the grey sample is drawn for (mid-October 2026). Pass it as `now` to
 * `barsModel`: the sample's months are fixed (Nov 2025 - Oct 2026), so its
 * window never goes empty as real time passes. Do not mutate.
 */
export const SAMPLE_NOW: Date = new Date(2026, 9, 15);

/** The sentence under the grey sample (README §3, zero-animal free keeper). */
export const SAMPLE_SENTENCE = 'This is what a keeper with six tarantulas sees. Yours will use your own logs.';

/**
 * The grey sample a zero-animal free keeper sees: "a keeper with six
 * tarantulas". Render it with `barsModel(series, width, SAMPLE_NOW)`. The 4
 * animals added in `collection_growth` plus `growthBaseline` (6 - 4 = 2) make
 * the 6.
 */
export const SAMPLE_ADVANCED: AdvancedAnalytics = {
  collection_value_total: 540,
  collection_value_average: 90,
  most_expensive_name: 'Juniper',
  most_expensive_price: 120,
  molt_heatmap: [
    { month: '2025-12', count: 1 },
    { month: '2026-02', count: 2 },
    { month: '2026-04', count: 1 },
    { month: '2026-05', count: 3 },
    { month: '2026-07', count: 1 },
    { month: '2026-08', count: 2 },
    { month: '2026-10', count: 2 },
  ],
  collection_growth: [
    { month: '2025-12', count: 1 },
    { month: '2026-03', count: 2 },
    { month: '2026-06', count: 1 },
  ],
  species_distribution: [
    { species_name: 'Species A', count: 3 },
    { species_name: 'Species B', count: 2 },
    { species_name: 'Species C', count: 1 },
  ],
  sex_distribution: { male: 2, female: 3, unknown: 1 },
  enclosure_type_distribution: { terrestrial: 4, arboreal: 1, fossorial: 1 },
  taxon_distribution: { tarantula: 6 },
  unique_species: 3,
  total_animals: 6,
  total_feedings_logged: 48,
  total_molts_logged: 12,
  estimated_monthly_feeding_cost: 12,
  cost_per_feeding: 0.5,
  cost_per_feeding_is_default: true,
  spent_this_month: 42.5,
  feeders_spent_this_month: 18,
};
