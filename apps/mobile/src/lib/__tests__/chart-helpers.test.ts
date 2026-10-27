import { contrastRatio, pickContrasting, rankedValueWidth, withAlpha } from '../chart-helpers';

describe('contrastRatio', () => {
  test('black on white is 21, identical colours 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#1a1a24', '#1a1a24')).toBeCloseTo(1, 5);
  });
  test('is symmetric', () => {
    expect(contrastRatio('#94a3b8', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#94a3b8')!, 8);
  });
  test('known values: old light tertiary fails AA, the replacement passes on every light surface', () => {
    expect(contrastRatio('#94a3b8', '#ffffff')!).toBeLessThan(3);
    for (const bg of ['#ffffff', '#f8fafc', '#f1f5f9']) {
      expect(contrastRatio('#5f6f86', bg)!).toBeGreaterThanOrEqual(4.5);
    }
  });
  test('non-hex input is null', () => {
    expect(contrastRatio('rgb(0,0,0)', '#fff')).toBeNull();
    expect(contrastRatio('#12', '#fff')).toBeNull();
  });
});

describe('pickContrasting', () => {
  const surface = '#1a1a24';
  test('keeps the first candidate when it reads', () => {
    expect(pickContrasting(surface, ['#f59e0b', '#ffffff'])).toBe('#f59e0b');
  });
  test('a near-black secondary on a dark card falls through to the next candidate', () => {
    expect(pickContrasting(surface, ['#1F1F1F', '#8fa8ff', '#000000'])).toBe('#8fa8ff');
    expect(pickContrasting(surface, ['#292524', '#1A1A1A', '#e0e0ff'])).toBe('#e0e0ff');
  });
  test('when nothing reaches the floor, the best of them wins', () => {
    expect(pickContrasting(surface, ['#1F1F1F', '#303040', '#242430'])).toBe('#303040');
  });
  test('an unparseable candidate is trusted as is', () => {
    expect(pickContrasting(surface, ['rgb(1,1,1)', '#ffffff'])).toBe('rgb(1,1,1)');
  });
});

describe('rankedValueWidth', () => {
  test('floor and ceiling', () => {
    expect(rankedValueWidth([])).toBe(56);
    expect(rankedValueWidth([{ value: '3' }])).toBe(56);
    expect(rankedValueWidth([{ value: 'x'.repeat(60) }])).toBe(140);
  });
  test('fits the longest "value · detail" and grows with the system font', () => {
    const rows = [
      { value: '4', detail: '3d' },
      { value: '1,221', detail: '11mo' },
      { value: 'none yet', none: true },
    ];
    const w = rankedValueWidth(rows);
    expect(w).toBe(Math.ceil('1,221 · 11mo'.length * 7.4) + 4);
    expect(w).toBeGreaterThan(84 - 8); // about what the fixed column was
    expect(rankedValueWidth(rows, 1.3)).toBeGreaterThan(w);
    expect(rankedValueWidth(rows, 0.5)).toBe(w); // never shrinks below the 1x estimate
    expect(rankedValueWidth(rows, NaN)).toBe(w);
  });
  test('same rows give the same width (tracks stay aligned within a card)', () => {
    const rows = [{ value: '12', detail: '11mo' }, { value: '2' }];
    expect(rankedValueWidth(rows)).toBe(rankedValueWidth([...rows].reverse()));
  });
});

describe('withAlpha', () => {
  test('16% of a 6-digit hex', () => {
    expect(withAlpha('#8b5cf6', 0.16, 'x')).toBe('#8b5cf629');
    expect(withAlpha('#22C55E', 1, 'x')).toBe('#22C55Eff');
    expect(withAlpha('#000000', 0, 'x')).toBe('#00000000');
  });
  test('anything else returns the fallback, and alpha is clamped', () => {
    expect(withAlpha('#abc', 0.5, 'fb')).toBe('fb');
    expect(withAlpha('rgb(1,2,3)', 0.5, 'fb')).toBe('fb');
    expect(withAlpha('', 0.5, 'fb')).toBe('fb');
    expect(withAlpha('#112233', 7, 'x')).toBe('#112233ff');
    expect(withAlpha('#112233', NaN, 'x')).toBe('#112233ff');
  });
});
