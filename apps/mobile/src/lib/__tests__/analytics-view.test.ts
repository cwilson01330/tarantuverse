/**
 * Analytics view lib (analytics redesign, Task 2). The same file ships in two
 * copies (mobile `analytics-view.ts`, web `analyticsView.ts`); everything below
 * the "shared below" marker is byte-identical, so this one test pins the shared
 * half. Every function is pure: `now` is injected, nothing reads the clock.
 *
 * Copy under test is the design handoff's README §3 (card copy) and §6 (charts).
 */
import {
  ADD_PAID_LINK,
  SAMPLE_ADVANCED,
  SAMPLE_NOW,
  SAMPLE_SENTENCE,
  barsModel,
  collectionFigures,
  feedingFigures,
  feedingSentence,
  formatCount,
  formatMoney,
  growthBaseline,
  headerSubtitle,
  insight,
  moltRow,
  moltsCard,
  moneyCard,
  monthsWithYou,
  ordinal,
  paidFooter,
  possessive,
  previewFromCollection,
  pronoun,
  recentRows,
  relativeLong,
  relativeShort,
  rightNowTiles,
  speciesRows,
  splitModel,
  stepModel,
} from '../analytics-view';
import type { AdvancedAnalytics, CollectionAnalytics } from '../analytics-view';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Every chip in the shipped FOOD_VOCABULARY, read from the source text (importing
 * `inverts.ts` pulls in the API client, which jest can't load), so a new chip is
 * covered the day it is added.
 */
function foodChips(): string[] {
  const src = fs.readFileSync(path.join(__dirname, '..', 'inverts.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const FOOD_VOCABULARY'));
  const chips = new Set<string>();
  for (const m of block.slice(0, block.indexOf('};')).matchAll(/foods:\s*\[([^\]]*)\]/g)) {
    for (const c of m[1].matchAll(/'([^']+)'/g)) chips.add(c[1]);
  }
  return [...chips];
}

// Local noon, Mon 26 Oct 2026. Date-only strings are read as local calendar days.
const NOW = new Date(2026, 9, 26, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

/** Paths of every number that is not finite (JSON.stringify turns NaN into null, so a regex can't see it). */
function badNumbers(v: unknown, path = '$'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => badNumbers(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => badNumbers(x, `${path}.${k}`));
  return [];
}

const EMPTY_LINE = "No molts logged yet. Each one you log shows up here with how long it's been.";
const ZERO_BARS = 'No molts logged in the last year. The chart appears after the first one.';

/** A /collection response from an OLD API: none of the redesign fields. */
function legacy(over: Partial<CollectionAnalytics> = {}): CollectionAnalytics {
  return {
    total_tarantulas: 3,
    unique_species: 2,
    sex_distribution: { male: 1, female: 2, unknown: 0 },
    species_counts: [
      { species_name: 'Grammostola pulchra', count: 2 },
      { species_name: 'Brachypelma hamorii', count: 1 },
    ],
    total_value: 0,
    average_age_months: 16,
    total_feedings: 20,
    total_molts: 5,
    total_substrate_changes: 1,
    average_days_between_feedings: 8.6,
    most_active_molter: null,
    newest_acquisition: null,
    oldest_acquisition: null,
    recent_activity: [],
    ...over,
  };
}

/** A /collection response from the new API with a normal three-animal collection. */
function full(over: Partial<CollectionAnalytics> = {}): CollectionAnalytics {
  return legacy({
    feeding_due_today: 1,
    feeding_overdue: 1,
    longest_gap: { tarantula_id: 'a1', name: 'Rosie', sex: 'female', days: 19, usual_interval_days: 10 },
    first_due: { tarantula_id: 'a1', name: 'Rosie', sex: 'female', days: 19, usual_interval_days: 10 },
    last_molt: {
      tarantula_id: 'a2',
      name: 'Juniper',
      sex: 'female',
      date: '2026-10-23',
      molted_at: daysAgo(3),
      molt_number: 4,
      avg_interval_days: 62,
    },
    priced_count: 2,
    molts_per_animal: [
      { tarantula_id: 'a2', name: 'Juniper', sex: 'female', count: 4, last_date: '2026-10-23', last_molted_at: daysAgo(3) },
      { tarantula_id: 'a1', name: 'Rosie', sex: 'female', count: 1, last_date: '2026-05-19', last_molted_at: daysAgo(160) },
      { tarantula_id: 'a3', name: 'Pepper', sex: 'male', count: 0, last_date: null, last_molted_at: null },
    ],
    total_animals: 3,
    average_months_in_collection: 16,
    ...over,
  });
}

/** The median keeper: one animal, no logs, from the NEW API (fields present, empty). */
function oneAnimalNoLogs(): CollectionAnalytics {
  return {
    total_tarantulas: 1,
    unique_species: 1,
    sex_distribution: { male: 0, female: 0, unknown: 1 },
    species_counts: [{ species_name: 'Grammostola pulchra', count: 1 }],
    total_value: 0,
    average_age_months: 0,
    total_feedings: 0,
    total_molts: 0,
    total_substrate_changes: 0,
    average_days_between_feedings: 0,
    most_active_molter: null,
    newest_acquisition: null,
    oldest_acquisition: null,
    recent_activity: [],
    feeding_due_today: 0,
    feeding_overdue: 0,
    longest_gap: null,
    first_due: null,
    last_molt: null,
    priced_count: 0,
    molts_per_animal: [{ tarantula_id: 'solo', name: 'Solo', sex: 'unknown', count: 0, last_date: null, last_molted_at: null }],
    total_animals: 1,
    average_months_in_collection: 0,
  };
}

function noAnimals(): CollectionAnalytics {
  return { ...oneAnimalNoLogs(), total_tarantulas: 0, total_animals: 0, unique_species: 0, species_counts: [], molts_per_animal: [] };
}

describe('formatCount', () => {
  test('thousands separators', () => {
    expect(formatCount(1221)).toBe('1,221');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
  test('never prints NaN', () => {
    expect(formatCount(NaN)).toBe('—');
  });
});

describe('formatMoney', () => {
  test('plain numbers, two decimals only when fractional, no symbol', () => {
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(12)).toBe('12');
    expect(formatMoney(12.5)).toBe('12.50');
    expect(formatMoney(1234.5)).toBe('1,234.50');
    expect(formatMoney(1234)).toBe('1,234');
    expect(formatMoney(0.07)).toBe('0.07');
  });
  test('missing value is the em dash', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(NaN)).toBe('—');
  });
  test('never a currency symbol', () => {
    expect(formatMoney(5000)).not.toMatch(/[$€£]/);
  });
});

describe('monthsWithYou', () => {
  test('years and months', () => {
    expect(monthsWithYou(16)).toBe('1y 4m');
    expect(monthsWithYou(3)).toBe('3m');
    expect(monthsWithYou(24)).toBe('2y');
    expect(monthsWithYou(12)).toBe('1y');
    expect(monthsWithYou(16.4)).toBe('1y 4m');
  });
  test('nothing to say is the em dash', () => {
    expect(monthsWithYou(0)).toBe('—');
    expect(monthsWithYou(null)).toBe('—');
    expect(monthsWithYou(NaN)).toBe('—');
  });
  test('under half a month is not zero', () => {
    expect(monthsWithYou(0.2)).toBe('<1m');
  });
});

