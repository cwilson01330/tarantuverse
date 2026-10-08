/**
 * Display units: imperial (in, °F) or metric (cm, °C).
 *
 * STORAGE NEVER CHANGES. Molt leg spans (every taxon) and growth rates are
 * INCHES; fields ending in `_mm` are MILLIMETRES; every temperature is °F;
 * weights are grams for everyone and are never converted. Only the edges
 * convert: formatters for display, parsers for form input.
 *
 * Rounding (same as apps/api/app/utils/units.py and apps/mobile/src/lib/units.ts):
 *   cm 1 decimal · in 2 decimals, trailing zeros trimmed · mm 1 decimal trimmed ·
 *   temperatures whole degrees.
 *
 * Pure module — no React. The current keeper's units come from
 * `useUnits()` in `components/UnitsProvider.tsx`.
 */

export type Units = 'imperial' | 'metric'

export const CM_PER_INCH = 2.54
export const MM_PER_INCH = 25.4

/** Countries that measure in inches and °F day to day. Everyone else → metric. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM'])

export function isUnits(v: unknown): v is Units {
  return v === 'imperial' || v === 'metric'
}

/** Anything that isn't 'metric' is imperial — which is what storage already is. */
export function normalizeUnits(v: unknown): Units {
  return v === 'metric' ? 'metric' : 'imperial'
}

/** US, Liberia, Myanmar → imperial; any other known region → metric; no
 *  region (a bare "en") → imperial, today's behaviour. */
export function defaultUnitsForRegion(region: string | null | undefined): Units {
  if (!region) return 'imperial'
  return IMPERIAL_REGIONS.has(region.trim().toUpperCase()) ? 'imperial' : 'metric'
}

/** Region from a BCP-47 tag: "en-GB" → "GB", "zh-Hant-TW" → "TW", "en" → null. */
export function regionFromLocale(locale: string | null | undefined): string | null {
  if (!locale) return null
  const parts = locale.replace(/_/g, '-').split('-')
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    if (p.length === 1) break // "-u-…" / "-x-…" extensions: no region after this
    if (/^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p)) return p.toUpperCase()
  }
  return null
}

/** The browser's default, from navigator.languages / navigator.language. */
export function browserDefaultUnits(): Units {
  if (typeof navigator === 'undefined') return 'imperial'
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean)
  for (const t of tags) {
    const r = regionFromLocale(t)
    if (r) return defaultUnitsForRegion(r)
  }
  return 'imperial'
}

// ── raw conversions ─────────────────────────────────────────────────────────

export const inchesToCm = (inches: number) => inches * CM_PER_INCH
export const cmToInches = (cm: number) => cm / CM_PER_INCH
export const mmToInches = (mm: number) => mm / MM_PER_INCH
export const inchesToMm = (inches: number) => inches * MM_PER_INCH
export const fToC = (f: number) => ((f - 32) * 5) / 9
export const cToF = (c: number) => (c * 9) / 5 + 32

// ── rounding ────────────────────────────────────────────────────────────────

