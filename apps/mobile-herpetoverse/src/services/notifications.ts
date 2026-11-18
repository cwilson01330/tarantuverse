/**
 * Local notifications for Herpetoverse mobile.
 *
 * Local feeding / low-stock reminders + quiet hours, plus the push token the
 * server's daily digest is sent to (registerPushToken, `app: 'herpetoverse'`).
 * Nothing here prompts for the OS permission except
 * requestNotificationPermissions(), which is only called from a moment the
 * keeper chose (NotificationAskSheet, notification settings).
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
import { apiClient } from './api';
import type { Permission } from '../lib/notification-ask';

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
 * The OS notification permission, without prompting. 'denied' only when the OS
 * will not show its dialog again (iOS after a refusal); a refusal the OS will
 * still ask about again reads as 'undetermined'. Any failure (native module
 * missing on an old binary) reads as 'undetermined' so callers stay quiet.
 */
export async function getPermissionStatus(): Promise<Permission> {
  try {
    const res = await Notifications.getPermissionsAsync();
    if (res.status === 'granted') return 'granted';
    if (res.status === 'denied') return res.canAskAgain === true ? 'undetermined' : 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Get this device's Expo push token so the server can deliver the daily
 * feeding digest (ADR-009). NEVER prompts (HV day one, 2026-11-18): the OS
 * dialog is only ever raised from a moment the keeper chose (the pre-ask
 * sheet, or the notification settings screen) via
 * requestNotificationPermissions(). Without permission this returns null.
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
    if (!(await hasNotificationPermissions())) return null;

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
 * Save this device's push token with the server — only when the OS permission
 * is already granted (it never prompts). The device time zone rides along (the
 * digest hour is this phone's hour) and `app: 'herpetoverse'`, because the
 * server keeps one push address per app per account: without it the server
 * files this token as Tarantuverse's. Resolves true when a token was saved;
 * every failure (no permission, Expo Go, offline) is non-fatal and resolves
 * false.
 */
export async function registerPushToken(): Promise<boolean> {
  try {
    if ((await getPermissionStatus()) !== 'granted') return false;
    const token = await getExpoPushToken();
    if (!token) return false;
    await apiClient.post('/notification-preferences/push-token', {
      token,
      tz_offset_minutes: new Date().getTimezoneOffset(),
      app: 'herpetoverse',
    });
    return true;
  } catch {
    return false;
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

const LEGACY_FEEDING_PREFIX = 'hv_feeding_reminder_';

/**
 * One-time cleanup: cancel every per-meal "Time to feed" notification an older
 * build scheduled (the server digest + per-animal reminders replace them).
 * Cancels by stored id, then drops the keys. Never throws.
 */
export async function cancelAllFeedingReminders(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith(LEGACY_FEEDING_PREFIX),
    );
    if (keys.length === 0) return;
    for (const key of keys) {
      try {
        const id = await AsyncStorage.getItem(key);
        if (id) await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        /* keep going: one bad id must not strand the rest */
      }
    }
    await AsyncStorage.multiRemove(keys);
  } catch (err) {
    console.warn('[notifications] cancelAllFeedingReminders failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Low-stock feeder reminders (ADR-012 — feeder keeping)
// ---------------------------------------------------------------------------

const FEEDER_LOW_STOCK_KEY = (stockId: string) =>
  `hv_feeder_low_stock_${stockId}`;

/**
 * Schedule a "running low" reminder for a feeder stock that just crossed its
 * low-stock threshold. Best-effort and guarded — reuses the feeding-reminder
 * pattern: cancel any prior reminder for the same stock first (so re-saving
 * never stacks duplicates), then schedule a single nudge a fixed delay out.
 *
 * We deliberately keep this dumb: a fixed ~48h TIME_INTERVAL nudge rather than
 * a recurring alarm. The keeper sees the low-stock badge in-app immediately;
 * this is just a gentle "don't forget to restock" a couple days later. Quiet
 * hours are respected so it doesn't buzz at 3am.
 *
 * Returns the notification ID, or null on failure / missing permission.
 */
export async function scheduleLowStockReminder(
  stockId: string,
  feederName: string,
  quietHours?: QuietHours,
  hoursUntilReminder = 48,
): Promise<string | null> {
  try {
    await cancelLowStockReminder(stockId);

    const granted = await hasNotificationPermissions();
    if (!granted) return null;

    const baseSeconds = Math.max(60, Math.round(hoursUntilReminder * 3600));
    const adjustedSeconds = adjustForQuietHours(baseSeconds, quietHours);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${feederName} is running low`,
        body: `Your ${feederName} feeder stock has dropped below your low-stock threshold. Time to restock?`,
        sound: true,
        data: { type: 'feeder_low_stock', stockId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: adjustedSeconds,
      },
    });

    await AsyncStorage.setItem(FEEDER_LOW_STOCK_KEY(stockId), id);
    return id;
  } catch (err) {
    console.warn('[notifications] scheduleLowStockReminder failed:', err);
    return null;
  }
}

/** Cancel a previously-scheduled low-stock reminder (e.g. after a restock). */
export async function cancelLowStockReminder(stockId: string): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(FEEDER_LOW_STOCK_KEY(stockId));
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(FEEDER_LOW_STOCK_KEY(stockId));
  } catch (err) {
    console.warn('[notifications] cancelLowStockReminder failed:', err);
  }
}

/**
 * Reconcile a stock's low-stock reminder against its current state. Call this
 * after any inventory change: schedules a reminder when the stock is low and
 * doesn't already have one queued, and cancels the queued reminder once the
 * stock is back above threshold. Fully guarded — a no-op on any failure.
 */
export async function syncLowStockReminder(
  stockId: string,
  feederName: string,
  isLow: boolean,
  quietHours?: QuietHours,
): Promise<void> {
  try {
    if (isLow) {
      const existing = await AsyncStorage.getItem(
        FEEDER_LOW_STOCK_KEY(stockId),
      );
      if (!existing) {
        await scheduleLowStockReminder(stockId, feederName, quietHours);
      }
    } else {
      await cancelLowStockReminder(stockId);
    }
  } catch (err) {
    console.warn('[notifications] syncLowStockReminder failed:', err);
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