describe('relativeShort / relativeLong', () => {
  test('datetimes: minutes, hours, days, months, years', () => {
    expect(relativeShort(hoursAgo(0.5), NOW)).toBe('30m');
    expect(relativeShort(hoursAgo(2), NOW)).toBe('2h');
    expect(relativeShort(daysAgo(3), NOW)).toBe('3d');
    expect(relativeShort(daysAgo(29), NOW)).toBe('29d');
    expect(relativeShort(daysAgo(30), NOW)).toBe('1mo');
    expect(relativeShort(daysAgo(215), NOW)).toBe('7mo');
    expect(relativeShort(daysAgo(400), NOW)).toBe('1y');
    expect(relativeShort(daysAgo(800), NOW)).toBe('2y');
    expect(relativeLong(hoursAgo(1), NOW)).toBe('1 hour ago');
    expect(relativeLong(hoursAgo(2), NOW)).toBe('2 hours ago');
    expect(relativeLong(daysAgo(1), NOW)).toBe('1 day ago');
    expect(relativeLong(daysAgo(3), NOW)).toBe('3 days ago');
    expect(relativeLong(daysAgo(215), NOW)).toBe('7 months ago');
    expect(relativeLong(daysAgo(400), NOW)).toBe('1 year ago');
    expect(relativeLong(daysAgo(800), NOW)).toBe('2 years ago');
    expect(relativeLong(hoursAgo(0.5), NOW)).toBe('30 minutes ago');
  });
  test('a moment ago, and clock skew never goes negative', () => {
    expect(relativeShort(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('now');
    expect(relativeLong(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('just now');
    expect(relativeShort(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe('now');
    expect(relativeLong(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe('just now');
  });
  test('date-only strings are the keeper\'s local calendar day (older API)', () => {
    expect(relativeShort('2026-10-23', NOW)).toBe('3d');
    expect(relativeLong('2026-10-23', NOW)).toBe('3 days ago');
    expect(relativeShort('2026-10-25', NOW)).toBe('1d');
    expect(relativeLong('2026-10-25', NOW)).toBe('1 day ago');
    // A date has no time of day, so it never claims "9h".
    expect(relativeShort('2026-10-26', NOW)).toBe('today');
    expect(relativeLong('2026-10-26', NOW)).toBe('today');
    expect(relativeShort('2026-10-27', NOW)).toBe('today');
    expect(relativeShort('2026-04-01', NOW)).toBe('6mo');
  });
  test('unreadable input is the em dash', () => {
    expect(relativeShort('not a date', NOW)).toBe('—');
    expect(relativeLong('', NOW)).toBe('—');
  });
});

describe('ordinal', () => {
  test.each([
    [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'],
    [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'],
    [23, '23rd'], [101, '101st'], [111, '111th'], [112, '112th'], [113, '113th'],
  ])('%i -> %s', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});

describe('pronoun / possessive', () => {
  test('from sex, else they', () => {
    expect(pronoun('female')).toBe('she');
    expect(pronoun('male')).toBe('he');
    expect(pronoun('unknown')).toBe('they');
    expect(pronoun(null)).toBe('they');
    expect(pronoun(undefined)).toBe('they');
    expect(possessive('female')).toBe('her');
    expect(possessive('male')).toBe('his');
    expect(possessive('unknown')).toBe('their');
    expect(possessive(undefined)).toBe('their');
  });
});

describe('headerSubtitle / collectionFigures', () => {
  test('counts and species', () => {
    expect(headerSubtitle(full())).toBe('3 animals · 2 species');
    expect(headerSubtitle(legacy())).toBe('3 animals · 2 species');
    expect(headerSubtitle(oneAnimalNoLogs())).toBe('1 animal · 1 species');
    expect(headerSubtitle(noAnimals())).toBe('No animals yet');
  });
  test('figures never call it age', () => {
    expect(collectionFigures(full(), false)).toEqual({
      animals: '3',
      species: '2',
      withYou: '1y 4m',
      withYouCaption: 'with you, avg',
    });
    expect(collectionFigures(full(), true).withYouCaption).toBe('with you, average');
    expect(JSON.stringify(collectionFigures(full(), true))).not.toMatch(/\bage\b/i);
  });
  test('reads the new aliases when present, the old fields otherwise', () => {
    const c = full({ total_animals: 1221, average_months_in_collection: 28 });
    expect(collectionFigures(c, false).animals).toBe('1,221');
    expect(collectionFigures(c, false).withYou).toBe('2y 4m');
    expect(collectionFigures(legacy(), false).animals).toBe('3');
  });
});

describe('rightNowTiles', () => {
  test('short forms (mobile)', () => {
    const tiles = rightNowTiles(full(), NOW, false);
    expect(tiles.map((t) => t.key)).toEqual(['due', 'molt', 'gap']);
    expect(tiles[0]).toMatchObject({
      label: 'Due to eat',
      value: '1',
      caption: 'Rosie, 19d',
      target: { kind: 'feeding_day' },
    });
    expect(tiles[1]).toMatchObject({
      label: 'Last molt',
      value: '3d',
      caption: 'Juniper',
      target: { kind: 'animal', id: 'a2' },
    });
    expect(tiles[2]).toMatchObject({
      label: 'Longest gap',
      value: '19d',
      caption: 'Rosie',
      target: { kind: 'animal', id: 'a1' },
    });
  });

  test('long forms (web)', () => {
    const tiles = rightNowTiles(full(), NOW, true);
    expect(tiles[0].caption).toBe('Rosie, 19 days');
    expect(tiles[1].value).toBe('3 days ago');
    expect(tiles[2].value).toBe('19 days');
    expect(tiles[2].caption).toBe('Rosie, usually every 10');
  });

  test('combined screen-reader label', () => {
    const [due, molt, gap] = rightNowTiles(full(), NOW, false);
    expect(due.a11y).toBe('Due to eat, 1, Rosie, 19 days');
    expect(molt.a11y).toBe('Last molt, 3 days ago, Juniper');
    expect(gap.a11y).toBe('Longest gap, 19 days, Rosie, usually every 10');
    // Spoken form is the same on both platforms.
    expect(rightNowTiles(full(), NOW, true).map((t) => t.a11y)).toEqual([due.a11y, molt.a11y, gap.a11y]);
  });

  test('a molt two hours ago reads 2h / 2 hours ago from the datetime', () => {
    const c = full({
      last_molt: { tarantula_id: 'a2', name: 'Juniper', date: '2026-10-26', molted_at: hoursAgo(2), molt_number: 1 },
    });
    expect(rightNowTiles(c, NOW, false)[1].value).toBe('2h');
    expect(rightNowTiles(c, NOW, true)[1].value).toBe('2 hours ago');
  });

  test('an older API without molted_at falls back to the local date', () => {
    const c = full({
      last_molt: { tarantula_id: 'a2', name: 'Juniper', date: '2026-10-23', molt_number: 1 },
    });
    expect(rightNowTiles(c, NOW, false)[1].value).toBe('3d');
    expect(rightNowTiles(c, NOW, true)[1].value).toBe('3 days ago');
  });

  test('due caption: more than one overdue -> the count; none due -> nothing due', () => {
    expect(rightNowTiles(full({ feeding_due_today: 3, feeding_overdue: 2 }), NOW, false)[0].caption).toBe('2 overdue');
    expect(rightNowTiles(full({ feeding_due_today: 2, feeding_overdue: 2 }), NOW, true)[0].caption).toBe('2 overdue');
    expect(rightNowTiles(full({ feeding_due_today: 0, feeding_overdue: 0, first_due: null }), NOW, false)[0]).toMatchObject({
      value: '0',
      caption: 'nothing due',
    });
  });

  test('due caption: first_due names the due animal (due=1, overdue=1)', () => {
    const c = full({ feeding_due_today: 1, feeding_overdue: 1 });
    const [short] = rightNowTiles(c, NOW, false);
    expect(short).toMatchObject({ value: '1', caption: 'Rosie, 19d', target: { kind: 'feeding_day' } });
    expect(rightNowTiles(c, NOW, true)[0].caption).toBe('Rosie, 19 days');
    expect(short.a11y).toBe('Due to eat, 1, Rosie, 19 days');
  });
  test('due caption: due=2, overdue=1 still names first_due, not the longest gap', () => {
    const c = full({
      feeding_due_today: 2,
      feeding_overdue: 1,
      first_due: { tarantula_id: 'b2', name: 'Bean', days: 8, usual_interval_days: 7 },
    });
    expect(rightNowTiles(c, NOW, false)[0].caption).toBe('Bean, 8d');
    expect(rightNowTiles(c, NOW, true)[0].caption).toBe('Bean, 8 days');
  });
  test('due caption: due today but not yet overdue is still named; singular "1 day"', () => {
    const c = full({
      feeding_due_today: 1,
      feeding_overdue: 0,
      first_due: { tarantula_id: 'b2', name: 'Bean', days: 1, usual_interval_days: 1 },
    });
    expect(rightNowTiles(c, NOW, false)[0].caption).toBe('Bean, 1d');
    expect(rightNowTiles(c, NOW, true)[0].caption).toBe('Bean, 1 day');
  });
  test('due caption: 2 overdue wins over first_due; first_due null with due > 0 -> "due today"', () => {
    expect(rightNowTiles(full({ feeding_due_today: 2, feeding_overdue: 2 }), NOW, false)[0].caption).toBe('2 overdue');
    expect(rightNowTiles(full({ feeding_due_today: 2, feeding_overdue: 0, first_due: null }), NOW, false)[0].caption).toBe('due today');
    expect(rightNowTiles(full({ feeding_due_today: 2, feeding_overdue: 1, first_due: null }), NOW, false)[0].caption).toBe('1 overdue');
  });
  test('due caption: an API without first_due keeps the longest-gap fallback', () => {
    const { first_due: _drop, ...noFirstDue } = full({ feeding_due_today: 1, feeding_overdue: 1 });
    expect('first_due' in noFirstDue).toBe(false);
    // The only due animal is the longest-gap one: safe to name.
    expect(rightNowTiles(noFirstDue, NOW, false)[0].caption).toBe('Rosie, 19d');
    // Not provably the due animal: never guess.
    expect(rightNowTiles({ ...noFirstDue, feeding_due_today: 2, feeding_overdue: 1 }, NOW, false)[0].caption).toBe('1 overdue');
    expect(rightNowTiles({ ...noFirstDue, feeding_due_today: 3, feeding_overdue: 0 }, NOW, false)[0].caption).toBe('due today');
    const notDue = {
      ...noFirstDue,
      feeding_due_today: 1,
      feeding_overdue: 0,
      longest_gap: { tarantula_id: 'a1', name: 'Rosie', days: 5, usual_interval_days: 30 },
    };
    expect(rightNowTiles(notDue, NOW, false)[0].caption).toBe('due today');
  });

  test('daily cadence reads "usually every day" in the caption and the a11y', () => {
    const c = full({ longest_gap: { tarantula_id: 'a1', name: 'Rosie', sex: 'female', days: 3, usual_interval_days: 1 } });
    const gap = rightNowTiles(c, NOW, true)[2];
    expect(gap.caption).toBe('Rosie, usually every day');
    expect(gap.a11y).toBe('Longest gap, 3 days, Rosie, usually every day');
    expect(rightNowTiles(c, NOW, false)[2].caption).toBe('Rosie');
    expect(rightNowTiles(c, NOW, true)[2].caption).not.toMatch(/every 1$/);
  });

  test('one animal, no logs: designed lines, never a broken value', () => {
    const [due, molt, gap] = rightNowTiles(oneAnimalNoLogs(), NOW, false);
    expect(due).toMatchObject({ value: '0', caption: 'nothing due', target: { kind: 'feeding_day' } });
    expect(molt).toMatchObject({ value: '—', caption: 'no molts yet', target: null });
    expect(gap).toMatchObject({ value: '—', caption: 'no gap to show', target: null });
    expect(JSON.stringify(rightNowTiles(oneAnimalNoLogs(), NOW, true))).not.toMatch(/NaN|undefined|N\/A/);
  });

  test('old API (none of the new fields): em dash and "not available yet", never 0', () => {
    const tiles = rightNowTiles(legacy(), NOW, false);
    expect(tiles).toHaveLength(3);
    for (const t of tiles) {
      expect(t.value).toBe('—');
      expect(t.caption).toBe('not available yet');
      expect(t.target).toBeNull();
    }
    expect(tiles[0].a11y).toBe('Due to eat, not available yet');
  });

  test('zero animals: no tiles', () => {
    expect(rightNowTiles(noAnimals(), NOW, false)).toEqual([]);
  });

  test('1,221 animals: thousands separators on the count', () => {
    const c = full({ feeding_due_today: 1221, feeding_overdue: 0, total_animals: 1221, total_tarantulas: 1221 });
    expect(rightNowTiles(c, NOW, false)[0].value).toBe('1,221');
  });
});

describe('feedingFigures / feedingSentence', () => {
  test('figures', () => {
    expect(feedingFigures(full())).toEqual({ feedings: '20', between: '9d', perAnimal: '6.7' });
    expect(feedingFigures(full(), true).between).toBe('9 days');
    expect(feedingFigures(full({ average_days_between_feedings: 1 }), true).between).toBe('1 day');
  });
  test('per animal: one decimal under 10, whole above', () => {
    expect(feedingFigures(full({ total_feedings: 12000, total_animals: 1221, total_tarantulas: 1221 })).perAnimal).toBe('9.8');
    expect(feedingFigures(full({ total_feedings: 14000, total_animals: 1221, total_tarantulas: 1221 })).perAnimal).toBe('11');
    expect(feedingFigures(full({ total_feedings: 14000, total_animals: 1221, total_tarantulas: 1221 })).feedings).toBe('14,000');
  });
  test('no feedings: 0, em dash, em dash', () => {
    expect(feedingFigures(oneAnimalNoLogs())).toEqual({ feedings: '0', between: '—', perAnimal: '—' });
    expect(feedingFigures(legacy({ total_feedings: 1, average_days_between_feedings: 0 })).between).toBe('—');
  });

  test('sentence: gap with a known cadence', () => {
    expect(feedingSentence(full())).toBe("Rosie's 19-day gap is the longest right now; she usually eats every 10 days.");
    const male = full({ longest_gap: { tarantula_id: 'a1', name: 'Rex', sex: 'male', days: 9, usual_interval_days: 7 } });
    expect(feedingSentence(male)).toBe("Rex's 9-day gap is the longest right now; he usually eats every 7 days.");
    const daily = full({ longest_gap: { tarantula_id: 'a1', name: 'Rex', sex: 'male', days: 3, usual_interval_days: 1 } });
    expect(feedingSentence(daily)).toBe("Rex's 3-day gap is the longest right now; he usually eats every day.");
  });
  test('sentence: unknown sex agrees with they', () => {
    const c = full({ longest_gap: { tarantula_id: 'a1', name: 'Bean', sex: 'unknown', days: 12, usual_interval_days: 7 } });
    expect(feedingSentence(c)).toBe("Bean's 12-day gap is the longest right now; they usually eat every 7 days.");
  });
  test('sentence: cadence unknown', () => {
    const c = full({ longest_gap: { tarantula_id: 'a1', name: 'Bean', days: 12, usual_interval_days: null } });
    expect(feedingSentence(c)).toBe('Bean has waited longest: 12 days.');
    const one = full({ longest_gap: { tarantula_id: 'a1', name: 'Bean', days: 1, usual_interval_days: null } });
    expect(feedingSentence(one)).toBe('Bean has waited longest: 1 day.');
  });
  test('sentence: nothing overdue', () => {
    expect(feedingSentence(full({ feeding_overdue: 0 }))).toBe('Nothing is overdue.');
  });
  test('sentence is hidden with no feedings, and on an old API', () => {
    expect(feedingSentence(oneAnimalNoLogs())).toBeNull();
    expect(feedingSentence(legacy())).toBeNull();
  });
  test('sentence: fed animals but nothing measurable (all paused) is omitted, not invented', () => {
    expect(feedingSentence(full({ feeding_overdue: 1, longest_gap: null }))).toBeNull();
  });
});

describe('moltsCard', () => {
  test('three animals: all rows, ranked, with the last molt', () => {
    const m = moltsCard(full(), NOW, false);
    expect(m.trailing).toBe('5 logged');
    expect(m.emptyLine).toBeNull();
    expect(m.moreCount).toBe(0);
    expect(m.allLabel).toBeNull();
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toMatchObject({
      id: 'a2', label: 'Juniper', count: 4, fraction: 1, value: '4', detail: '3d', right: '4 · 3d', none: false,
    });
    expect(m.rows[1]).toMatchObject({ id: 'a1', label: 'Rosie', count: 1, fraction: 0.25, right: '1 · 5mo' });
    expect(m.rows[2]).toMatchObject({ id: 'a3', label: 'Pepper', count: 0, fraction: 0, value: 'none yet', right: 'none yet', none: true });
  });
  test('long forms (web)', () => {
    const m = moltsCard(full(), NOW, true);
    expect(m.rows[0].right).toBe('4 · 3 days ago');
    expect(m.rows[0].a11y).toBe('Juniper, 4 molts, last molt 3 days ago');
    expect(m.rows[2].a11y).toBe('Pepper, no molts yet');
  });
  test('date-only last molt (older API)', () => {
    const c = full({
      molts_per_animal: [{ tarantula_id: 'a2', name: 'Juniper', count: 2, last_date: '2026-10-23', last_molted_at: null }],
    });
    expect(moltsCard(c, NOW, false).rows[0].right).toBe('2 · 3d');
  });
  test('five animals: still all rows', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ tarantula_id: n, name: n, count: 5 - i, last_date: '2026-10-20', last_molted_at: null }));
    const m = moltsCard(full({ molts_per_animal: rows, total_animals: 5, total_tarantulas: 5 }), NOW, false);
    expect(m.rows).toHaveLength(5);
    expect(m.moreCount).toBe(0);
    expect(m.allLabel).toBeNull();
  });
  test('more than five animals: top 3 and "All n"', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      tarantula_id: `x${i}`, name: `Spider ${i}`, count: 10 - i, last_date: '2026-10-20', last_molted_at: null,
    }));
    const m = moltsCard(full({ molts_per_animal: rows, total_animals: 8, total_tarantulas: 8 }), NOW, false);
    expect(m.rows.map((r) => r.label)).toEqual(['Spider 0', 'Spider 1', 'Spider 2']);
    expect(m.moreCount).toBe(5);
    expect(m.allLabel).toBe('All 8 →');
  });
  test('1,221 animals: separators in the link and the total', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      tarantula_id: `x${i}`, name: `S${i}`, count: 10 - i, last_date: '2026-10-20', last_molted_at: null,
    }));
    const m = moltsCard(full({ molts_per_animal: rows, total_animals: 1221, total_tarantulas: 1221, total_molts: 5400 }), NOW, false);
    expect(m.allLabel).toBe('All 1,221 →');
    expect(m.moreCount).toBe(1218);
    expect(m.trailing).toBe('5,400 logged');
  });
  test('old API: most_active_molter as one row', () => {
    const m = moltsCard(legacy({ most_active_molter: { tarantula_id: 'a2', name: 'Juniper', molt_count: 4 } }), NOW, false);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ id: 'a2', label: 'Juniper', count: 4, fraction: 1, right: '4' });
    expect(m.moreCount).toBe(0);
    expect(m.allLabel).toBeNull();
    expect(m.emptyLine).toBeNull();
  });
  test('zero molts: no rows, the designed line', () => {
    const m = moltsCard(oneAnimalNoLogs(), NOW, false);
    expect(m.rows).toEqual([]);
    expect(m.moreCount).toBe(0);
    expect(m.emptyLine).toBe(EMPTY_LINE);
    expect(m.trailing).toBe('0 logged');
    expect(moltsCard(legacy({ total_molts: 0 }), NOW, true).emptyLine).toBe(EMPTY_LINE);
  });
});

