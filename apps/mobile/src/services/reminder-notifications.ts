/**
 * Notification buttons for feeding reminders (Effortless logging, task 4).
 *
 * `registerReminderCategories` teaches the OS the button sets; the server's
 * pushes name them with `categoryId`. `handleNotificationResponse` is the one
 * place a tap becomes an action — it is dependency-injected so it is testable
 * without native modules. No new native module: expo-notifications is already
 * in the binary, and every native call here is wrapped so a missing API is a
 * warning, never a crash.
 */
import { resolveDeeplink } from '../lib/deeplinks';
import { actionFromIdentifier, toastFor, type ReminderAction } from '../lib/reminder-actions';

export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export interface ReminderResult {
  action: ReminderAction;
  created: boolean;
  animal_name: string;
  message: string;
}

export interface ResponseLike {
  actionIdentifier: string;
  notification: {
    request: {
      identifier?: string;
      content: { data?: Record<string, unknown> | null };
    };
  };
}

export interface ResponseDeps {
  post: (invertId: string, body: { action: ReminderAction; reminder_date: string }) => Promise<ReminderResult>;
  navigate: (href: string) => void;
  showToast: (text: string) => void;
  isSignedIn: () => boolean;
  /**
   * Removes the notification from the tray. Android never auto-dismisses on an
   * action-button tap, so a handled button must clear it itself. Optional and
   * never allowed to throw.
   */
  dismiss?: (notificationId: string) => Promise<void> | void;
}

/** Local calendar day as YYYY-MM-DD (fallback when a push has no reminder_date). */
function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function errorText(err: any): string | undefined {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  return undefined;
}

export async function handleNotificationResponse(response: ResponseLike, deps: ResponseDeps): Promise<void> {
  const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
  const id = response?.actionIdentifier ?? DEFAULT_ACTION;

  if (id === 'open_feeding_day') {
    deps.navigate('/feeding-day');
    return;
  }

  const action = actionFromIdentifier(id);
  if (action) {
    const dismissIt = async () => {
      const notificationId = response?.notification?.request?.identifier;
      if (!notificationId || !deps.dismiss) return;
      try {
        await deps.dismiss(notificationId);
      } catch (error) {
        console.warn('[Reminders] could not dismiss notification', error);
      }
    };
    // Signed out: never log anything. Open the animal's link instead (the app
    // shows sign-in first) so the tap is never silently swallowed.
    if (!deps.isSignedIn()) {
      const signedOutHref = resolveDeeplink(typeof data.deeplink === 'string' ? data.deeplink : null);
      if (signedOutHref) {
        deps.navigate(signedOutHref);
        await dismissIt();
      }
      return;
    }
    const invertId = typeof data.invert_id === 'string' ? data.invert_id : null;
    if (!invertId) return;
    const reminderDate = typeof data.reminder_date === 'string' && data.reminder_date ? data.reminder_date : localToday();
    try {
      const result = await deps.post(invertId, { action, reminder_date: reminderDate });
      deps.showToast(toastFor(result));
    } catch (err) {
      deps.showToast(toastFor(null, errorText(err)));
    }
    await dismissIt();
    return;
  }

  // Body tap (default action): follow the server's deeplink if we know it.
  const href = resolveDeeplink(typeof data.deeplink === 'string' ? data.deeplink : null);
  if (href) deps.navigate(href);
}

/** Registers the two button sets. Safe to call repeatedly; never throws. */
export async function registerReminderCategories(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    if (typeof Notifications?.setNotificationCategoryAsync !== 'function') {
      console.warn('[Reminders] notification categories are not available in this build');
      return;
    }
    const opts = { opensAppToForeground: true };
    await Notifications.setNotificationCategoryAsync('feeding_due', [
      { identifier: 'fed', buttonTitle: 'Fed', options: opts },
      { identifier: 'refused', buttonTitle: 'Refused', options: opts },
      { identifier: 'tomorrow', buttonTitle: 'Tomorrow', options: opts },
    ]);
    await Notifications.setNotificationCategoryAsync('feeding_summary', [
      { identifier: 'open_feeding_day', buttonTitle: 'Open Feeding Day', options: opts },
    ]);
  } catch (error) {
    console.warn('[Reminders] could not register notification categories', error);
  }
}
