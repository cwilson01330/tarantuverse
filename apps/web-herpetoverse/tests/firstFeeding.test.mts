// Unit tests for the HV day-one first-feeding helpers (web copy of TV web's
// firstFeeding.ts, HV wording). Dates are built from local parts, so these
// hold in any timezone.
// Run: node --test --experimental-strip-types tests/*.test.mts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DUE_NO_MEAL_LOGGED,
  EMAIL_ASK_STORAGE_KEY,
  FIRST_FEEDING_CARD_MAX,
  FIRST_FEEDING_COPY,
  FIRST_MEAL_NOT_LOGGED,
  NO_SCHEDULE,
  NUDGE_HIDE_DAYS,
  dateFromInputValue,
  feedingStatusText,
  firstFeedingRows,
  lastFedIso,
  nudgeHidden,
  parseAskState,
  shouldAskAfterSave,
  shouldAskWhenDue,
  todayInputValue,
} from '../src/lib/firstFeeding.ts'

const noonIso = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0, 0).toISOString()
const lateEvening = new Date(2026, 10, 18, 23, 30)
const earlyMorning = new Date(2026, 10, 18, 0, 5)

test("lastFedIso: today is local noon of now's local day, even at 11:30 pm", () => {
  assert.equal(lastFedIso('today', null, lateEvening), noonIso(2026, 10, 18))
  assert.equal(lastFedIso('today', null, earlyMorning), noonIso(2026, 10, 18))
})

test('lastFedIso: yesterday crosses month and year', () => {
  assert.equal(lastFedIso('yesterday', null, lateEvening), noonIso(2026, 10, 17))
  assert.equal(lastFedIso('yesterday', null, new Date(2026, 11, 1, 8)), noonIso(2026, 10, 30))
  assert.equal(lastFedIso('yesterday', null, new Date(2027, 0, 1, 8)), noonIso(2026, 11, 31))
})

test('lastFedIso: pick uses the picked local day at noon; today allowed; future null', () => {
  assert.equal(lastFedIso('pick', new Date(2026, 10, 10, 3, 15), lateEvening), noonIso(2026, 10, 10))
  assert.equal(lastFedIso('pick', new Date(2026, 10, 18, 18), earlyMorning), noonIso(2026, 10, 18))
  assert.equal(lastFedIso('pick', new Date(2026, 10, 19, 0, 1), lateEvening), null)
})

test('lastFedIso: pick with nothing or invalid is null; not_sure is null', () => {
  assert.equal(lastFedIso('pick', null, lateEvening), null)
  assert.equal(lastFedIso('pick', new Date('nope'), lateEvening), null)
  assert.equal(lastFedIso('not_sure', null, lateEvening), null)
})

test('dateFromInputValue and todayInputValue use local parts', () => {
  const d = dateFromInputValue('2026-11-05')
  assert.ok(d)
  assert.equal(d!.getFullYear(), 2026)
  assert.equal(d!.getMonth(), 10)
  assert.equal(d!.getDate(), 5)
  assert.equal(dateFromInputValue(''), null)
  assert.equal(dateFromInputValue('11/05/2026'), null)
  assert.equal(todayInputValue(new Date(2026, 0, 3, 23, 59)), '2026-01-03')
})

test('feedingStatusText', () => {
  assert.equal(feedingStatusText({ needs_first_feeding: true }), 'First meal not logged')
  assert.equal(
    feedingStatusText({ needs_first_feeding: true, is_overdue: true, days_since_last_feeding: null }),
    'First meal not logged',
  )
  assert.equal(feedingStatusText({ is_overdue: true, days_since_last_feeding: null }), 'Due · no meal logged yet')
  assert.equal(feedingStatusText({ is_overdue: true, days_since_last_feeding: 9 }), null)
  assert.equal(feedingStatusText({}), null)
  assert.equal(FIRST_MEAL_NOT_LOGGED, 'First meal not logged')
  assert.equal(DUE_NO_MEAL_LOGGED, 'Due · no meal logged yet')
  assert.equal(NO_SCHEDULE, 'No schedule')
})

