/**
 * When to ask for notification permission (Day-one, 2026-10-27). Pure: the
 * caller reads/writes AsyncStorage under ASK_STORAGE_KEY and the OS permission.
 *
 * Two one-time asks, tracked separately:
 *  - after the keeper saves an animal ("heads-up when {name} is due")
 *  - when something is due ("reminder on days something is due")
 * The due ask does NOT depend on the after-save one: an existing keeper who
 * was never asked after a save still gets the due ask once. Once the OS
 * permission is granted or denied we never ask again (denied is handled by
 * an "Open phone settings" button elsewhere).
 */

export type AskState = { afterSaveShown: boolean; dueShown: boolean }
export type Permission = 'granted' | 'denied' | 'undetermined'

export const ASK_STORAGE_KEY = 'notification_ask_v1'

export function shouldAskAfterSave(s: AskState, p: Permission): boolean {
  return p === 'undetermined' && !s.afterSaveShown
}

export function shouldAskWhenDue(s: AskState, p: Permission, anyDue: boolean): boolean {
  return p === 'undetermined' && anyDue && !s.dueShown
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
