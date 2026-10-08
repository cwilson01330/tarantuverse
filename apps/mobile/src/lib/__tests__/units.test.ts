/**
 * Display units. Storage never changes (inches / mm / °F); these pin the
 * rounding rules shared with apps/api/app/utils/units.py and the web copy,
 * and the round trips that must not drift when a keeper edits an entry.
 */
import {
  defaultUnitsForRegion,
  formatLength,
  formatLengthMm,
  formatLengthMmRange,
  formatLengthRate,
  formatTemp,
  formatTempRange,
  keepIfUnchanged,
  lengthInput,
  lengthValue,
  parseLengthInput,
  parseLengthMmInput,
  parseTempInput,
  regionFromLocale,
  stripUnit,
  tempInput,
  tempValue,
  withMmUnit,
} from '../units';

describe('formatting', () => {
  it('shows inches with up to 2 decimals, trimmed', () => {
    expect(formatLength(3.5, 'imperial')).toBe('3.5 in');
    expect(formatLength('3.25', 'imperial')).toBe('3.25 in');
    expect(formatLength(4, 'imperial')).toBe('4 in');
    expect(formatLength(3.456, 'imperial')).toBe('3.46 in');
  });

  it('shows cm with 1 decimal', () => {
    expect(formatLength(3.5, 'metric')).toBe('8.9 cm');
    expect(formatLength(1, 'metric')).toBe('2.5 cm');
    expect(formatLength(10, 'metric')).toBe('25.4 cm');
  });

  it('shows mm fields as mm or inches', () => {
    expect(formatLengthMm(45, 'metric')).toBe('45 mm');
    expect(formatLengthMm('45.50', 'metric')).toBe('45.5 mm');
    expect(formatLengthMm(45, 'imperial')).toBe('1.77 in');
    expect(formatLengthMmRange(40, 60, 'metric')).toBe('40–60 mm');
    expect(formatLengthMmRange(null, 60, 'imperial')).toBe('?–2.36 in');
    expect(formatLengthMmRange(null, null, 'imperial')).toBeNull();
  });

  it('shows whole-degree temperatures', () => {
    expect(formatTemp(75, 'imperial')).toBe('75°F');
    expect(formatTemp(75, 'metric')).toBe('24°C');
    expect(formatTemp(32, 'metric')).toBe('0°C');
    expect(formatTempRange(72, 82, 'metric')).toBe('22–28°C');
    expect(formatTempRange('72.00', null, 'imperial')).toBe('72–?°F');
    expect(formatTempRange(null, null, 'metric')).toBeNull();
  });

  it('keeps 2 decimals on growth rates in cm', () => {
    expect(formatLengthRate(0.25, 'imperial')).toBe('0.25 in/mo');
    expect(formatLengthRate(0.25, 'metric')).toBe('0.64 cm/mo');
  });

  it('leaves missing values missing', () => {
    expect(formatLength(null, 'metric')).toBeNull();
    expect(formatLength('', 'metric')).toBeNull();
    expect(formatTemp(undefined, 'metric')).toBeNull();
  });

  it('swaps the unit on a registry label', () => {
    expect(withMmUnit('Leg span (mm)', 'imperial')).toBe('Leg span (in)');
    expect(withMmUnit('Leg span (mm)', 'metric')).toBe('Leg span (mm)');
    expect(stripUnit('Length (mm)')).toBe('Length');
  });
});

describe('parsing back to storage units', () => {
  it('converts typed values to inches / mm / °F', () => {
    expect(parseLengthInput('8.9', 'metric')).toBe(3.5);
    expect(parseLengthInput('3,5', 'imperial')).toBe(3.5);
    expect(parseLengthMmInput('1.77', 'imperial')).toBe(44.96);
    expect(parseLengthMmInput('45', 'metric')).toBe(45);
    expect(parseTempInput('24', 'metric')).toBe(75.2);
    expect(parseTempInput('75', 'imperial')).toBe(75);
    expect(parseTempInput('-5', 'metric')).toBe(23);
  });

  it('rejects blanks, garbage and negative lengths', () => {
    expect(parseLengthInput('', 'metric')).toBeNull();
    expect(parseLengthInput('abc', 'metric')).toBeNull();
    expect(parseLengthInput('-1', 'imperial')).toBeNull();
    expect(parseLengthMmInput('-1', 'metric')).toBeNull();
  });

  it('round-trips every typed tenth of a cm through inch storage', () => {
    for (let t = 1; t < 400; t++) {
      const typed = t / 10;
      const stored = parseLengthInput(String(typed), 'metric');
      expect(Number(lengthValue(stored, 'metric'))).toBeCloseTo(typed, 5);
    }
  });

  it('round-trips every whole °C through °F storage', () => {
    for (let c = -10; c < 50; c++) {
      const stored = parseTempInput(String(c), 'metric');
      expect(tempValue(stored, 'metric')).toBe(String(c));
    }
  });

  it('saves the original when an edit field was not touched', () => {
    // 3.5 in shows as 8.9 cm; saving without touching must keep 3.5 exactly.
    const shown = lengthInput(3.5, 'metric');
    expect(shown).toBe('8.9');
    expect(keepIfUnchanged(shown, shown, 3.5, (t) => parseLengthInput(t, 'metric'))).toBe(3.5);
    // 76°F shows as 24.4 °C; re-parsing would give 75.9 — the original wins.
    const t = tempInput(76, 'metric');
    expect(t).toBe('24.4');
    expect(keepIfUnchanged(t, t, 76, (x) => parseTempInput(x, 'metric'))).toBe(76);
    expect(parseTempInput(t, 'metric')).toBe(75.9);
  });
});

describe('region default', () => {
  it('is imperial for US, Liberia and Myanmar, metric elsewhere', () => {
    for (const r of ['US', 'us', 'LR', 'MM']) expect(defaultUnitsForRegion(r)).toBe('imperial');
    for (const r of ['GB', 'CA', 'DE', 'AU', 'NL']) expect(defaultUnitsForRegion(r)).toBe('metric');
    expect(defaultUnitsForRegion(null)).toBe('imperial');
  });

  it('reads the region from a locale tag', () => {
    expect(regionFromLocale('en-GB')).toBe('GB');
    expect(regionFromLocale('en_US')).toBe('US');
    expect(regionFromLocale('zh-Hant-TW')).toBe('TW');
    expect(regionFromLocale('es-419')).toBe('419');
    expect(regionFromLocale('en-US-u-ca-gregory')).toBe('US');
    expect(regionFromLocale('de-u-co-phonebk')).toBeNull();
    expect(regionFromLocale('en')).toBeNull();
  });
});
