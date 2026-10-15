/**
 * In-app store review prompt (expo-store-review). See
 * docs/release/NEXT_NATIVE_BUILD.md for the ground rules:
 *
 *  - Ask only right after a success moment (a completed Feeding Day batch, a
 *    logged molt, the 3rd+ animal added). Never on launch, mid-task, or after
 *    an error — callers only call this from success paths.
 *  - Gated on StoreReview.hasAction(); at most once per app version and at
 *    least 90 days apart (AsyncStorage). The OS rate-limits on top of that
 *    and may show nothing.
 *  - No home-made "Enjoying the app?" pre-prompt that filters for happy
 *    users (Apple 5.6.1 / Play policy). The OS sheet is the only UI.
 *
 * expo-store-review is NATIVE. This JS could in principle land on a binary
 * built without it, where importing it throws at module load. So it is never
 * imported statically: we check the native module exists, then import it
 * lazily inside try/catch, and every failure is swallowed. Nothing here can
 * crash the app or block the caller.
 */
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';

export type ReviewTrigger = 'feeding_day' | 'molt_logged' | 'animal_added';

const KEY_LAST_AT = 'review_prompt:last_at';
const KEY_LAST_VERSION = 'review_prompt:last_version';
const KEY_ANIMALS_ADDED = 'review_prompt:animals_added';

const MIN_DAYS_BETWEEN = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Let the success UI (toast, navigation, alert dismiss) settle first. */
const SETTLE_MS = 1200;
/** "3rd+ animal": counted on this device, since the prompt shipped. */
const ANIMALS_BEFORE_ASKING = 3;

// Fallbacks when app.json's store URLs aren't available at runtime.
const IOS_STORE_URL = 'https://apps.apple.com/app/id6756224640';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tarantuverse.app';

type StoreReviewModule = typeof import('expo-store-review');

let mod: StoreReviewModule | null = null;
let loadFailed = false;
let inFlight = false;

async function loadStoreReview(): Promise<StoreReviewModule | null> {
  if (mod) return mod;
  if (loadFailed) return null;
  try {
    // Missing native module (an older binary) → stay out of the way.
    if (!requireOptionalNativeModule('ExpoStoreReview')) {
      loadFailed = true;
      return null;
    }
    mod = await import('expo-store-review');
    return mod;
  } catch {
    loadFailed = true;
    return null;
  }
}

function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

/**
 * Ask the OS to show its review sheet if the rules allow it. Fire-and-forget:
 * never throws, never awaits anything the caller depends on.
 *
 * `countOnly` (animal_added): record the add but don't ask — for adds in the
 * middle of a task, like "Save & add another".
 */
export function maybeRequestReview(
  trigger: ReviewTrigger,
  opts: { countOnly?: boolean } = {},
): void {
  void (async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      if (trigger === 'animal_added') {
        const n = Number((await AsyncStorage.getItem(KEY_ANIMALS_ADDED)) ?? '0') + 1;
        await AsyncStorage.setItem(KEY_ANIMALS_ADDED, String(n));
        if (n < ANIMALS_BEFORE_ASKING) return;
      }
      if (opts.countOnly) return;

      const [lastAt, lastVersion] = await Promise.all([
        AsyncStorage.getItem(KEY_LAST_AT),
        AsyncStorage.getItem(KEY_LAST_VERSION),
      ]);
      const version = appVersion();
      if (lastVersion === version) return;
      if (lastAt && Date.now() - Number(lastAt) < MIN_DAYS_BETWEEN * DAY_MS) return;

      const StoreReview = await loadStoreReview();
      if (!StoreReview) return;
      if (!(await StoreReview.hasAction())) return;

      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      // Record BEFORE asking: the OS may silently show nothing, and either
      // way this version has had its one ask.
      await AsyncStorage.multiSet([
        [KEY_LAST_AT, String(Date.now())],
        [KEY_LAST_VERSION, version],
      ]);
      await StoreReview.requestReview();
    } catch {
      // Never surface review-prompt failures.
    } finally {
      inFlight = false;
    }
  })();
}

/** The app's store page — for the always-available "Rate the app" row. */
export async function openStorePage(): Promise<void> {
  let url: string | null = null;
  try {
    const StoreReview = await loadStoreReview();
    url = StoreReview?.storeUrl() ?? null;
  } catch {
    url = null;
  }
  if (!url) url = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing useful to tell the keeper; the row simply does nothing.
  }
}
