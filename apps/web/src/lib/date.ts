/**
 * Date formatting helpers for Tarantuverse web.
 *
 * Why this file exists: the backend stores some fields as `DATE`
 * (e.g. `date_acquired`, `last_substrate_change`, `changed_at`) and
 * returns them as bare `"YYYY-MM-DD"` strings. `new Date("2026-03-04")`
 * parses that as **UTC midnight** — then `.toLocaleDateString()` converts
 * to local time, which for any timezone west of UTC rewinds the date by
 * one day. Users east of the keeper's reported locale would see no bug,
 * which is how it hid so long.
 *
 * `DATETIME` fields (`fed_at`, `molted_at`) already round-trip correctly
 * because they include a timezone offset, so this helper deliberately
 * no-ops on strings that aren't pure dates.
 */

/**
 * Parse a `DATE` or `DATETIME` string in a way that preserves the
 * keeper's intended calendar day. Returns null for empty input so
 * callers can still short-circuit.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  // Pure "YYYY-MM-DD" — parse as local, not UTC.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) {
    const [, y, m, d] = match
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  // Full datetime — let Date handle it (includes tz offset).
  const dt = new Date(value)
  return isNaN(dt.getTime()) ? null : dt
}

/**
 * Format a DATE/DATETIME for display. Returns an empty string for null
 * input so templates can interpolate it without branching.
 */
export function formatLocalDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const d = parseLocalDate(value)
  return d ? d.toLocaleDateString('en-US', options) : ''
}

/**
 * Whole-day diff between a DATE (or DATETIME) and now, in the keeper's
 * local calendar. Useful for "X days since acquisition" math that
 * previously drifted by the UTC offset.
 */
export function daysBetween(
  fromValue: string | null | undefined,
  toValue: string | null | undefined = undefined,
): number | null {
  const from = parseLocalDate(fromValue)
  if (!from) return null
  const to = toValue ? parseLocalDate(toValue) : new Date()
  if (!to) return null
  // Collapse both to local midnight before diffing so DST shifts don't
  // introduce off-by-one.
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