describe('speciesRows', () => {
  test('five or fewer: every species', () => {
    const s = speciesRows(full());
    expect(s.rows.map((r) => [r.label, r.count, r.value])).toEqual([
      ['Grammostola pulchra', 2, '2'],
      ['Brachypelma hamorii', 1, '1'],
    ]);
    expect(s.rows[0].fraction).toBe(1);
    expect(s.rows[1].fraction).toBe(0.5);
    expect(s.moreCount).toBe(0);
    expect(s.moreLabel).toBeNull();
  });
  test('more than five: top five and "n more"', () => {
    const species_counts = Array.from({ length: 8 }, (_, i) => ({ species_name: `Species ${i}`, count: 8 - i }));
    const s = speciesRows(full({ species_counts, unique_species: 8 }));
    expect(s.rows).toHaveLength(5);
    expect(s.rows[0].label).toBe('Species 0');
    expect(s.moreCount).toBe(3);
    expect(s.moreLabel).toBe('3 more species →');
  });
  test('1,500 species: separators', () => {
    const species_counts = Array.from({ length: 1500 }, (_, i) => ({ species_name: `S${i}`, count: 1 }));
    const s = speciesRows(full({ species_counts }));
    expect(s.moreCount).toBe(1495);
    expect(s.moreLabel).toBe('1,495 more species →');
  });
  test('does not reorder the caller\'s array', () => {
    const species_counts = [{ species_name: 'B', count: 1 }, { species_name: 'A', count: 3 }];
    const c = full({ species_counts });
    expect(speciesRows(c).rows.map((r) => r.label)).toEqual(['A', 'B']);
    expect(c.species_counts.map((r) => r.species_name)).toEqual(['B', 'A']);
  });
  test('no species: nothing', () => {
    expect(speciesRows(noAnimals())).toEqual({ rows: [], moreCount: 0, moreLabel: null });
  });
  test('a limit changes the cap; null means every species (the full list screens)', () => {
    const species_counts = Array.from({ length: 8 }, (_, i) => ({ species_name: `Species ${i}`, count: 8 - i }));
    const c = full({ species_counts, unique_species: 8 });
    expect(speciesRows(c, 2).rows.map((r) => r.label)).toEqual(['Species 0', 'Species 1']);
    expect(speciesRows(c, 2).moreLabel).toBe('6 more species →');
    const all = speciesRows(c, null);
    expect(all.rows).toHaveLength(8);
    expect(all.moreCount).toBe(0);
    expect(all.moreLabel).toBeNull();
    // Fractions stay relative to the biggest species, so a searched list keeps its scale.
    expect(all.rows[0].fraction).toBe(1);
    expect(all.rows[7].fraction).toBe(0.125);
    expect(speciesRows(c, Infinity).rows).toHaveLength(8);
    expect(speciesRows(c, 0).rows).toEqual([]);
  });
  test('1,500 species with no cap: all of them, in count order', () => {
    const species_counts = Array.from({ length: 1500 }, (_, i) => ({ species_name: `S${i}`, count: 1 + (i % 3) }));
    const all = speciesRows(full({ species_counts }), null);
    expect(all.rows).toHaveLength(1500);
    expect(all.rows[0].count).toBe(3);
    expect(all.rows[1499].count).toBe(1);
  });
});

