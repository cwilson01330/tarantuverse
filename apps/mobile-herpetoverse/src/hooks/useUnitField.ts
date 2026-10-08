/**
 * One form input for a value STORED in inches / mm / °F but TYPED in the
 * keeper's units. Mirror of apps/mobile/src/hooks/useUnitField.ts and the
 * HV web hook — keep them in step.
 *
 *   const temp = useUnitField('temp');
 *   temp.load(clutch.incubation_temp_min_f);   // edit: the stored °F
 *   <TextInput value={temp.value} onChangeText={temp.setValue} />
 *   body.incubation_temp_min_f = temp.toStorage(); // °F again
 *
 * Until the keeper types in it, the field saves the ORIGINAL stored number,
 * so opening an entry and saving it never drifts it through a round trip
 * (and a late-arriving units setting just re-renders the pre-fill).
 */
import { useCallback, useState } from 'react';
import { useUnits } from './useUnits';
import {
  lengthInput, lengthMmInput, tempInput,
  parseLengthInput, parseLengthMmInput, parseTempInput,
  lengthUnit, lengthMmUnit, tempUnit, toNum,
  type Units,
} from '../lib/units';

export type UnitFieldKind = 'length' | 'lengthMm' | 'temp';

const TO_INPUT: Record<UnitFieldKind, (v: unknown, u: Units) => string> = {
  length: lengthInput,
  lengthMm: lengthMmInput,
  temp: tempInput,
};
const PARSE: Record<UnitFieldKind, (v: unknown, u: Units) => number | null> = {
  length: parseLengthInput,
  lengthMm: parseLengthMmInput,
  temp: parseTempInput,
};
const UNIT: Record<UnitFieldKind, (u: Units) => string> = {
  length: lengthUnit,
  lengthMm: lengthMmUnit,
  temp: tempUnit,
};

export interface UnitField {
  /** What the input shows. */
  value: string;
  setValue: (text: string) => void;
  /** Pre-fill from a stored value (inches / mm / °F). */
  load: (stored: unknown) => void;
  /** The value to send to the API, in storage units. */
  toStorage: () => number | null;
  /** True once the keeper has typed in it. */
  touched: boolean;
  /** "in" / "cm" / "mm" / "°F" / "°C" for the label. */
  unit: string;
}

export function useUnitField(kind: UnitFieldKind): UnitField {
  const { units } = useUnits();
  const [stored, setStored] = useState<number | null>(null);
  const [text, setText] = useState<string | null>(null); // null = untouched

  const load = useCallback((v: unknown) => {
    setStored(toNum(v));
    setText(null);
  }, []);

  return {
    value: text ?? TO_INPUT[kind](stored, units),
    setValue: setText,
    load,
    toStorage: () => (text === null ? stored : PARSE[kind](text, units)),
    touched: text !== null,
    unit: UNIT[kind](units),
  };
}