test('firstFeedingRows: flagged only, server order, at most three', () => {
  const rows = [
    { id: 'a', needs_first_feeding: true },
    { id: 'b', needs_first_feeding: false },
    { id: 'c' },
    { id: 'd', needs_first_feeding: true },
    { id: 'e', needs_first_feeding: true },
    { id: 'f', needs_first_feeding: true },
  ]
  assert.equal(FIRST_FEEDING_CARD_MAX, 3)
  assert.deepEqual(firstFeedingRows(rows).map((r) => r.id), ['a', 'd', 'e'])
  assert.deepEqual(firstFeedingRows([]), [])
})

test('nudgeHidden', () => {
  const now = new Date(2026, 10, 18, 12)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()
  assert.equal(NUDGE_HIDE_DAYS, 14)
  assert.equal(nudgeHidden(daysAgo(13), now), true)
  assert.equal(nudgeHidden(daysAgo(14), now), false)
  assert.equal(nudgeHidden(null, now), false)
  assert.equal(nudgeHidden('not a date', now), false)
})

test('parseAskState tolerates null, garbage and partial JSON', () => {
  const none = { afterSaveShown: false, dueShown: false }
  assert.deepEqual(parseAskState(null), none)
  assert.deepEqual(parseAskState('{nope'), none)
  assert.deepEqual(parseAskState('[1,2]'), none)
  assert.deepEqual(parseAskState('{"afterSaveShown":true}'), { afterSaveShown: true, dueShown: false })
  assert.deepEqual(parseAskState('{"afterSaveShown":"yes","dueShown":1}'), none)
})

test('email ask rules (HV key, TV logic)', () => {
  const fresh = { afterSaveShown: false, dueShown: false }
  assert.equal(EMAIL_ASK_STORAGE_KEY, 'hv_email_reminder_ask_v1')
  assert.equal(shouldAskAfterSave(fresh, false), true)
  assert.equal(shouldAskAfterSave({ afterSaveShown: true, dueShown: false }, false), false)
  assert.equal(shouldAskAfterSave({ afterSaveShown: false, dueShown: true }, false), true)
  assert.equal(shouldAskAfterSave(fresh, true), false)
  assert.equal(shouldAskAfterSave(fresh, false, false), false)
  assert.equal(shouldAskWhenDue(fresh, false, true), true)
  assert.equal(shouldAskWhenDue({ afterSaveShown: true, dueShown: false }, false, true), true)
  assert.equal(shouldAskWhenDue(fresh, false, false), false)
  assert.equal(shouldAskWhenDue({ afterSaveShown: false, dueShown: true }, false, true), false)
  assert.equal(shouldAskWhenDue(fresh, true, true), false)
  assert.equal(shouldAskWhenDue(fresh, false, true, false), false)
})

test('FIRST_FEEDING_COPY is frozen, HV-worded, no emoji', () => {
  const c = FIRST_FEEDING_COPY
  assert.equal(Object.isFrozen(c), true)
  assert.equal(c.welcomeTitle, 'Welcome to Herpetoverse')
  assert.equal(c.lastFedLabel, 'When did it last eat?')
  assert.equal(c.chipNotSure, 'Not sure')
  assert.equal(c.lastFedHint, "Not sure is fine. We'll remind you to log its first meal.")
  assert.equal(c.emailAskAfterSaveTitle('Hairy'), 'Want an email when Hairy is due?')
  assert.equal(c.emailAskWhenDueTitle, 'Want an email on days something is due?')
  assert.equal(c.emailAskAccept, 'Email me')
  assert.equal(c.emailAskDecline, 'Not now')
  assert.equal(c.nudgeTitle, 'First meal not logged')
  assert.equal(c.nudgeHideLabel, 'Hide for 14 days')
  assert.equal(c.noSchedule, 'No schedule')
  assert.equal(c.dailyEmailSwitch, 'Daily email reminder')
  assert.equal(c.dailyEmailHelp, 'An email on days something is due, at your reminder hour.')
  assert.equal(c.unsubscribeHeading, 'Stop daily email reminders?')
  assert.equal(c.unsubscribeOk, "You're unsubscribed from daily email reminders.")
  assert.equal(c.unsubscribeBad, "This unsubscribe link isn't valid.")
  for (const v of Object.values(c)) {
    if (typeof v === 'string') assert.doesNotMatch(v, /Tarantuverse|\p{Extended_Pictographic}/u)
  }
})
