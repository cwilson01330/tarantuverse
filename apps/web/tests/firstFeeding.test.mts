// Unit tests for the Day-one first-feeding helpers (web copy of the mobile
// first-feeding.ts + notification-ask.ts). Dates are built from local parts,
// so these hold in any timezone.
// Run: pnpm --filter web test:auth   (node --test with type stripping)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DUE_NO_MEAL_LOGGED,
  EMAIL_ASK_STORAGE_KEY,
  FIRST_FEEDING_COPY,
  FIRST_MEAL_NOT_LOGGED,
  NUDGE_HIDE_DAYS,
  feedingStatusText,
  lastFedIso,
  nudgeHidden,
  parseAskState,
  shouldAskAfterSave,
  shouldAskWhenDue,
} from '../src/lib/firstFeeding.ts'

const noonIso = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0, 0).toISOString()
const lateEvening = new Date(2026, 9, 27, 23, 30)
const earlyMorning = new Date(2026, 9, 27, 0, 5)

test('lastFedIso: today is local noon of now\'s local day, even at 11:30 pm', () => {
  assert.equal(lastFedIso('today', null, lateEvening), noonIso(2026, 9, 27))
  assert.equal(lastFedIso('today', null, earlyMorning), noonIso(2026, 9, 27))
})

test('lastFedIso: yesterday is the previous local day at noon, across month and year', () => {
  assert.equal(lastFedIso('yesterday', null, lateEvening), noonIso(2026, 9, 26))
  assert.equal(lastFedIso('yesterday', null, new Date(2026, 10, 1, 8)), noonIso(2026, 9, 31))
  assert.equal(lastFedIso('yesterday', null, new Date(2027, 0, 1, 8)), noonIso(2026, 11, 31))
})

test('lastFedIso: pick uses the picked local day at noon; today allowed; future null', () => {
  assert.equal(lastFedIso('pick', new Date(2026, 9, 20, 3, 15), lateEvening), noonIso(2026, 9, 20))
  assert.equal(lastFedIso('pick', new Date(2026, 9, 20, 23, 59), lateEvening), noonIso(2026, 9, 20))
  assert.equal(lastFedIso('pick', new Date(2026, 9, 27, 18), earlyMorning), noonIso(2026, 9, 27))
  assert.equal(lastFedIso('pick', new Date(2026, 9, 28, 0, 1), lateEvening), null)
  assert.equal(lastFedIso('pick', new Date(2027, 0, 1), lateEvening), null)
})

test('lastFedIso: pick with nothing or an invalid date is null; not_sure is null', () => {
  assert.equal(lastFedIso('pick', null, lateEvening), null)
  assert.equal(lastFedIso('pick', new Date('nope'), lateEvening), null)
  assert.equal(lastFedIso('not_sure', null, lateEvening), null)
  assert.equal(lastFedIso('not_sure', new Date(2026, 9, 20), lateEvening), null)
})

test('lastFedIso: defaults now to the current time', () => {
  const n = new Date()
  assert.equal(lastFedIso('today', null), new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12).toISOString())
})

test('feedingStatusText', () => {
  assert.equal(feedingStatusText({ needs_first_feeding: true }), 'First meal not logged')
  assert.equal(
    feedingStatusText({ needs_first_feeding: true, is_overdue: true, days_since_last_feeding: null }),
    'First meal not logged',
  )
  assert.equal(feedingStatusText({ is_overdue: true, days_since_last_feeding: null }), 'Due · no meal logged yet')
  assert.equal(feedingStatusText({ is_overdue: true }), 'Due · no meal logged yet')
  assert.equal(feedingStatusText({ is_overdue: true, days_since_last_feeding: 9 }), null)
  assert.equal(feedingStatusText({ is_overdue: true, days_since_last_feeding: 0 }), null)
  assert.equal(feedingStatusText({}), null)
  assert.equal(
    feedingStatusText({ needs_first_feeding: false, is_overdue: false, days_since_last_feeding: null }),
    null,
  )
  assert.equal(FIRST_MEAL_NOT_LOGGED, 'First meal not logged')
  assert.equal(DUE_NO_MEAL_LOGGED, 'Due · no meal logged yet')
})

test('nudgeHidden', () => {
  const now = new Date(2026, 9, 27, 12)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()
  assert.equal(NUDGE_HIDE_DAYS, 14)
  assert.equal(nudgeHidden(daysAgo(13), now), true)
  assert.equal(nudgeHidden(daysAgo(15), now), false)
  assert.equal(nudgeHidden(daysAgo(14), now), false)
  assert.equal(nudgeHidden(daysAgo(0), now), true)
  assert.equal(nudgeHidden(null, now), false)
  assert.equal(nudgeHidden('', now), false)
  assert.equal(nudgeHidden('not a date', now), false)
})