describe('moltRow (exported for the full Molts list screens)', () => {
  test('a row with molts: count, relative last molt, spoken label', () => {
    const r = moltRow('a2', 'Juniper', 4, daysAgo(3), 4, NOW, false);
    expect(r).toMatchObject({ id: 'a2', label: 'Juniper', count: 4, fraction: 1, value: '4', detail: '3d', right: '4 · 3d', none: false });
    expect(r.a11y).toBe('Juniper, 4 molts, last molt 3 days ago');
    expect(moltRow('a2', 'Juniper', 4, daysAgo(3), 4, NOW, true).right).toBe('4 · 3 days ago');
  });
  test('scaled to the largest count; a single molt is singular; no date -> no suffix', () => {
    const r = moltRow('a1', 'Rosie', 1, null, 4, NOW, true);
    expect(r.fraction).toBe(0.25);
    expect(r.right).toBe('1');
    expect(r.a11y).toBe('Rosie, 1 molt');
  });
  test('zero molts: track only and "none yet"', () => {
    expect(moltRow('a3', 'Pepper', 0, null, 4, NOW, true)).toMatchObject({ none: true, value: 'none yet', right: 'none yet', fraction: 0, a11y: 'Pepper, no molts yet' });
  });
  test('a 1,221 count gets a separator', () => {
    expect(moltRow('big', 'Big', 1221, null, 1221, NOW, true).value).toBe('1,221');
  });
});

describe('paidFooter', () => {
  test('value with the priced caption', () => {
    expect(paidFooter(full({ total_value: 1234.5 }))).toEqual({ value: '1,234.50', caption: '2 of 3 priced' });
  });
  test('no prices entered', () => {
    expect(paidFooter(full({ priced_count: 0 }))).toEqual({ value: '—', caption: 'no prices entered' });
    expect(paidFooter(oneAnimalNoLogs())).toEqual({ value: '—', caption: 'no prices entered' });
  });
  test('older API: no caption, value only when positive', () => {
    expect(paidFooter(legacy({ total_value: 90 }))).toEqual({ value: '90', caption: null });
    expect(paidFooter(legacy({ total_value: 0 }))).toEqual({ value: '—', caption: null });
  });
  test('never a currency symbol or $0', () => {
    expect(JSON.stringify([paidFooter(full()), paidFooter(legacy()), paidFooter(oneAnimalNoLogs())])).not.toMatch(/\$|N\/A/);
  });
});

