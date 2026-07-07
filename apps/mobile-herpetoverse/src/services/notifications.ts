/**
 * Local notifications for Herpetoverse mobile.
 *
 * v1 scope is intentionally small: feeding reminders + quiet hours.
 * Shed reminders, push notifications, and community-driven pushes are
 * out (Herpetoverse has no community surface yet, so a push token
 * wouldn't drive anything). We can layer them in later by adding
 * functions here — the LogFeedingScreen hook is the only call site for
 * now.
 *
 * Trigger SHAPE: SDK 53+ requires `SchedulableTriggerInputTypes.TIME_INTERVAL`
 * explicitly. The older `{ seconds: N }` shorthand silently fires
 * immediately on SDK 53+ (Tarantuverse hit this on 2026-05-01) — never
 * use it here.
 *
 * RESILIENCE: every public function wraps `expo-notifications` calls in
 * try/catch. If the native module isn't linked (e.g. an OTA update onto
 * a binary that pre-dates this change), reminders silently no-op rather
 * than crashing the screen that called them.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Expo Go (SDK 53+) doesn't support remote pushes and has limited
// scheduling fidelity. We still let local notifications run in Expo Go
// for development, but skip the `setNotificationHandler` install if it
// errors there.
let isExpoGo = false;
try {
  isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo';
} catch {
  isExpoGo = false;
}

// Configure how a notification renders while the app is foregrounded.
// Wrapped so module init never throws if the native module is missing.
try {
  // SDK 53+ added `shouldShowBanner` + `shouldShowList`. The older
  // `shouldShowAlert` still works (maps to both internally) but the new
  // fields are clearer about foreground banner vs notification-center
  // list visibility — see expo-notifications 0.29 changelog.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (err) {
  console.warn('[notifications] setNotificationHandler failed:', err);
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" 24h local time, e.g. "22:00" */
  start: string;
  /** "HH:MM" 24h local time, e.g. "08:00" */
  end: string;
}

const FEEDING_KEY = (animalId: string) => `hv_feeding_reminder_${animalId}`;

/**
 * Ask the OS for permission to post local notifications. Idempotent —
 * returns true if already granted, otherwise prompts and returns the
 * resolved decision.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.status === 'granted';
  } catch (err) {
    console.warn('[notifications] permission request failed:', err);
    return false;
  }
}

/** True if the OS has already granted notification permission. */
export async function hasNotificationPermissions(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Get this device's Expo push token so the server can deliver the daily
 * feeding digest (ADR-009). Without this, HV mobile only ever scheduled
 * LOCAL reminders and never registered a token — so server-sent pushes
 * had nowhere to go.
 *
 * Push tokens aren't available in Expo Go (SDK 53+), so we no-op there.
 * The `projectId` is read from THIS app's EAS config — never hardcode the
 * Tarantuverse id, or getExpoPushTokenAsync throws and no token is saved.
 * Returns null on any failure so callers can fire-and-forget.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (isExpoGo) {
    console.log(
      '[notifications] push tokens are unavailable in Expo Go — use a dev/prod build.',
    );
    return null;
  }

  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    // Read the HV app's own EAS projectId from app.json
    // (extra.eas.projectId). Fall back to easConfig for older runtimes.
    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    if (!projectId) {
      console.warn('[notifications] no EAS projectId found — skipping push token.');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (err) {
    console.warn('[notifications] getExpoPushToken failed:', err);
    return null;
  }
}

/**
 * Shift a target offset forward when it would land inside the keeper's
 * quiet hours, so reminders don't buzz at 3am. Cross-midnight windows
 * (e.g. 22:00 → 08:00) are handled.
 *
 * Returns the original offset if the target is outside the window or if
 * quiet hours are disabled / malformed.
 */
export function adjustForQuietHours(
  secondsFromNow: number,
  quietHours: QuietHours | undefined,
): number {
  if (!quietHours?.enabled) return secondsFromNow;
  const startMin = parseHHMM(quietHours.start);
  const endMin = parseHHMM(quietHours.end);
  if (startMin == null || endMin == null) return secondsFromNow;
  // Same start/end means an empty window — nothing to adjust.
  if (startMin === endMin) return secondsFromNow;

  const now = new Date();
  const target = new Date(now.getTime() + secondsFromNow * 1000);
  const targetMin = target.getHours() * 60 + target.getMinutes();

  const sameDay = startMin < endMin;
  const inWindow = sameDay
    ? targetMin >= startMin && targetMin < endMin
    : targetMin >= startMin || targetMin < endMin;

  if (!inWindow) return secondsFromNow;

  // Shift to the end-of-quiet-hours boundary on whichever day applies.
  const shifted = new Date(target);
  shifted.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  if (shifted <= target) {
    shifted.setDate(shifted.getDate() + 1);
  }
  const adjusted = Math.round((shifted.getTime() - now.getTime()) / 1000);
  return Math.max(60, adjusted);
}

function parseHHMM(value: string): number | null {
  const m = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Schedule (or re-schedule) a feeding reminder for a single animal.
 * Cancels any prior reminder for the same animal first, so saving a new
 * feeding never stacks duplicates.
 *
 * Returns the notification ID on success, or null on failure / when
 * permission is missing.
 */
export async function scheduleFeedingReminder(
  animalId: string,
  animalName: string,
  hoursUntilReminder: number,
  quietHours?: QuietHours,
): Promise<string | null> {
  try {
    await cancelFeedingReminder(animalId);

    const granted = await hasNotificationPermissions();
    if (!granted) return null;

    const baseSeconds = Math.max(60, Math.round(hoursUntilReminder * 3600));
    const adjustedSeconds = adjustForQuietHours(baseSeconds, quietHours);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to feed ${animalName}`,
        body: `It's been ${hoursUntilReminder} hours since ${animalName}'s last feeding.`,
        sound: true,
        data: { type: 'feeding_reminder', animalId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: adjustedSeconds,
      },
    });

    await AsyncStorage.setItem(FEEDING_KEY(animalId), id);
    return id;
  } catch (err) {
    console.warn('[notifications] scheduleFeedingReminder failed:', err);
    return null;
  }
}

/** Cancel a previously-scheduled feeding reminder for one animal. */
export async function cancelFeedingReminder(animalId: string): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(FEEDING_KEY(animalId));
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(FEEDING_KEY(animalId));
  } catch (err) {
    console.warn('[notifications] cancelFeedingReminder failed:', err);
  }
}

/** Cancel every scheduled local notification this app owns. */
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[notifications] cancelAllReminders failed:', err);
  }
}

/** Exposed for tests / debugging. */
export const __isExpoGo = isExpoGo;