test('parseAskState tolerates null, garbage and partial JSON', () => {
  assert.deepEqual(parseAskState(null), { afterSaveShown: false, dueShown: false })
  assert.deepEqual(parseAskState(''), { afterSaveShown: false, dueShown: false })
  assert.deepEqual(parseAskState('{nope'), { afterSaveShown: false, dueShown: false })
  assert.deepEqual(parseAskState('[1,2]'), { afterSaveShown: false, dueShown: false })
  assert.deepEqual(parseAskState('"x"'), { afterSaveShown: false, dueShown: false })
  assert.deepEqual(parseAskState('{"afterSaveShown":true}'), { afterSaveShown: true, dueShown: false })
  assert.deepEqual(parseAskState('{"afterSaveShown":"yes","dueShown":1}'), {
    afterSaveShown: false,
    dueShown: false,
  })
  assert.deepEqual(parseAskState('{"afterSaveShown":true,"dueShown":true}'), {
    afterSaveShown: true,
    dueShown: true,
  })
})

test('email ask: shouldAskAfterSave', () => {
  const fresh = { afterSaveShown: false, dueShown: false }
  assert.equal(EMAIL_ASK_STORAGE_KEY, 'email_reminder_ask_v1')
  assert.equal(shouldAskAfterSave(fresh, false), true)
  assert.equal(shouldAskAfterSave({ afterSaveShown: true, dueShown: false }, false), false)
  // dueShown does not suppress the after-save ask
  assert.equal(shouldAskAfterSave({ afterSaveShown: false, dueShown: true }, false), true)
  // email already on: never ask
  assert.equal(shouldAskAfterSave(fresh, true), false)
  // daily digest off: never ask; on (or unspecified) behaves as before
  assert.equal(shouldAskAfterSave(fresh, false, false), false)
  assert.equal(shouldAskAfterSave(fresh, false, true), true)
})

test('email ask: shouldAskWhenDue is independent of the after-save ask', () => {
  const fresh = { afterSaveShown: false, dueShown: false }
  assert.equal(shouldAskWhenDue(fresh, false, true), true)
  assert.equal(shouldAskWhenDue({ afterSaveShown: true, dueShown: false }, false, true), true)
  assert.equal(shouldAskWhenDue(fresh, false, false), false)
  assert.equal(shouldAskWhenDue({ afterSaveShown: false, dueShown: true }, false, true), false)
  // email already on: never ask
  assert.equal(shouldAskWhenDue(fresh, true, true), false)
  assert.equal(shouldAskWhenDue({ afterSaveShown: true, dueShown: true }, true, true), false)
  // daily digest off: never ask
  assert.equal(shouldAskWhenDue(fresh, false, true, false), false)
  assert.equal(shouldAskWhenDue(fresh, false, true, true), true)
})

test('FIRST_FEEDING_COPY is frozen and verbatim', () => {
  const c = FIRST_FEEDING_COPY
  assert.equal(Object.isFrozen(c), true)
  assert.equal(c.welcomeTitle, 'Welcome to Tarantuverse')
  assert.equal(c.welcomeLine, "Let's add your first animal. It takes about a minute.")
  assert.equal(c.welcomeImport, 'Import a spreadsheet')
  assert.equal(c.lastFedLabel, 'When did it last eat?')
  assert.equal(c.chipToday, 'Today')
  assert.equal(c.chipYesterday, 'Yesterday')
  assert.equal(c.chipPickDate, 'Pick a date')
  assert.equal(c.chipNotSure, 'Not sure')
  assert.equal(c.lastFedHint, "Not sure is fine. We'll remind you to log its first meal.")
  assert.equal(c.emailAskAfterSaveTitle('Hairy'), 'Want an email when Hairy is due?')
  assert.equal(c.emailAskWhenDueTitle, 'Want an email on days something is due?')
  assert.equal(c.emailAskBody, 'On days something is due, at most once a day. You can turn it off any time.')
  assert.equal(c.emailAskAccept, 'Email me')
  assert.equal(c.emailAskDecline, 'Not now')
  assert.equal(c.nudgeTitle, 'First feeding not logged')
  assert.equal(c.nudgeRowButton, 'When did it last eat?')
  assert.equal(c.nudgeChipNotYet, 'Not yet')
  assert.equal(c.nudgeHideLabel, 'Hide for 14 days')
  assert.equal(c.dailyEmailSwitch, 'Daily email reminder')
  assert.equal(c.dailyEmailHelp, 'An email on days something is due, at your reminder hour.')
  assert.equal(c.unsubscribeOk, "You're unsubscribed from daily email reminders.")
  assert.equal(c.unsubscribeBad, "This unsubscribe link isn't valid.")
  assert.equal(c.unsubscribeHeading, 'Stop daily email reminders?')
  assert.equal(c.unsubscribeButton, 'Unsubscribe')
  assert.equal(c.importLastFedHelp, 'Have a "last fed" column? We\'ll log that feeding for each animal.')
})
