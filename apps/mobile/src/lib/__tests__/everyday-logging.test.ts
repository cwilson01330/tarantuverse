import {
  MOLT_PHOTO_PROMPT_KEY,
  elapsedShort,
  matureBadge,
  matureMaleNote,
  offerMoltPhoto,
  preyLabel,
  stageChip,
} from '../everyday-logging';

const NOW = new Date(2026, 10, 13, 12, 0);

describe('elapsedShort', () => {
  it('uses local calendar days then months then years', () => {
    expect(elapsedShort('2026-11-13', NOW)).toBe('today');
    expect(elapsedShort('2026-11-20', NOW)).toBe('today');
    expect(elapsedShort('2026-11-12', NOW)).toBe('1 d');
    expect(elapsedShort('2026-09-15', NOW)).toBe('59 d');
    expect(elapsedShort('2026-08-13', NOW)).toBe('3 mo');
    expect(elapsedShort('2026-08-14', NOW)).toBe('2 mo');
    expect(elapsedShort('2024-12-01', NOW)).toBe('23 mo');
    expect(elapsedShort('2024-11-13', NOW)).toBe('2 yr');
    expect(elapsedShort('2020-01-01', NOW)).toBe('6 yr');
  });
  it('late evening still counts the local day', () => {
    expect(elapsedShort('2026-11-13', new Date(2026, 10, 13, 23, 59))).toBe('today');
    expect(elapsedShort('2026-11-12', new Date(2026, 10, 13, 0, 1))).toBe('1 d');
  });
});

describe('matureBadge', () => {
  it('words', () => {
    expect(matureBadge(null, NOW)).toBeNull();
    expect(matureBadge('2026-11-13', NOW)).toBe('Mature · today');
    expect(matureBadge('2026-08-13', NOW)).toBe('Mature · 3 mo');
  });
});

describe('matureMaleNote', () => {
  it('tarantula males only', () => {
    const n = matureMaleNote('tarantula', 'Male');
    expect(n?.text).toBe('Mature males typically live a few months to a couple of years after their final molt.');
    expect(n?.sourceUrl).toBe('https://www.thebiodude.com/blogs/helpful-husbandry-faqs/how-to-sex-male-vs-female-tarantulas');
    expect(matureMaleNote('tarantula', 'female')).toBeNull();
    expect(matureMaleNote('tarantula', null)).toBeNull();
    expect(matureMaleNote('true_spider', 'male')).toBeNull();
  });
});

describe('stageChip', () => {
  it('instar taxa with a count', () => {
    expect(stageChip('tarantula', 7)).toBeNull();
    expect(stageChip('mantis', 5)).toBe('L5');
    expect(stageChip('scorpion', 3)).toBe('Instar 3');
    expect(stageChip('mantis', null)).toBeNull();
    expect(stageChip('mantis', 0)).toBeNull();
    expect(stageChip('mantis', undefined)).toBeNull();
  });
});

describe('offerMoltPhoto', () => {
  it('rules', () => {
    expect(MOLT_PHOTO_PROMPT_KEY).toBe('molt_photo_prompt_v1');
    expect(offerMoltPhoto('millipede', false, false)).toBe(false);
    expect(offerMoltPhoto('mantis', true, false)).toBe(false);
    expect(offerMoltPhoto('mantis', false, true)).toBe(false);
    expect(offerMoltPhoto('mantis', false, false)).toBe(true);
  });
});

describe('preyLabel', () => {
  it('words', () => {
    expect(preyLabel('House fly', 3)).toBe('3 × House fly');
    expect(preyLabel('House fly', 1)).toBe('House fly');
    expect(preyLabel('House fly', null)).toBe('House fly');
    expect(preyLabel(null, 4)).toBe('4 prey items');
  });
});
