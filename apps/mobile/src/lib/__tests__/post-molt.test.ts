import { effectivePauseDays, isPauseActive, moltFormLine, pauseDaysFor, pauseLabel, pauseUntil } from '../post-molt';

describe('isPauseActive', () => {
  it('is active when the last paused day is today or later', () => {
    expect(isPauseActive('2026-11-24', '2026-11-10')).toBe(true);
    expect(isPauseActive('2026-11-10', '2026-11-10')).toBe(true);
  });
  it('is not active for a back-dated molt whose window already ended', () => {
    expect(isPauseActive('2026-10-20', '2026-11-10')).toBe(false);
  });
  it('is not active with no date or a bad date', () => {
    expect(isPauseActive(null, '2026-11-10')).toBe(false);
    expect(isPauseActive('nope', '2026-11-10')).toBe(false);
    expect(isPauseActive('2026-11-24', 'nope')).toBe(false);
  });
});

describe('pauseUntil', () => {
  it('adds the window to the molt day', () => {
    expect(pauseUntil('2026-11-10', 14)).toBe('2026-11-24');
  });
  it('crosses month and year ends', () => {
    expect(pauseUntil('2026-12-28', 7)).toBe('2027-01-04');
    expect(pauseUntil('2028-02-25', 7)).toBe('2028-03-03');
  });
  it('returns null with no window or a bad date', () => {
    expect(pauseUntil('2026-11-10', null)).toBeNull();
    expect(pauseUntil('2026-11-10', 0)).toBeNull();
    expect(pauseUntil('nope', 7)).toBeNull();
  });
});

describe('pauseLabel', () => {
  it('formats Mon D without drift', () => {
    expect(pauseLabel('2026-11-24')).toBe('Paused after molt · until Nov 24');
    expect(pauseLabel('2027-01-01')).toBe('Paused after molt · until Jan 1');
  });
  it('is null for no pause', () => {
    expect(pauseLabel(null)).toBeNull();
    expect(pauseLabel('garbage')).toBeNull();
  });
});

describe('moltFormLine', () => {
  it('uses the exact copy', () => {
    expect(moltFormLine('2026-11-24')).toBe(
      'Feeding reminders pause until Nov 24 — check the fangs are fully black before offering food.',
    );
  });
});

describe('effectivePauseDays', () => {
  test('override wins: 0 → no line, 21 → 21 days', () => {
    expect(effectivePauseDays(14, 0)).toBeNull();
    expect(effectivePauseDays(14, 21)).toBe(21);
  });
  it('null or undefined override keeps the default', () => {
    expect(effectivePauseDays(14, null)).toBe(14);
    expect(effectivePauseDays(14, undefined)).toBe(14);
  });
  it('no default and no override means no pause', () => {
    expect(effectivePauseDays(null, null)).toBeNull();
    expect(effectivePauseDays(null, 5)).toBe(5);
    expect(effectivePauseDays(0, null)).toBeNull();
  });
});

describe('pauseDaysFor', () => {
  it('counts whole days from the molt day to the chosen day', () => {
    expect(pauseDaysFor('2026-11-10', '2026-11-24')).toBe(14);
    expect(pauseDaysFor('2026-12-28', '2027-01-04')).toBe(7);
  });
  it('a day on or before the molt means no pause', () => {
    expect(pauseDaysFor('2026-11-10', '2026-11-10')).toBe(0);
    expect(pauseDaysFor('2026-11-10', '2026-11-01')).toBe(0);
  });
  it('is capped at the 60 days the server allows', () => {
    expect(pauseDaysFor('2026-11-10', '2027-03-01')).toBe(60);
  });
  it('is null for unparseable input', () => {
    expect(pauseDaysFor('x', '2026-11-10')).toBeNull();
  });
});
