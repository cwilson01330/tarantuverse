/**
 * Date formatting helpers for Tarantuverse mobile.
 *
 * Mirrors `apps/web/src/lib/date.ts`: DATE fields from the backend come
 * back as bare `"YYYY-MM-DD"` strings, which `new Date()` parses as UTC
 * midnight. `.toLocaleDateString()` then converts to local time, rewinding
 * the calendar day by one for any keeper west of UTC (i.e., everyone in
 * the Americas). This helper detects pure-date strings and anchors them
 * to the local calendar; full datetimes with offsets are passed through
 * unchanged.
 */

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

export function formatLocalDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = parseLocalDate(value);
  return d ? d.toLocaleDateString('en-US', options) : '';
}

/**
 * Whole-day diff between a DATE and now, in the keeper's local calendar.
 */
export function daysBetween(
  fromValue: string | null | undefined,
  toValue: string | null | undefined = undefined,
): number | null {
  const from = parseLocalDate(fromValue);
  if (!from) return null;
  const to = toValue ? parseLocalDate(toValue) : new Date();
  if (!to) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Format a local Date as a `YYYY-MM-DD` string for sending to the API.
 * Avoids the `.toISOString().split('T')[0]` trap, which converts local
 * → UTC and can flip the day forward by one when the local time is
 * late enough in the day.
 */
export function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