describe('recentRows', () => {
  const act = (type: string, name: string, description: string, date = '2026-10-23') => ({
    type, date, tarantula_id: `id-${name}`, tarantula_name: name, description,
  });
  test('three rows: molted, ate, substrate changed', () => {
    const rows = recentRows(
      legacy({
        recent_activity: [
          act('molt', 'Juniper', 'Molted successfully (5g)', '2026-10-23'),
          act('feeding', 'Pepper', 'Fed cricket', '2026-10-25'),
          act('substrate_change', 'Rosie', 'Substrate changed to coco fiber', '2026-10-01'),
          act('feeding', 'Extra', 'Fed cricket'),
        ],
      }),
      NOW,
    );
    expect(rows).toEqual([
      { kind: 'molt', id: 'id-Juniper', name: 'Juniper', verb: 'molted', rel: '3d', text: 'Juniper molted', a11y: 'Juniper molted, 3 days ago' },
      { kind: 'feeding', id: 'id-Pepper', name: 'Pepper', verb: 'ate a cricket', rel: '1d', text: 'Pepper ate a cricket', a11y: 'Pepper ate a cricket, 1 day ago' },
      { kind: 'substrate_change', id: 'id-Rosie', name: 'Rosie', verb: 'substrate changed', rel: '25d', text: 'Rosie substrate changed', a11y: 'Rosie substrate changed, 25 days ago' },
    ]);
  });
  test('the spoken label uses the long relative form, and "today" for today', () => {
    const rows = recentRows(
      legacy({ recent_activity: [act('molt', 'A', 'x', '2026-10-26'), act('feeding', 'B', 'Fed prey', '2026-04-26')] }),
      NOW,
    );
    expect(rows.map((r) => r.a11y)).toEqual(['A molted, today', 'B ate, 6 months ago']);
    // A date the lib can't read never leaves a trailing dash in the spoken label.
    expect(recentRows(legacy({ recent_activity: [act('molt', 'C', 'x', 'garbage')] }), NOW)[0].a11y).toBe('C molted');
  });
  test('food phrasing', () => {
    const verb = (d: string) => recentRows(legacy({ recent_activity: [act('feeding', 'P', d)] }), NOW)[0].verb;
    expect(verb('Fed cricket')).toBe('ate a cricket');
    expect(verb('Fed earthworm')).toBe('ate earthworm');
    expect(verb('Fed Dubia roaches')).toBe('ate dubia roaches');
    expect(verb('Fed prey')).toBe('ate');
    expect(verb('Fed cricket (refused)')).toBe('refused a cricket');
    expect(verb('Fed prey (refused)')).toBe('refused');
    expect(verb('')).toBe('ate');
  });
  test('food phrasing: the countable chips take an article, lowercased', () => {
    const verb = (d: string) => recentRows(legacy({ recent_activity: [act('feeding', 'P', d)] }), NOW)[0].verb;
    expect(verb('Fed Cricket')).toBe('ate a cricket');
    expect(verb('Fed Dubia Roach')).toBe('ate a dubia roach');
    expect(verb('Fed Red Runner')).toBe('ate a red runner');
    expect(verb('Fed Mealworm')).toBe('ate a mealworm');
    expect(verb('Fed Superworm')).toBe('ate a superworm');
    expect(verb('Fed Fruit fly')).toBe('ate a fruit fly');
    expect(verb('Fed House fly')).toBe('ate a house fly');
    expect(verb('Fed Blue bottle fly')).toBe('ate a blue bottle fly');
    expect(verb('Fed Cricket (refused)')).toBe('refused a cricket');
  });
  test('food phrasing: the "Other" chip with no text is the bare verb', () => {
    const verb = (d: string) => recentRows(legacy({ recent_activity: [act('feeding', 'Pepper', d)] }), NOW)[0].text;
    expect(verb('Fed Other')).toBe('Pepper ate');
    expect(verb('Fed other (refused)')).toBe('Pepper refused');
    expect(verb('Fed prey')).toBe('Pepper ate');
    expect(verb('Fed ')).toBe('Pepper ate');
  });
  test('food phrasing: uncountable and free-text foods get no article, and keep deliberate casing', () => {
    const text = (d: string) => recentRows(legacy({ recent_activity: [act('feeding', 'Millie', d)] }), NOW)[0].text;
    expect(text('Fed Leaf litter')).toBe('Millie ate leaf litter');
    expect(text('Fed Rotting wood')).toBe('Millie ate rotting wood');
    expect(text('Fed Veg / greens')).toBe('Millie ate veg / greens');
    expect(text('Fed Fruit')).toBe('Millie ate fruit');
    expect(text('Fed Dry gutload')).toBe('Millie ate dry gutload');
    expect(text('Fed Protein (fish flake)')).toBe('Millie ate protein (fish flake)');
    expect(text('Fed Calcium (cuttlebone)')).toBe('Millie ate calcium (cuttlebone)');
    expect(text('Fed BSFL')).toBe('Millie ate BSFL');
    expect(text('Fed bsfl')).toBe('Millie ate bsfl');
    expect(text('Fed Orange Head Roach')).toBe('Millie ate orange head roach');
    expect(text('Fed Protein (fish flake) (refused)')).toBe('Millie refused protein (fish flake)');
  });
  test('food phrasing: every chip the app offers reads cleanly', () => {
    const verb = (d: string) => recentRows(legacy({ recent_activity: [act('feeding', 'P', d)] }), NOW)[0].verb;
    const chips = foodChips();
    expect(chips.length).toBeGreaterThan(15);
    expect(chips).toContain('Protein (fish flake)');
    for (const chip of chips) {
      const out = verb(`Fed ${chip}`);
      expect(out).not.toMatch(/\ban? (other|leaf|rotting|veg|fruit$|dry|protein|calcium)/i);
      if (chip === 'Other') expect(out).toBe('ate');
      else expect(out).toBe(`ate ${/^(Cricket|Dubia Roach|Red Runner|Mealworm|Superworm|Fruit fly|House fly|Blue bottle fly)$/.test(chip) ? 'a ' : ''}${chip.toLowerCase()}`);
    }
  });
  test('recent_activity dates are the keeper\'s local day: read against the local calendar day, never as hours', () => {
    // 23:50 local on the 25th is "1d" at noon on the 26th, and the same-day item is "today".
    const rows = recentRows(
      legacy({ recent_activity: [act('molt', 'A', 'x', '2026-10-26'), act('feeding', 'B', 'Fed cricket', '2026-10-25')] }),
      NOW,
    );
    expect(rows.map((r) => r.rel)).toEqual(['today', '1d']);
    expect(insight(legacy({ total_feedings: 4, recent_activity: [act('feeding', 'B', 'Fed cricket', '2026-10-25')] }), NOW)?.sentence).toBe(
      'B ate 1 day ago.',
    );
  });
  test('today reads "today"', () => {
    expect(recentRows(legacy({ recent_activity: [act('molt', 'J', 'x', '2026-10-26')] }), NOW)[0].rel).toBe('today');
  });
  test('nothing logged: no rows', () => {
    expect(recentRows(legacy(), NOW)).toEqual([]);
    expect(recentRows(oneAnimalNoLogs(), NOW)).toEqual([]);
  });
  test('an unknown activity type is skipped, not shown raw', () => {
    expect(recentRows(legacy({ recent_activity: [act('weird', 'X', 'x')] }), NOW)).toEqual([]);
  });
});

describe('insight', () => {
  const act = (type: string, name: string, description: string, date: string, id = `id-${name}`) => ({
    type, date, tarantula_id: id, tarantula_name: name, description,
  });

  test('zero animals: no card', () => {
    expect(insight(noAnimals(), NOW)).toBeNull();
  });

  test('molt: ordinal, possessive, average interval', () => {
    const c = full({ recent_activity: [act('molt', 'Juniper', 'Molted successfully', '2026-10-23', 'a2')] });
    expect(insight(c, NOW)).toEqual({
      sentence: 'Juniper molted 3 days ago, her 4th with you.',
      support: "That's one every 62 days on average.",
      link: 'See analytics →',
    });
  });
  test('molt: the first one has no average', () => {
    const c = full({
      recent_activity: [act('molt', 'Juniper', 'Molted successfully', '2026-10-23', 'a2')],
      last_molt: { tarantula_id: 'a2', name: 'Juniper', sex: 'female', date: '2026-10-23', molted_at: daysAgo(3), molt_number: 1, avg_interval_days: null },
    });
    expect(insight(c, NOW)).toEqual({
      sentence: 'Juniper molted 3 days ago, her 1st with you.',
      support: null,
      link: 'See analytics →',
    });
  });
  test('molt: another animal than last_molt takes its count from molts_per_animal', () => {
    const c = full({ recent_activity: [act('molt', 'Rosie', 'Molted successfully', '2026-10-23', 'a1')] });
    // Rosie has 1 molt in molts_per_animal.
    expect(insight(c, NOW)).toEqual({
      sentence: 'Rosie molted 3 days ago, her 1st with you.',
      support: null,
      link: 'See analytics →',
    });
  });
  test('molt: male and unsexed pronouns', () => {
    const rows = [
      { tarantula_id: 'm1', name: 'Rex', sex: 'male', count: 2, last_date: '2026-10-25', last_molted_at: null },
      { tarantula_id: 'u1', name: 'Bean', sex: 'unknown', count: 3, last_date: '2026-10-25', last_molted_at: null },
    ];
    const male = full({ last_molt: null, molts_per_animal: rows, recent_activity: [act('molt', 'Rex', 'x', '2026-10-25', 'm1')] });
    expect(insight(male, NOW)?.sentence).toBe('Rex molted 1 day ago, his 2nd with you.');
    const they = full({ last_molt: null, molts_per_animal: rows, recent_activity: [act('molt', 'Bean', 'x', '2026-10-26', 'u1')] });
    expect(insight(they, NOW)?.sentence).toBe('Bean molted today, their 3rd with you.');
  });
  test('molt: old API says only what it knows', () => {
    const c = legacy({ recent_activity: [act('molt', 'Juniper', 'Molted successfully', '2026-10-23')] });
    expect(insight(c, NOW)).toEqual({ sentence: 'Juniper molted 3 days ago.', support: null, link: 'See analytics →' });
  });

  test('feeding: ruling copy, "{total_feedings} feedings logged across {n} animals."', () => {
    const c = full({ recent_activity: [act('feeding', 'Pepper', 'Fed cricket', '2026-10-24')] });
    expect(insight(c, NOW)).toEqual({
      sentence: 'Pepper ate 2 days ago.',
      support: '20 feedings logged across 3 animals.',
      link: 'See analytics →',
    });
    expect(insight(full({ recent_activity: [act('feeding', 'Pepper', 'Fed cricket', '2026-10-26')] }), NOW)?.sentence).toBe('Pepper ate today.');
  });
  test('feeding: a refused meal is not "ate"', () => {
    const c = full({ recent_activity: [act('feeding', 'Pepper', 'Fed cricket (refused)', '2026-10-24')] });
    expect(insight(c, NOW)?.sentence).toBe('Pepper refused a meal 2 days ago.');
  });
  test('feeding: singular and large numbers', () => {
    const one = oneAnimalNoLogs();
    one.total_feedings = 1;
    one.recent_activity = [act('feeding', 'Solo', 'Fed cricket', '2026-10-26')];
    expect(insight(one, NOW)?.support).toBe('1 feeding logged across 1 animal.');
    const big = full({ total_feedings: 9800, total_animals: 1221, total_tarantulas: 1221, recent_activity: [act('feeding', 'P', 'Fed cricket', '2026-10-26')] });
    expect(insight(big, NOW)?.support).toBe('9,800 feedings logged across 1,221 animals.');
  });

  test('substrate change', () => {
    const c = full({ recent_activity: [act('substrate_change', 'Rosie', 'Substrate changed to coco fiber', '2026-10-22')] });
    expect(insight(c, NOW)).toEqual({
      sentence: 'Rosie got fresh substrate 4 days ago.',
      support: '3 animals, 20 feedings logged.',
      link: 'See analytics →',
    });
  });

  test('animal added within 7 days and newer than the newest activity', () => {
    const c = full({
      newest_acquisition: { tarantula_id: 'n1', name: 'Webster', date: '2026-10-24' },
      recent_activity: [act('feeding', 'Pepper', 'Fed cricket', '2026-10-20')],
    });
    expect(insight(c, NOW)).toEqual({
      sentence: 'Webster joined 2 days ago.',
      support: '3 animals · 2 species.',
      link: 'See analytics →',
    });
  });
  test('animal added: not when older than 7 days, or not newer than the activity', () => {
    const old = full({
      newest_acquisition: { tarantula_id: 'n1', name: 'Webster', date: '2026-10-10' },
      recent_activity: [act('feeding', 'Pepper', 'Fed cricket', '2026-10-05')],
    });
    expect(insight(old, NOW)?.sentence).toBe('Pepper ate 21 days ago.');
    const same = full({
      newest_acquisition: { tarantula_id: 'n1', name: 'Webster', date: '2026-10-24' },
      recent_activity: [act('feeding', 'Pepper', 'Fed cricket', '2026-10-24')],
    });
    expect(insight(same, NOW)?.sentence).toBe('Pepper ate 2 days ago.');
  });
  test('animal added with no activity at all', () => {
    const c = full({ newest_acquisition: { tarantula_id: 'n1', name: 'Webster', date: '2026-10-26' } });
    expect(insight(c, NOW)?.sentence).toBe('Webster joined today.');
  });

  test('no activity: counts, and the comparison link', () => {
    expect(insight(full(), NOW)).toEqual({
      sentence: '3 animals, 20 feedings logged.',
      support: null,
      link: 'See how they compare →',
    });
    expect(insight(oneAnimalNoLogs(), NOW)).toEqual({
      sentence: '1 animal, 0 feedings logged.',
      support: null,
      link: 'See how they compare →',
    });
    expect(insight(full({ total_animals: 1221, total_tarantulas: 1221, total_feedings: 9800 }), NOW)?.sentence).toBe(
      '1,221 animals, 9,800 feedings logged.',
    );
  });

  test('never money', () => {
    const c = full({ total_value: 5000, recent_activity: [act('feeding', 'P', 'Fed cricket', '2026-10-26')] });
    expect(JSON.stringify(insight(c, NOW))).not.toMatch(/5,?000|paid|\$/);
  });
});

