/**
 * First-feeding helpers (Day-one). Dates are built from local parts, so the
 * tests hold in any timezone.
 */
import {
  DUE_NO_MEAL_LOGGED,
  FIRST_FEEDING_COPY,
  FIRST_MEAL_NOT_LOGGED,
  NUDGE_HIDE_DAYS,
  feedingStatusText,
  lastFedIso,
  nudgeHidden,
} from '../first-feeding';

const noonIso = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0, 0).toISOString();

describe('lastFedIso', () => {
  const lateEvening = new Date(2026, 9, 27, 23, 30);
  const earlyMorning = new Date(2026, 9, 27, 0, 5);

  it('today is local noon of now\'s local day, even at 11:30 pm', () => {
    expect(lastFedIso('today', null, lateEvening)).toBe(noonIso(2026, 9, 27));
    expect(lastFedIso('today', null, earlyMorning)).toBe(noonIso(2026, 9, 27));
  });

  it('yesterday is the previous local day at noon', () => {
    expect(lastFedIso('yesterday', null, lateEvening)).toBe(noonIso(2026, 9, 26));
  });

  it('yesterday crosses month and year boundaries', () => {
    expect(lastFedIso('yesterday', null, new Date(2026, 10, 1, 8))).toBe(noonIso(2026, 9, 31));
    expect(lastFedIso('yesterday', null, new Date(2027, 0, 1, 8))).toBe(noonIso(2026, 11, 31));
  });

  it('pick uses the picked local day at noon, whatever the time of day', () => {
    expect(lastFedIso('pick', new Date(2026, 9, 20, 3, 15), lateEvening)).toBe(noonIso(2026, 9, 20));
    expect(lastFedIso('pick', new Date(2026, 9, 20, 23, 59), lateEvening)).toBe(noonIso(2026, 9, 20));
  });

  it('pick of today is allowed', () => {
    expect(lastFedIso('pick', new Date(2026, 9, 27, 18), earlyMorning)).toBe(noonIso(2026, 9, 27));
  });

  it('pick of a future day is null', () => {
    expect(lastFedIso('pick', new Date(2026, 9, 28, 0, 1), lateEvening)).toBeNull();
    expect(lastFedIso('pick', new Date(2027, 0, 1), lateEvening)).toBeNull();
  });

  it('pick with nothing picked (or an invalid date) is null', () => {
    expect(lastFedIso('pick', null, lateEvening)).toBeNull();
    expect(lastFedIso('pick', new Date('nope'), lateEvening)).toBeNull();
  });

  it('not_sure is null', () => {
    expect(lastFedIso('not_sure', null, lateEvening)).toBeNull();
    expect(lastFedIso('not_sure', new Date(2026, 9, 20), lateEvening)).toBeNull();
  });

  it('defaults now to the current time', () => {
    const iso = lastFedIso('today', null);
    expect(iso).not.toBeNull();
    const n = new Date();
    expect(iso).toBe(new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0).toISOString());
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

  it('overdue with a known last feeding keeps the caller\'s text', () => {
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
  });
});

describe('nudgeHidden', () => {
  const now = new Date(2026, 9, 27, 12);
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

  it('welcome', () => {
    expect(c.welcomeTitle).toBe('Welcome to Tarantuverse');
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
    expect(c.pushAskAfterSaveTitle('Hairy')).toBe('Want a heads-up when Hairy is due to eat?');
    expect(c.pushAskWhenDueTitle).toBe('Want a reminder on days something is due?');
    expect(c.pushAskBody).toBe('At most one reminder a day, at the hour you choose in Settings.');
    expect(c.pushAskAccept).toBe('Turn on reminders');
    expect(c.pushAskDecline).toBe('Not now');
  });

  it('email ask', () => {
    expect(c.emailAskAfterSaveTitle('Hairy')).toBe('Want an email when Hairy is due?');
    expect(c.emailAskWhenDueTitle).toBe('Want an email on days something is due?');
    expect(c.emailAskBody).toBe('On days something is due, at most once a day. You can turn it off any time.');
    expect(c.emailAskAccept).toBe('Email me');
    expect(c.emailAskDecline).toBe('Not now');
  });

  it('nudge', () => {
    expect(c.nudgeTitle).toBe('First feeding not logged');
    expect(c.nudgeRowButton).toBe('When did it last eat?');
    expect(c.nudgeChipToday).toBe('Today');
    expect(c.nudgeChipYesterday).toBe('Yesterday');
    expect(c.nudgeChipPickDate).toBe('Pick a date');
    expect(c.nudgeChipNotYet).toBe('Not yet');
    expect(c.nudgeHideLabel).toBe('Hide for 14 days');
  });

  it('status labels, settings, email and unsubscribe', () => {
    expect(c.firstMealNotLogged).toBe('First meal not logged');
    expect(c.dueNoMealLogged).toBe('Due · no meal logged yet');
    expect(c.dailyEmailSwitch).toBe('Daily email reminder');
    expect(c.dailyEmailHelp).toBe('An email on days something is due, at your reminder hour.');
    expect(c.openPhoneSettings).toBe('Open phone settings');
    expect(c.digestSubject(1)).toBe('1 animal is due to eat today');
    expect(c.digestSubject(3)).toBe('3 animals are due to eat today');
    expect(c.digestButton).toBe('Open Feeding Day');
    expect(c.digestFooter).toBe("You're getting this because you turned on daily email reminders.");
    expect(c.digestUnsubscribe).toBe('Unsubscribe');
    expect(c.digestSettingsLink).toBe('Reminder settings');
    expect(c.unsubscribeOk).toBe("You're unsubscribed from daily email reminders.");
    expect(c.unsubscribeBad).toBe("This unsubscribe link isn't valid.");
  });
});
