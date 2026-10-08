/**
 * One form input for a value STORED in inches / mm / °F but TYPED in the
 * keeper's units.
 *
 *   const span = useUnitField('length')
 *   span.load(m.leg_span_after)            // edit: the stored inches
 *   <TextInput value={span.value} onChangeText={span.setValue} />
 *   body.leg_span_after = span.toStorage() // inches again
 *
 * Until the keeper types in it, the field saves the ORIGINAL stored number,
 * so opening an entry and saving it never drifts it through a round trip
 * (and a late-arriving units setting just re-renders the pre-fill).
 */
import { useCallback, useState } from 'react'
import { useUnits } from './useUnits'
import {
  lengthInput, lengthMmInput, tempInput,
  parseLengthInput, parseLengthMmInput, parseTempInput,
  lengthUnit, lengthMmUnit, tempUnit, toNum,
  type Units,
} from '../lib/units'

export type UnitFieldKind = 'length' | 'lengthMm' | 'temp'

const TO_INPUT: Record<UnitFieldKind, (v: unknown, u: Units) => string> = {
  length: lengthInput,
  lengthMm: lengthMmInput,
  temp: tempInput,
}
const PARSE: Record<UnitFieldKind, (v: unknown, u: Units) => number | null> = {
  length: parseLengthInput,
  lengthMm: parseLengthMmInput,
  temp: parseTempInput,
}
const UNIT: Record<UnitFieldKind, (u: Units) => string> = {
  length: lengthUnit,
  lengthMm: lengthMmUnit,
  temp: tempUnit,
}

export interface UnitField {
  /** What the input shows. */
  value: string
  setValue: (text: string) => void
  /** Pre-fill from a stored value (inches / mm / °F). */
  load: (stored: unknown) => void
  /** The value to send to the API, in storage units. */
  toStorage: () => number | null
  /** "in" / "cm" / "mm" / "°F" / "°C" for the label. */
  unit: string
}

export function useUnitField(kind: UnitFieldKind): UnitField {
  const { units } = useUnits()
  const [stored, setStored] = useState<number | null>(null)
  const [text, setText] = useState<string | null>(null) // null = untouched

  const load = useCallback((v: unknown) => {
    setStored(toNum(v))
    setText(null)
  }, [])

  return {
    value: text ?? TO_INPUT[kind](stored, units),
    setValue: setText,
    load,
    toStorage: () => (text === null ? stored : PARSE[kind](text, units)),
    unit: UNIT[kind](units),
  }
}