describe('barsModel', () => {
  const W = 342; // (342 - 11*6) / 12 = 23

  const series = [
    { month: '2025-12', count: 1 },
    { month: '2026-03', count: 2 },
    { month: '2026-10', count: 4 },
  ];

  test('twelve buckets ending at this month, with geometry from the README', () => {
    const m = barsModel(series, W, NOW);
    expect(m.bars).toHaveLength(12);
    expect(m.total).toBe(7);
    expect(m.bars[0].label).toBe('N'); // November 2025
    expect(m.bars[11].label).toBe('O'); // October 2026
    expect(m.bars[0].w).toBe(23);
    expect(m.bars[1].x).toBe(29); // 23 + gap 6
    expect(m.bars[11].x).toBe(11 * 29);
    expect(m.bars[11]).toMatchObject({ isMax: true, value: 4, h: 56 });
    expect(m.bars.filter((b) => b.isMax)).toHaveLength(1);
    expect(m.bars[0]).toMatchObject({ value: 0, h: 2, isMax: false }); // zero month: 2pt stub
    expect(m.bars[1]).toMatchObject({ value: 1, label: 'D' });
    expect(m.bars[1].h).toBeCloseTo(14, 5); // 1 of 4 on the 56 scale
    expect(m.bars.every((b) => b.y + b.h === 70)).toBe(true);
    expect(m.sentence).toBe('Busiest month was October: 4 molts.');
    expect(m.a11y).toBe('Molts per month, November to October, most in October with 4');
  });
  test('a tie goes to the latest month; singular "molt"', () => {
    const m = barsModel([{ month: '2026-03', count: 1 }, { month: '2026-06', count: 1 }, { month: '2026-07', count: 0 }], W, NOW);
    expect(m.bars.find((b) => b.isMax)?.label).toBe('J');
    expect(m.sentence).toBe('1 molt in each of 2 months, most recently June.');
    expect(m.a11y).toBe('Molts per month, November to October, 1 molt in each of 2 months, most recently June');
    expect(m.total).toBe(2);
  });
  test('a tie at a higher count is plural; a clear winner still gets the busiest-month sentence', () => {
    const tie = barsModel([{ month: '2026-03', count: 3 }, { month: '2026-05', count: 3 }, { month: '2026-09', count: 3 }, { month: '2026-10', count: 1 }], W, NOW);
    expect(tie.sentence).toBe('3 molts in each of 3 months, most recently September.');
    const win = barsModel([{ month: '2026-03', count: 3 }, { month: '2026-05', count: 2 }], W, NOW);
    expect(win.sentence).toBe('Busiest month was March: 3 molts.');
  });
  test('months outside the window are ignored', () => {
    const m = barsModel([{ month: '2025-10', count: 9 }, { month: '2026-05', count: 2 }], W, NOW);
    expect(m.total).toBe(2);
  });
  test('the window follows `now`, not the newest month in the data (stale data looks stale)', () => {
    const stale = barsModel([{ month: '2025-01', count: 2 }, { month: '2025-02', count: 3 }], W, NOW);
    expect(stale.total).toBe(0);
    expect(stale.sentence).toBe(ZERO_BARS);
    const later = barsModel([{ month: '2026-04', count: 1 }, { month: '2026-08', count: 3 }], W, new Date(2026, 11, 3));
    expect(later.bars[11].label).toBe('D'); // December 2026
    expect(later.a11y).toBe('Molts per month, January to December, most in August with 3');
  });
  test('duplicate months add up', () => {
    const m = barsModel([{ month: '2026-08', count: 1 }, { month: '2026-08', count: 2 }], W, NOW);
    expect(m.total).toBe(3);
  });
  test('zero total: no chart, the sentence only', () => {
    for (const s of [[], [{ month: '2026-08', count: 0 }]]) {
      const m = barsModel(s, W, NOW);
      expect(m.bars).toEqual([]);
      expect(m.total).toBe(0);
      expect(m.sentence).toBe(ZERO_BARS);
    }
    expect(barsModel([], W, NOW).sentence).toBe(ZERO_BARS);
  });
  test('one molt: one bar, the sentence names the month', () => {
    const m = barsModel([{ month: '2026-08', count: 1 }], W, NOW);
    expect(m.total).toBe(1);
    expect(m.bars).toHaveLength(1);
    expect(m.bars[0]).toMatchObject({ isMax: true, value: 1, label: 'A', h: 56 });
    expect(m.sentence).toBe('1 molt in the last year, in August.');
    expect(m.a11y).toContain('August');
  });
  test('a tiny or zero width never produces NaN or negative bars', () => {
    for (const w of [0, 10, 70]) {
      const m = barsModel(series, w, NOW);
      expect(badNumbers(m)).toEqual([]);
      expect(m.bars.every((b) => b.w >= 1 && b.x >= 0)).toBe(true);
    }
  });
});

