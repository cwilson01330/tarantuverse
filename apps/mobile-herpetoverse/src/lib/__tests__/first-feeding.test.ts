/**
 * First-feeding helpers (HV day one). Same vectors as the Tarantuverse test
 * (apps/mobile/src/lib/__tests__/first-feeding.test.ts), plus the HV-only
 * pieces: the product name in the copy, the "No schedule" label for
 * plant-eaters, and the dashboard's pick of animals for the card.
 *
 * Dates are built from local parts, so the tests hold in any timezone.
 */
import { describe, expect, it } from '@jest/globals';
import {
  DUE_NO_MEAL_LOGGED,
  FIRST_FEEDING_CARD_MAX,
  FIRST_FEEDING_COPY,
  FIRST_MEAL_NOT_LOGGED,
  NO_SCHEDULE,
  NUDGE_HIDE_DAYS,
  feedingStatusText,
  firstFeedingRows,
  lastFedIso,
  lastFedPickError,
  nudgeHidden,
  parseLocalYmd,
} from '../first-feeding';

const noonIso = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0, 0).toISOString();

describe('lastFedIso', () => {
  const lateEvening = new Date(2026, 10, 18, 23, 30);
  const earlyMorning = new Date(2026, 10, 18, 0, 5);

  it("today is local noon of now's local day, even at 11:30 pm", () => {
    expect(lastFedIso('today', null, lateEvening)).toBe(noonIso(2026, 10, 18));
    expect(lastFedIso('today', null, earlyMorning)).toBe(noonIso(2026, 10, 18));
  });

  it('yesterday is the previous local day at noon', () => {
    expect(lastFedIso('yesterday', null, lateEvening)).toBe(noonIso(2026, 10, 17));
  });

  it('yesterday crosses month and year boundaries', () => {
    expect(lastFedIso('yesterday', null, new Date(2026, 10, 1, 8))).toBe(noonIso(2026, 9, 31));
    expect(lastFedIso('yesterday', null, new Date(2027, 0, 1, 8))).toBe(noonIso(2026, 11, 31));
  });

  it('pick uses the picked local day at noon, whatever the time of day', () => {
    expect(lastFedIso('pick', new Date(2026, 10, 10, 3, 15), lateEvening)).toBe(noonIso(2026, 10, 10));
    expect(lastFedIso('pick', new Date(2026, 10, 10, 23, 59), lateEvening)).toBe(noonIso(2026, 10, 10));
  });

  it('pick of today is allowed', () => {
    expect(lastFedIso('pick', new Date(2026, 10, 18, 18), earlyMorning)).toBe(noonIso(2026, 10, 18));
  });

  it('pick of a future day is null', () => {
    expect(lastFedIso('pick', new Date(2026, 10, 19, 0, 1), lateEvening)).toBeNull();
    expect(lastFedIso('pick', new Date(2027, 0, 1), lateEvening)).toBeNull();
  });

  it('pick with nothing picked (or an invalid date) is null', () => {
    expect(lastFedIso('pick', null, lateEvening)).toBeNull();
    expect(lastFedIso('pick', new Date('nope'), lateEvening)).toBeNull();
  });

  it('not_sure is null', () => {
    expect(lastFedIso('not_sure', null, lateEvening)).toBeNull();
    expect(lastFedIso('not_sure', new Date(2026, 10, 10), lateEvening)).toBeNull();
  });

  it('defaults now to the current time', () => {
    const iso = lastFedIso('today', null);
    expect(iso).not.toBeNull();
    const n = new Date();
    expect(iso).toBe(new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0).toISOString());
  });
});

// HV forms take dates as typed YYYY-MM-DD (no native date picker in this app).
describe('parseLocalYmd', () => {
  it('reads a local calendar day', () => {
    const d = parseLocalYmd('2026-11-05');
    expect(d).not.toBeNull();
    expect([d!.getFullYear(), d!.getMonth(), d!.getDate()]).toEqual([2026, 10, 5]);
  });

  it('trims whitespace', () => {
    expect(parseLocalYmd(' 2026-11-05 ')?.getDate()).toBe(5);
  });

  it('rejects other shapes and impossible days', () => {
    expect(parseLocalYmd('')).toBeNull();
    expect(parseLocalYmd('11/05/2026')).toBeNull();
    expect(parseLocalYmd('2026-11-5')).toBeNull();
    expect(parseLocalYmd('2026-02-30')).toBeNull();
    expect(parseLocalYmd('2026-13-01')).toBeNull();
  });

  it('feeds lastFedIso as local noon of that day', () => {
    const now = new Date(2026, 10, 18, 21);
    expect(lastFedIso('pick', parseLocalYmd('2026-11-05'), now)).toBe(noonIso(2026, 10, 5));
  });
});

describe('lastFedPickError', () => {
  const now = new Date(2026, 10, 18, 21);

  it('accepts today and earlier days', () => {
    expect(lastFedPickError('2026-11-18', now)).toBeNull();
    expect(lastFedPickError('2026-01-02', now)).toBeNull();
  });

  it('refuses a malformed day', () => {
    expect(lastFedPickError('', now)).toBe('Last meal date should be YYYY-MM-DD.');
    expect(lastFedPickError('2026-02-30', now)).toBe('Last meal date should be YYYY-MM-DD.');
  });

  it('refuses a future day', () => {
    expect(lastFedPickError('2026-11-19', now)).toBe("Last meal date can't be in the future.");
  });
});

