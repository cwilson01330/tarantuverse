/**
 * First-feeding helpers (HV day one, 2026-11-18). Pure: no React, no fetch.
 * Mirrors Tarantuverse apps/mobile/src/lib/first-feeding.ts, with
 * "Herpetoverse" where TV names its product, the card titled "First meal not
 * logged" (the HV spec's wording, same as TV web), and the "No schedule"
 * label for plant-eaters with no keeper interval.
 *
 * Feeds the add-animal "When did it last eat?" chips, the status labels for
 * animals with no logged feeding, the dashboard's first-meal card, and the
 * notification asks. Keeper-facing day-one strings live in FIRST_FEEDING_COPY
 * so screens import one place.
 *
 * Rules:
 *  - A date the keeper picks is saved as LOCAL NOON of that day (ISO string).
 *    Dates are built from local parts, never by parsing 'YYYY-MM-DD', so a
 *    keeper west of UTC at 9 pm still gets today, not tomorrow.
 *  - 'not_sure' (and a missing or future pick) saves nothing: null.
 */

export type LastFedChoice = 'today' | 'yesterday' | 'pick' | 'not_sure';

/** The first-meal card stays hidden this long after the keeper taps its X. */
export const NUDGE_HIDE_DAYS = 14;

/** At most this many animals on the dashboard's first-meal card. */
export const FIRST_FEEDING_CARD_MAX = 3;

export const FIRST_MEAL_NOT_LOGGED = 'First meal not logged';
export const DUE_NO_MEAL_LOGGED = 'Due · no meal logged yet';
/** Plant-eater with no keeper interval: listed and feedable, never due. */
export const NO_SCHEDULE = 'No schedule';

function localNoon(y: number, m: number, d: number): string {
  return new Date(y, m, d, 12, 0, 0, 0).toISOString();
}

/** Local noon of the chosen day as an ISO string, or null when nothing should be saved. */
export function lastFedIso(
  choice: LastFedChoice,
  picked: Date | null,
  now: Date = new Date(),
): string | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (choice) {
    case 'today':
      return localNoon(y, m, d);
    case 'yesterday':
      // Date normalises d - 1 across month and year boundaries.
      return localNoon(y, m, d - 1);
    case 'pick': {
      if (!picked || Number.isNaN(picked.getTime())) return null;
      const py = picked.getFullYear();
      const pm = picked.getMonth();
      const pd = picked.getDate();
      const pickedDay = new Date(py, pm, pd).getTime();
      const today = new Date(y, m, d).getTime();
      if (pickedDay > today) return null;
      return localNoon(py, pm, pd);
    }
    default:
      return null;
  }
}

/**
 * A typed YYYY-MM-DD as that LOCAL calendar day (midnight), or null for any
 * other shape or an impossible day (2026-02-30). HV forms take dates as typed
 * text, so "Pick a date" goes through here before lastFedIso.
 */
export function parseLocalYmd(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

/** Why a typed "last meal" day can't be saved, or null when it can. */
export function lastFedPickError(text: string, now: Date = new Date()): string | null {
  const d = parseLocalYmd(text);
  if (!d) return 'Last meal date should be YYYY-MM-DD.';
  if (lastFedIso('pick', d, now) === null) return "Last meal date can't be in the future.";
  return null;
}

/**
 * Label for an animal with no logged feeding, or null (the caller keeps its
 * own text). `needs_first_feeding` wins over the overdue label.
 */
export function feedingStatusText(s: {
  needs_first_feeding?: boolean;
  is_overdue?: boolean;
  days_since_last_feeding?: number | null;
}): string | null {
  if (s.needs_first_feeding) return FIRST_MEAL_NOT_LOGGED;
  if (s.is_overdue && (s.days_since_last_feeding === null || s.days_since_last_feeding === undefined)) {
    return DUE_NO_MEAL_LOGGED;
  }
  return null;
}

/** The animals for the dashboard's first-meal card: flagged by the server, in its order, at most three. */
export function firstFeedingRows<T extends { needs_first_feeding?: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.needs_first_feeding === true).slice(0, FIRST_FEEDING_CARD_MAX);
}

/** True while the keeper's "hide for 14 days" is still running. Null or garbage = shown. */
export function nudgeHidden(hiddenAtIso: string | null, now: Date = new Date()): boolean {
  if (!hiddenAtIso) return false;
  const t = new Date(hiddenAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < NUDGE_HIDE_DAYS * 86400000;
}

export const FIRST_FEEDING_COPY = Object.freeze({
  // Welcome
  welcomeTitle: 'Welcome to Herpetoverse',
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

  // Push ask
  pushAskAfterSaveTitle: (name: string) => `Want a heads-up when ${name} is due to eat?`,
  pushAskWhenDueTitle: 'Want a reminder on days something is due?',
  pushAskBody: 'Reminders come at the hour you choose in Settings, only on days something is due.',
  pushAskAccept: 'Turn on reminders',
  pushAskDecline: 'Not now',

  // First-meal card
  nudgeTitle: FIRST_MEAL_NOT_LOGGED,
  nudgeRowButton: 'When did it last eat?',
  nudgeChipToday: 'Today',
  nudgeChipYesterday: 'Yesterday',
  nudgeChipPickDate: 'Pick a date',
  nudgeChipNotYet: 'Not yet',
  nudgeHideLabel: 'Hide for 14 days',

  // Status labels
  firstMealNotLogged: FIRST_MEAL_NOT_LOGGED,
  dueNoMealLogged: DUE_NO_MEAL_LOGGED,
  noSchedule: NO_SCHEDULE,

  // Settings
  dailyEmailSwitch: 'Daily email reminder',
  dailyEmailHelp: 'An email on days something is due, at your reminder hour.',
  openPhoneSettings: 'Open phone settings',
});