describe('stepModel', () => {
  const W = 300;
  const H = 70;

  test('many points: running count, first and last values, the busiest month', () => {
    const m = stepModel(
      [{ month: '2026-01', count: 2 }, { month: '2026-04', count: 1 }, { month: '2026-07', count: 3 }],
      W,
      H,
    );
    expect(m.points.map((p) => p.value)).toEqual([2, 3, 6]);
    expect(m.first).toBe(2);
    expect(m.last).toBe(6);
    expect(m.sentence).toBe('2 → 6 this year. 3 arrived in July.');
    expect(m.a11y).toBe('Animals in your collection, January to July, from 2 to 6');
    // The last (highest) point sits highest on screen; every y is inside the box.
    expect(m.points[2].y).toBeLessThan(m.points[0].y);
    for (const p of m.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
    }
    expect(m.points[0].x).toBeLessThan(m.points[2].x);
    expect(m.end).toEqual({ x: m.points[2].x, y: m.points[2].y });
    expect(m.startY).toBe(m.points[0].y); // no baseline: the line begins at the first point
    expect(m.line.startsWith('M')).toBe(true);
    expect(m.area.startsWith('M')).toBe(true);
    expect(m.area.endsWith('Z')).toBe(true);
    expect(badNumbers(m)).toEqual([]);
    expect(m.line + m.area).not.toMatch(/NaN|Infinity/);
  });
  test('no month added two or more: no "arrived" clause', () => {
    const m = stepModel([{ month: '2026-01', count: 1 }, { month: '2026-04', count: 1 }], W, H);
    expect(m.sentence).toBe('1 → 2 this year.');
  });
  test('a baseline (animals owned before the window) is the first value and the start of the line', () => {
    const m = stepModel([{ month: '2026-03', count: 1 }, { month: '2026-08', count: 2 }], W, H, 10);
    expect(m.first).toBe(10);
    expect(m.last).toBe(13);
    expect(m.points.map((p) => p.value)).toEqual([11, 13]);
    expect(m.sentence).toBe('10 → 13 this year. 2 arrived in August.');
    expect(m.a11y).toBe('Animals in your collection, March to August, from 10 to 13');
    // The line starts at the baseline and steps up at the first month: M x y(baseline) V y(first total).
    const start = /^M([\d.]+) ([\d.]+) V([\d.]+) H/.exec(m.line);
    expect(start).not.toBeNull();
    expect(Number(start![1])).toBe(m.points[0].x);
    expect(Number(start![3])).toBe(m.points[0].y);
    expect(Number(start![2])).toBeGreaterThan(Number(start![3])); // baseline is lower on screen than 11
    expect(Number(start![2])).toBeLessThanOrEqual(H);
    // startY is exactly where the drawn line begins: the baseline, lower than the first total.
    expect(m.startY).toBe(Number(start![2]));
    expect(m.startY).toBeGreaterThan(m.points[0].y);
    expect(badNumbers(m)).toEqual([]);
  });
  test('a keeper with 10 who added 1 in November reads 10 -> 13, not 11 -> 13', () => {
    const m = stepModel([{ month: '2026-02', count: 1 }, { month: '2026-10', count: 2 }], W, H, 10);
    expect(m.sentence.startsWith('10 → 13 this year.')).toBe(true);
  });
  test('without a baseline there is no leading step', () => {
    const m = stepModel([{ month: '2026-03', count: 1 }, { month: '2026-08', count: 2 }], W, H);
    expect(m.line).toMatch(/^M[\d.]+ [\d.]+ H/);
    expect(m.sentence).toBe('1 → 3 this year. 2 arrived in August.');
  });
  test('a baseline equal to the total at the end is flat', () => {
    const m = stepModel([{ month: '2026-03', count: 0 }, { month: '2026-08', count: 0 }], W, H, 4);
    expect(m.sentence).toBe('No change since March.');
    expect(badNumbers(m)).toEqual([]);
  });
  test('a span of more than 11 months names the years instead of "this year"', () => {
    const m = stepModel([{ month: '2019-03', count: 1 }, { month: '2026-06', count: 4 }], W, H);
    expect(m.sentence).toBe('1 → 5 since March 2019. 4 arrived in June 2026.');
    expect(m.a11y).toBe('Animals in your collection, March 2019 to June 2026, from 1 to 5');
    const flat = stepModel([{ month: '2019-03', count: 2 }, { month: '2026-06', count: 0 }], W, H);
    expect(flat.sentence).toBe('No change since March 2019.');
  });
  test('exactly 11 months apart is still "this year"; 12 is not', () => {
    expect(stepModel([{ month: '2025-11', count: 1 }, { month: '2026-10', count: 1 }], W, H).sentence).toBe('1 → 2 this year.');
    expect(stepModel([{ month: '2025-10', count: 1 }, { month: '2026-10', count: 1 }], W, H).sentence).toBe('1 → 2 since October 2025.');
  });
  test('flat: a straight line and "No change since"', () => {
    const m = stepModel([{ month: '2026-01', count: 2 }, { month: '2026-04', count: 0 }], W, H);
    expect(m.first).toBe(2);
    expect(m.last).toBe(2);
    expect(m.sentence).toBe('No change since January.');
    expect(m.points[0].y).toBe(m.points[m.points.length - 1].y);
  });
  test('one point: a dot and the month', () => {
    const one = stepModel([{ month: '2026-06', count: 1 }], W, H);
    expect(one.points).toHaveLength(1);
    expect(one.line).toBe('');
    expect(one.area).toBe('');
    expect(one.end).not.toBeNull();
    expect(one.startY).toBe(one.points[0].y);
    expect(one.sentence).toBe('1 animal since June.');
    const three = stepModel([{ month: '2026-06', count: 3 }], W, H);
    expect(three.sentence).toBe('3 animals since June.');
    // With animals already owned, "N animals since June" would be a lie: say how many are new.
    expect(stepModel([{ month: '2026-06', count: 1 }], W, H, 10).sentence).toBe('1 new animal since June.');
    expect(stepModel([{ month: '2026-06', count: 2 }], W, H, 10).sentence).toBe('2 new animals since June.');
    expect(badNumbers(three)).toEqual([]);
  });
  test('no points: no chart', () => {
    const m = stepModel([], W, H);
    expect(m.startY).toBe(0);
    expect(m.points).toEqual([]);
    expect(m.end).toBeNull();
    expect(m.line).toBe('');
    expect(m.sentence).toBe('No animals added in the last year.');
  });
  test('unsorted input is read in month order', () => {
    const m = stepModel([{ month: '2026-07', count: 3 }, { month: '2026-01', count: 2 }], W, H);
    expect(m.points.map((p) => p.month)).toEqual(['2026-01', '2026-07']);
    expect(m.last).toBe(5);
  });
});

describe('splitModel', () => {
  const SEX = [
    { key: 'male', count: 3, color: '#3b82f6' },
    { key: 'female', count: 2, color: '#ec4899' },
    { key: 'unsexed', count: 1, color: '#999999' },
  ];
  test('several categories: flexed segments, a legend of all of them', () => {
    const m = splitModel(SEX);
    expect(m.segments).toEqual([
      { flex: 3, color: '#3b82f6' },
      { flex: 2, color: '#ec4899' },
      { flex: 1, color: '#999999' },
    ]);
    expect(m.legend.map((l) => l.label)).toEqual(['3 male', '2 female', '1 unsexed']);
    expect(m.sentence).toBeNull();
    expect(m.a11y).toBe('Split: 3 male, 2 female, 1 unsexed');
  });
  test('the legend keeps zero categories; their segments are dropped', () => {
    const m = splitModel([
      { key: 'male', count: 2, color: 'a' },
      { key: 'female', count: 0, color: 'b' },
      { key: 'unsexed', count: 1, color: 'c' },
    ]);
    expect(m.segments).toHaveLength(2);
    expect(m.legend.map((l) => l.label)).toEqual(['2 male', '0 female', '1 unsexed']);
  });
  test('one category: a sentence and no bar', () => {
    const m = splitModel([
      { key: 'terrestrial', count: 1, color: 'a' },
      { key: 'arboreal', count: 0, color: 'b' },
    ]);
    expect(m.segments).toEqual([]);
    expect(m.sentence).toBe('1 terrestrial. A split appears with two or more animals.');
    expect(m.legend.map((l) => l.label)).toEqual(['1 terrestrial', '0 arboreal']);
  });
  test('one category with several animals does not claim "two or more animals"', () => {
    const m = splitModel([{ key: 'terrestrial', count: 4, color: 'a' }]);
    expect(m.segments).toEqual([]);
    expect(m.sentence).toBe('All 4 terrestrial.');
    expect(splitModel([{ key: 'female', count: 3, color: 'a' }, { key: 'male', count: 0, color: 'b' }]).sentence).toBe('All 3 female.');
  });
  test('a label replaces the raw API key in the legend, the sentence and the a11y', () => {
    const m = splitModel([
      { key: 'male', count: 2, color: 'a' },
      { key: 'unknown', label: 'unsexed', count: 1, color: 'b' },
    ]);
    expect(m.legend.map((l) => l.label)).toEqual(['2 male', '1 unsexed']);
    expect(m.legend[1]).toMatchObject({ key: 'unknown', word: 'unsexed' });
    expect(m.a11y).toBe('Split: 2 male, 1 unsexed');
    expect(splitModel([{ key: 'unknown', label: 'unsexed', count: 1, color: 'a' }]).sentence).toBe(
      '1 unsexed. A split appears with two or more animals.',
    );
    expect(splitModel([{ key: 'unknown', label: 'unsexed', count: 5, color: 'a' }]).sentence).toBe('All 5 unsexed.');
    // By group: the registry label, not true_spider.
    const groups = splitModel([
      { key: 'true_spider', label: 'True spider', count: 2, color: 'a' },
      { key: 'whip_spider', label: 'Whip spider', count: 1, color: 'b' },
    ]);
    expect(groups.legend.map((l) => l.label)).toEqual(['2 True spider', '1 Whip spider']);
    expect(JSON.stringify(groups.legend.map((l) => l.label))).not.toMatch(/_/);
  });
  test('without a label the key is the word (callers pass labels for keys that are not words)', () => {
    expect(splitModel([{ key: 'unknown', count: 1, color: 'a' }, { key: 'arboreal', count: 1, color: 'b' }]).legend.map((l) => l.label))
      .toEqual(['1 unknown', '1 arboreal']);
  });
  test('nothing at all: no bar, no sentence', () => {
    const m = splitModel([{ key: 'male', count: 0, color: 'a' }]);
    expect(m.segments).toEqual([]);
    expect(m.sentence).toBeNull();
    expect(splitModel([]).legend).toEqual([]);
  });
});