describe('feedingStatusText', () => {
  it('needs_first_feeding wins', () => {
    expect(feedingStatusText({ needs_first_feeding: true })).toBe('First meal not logged');
    expect(feedingStatusText({ needs_first_feeding: true, is_overdue: true, days_since_last_feeding: null })).toBe(
      'First meal not logged',
    );
  });

  it('overdue with no feeding at all says due, no meal logged', () => {
    expect(feedingStatusText({ is_overdue: true, days_since_last_feeding: null })).toBe('Due · no meal logged yet');
    expect(feedingStatusText({ is_overdue: true })).toBe('Due · no meal logged yet');
  });

  it("overdue with a known last feeding keeps the caller's text", () => {
    expect(feedingStatusText({ is_overdue: true, days_since_last_feeding: 9 })).toBeNull();
    expect(feedingStatusText({ is_overdue: true, days_since_last_feeding: 0 })).toBeNull();
  });

  it('otherwise null', () => {
    expect(feedingStatusText({})).toBeNull();
    expect(feedingStatusText({ needs_first_feeding: false, is_overdue: false, days_since_last_feeding: null })).toBeNull();
  });

  it('exports the labels as constants', () => {
    expect(FIRST_MEAL_NOT_LOGGED).toBe('First meal not logged');
    expect(DUE_NO_MEAL_LOGGED).toBe('Due · no meal logged yet');
    expect(NO_SCHEDULE).toBe('No schedule');
  });
});

describe('firstFeedingRows', () => {
  const row = (id: string, needs: boolean | undefined) => ({ id, needs_first_feeding: needs });

  it('keeps only animals flagged for a first meal, in server order', () => {
    const rows = [row('a', false), row('b', true), row('c', undefined), row('d', true)];
    expect(firstFeedingRows(rows).map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('caps at three', () => {
    expect(FIRST_FEEDING_CARD_MAX).toBe(3);
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, true));
    expect(firstFeedingRows(rows).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('empty in, empty out', () => {
    expect(firstFeedingRows([])).toEqual([]);
  });
});

describe('nudgeHidden', () => {
  const now = new Date(2026, 10, 18, 12);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

  it('is 14 days', () => {
    expect(NUDGE_HIDE_DAYS).toBe(14);
  });

  it('is hidden at 13 days, shown at 15', () => {
    expect(nudgeHidden(daysAgo(13), now)).toBe(true);
    expect(nudgeHidden(daysAgo(15), now)).toBe(false);
  });

  it('is shown again at exactly 14 days', () => {
    expect(nudgeHidden(daysAgo(14), now)).toBe(false);
  });

  it('is hidden just after hiding', () => {
    expect(nudgeHidden(daysAgo(0), now)).toBe(true);
  });

  it('null or garbage is not hidden', () => {
    expect(nudgeHidden(null, now)).toBe(false);
    expect(nudgeHidden('', now)).toBe(false);
    expect(nudgeHidden('not a date', now)).toBe(false);
  });
});

describe('FIRST_FEEDING_COPY', () => {
  const c = FIRST_FEEDING_COPY;

  it('is frozen', () => {
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('names Herpetoverse, never Tarantuverse', () => {
    expect(c.welcomeTitle).toBe('Welcome to Herpetoverse');
    for (const v of Object.values(c)) {
      const s = typeof v === 'function' ? (v as (x: string) => string)('X') : String(v);
      expect(s).not.toMatch(/tarantuverse/i);
    }
  });

  it('welcome', () => {
    expect(c.welcomeLine).toBe("Let's add your first animal. It takes about a minute.");
    expect(c.welcomeAdd).toBe('Add your first animal');
    expect(c.welcomeImport).toBe('Import a spreadsheet');
    expect(c.welcomeLookAround).toBe('Look around first');
  });

  it('add form', () => {
    expect(c.lastFedLabel).toBe('When did it last eat?');
    expect(c.chipToday).toBe('Today');
    expect(c.chipYesterday).toBe('Yesterday');
    expect(c.chipPickDate).toBe('Pick a date');
    expect(c.chipNotSure).toBe('Not sure');
    expect(c.lastFedHint).toBe("Not sure is fine. We'll remind you to log its first meal.");
  });

  it('push ask', () => {
    expect(c.pushAskAfterSaveTitle('Hex')).toBe('Want a heads-up when Hex is due to eat?');
    expect(c.pushAskWhenDueTitle).toBe('Want a reminder on days something is due?');
    expect(c.pushAskBody).toBe('Reminders come at the hour you choose in Settings, only on days something is due.');
    expect(c.pushAskAccept).toBe('Turn on reminders');
    expect(c.pushAskDecline).toBe('Not now');
  });

  it('first-meal card', () => {
    expect(c.nudgeTitle).toBe('First meal not logged');
    expect(c.nudgeRowButton).toBe('When did it last eat?');
    expect(c.nudgeChipToday).toBe('Today');
    expect(c.nudgeChipYesterday).toBe('Yesterday');
    expect(c.nudgeChipPickDate).toBe('Pick a date');
    expect(c.nudgeChipNotYet).toBe('Not yet');
    expect(c.nudgeHideLabel).toBe('Hide for 14 days');
  });

  it('status labels and settings', () => {
    expect(c.firstMealNotLogged).toBe('First meal not logged');
    expect(c.dueNoMealLogged).toBe('Due · no meal logged yet');
    expect(c.noSchedule).toBe('No schedule');
    expect(c.dailyEmailSwitch).toBe('Daily email reminder');
    expect(c.dailyEmailHelp).toBe('An email on days something is due, at your reminder hour.');
    expect(c.openPhoneSettings).toBe('Open phone settings');
  });
});
