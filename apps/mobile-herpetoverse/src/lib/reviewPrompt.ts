/**
 * In-app store review prompt (Herpetoverse mobile).
 *
 * Ground rules (docs/release/NEXT_NATIVE_BUILD.md, Apple 5.6.1, Play policy):
 *  - Ask only right after a success moment — a completed Feeding Day batch, a
 *    logged shed, the 3rd+ animal added. Never on launch, never mid-task, and
 *    never shortly after something failed.
 *  - At most once per app version and no more than every 90 days (AsyncStorage).
 *  - Gate on StoreReview.hasAction(). The OS rate-limits on top of this and may
 *    show nothing; that's fine.
 *  - No "do you like the app?" pre-prompt that filters for happy users. We call
 *    the native sheet directly or not at all.
 *
 * expo-store-review is a NATIVE module. It's loaded with a guarded dynamic
 * import so a JS bundle running on a binary without it (or any native failure)
 * degrades to "no prompt" instead of crashing — same pattern as services/iap.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

export type ReviewTrigger = 'feeding_day' | 'shed_logged' | 'animal_added';

const STORAGE_KEY = 'hv_review_prompt_v1';
const MIN_GAP_MS = 90 * 24 * 60 * 60 * 1000;
/** Don't ask within this long of a failed save/request in a review flow. */
const ERROR_COOLDOWN_MS = 10 * 60 * 1000;
/** Let the success navigation / sheet close settle before the system sheet. */
const SETTLE_DELAY_MS = 1200;

// Fallback when app.json has no android.playStoreUrl. iOS has no safe fallback
// without the App Store ID, so it relies on ios.appStoreUrl in app.json.
const ANDROID_STORE_FALLBACK =
  'https://play.google.com/store/apps/details?id=com.herpetoverse.app';

type StoreReviewModule = typeof import('expo-store-review');

let storeReview: StoreReviewModule | null = null;
let loadFailed = false;
let inFlight = false;
let lastErrorAt = 0;

async function loadStoreReview(): Promise<StoreReviewModule | null> {
  if (loadFailed) return null;
  if (storeReview) return storeReview;
  try {
    // Binaries built before expo-store-review was added don't have the
    // native module; importing it there throws, so check first.
    const { requireOptionalNativeModule } = await import('expo');
    if (!requireOptionalNativeModule('ExpoStoreReview')) {
      loadFailed = true;
      return null;
    }
    storeReview = await import('expo-store-review');
    return storeReview;
  } catch {
    loadFailed = true;
    return null;
  }
}

/**
 * Record a failure in one of the review-trigger flows. Suppresses the prompt
 * for a while so a keeper is never asked to rate the app right after
 * something went wrong.
 */
export function noteReviewBlockingError(): void {
  lastErrorAt = Date.now();
}

type PromptState = { version?: string; at?: number; trigger?: string };

async function readState(): Promise<PromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PromptState) : {};
  } catch {
    return {};
  }
}

/**
 * Maybe show the native review sheet. Fire-and-forget: never throws, never
 * blocks the caller. Call ONLY from a success path.
 */
export async function maybeRequestReview(trigger: ReviewTrigger): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    if (__DEV__) return;
    if (Date.now() - lastErrorAt < ERROR_COOLDOWN_MS) return;

    const version = Constants.expoConfig?.version ?? 'unknown';
    const state = await readState();
    if (state.version === version) return;
    if (typeof state.at === 'number' && Date.now() - state.at < MIN_GAP_MS) return;

    const SR = await loadStoreReview();
    if (!SR) return;
    if (!(await SR.hasAction())) return;

    await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS));
    // Re-check: a failure may have happened while we waited.
    if (Date.now() - lastErrorAt < ERROR_COOLDOWN_MS) return;

    // Record first so a native failure can't make us retry on every success.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version, at: Date.now(), trigger } satisfies PromptState),
    ).catch(() => {});
    await SR.requestReview();
  } catch {
    // Never let a review prompt surface an error to the keeper.
  } finally {
    inFlight = false;
  }
}

/**
 * The store page for the "Rate the app" row, or null when it can't be
 * resolved (iOS without ios.appStoreUrl in app.json). Callers hide the row
 * on null rather than show a dead control.
 */
export async function getStorePageUrl(): Promise<string | null> {
  try {
    const SR = await loadStoreReview();
    const url = SR?.storeUrl?.() ?? null;
    if (url) return url;
  } catch {
    // fall through
  }
  return Platform.OS === 'android' ? ANDROID_STORE_FALLBACK : null;
}

/** Open the store page. Resolves false if it couldn't be opened. */
export async function openStorePage(): Promise<boolean> {
  const url = await getStorePageUrl();
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