/** Round half away from zero on the decimal representation, trim zeros. */
function trim(value: number, places: number): string {
  const abs = Math.abs(value)
  let r = Number(Math.round(Number(`${abs}e${places}`)) + `e-${places}`)
  if (!Number.isFinite(r)) r = Number(abs.toFixed(places))
  if (r === 0) return '0'
  return String(value < 0 ? -r : r)
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ── unit labels ─────────────────────────────────────────────────────────────

export const lengthUnit = (units: Units) => (units === 'metric' ? 'cm' : 'in')
/** For fields stored in mm: metric shows mm, imperial shows inches. */
export const lengthMmUnit = (units: Units) => (units === 'metric' ? 'mm' : 'in')
export const tempUnit = (units: Units) => (units === 'metric' ? '°C' : '°F')

/** Swap a trailing "(mm)" / "(in)" on a label for the keeper's mm-field unit:
 *  "Leg span (mm)" → "Leg span (in)" for imperial. */
export function withMmUnit(label: string, units: Units): string {
  return `${stripUnit(label)} (${lengthMmUnit(units)})`
}

/** "Leg span (mm)" → "Leg span". */
export function stripUnit(label: string): string {
  return label.replace(/\s*\((mm|cm|in|inches)\)\s*$/i, '')
}

// ── values (number only, in the keeper's units) ─────────────────────────────

export function lengthValue(inches: unknown, units: Units): string | null {
  const n = toNum(inches)
  if (n === null) return null
  return units === 'metric' ? trim(inchesToCm(n), 1) : trim(n, 2)
}

export function lengthMmValue(mm: unknown, units: Units): string | null {
  const n = toNum(mm)
  if (n === null) return null
  return units === 'metric' ? trim(n, 1) : trim(mmToInches(n), 2)
}

export function tempValue(f: unknown, units: Units): string | null {
  const n = toNum(f)
  if (n === null) return null
  return trim(units === 'metric' ? fToC(n) : n, 0)
}

// ── formatted strings ───────────────────────────────────────────────────────

/** Stored inches → "3.5 in" / "8.9 cm". */
export function formatLength(inches: unknown, units: Units): string | null {
  const v = lengthValue(inches, units)
  return v === null ? null : `${v} ${lengthUnit(units)}`
}

/** Stored millimetres → "45 mm" / "1.77 in". */
export function formatLengthMm(mm: unknown, units: Units): string | null {
  const v = lengthMmValue(mm, units)
  return v === null ? null : `${v} ${lengthMmUnit(units)}`
}

/** Stored mm range → "40–60 mm" / "1.57–2.36 in"; null when both are missing. */
export function formatLengthMmRange(lo: unknown, hi: unknown, units: Units): string | null {
  const a = lengthMmValue(lo, units)
  const b = lengthMmValue(hi, units)
  if (a === null && b === null) return null
  return `${a ?? '?'}–${b ?? '?'} ${lengthMmUnit(units)}`
}

/** Stored °F → "75°F" / "24°C". */
export function formatTemp(f: unknown, units: Units): string | null {
  const v = tempValue(f, units)
  return v === null ? null : `${v}${tempUnit(units)}`
}

/** Stored °F range → "72–82°F" / "22–28°C"; null when both are missing. */
export function formatTempRange(lo: unknown, hi: unknown, units: Units): string | null {
  const a = tempValue(lo, units)
  const b = tempValue(hi, units)
  if (a === null && b === null) return null
  return `${a ?? '?'}–${b ?? '?'}${tempUnit(units)}`
}

/** Stored inches-per-month growth rate → "0.25 in/mo" / "0.64 cm/mo".
 *  Rates are small, so cm keeps 2 decimals here (1 would round most to 0). */
export function formatLengthRate(inchesPerMonth: unknown, units: Units): string | null {
  const n = toNum(inchesPerMonth)
  if (n === null) return null
  const v = units === 'metric' ? trim(inchesToCm(n), 2) : trim(n, 2)
  return `${v} ${lengthUnit(units)}/mo`
}

// ── form input: keeper's units ↔ storage ────────────────────────────────────

/** Typed length (in or cm) → INCHES, 2 decimals. Empty/garbage/negative → null. */
export function parseLengthInput(value: unknown, units: Units): number | null {
  const n = toNum(value)
  if (n === null || n < 0) return null
  const inches = units === 'metric' ? cmToInches(n) : n
  return Math.round(inches * 100) / 100
}

/** Typed length (mm or in) → MILLIMETRES, 2 decimals. */
export function parseLengthMmInput(value: unknown, units: Units): number | null {
  const n = toNum(value)
  if (n === null || n < 0) return null
  const mm = units === 'metric' ? n : inchesToMm(n)
  return Math.round(mm * 100) / 100
}

/** Typed temperature (°F or °C) → °F, 1 decimal (exact for whole °C). */
export function parseTempInput(value: unknown, units: Units): number | null {
  const n = toNum(value)
  if (n === null) return null
  const f = units === 'metric' ? cToF(n) : n
  return Math.round(f * 10) / 10
}

/** Stored inches → the string to pre-fill an edit input with (no unit). */
export const lengthInput = (inches: unknown, units: Units) => lengthValue(inches, units) ?? ''
/** Stored mm → input string. */
export const lengthMmInput = (mm: unknown, units: Units) => lengthMmValue(mm, units) ?? ''
/** Stored °F → input string. Temperatures pre-fill to 1 decimal so a stored
 *  75.2°F shows as 24 °C, and 76°F as 24.4 °C (never silently rounded). */
export function tempInput(f: unknown, units: Units): string {
  const n = toNum(f)
  if (n === null) return ''
  return trim(units === 'metric' ? fToC(n) : n, 1)
}

/**
 * Edit forms: if the keeper didn't touch a field, save the ORIGINAL stored
 * value instead of re-parsing the converted text, so opening and saving an
 * entry never drifts it (3.5 in → "8.9" cm → 3.5 in, but also 76°F →
 * "24.4" °C → 75.9°F would drift without this).
 */
export function keepIfUnchanged<T>(
  text: string,
  initialText: string,
  original: T,
  parse: (text: string) => T,
): T {
  return text.trim() === initialText.trim() ? original : parse(text)
}
