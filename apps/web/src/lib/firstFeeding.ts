/**
 * First-feeding helpers (Day-one, 2026-10-27). Pure: no React, no fetch.
 * Web copy of apps/mobile/src/lib/first-feeding.ts + notification-ask.ts
 * (same semantics; the web asks for EMAIL reminders instead of push).
 *
 * Rules:
 *  - A date the keeper picks is saved as LOCAL NOON of that day (ISO string).
 *    Dates are built from local parts, never by parsing 'YYYY-MM-DD', so a
 *    keeper west of UTC at 9 pm still gets today, not tomorrow.
 *  - 'not_sure' (and a missing or future pick) saves nothing: null.
 */

export type LastFedChoice = 'today' | 'yesterday' | 'pick' | 'not_sure'

/** The nudge card stays hidden this long after the keeper taps its X. */
export const NUDGE_HIDE_DAYS = 14

export const FIRST_MEAL_NOT_LOGGED = 'First meal not logged'
export const DUE_NO_MEAL_LOGGED = 'Due · no meal logged yet'

function localNoon(y: number, m: number, d: number): string {
  return new Date(y, m, d, 12, 0, 0, 0).toISOString()
}

/** Local noon of the chosen day as an ISO string, or null when nothing should be saved. */
export function lastFedIso(
  choice: LastFedChoice,
  picked: Date | null,
  now: Date = new Date(),
): string | null {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (choice) {
    case 'today':
      return localNoon(y, m, d)
    case 'yesterday':
      // Date normalises d - 1 across month and year boundaries.
      return localNoon(y, m, d - 1)
    case 'pick': {
      if (!picked || Number.isNaN(picked.getTime())) return null
      const py = picked.getFullYear()
      const pm = picked.getMonth()
      const pd = picked.getDate()
      const pickedDay = new Date(py, pm, pd).getTime()
      const today = new Date(y, m, d).getTime()
      if (pickedDay > today) return null
      return localNoon(py, pm, pd)
    }
    default:
      return null
  }
}

/** `<input type="date">` value ("YYYY-MM-DD") to a local-midnight Date, or null. Never uses Date parsing of the string. */
export function dateFromInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Today's local date as an `<input type="date">` value (for its `max`). */
export function todayInputValue(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/**
 * Label for an animal with no logged feeding, or null (the caller keeps its
 * own text). `needs_first_feeding` wins over the overdue label.
 */
export function feedingStatusText(s: {
  needs_first_feeding?: boolean
  is_overdue?: boolean
  days_since_last_feeding?: number | null
}): string | null {
  if (s.needs_first_feeding) return FIRST_MEAL_NOT_LOGGED
  if (s.is_overdue && (s.days_since_last_feeding === null || s.days_since_last_feeding === undefined)) {
    return DUE_NO_MEAL_LOGGED
  }
  return null
}

/** True while the keeper's "hide for 14 days" is still running. Null or garbage = shown. */
export function nudgeHidden(hiddenAtIso: string | null, now: Date = new Date()): boolean {
  if (!hiddenAtIso) return false
  const t = new Date(hiddenAtIso).getTime()
  if (Number.isNaN(t)) return false
  return now.getTime() - t < NUDGE_HIDE_DAYS * 86400000
}

// ---- Email reminder ask (localStorage `email_reminder_ask_v1`) ----
//
// Two one-time asks, tracked separately: after the keeper saves an animal, and
// when something is due. The due ask does NOT depend on the after-save one.
// Never asked when the daily email reminder is already on, nor when the keeper
// has turned the daily digest off (the email rides on it: they said no to reminders).

export type AskState = { afterSaveShown: boolean; dueShown: boolean }

export const EMAIL_ASK_STORAGE_KEY = 'email_reminder_ask_v1'

export function shouldAskAfterSave(s: AskState, emailOn: boolean, digestOn: boolean = true): boolean {
  return digestOn && !emailOn && !s.afterSaveShown
}

export function shouldAskWhenDue(
  s: AskState,
  emailOn: boolean,
  anyDue: boolean,
  digestOn: boolean = true,
): boolean {
  return digestOn && !emailOn && anyDue && !s.dueShown
}

/** Tolerates null, garbage and partial JSON: anything not literally `true` is false. */
export function parseAskState(raw: string | null): AskState {
  const state: AskState = { afterSaveShown: false, dueShown: false }
  if (!raw) return state
  try {
    const v: unknown = JSON.parse(raw)
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      state.afterSaveShown = o.afterSaveShown === true
      state.dueShown = o.dueShown === true
    }
  } catch {
    // keep defaults
  }
  return state
}

export const FIRST_FEEDING_COPY = Object.freeze({
  // Welcome
  welcomeTitle: 'Welcome to Tarantuverse',
  welcomeLine: "Let's add your first animal. It takes about a minute.",
  welcomeAdd: 'Add your first animal',
  welcomeImport: 'Import a spreadsheet',
  welcomeLookAround: 'Look around first',

  // Add form
  lastFedLabel: 'When did it last eat?',
  chipToday: 'Today',
  chipYesterday: 'Yesterday',
  chipPickDate: 'Pick a date',
  chipNotSure: 'Not sure',
  lastFedHint: "Not sure is fine. We'll remind you to log its first meal.",

  // Email ask (web)
  emailAskAfterSaveTitle: (name: string) => `Want an email when ${name} is due?`,
  emailAskWhenDueTitle: 'Want an email on days something is due?',
  emailAskBody: 'On days something is due, at most once a day. You can turn it off any time.',
  emailAskAccept: 'Email me',
  emailAskDecline: 'Not now',

  // Nudge card
  nudgeTitle: 'First feeding not logged',
  nudgeRowButton: 'When did it last eat?',
  nudgeChipToday: 'Today',
  nudgeChipYesterday: 'Yesterday',
  nudgeChipPickDate: 'Pick a date',
  nudgeChipNotYet: 'Not yet',
  nudgeHideLabel: 'Hide for 14 days',

  // Status labels
  firstMealNotLogged: FIRST_MEAL_NOT_LOGGED,
  dueNoMealLogged: DUE_NO_MEAL_LOGGED,

  // Settings
  dailyEmailSwitch: 'Daily email reminder',
  dailyEmailHelp: 'An email on days something is due, at your reminder hour.',

  // Import page
  importLastFedHelp: 'Have a "last fed" column? We\'ll log that feeding for each animal.',

  // Unsubscribe page
  unsubscribeHeading: 'Stop daily email reminders?',
  unsubscribeButton: 'Unsubscribe',
  unsubscribeOk: "You're unsubscribed from daily email reminders.",
  unsubscribeBad: "This unsubscribe link isn't valid.",
})
