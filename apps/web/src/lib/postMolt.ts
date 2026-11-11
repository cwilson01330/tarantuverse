/**
 * Post-molt feeding pause helpers (Effortless logging, task 6; web copy of apps/mobile/src/lib/post-molt.ts). Pure.
 *
 * Dates are 'YYYY-MM-DD' strings in the keeper's local calendar. They are
 * parsed by their parts, never with `new Date('YYYY-MM-DD')` (that is UTC
 * midnight and drifts a day in negative-offset time zones).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}

/** Molt day + window → the last paused day (reminders resume the day after). null when no window. */
export function pauseUntil(moltedOn: string, days: number | null): string | null {
  if (days == null || !(days > 0)) return null;
  const p = parts(moltedOn);
  if (!p) return null;
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + Math.floor(days)));
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True while a pause through `until` (the last paused day) still matters: the
 * date is today or later. Both are keeper-local 'YYYY-MM-DD'. A back-dated molt
 * whose window already ended pauses nothing, so the form shows no line.
 */
export function isPauseActive(until: string | null | undefined, today: string): boolean {
  if (!until || !parts(until) || !parts(today)) return false
  return until >= today
}

/** "Nov 24" from "2026-11-24" (en-US short month), or null if unparseable. */
function shortDate(date: string): string | null {
  const p = parts(date);
  if (!p) return null;
  return `${MONTHS[p[1] - 1]} ${p[2]}`;
}

/** `Paused after molt · until Nov 24`, or null when there is no pause. */
export function pauseLabel(until: string | null | undefined): string | null {
  if (!until) return null;
  const s = shortDate(until);
  return s ? `Paused after molt · until ${s}` : null;
}

/** The molt-form line (exact copy). */
export function moltFormLine(until: string): string {
  return `Feeding reminders pause until ${shortDate(until) ?? until} — check the fangs are fully black before offering food.`;
}

/**
 * The window a molt form shows: the keeper's override when set (0 = don't
 * pause → null), else the default. null/undefined override keeps the default.
 */
export function effectivePauseDays(
  defaultDays: number | null,
  override: number | null | undefined,
): number | null {
  const days = override == null ? defaultDays : override;
  return days != null && days > 0 ? days : null;
}

const MAX_PAUSE_DAYS = 60;

/**
 * Whole days from the molt day to the chosen last paused day, for `feeding_pause_days`.
 * A day on or before the molt = 0 (don't pause); capped at the server's 60.
 */
export function pauseDaysFor(moltedOn: string, chosenUntil: string): number | null {
  const a = parts(moltedOn);
  const b = parts(chosenUntil);
  if (!a || !b) return null;
  const diff = Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  if (diff <= 0) return 0;
  return Math.min(diff, MAX_PAUSE_DAYS);
}
