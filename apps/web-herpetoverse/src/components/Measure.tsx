'use client'

/**
 * Lengths and temperatures in the viewer's units, as drop-in text.
 *
 * For components that also render on the server (the public care sheet,
 * the species browser): they stay server components and drop one of these
 * in where a number + unit used to be. The server's first paint is imperial
 * (what storage is); the client settles on the viewer's units after
 * hydration — see UnitsProvider.
 *
 * Imperial output is exactly what these pages printed before (same
 * trimZeros formatting, "75–85 °F"), so nothing moves for imperial keepers.
 */
import { useUnits } from '@/components/UnitsProvider'
import { trimZeros } from '@/lib/reptileSpecies'
import {
  lengthUnit, lengthValue, tempUnit, tempValue, toNum,
  type Units,
} from '@/lib/units'

type Raw = string | number | null | undefined

function rangeText(
  min: Raw,
  max: Raw,
  fmt: (v: Raw) => string | null,
  unit: string,
): string | null {
  if (min == null && max == null) return null
  const a = min == null ? '—' : fmt(min) ?? '—'
  const b = max == null ? '—' : fmt(max) ?? '—'
  if (min != null && max != null && a === b) return `${a} ${unit}`
  return `${a}–${b} ${unit}`
}

const imperialNum = (v: Raw) => {
  if (v == null || toNum(v) === null) return null
  const s = String(v)
  // trimZeros only on a decimal ("72.50" → "72.5"); a bare "70" stays 70.
  return s.includes('.') ? trimZeros(s) : s
}

/** Stored-inches range → "36–60 in" / "91.4–152.4 cm". */
export function formatLengthRangeIn(min: Raw, max: Raw, units: Units): string | null {
  if (units === 'imperial') return rangeText(min, max, imperialNum, 'in')
  return rangeText(min, max, (v) => lengthValue(v, units), lengthUnit(units))
}

/** Stored-°F range → "75–85 °F" / "24–29 °C". */
export function formatTempRangeF(min: Raw, max: Raw, units: Units): string | null {
  if (units === 'imperial') return rangeText(min, max, imperialNum, '°F')
  return rangeText(min, max, (v) => tempValue(v, units), tempUnit(units))
}

/** <LengthRange min={s.adult_length_min_in} max={s.adult_length_max_in} /> */
export function LengthRange({ min, max }: { min: Raw; max: Raw }) {
  const { units } = useUnits()
  return <>{formatLengthRangeIn(min, max, units)}</>
}

/** <TempRange min={s.temp_cool_min} max={s.temp_cool_max} /> */
export function TempRange({ min, max }: { min: Raw; max: Raw }) {
  const { units } = useUnits()
  return <>{formatTempRangeF(min, max, units)}</>
}