describe('moneyCard', () => {
  const adv = (over: Partial<AdvancedAnalytics> = {}): AdvancedAnalytics => ({
    ...SAMPLE_ADVANCED,
    most_expensive_name: 'Rosie',
    most_expensive_price: 1234.5,
    collection_value_total: 2000,
    spent_this_month: 42.5,
    feeders_spent_this_month: 18,
    estimated_monthly_feeding_cost: 61.5,
    cost_per_feeding: 0.75,
    cost_per_feeding_is_default: false,
    ...over,
  });

  test('every figure through formatMoney, README captions, no currency symbol', () => {
    const m = moneyCard(adv());
    expect(m.spent).toEqual({ value: '42.50', caption: 'spent this month', sub: '18 on feeders' });
    expect(m.paid).toEqual({ value: '2,000', caption: 'paid for animals', sub: 'most: Rosie, 1,234.50', addLink: false });
    expect(m.feeding).toEqual({ label: 'Est. feeding cost / month', value: '~61.50', caption: '0.75 per feeding' });
    expect(m.trailing).toBe('your currency · private');
    expect(JSON.stringify(m)).not.toMatch(/[$€£]|\$0|NaN|undefined|N\/A/);
  });
  test('the default cost says so', () => {
    expect(moneyCard(adv({ cost_per_feeding: 0.5, cost_per_feeding_is_default: true })).feeding.caption).toBe('default, 0.50 per feeding');
  });
  test('zero spend -> em dash and "nothing spent this month"', () => {
    expect(moneyCard(adv({ spent_this_month: 0, feeders_spent_this_month: 0 })).spent).toEqual({
      value: '—',
      caption: 'nothing spent this month',
      sub: null,
    });
  });
  test('spend with no feeder spend has no feeders line', () => {
    expect(moneyCard(adv({ spent_this_month: 10, feeders_spent_this_month: 0 })).spent.sub).toBeNull();
  });
  test('no prices -> em dash, "no price entered" and the Add link', () => {
    const m = moneyCard(adv({ collection_value_total: 0, most_expensive_name: null, most_expensive_price: null }));
    expect(m.paid).toEqual({ value: '—', caption: 'no price entered', sub: null, addLink: true });
    expect(ADD_PAID_LINK).toBe('Add what you paid');
  });
  test('paid total without a named most expensive animal has no "most:" line', () => {
    expect(moneyCard(adv({ most_expensive_name: null, most_expensive_price: null })).paid.sub).toBeNull();
    expect(moneyCard(adv({ most_expensive_price: null })).paid.sub).toBeNull();
  });
  test('an older API (fields absent) -> "—" + "not available yet", never 0', () => {
    const old = adv({ spent_this_month: undefined, feeders_spent_this_month: undefined, cost_per_feeding: undefined, cost_per_feeding_is_default: undefined });
    const m = moneyCard(old);
    expect(m.spent).toEqual({ value: '—', caption: 'not available yet', sub: null });
    expect(m.feeding.caption).toBeNull();
    expect(badNumbers(m)).toEqual([]);
  });
  test('a non-finite estimate is an em dash, not NaN', () => {
    expect(moneyCard(adv({ estimated_monthly_feeding_cost: Number.NaN })).feeding.value).toBe('—');
  });
});

describe('growthBaseline', () => {
  const adv = (over: Partial<AdvancedAnalytics>): AdvancedAnalytics => ({ ...SAMPLE_ADVANCED, ...over });
  test('total animals minus the animals added in the window', () => {
    expect(growthBaseline(adv({ total_animals: 14, collection_growth: [{ month: '2026-03', count: 1 }, { month: '2026-08', count: 3 }] }))).toBe(10);
  });
  test('never negative (animals that died in the window), never NaN', () => {
    expect(growthBaseline(adv({ total_animals: 2, collection_growth: [{ month: '2026-03', count: 5 }] }))).toBe(0);
    expect(growthBaseline(adv({ total_animals: undefined, collection_growth: [] }))).toBe(0);
    expect(growthBaseline(adv({ total_animals: 7, collection_growth: [] }))).toBe(7);
  });
});

describe('SAMPLE_NOW', () => {
  test('is mid-October 2026, so the fixed sample months always fill the window', () => {
    expect(SAMPLE_NOW.getFullYear()).toBe(2026);
    expect(SAMPLE_NOW.getMonth()).toBe(9);
  });
});

describe('previewFromCollection', () => {
  const act = (type: string, date: string) => ({ type, date, tarantula_id: 'x', tarantula_name: 'X', description: '' });

  test('molts bucketed by month, only molts', () => {
    const p = previewFromCollection(
      full({
        recent_activity: [
          act('molt', '2026-10-23'), act('molt', '2026-10-02'), act('molt', '2026-09-15'),
          act('feeding', '2026-10-24'), act('substrate_change', '2026-08-01'),
        ],
      }),
      NOW,
    );
    expect(p.moltSeries).toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }]);
  });
  test('molts older than the window are dropped', () => {
    const p = previewFromCollection(full({ recent_activity: [act('molt', '2024-01-02'), act('molt', '2026-10-02')] }), NOW);
    expect(p.moltSeries).toEqual([{ month: '2026-10', count: 1 }]);
  });
  test('growth is a two-point step from the oldest to the newest acquisition', () => {
    const p = previewFromCollection(
      full({
        oldest_acquisition: { tarantula_id: 'o', name: 'Old', date: '2026-01-10' },
        newest_acquisition: { tarantula_id: 'n', name: 'New', date: '2026-10-24' },
      }),
      NOW,
    );
    expect(p.growthSeries).toEqual([{ month: '2026-01', count: 1 }, { month: '2026-10', count: 2 }]);
    const m = stepModel(p.growthSeries, 300, 70);
    expect(m.last).toBe(3);
  });
  test('growth: one acquisition month is a single point with the whole collection', () => {
    const p = previewFromCollection(
      full({
        oldest_acquisition: { tarantula_id: 'o', name: 'Old', date: '2026-10-01' },
        newest_acquisition: { tarantula_id: 'n', name: 'New', date: '2026-10-24' },
      }),
      NOW,
    );
    expect(p.growthSeries).toEqual([{ month: '2026-10', count: 3 }]);
  });
  test('no acquisition dates: no growth series', () => {
    expect(previewFromCollection(full(), NOW).growthSeries).toEqual([]);
  });
  test('money: what was paid, or an honest dash', () => {
    expect(previewFromCollection(full({ total_value: 1234.5 }), NOW).money).toEqual({ paid: '1,234.50', caption: 'paid for animals' });
    expect(previewFromCollection(full({ priced_count: 0 }), NOW).money).toEqual({ paid: '—', caption: 'no price entered' });
    expect(previewFromCollection(legacy({ total_value: 0 }), NOW).money).toEqual({ paid: '—', caption: 'no price entered' });
    expect(previewFromCollection(legacy({ total_value: 40 }), NOW).money).toEqual({ paid: '40', caption: 'paid for animals' });
  });
  test('one animal, no logs: all empty, nothing broken', () => {
    const p = previewFromCollection(oneAnimalNoLogs(), NOW);
    expect(p.moltSeries).toEqual([]);
    expect(p.growthSeries).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/NaN|undefined/);
  });
});

describe('SAMPLE_ADVANCED (zero-animal free keeper)', () => {
  const sample: AdvancedAnalytics = SAMPLE_ADVANCED;
  test('is a six-tarantula collection whose parts agree', () => {
    expect(sample.total_animals).toBe(6);
    expect(sample.taxon_distribution).toEqual({ tarantula: 6 });
    expect(Object.values(sample.enclosure_type_distribution).reduce((a, b) => a + b, 0)).toBe(6);
    expect(Object.values(sample.sex_distribution).reduce((a, b) => a + b, 0)).toBe(6);
    expect(sample.molt_heatmap.reduce((a, b) => a + b.count, 0)).toBe(sample.total_molts_logged);
  });
  test('renders through the same models as real data', () => {
    const bars = barsModel(sample.molt_heatmap, 342, SAMPLE_NOW);
    expect(bars.bars).toHaveLength(12);
    expect(bars.total).toBe(sample.total_molts_logged);
    expect(bars.bars[11].label).toBe('O');
    expect(growthBaseline(sample)).toBe(2);
    const step = stepModel(sample.collection_growth, 300, 70, growthBaseline(sample));
    expect(step.first).toBe(2);
    expect(step.last).toBe(6);
  });
  test('the sample sentence is exported verbatim', () => {
    expect(SAMPLE_SENTENCE).toBe('This is what a keeper with six tarantulas sees. Yours will use your own logs.');
  });
  test('the sample Money card shows its designed "most:" caption', () => {
    const m = moneyCard(sample);
    expect(m.paid).toEqual({ value: '540', caption: 'paid for animals', sub: 'most: Juniper, 120', addLink: false });
    expect(m.spent).toEqual({ value: '42.50', caption: 'spent this month', sub: '18 on feeders' });
    expect(m.feeding).toEqual({ label: 'Est. feeding cost / month', value: '~12', caption: 'default, 0.50 per feeding' });
  });
  test('no currency symbol in any figure', () => {
    expect(formatMoney(sample.collection_value_total)).not.toMatch(/[$€£]/);
  });
});

describe('a full pass over the one-animal, zero-log keeper never leaks NaN, undefined or N/A', () => {
  test('every card has its designed empty line', () => {
    const c = oneAnimalNoLogs();
    const out = {
      subtitle: headerSubtitle(c),
      figures: collectionFigures(c, true),
      tiles: rightNowTiles(c, NOW, true),
      feeding: feedingFigures(c, true),
      sentence: feedingSentence(c),
      molts: moltsCard(c, NOW, true),
      species: speciesRows(c),
      paid: paidFooter(c),
      recent: recentRows(c, NOW),
      insight: insight(c, NOW),
      preview: previewFromCollection(c, NOW),
      bars: barsModel(previewFromCollection(c, NOW).moltSeries, 300, NOW),
      step: stepModel(previewFromCollection(c, NOW).growthSeries, 300, 70),
    };
    expect(badNumbers(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/NaN|undefined|N\/A|\$0|Infinity/);
    expect(out.molts.emptyLine).toBe(EMPTY_LINE);
    expect(out.bars.sentence).toBe(ZERO_BARS);
    expect(out.tiles[0].value).toBe('0');
    expect(out.sentence).toBeNull();
  });
});
