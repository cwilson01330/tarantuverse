/**
 * Server-controlled feature switches (forums pause) — see the shared half below the marker.
 * Mobile transport: the app's axios client (base /api/v1), one GET /system/status per app session;
 * the last known value is kept in AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../services/api';

let statusPromise: Promise<unknown> | null = null;

/** The public system status. One request per app session; a failure resolves null (and is retried next time). */
export function getSystemStatus(): Promise<unknown> {
  if (!statusPromise) {
    statusPromise = apiClient
      .get('/system/status')
      .then((res) => res.data as unknown)
      .catch(() => null)
      .then((data) => {
        if (data === null) statusPromise = null;
        return data;
      });
  }
  return statusPromise;
}

/** The value saved by an earlier session, or null (also when storage fails or holds junk). */
export async function readSavedFeatures(): Promise<Features | null> {
  try {
    const raw = await AsyncStorage.getItem(FEATURES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.forumsEnabled === 'boolean' ? { forumsEnabled: parsed.forumsEnabled } : null;
  } catch {
    return null;
  }
}

export async function saveFeatures(features: Features): Promise<void> {
  try {
    await AsyncStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(features));
  } catch {
    // storage errors are ignored: the in-memory value still works for this session
  }
}

// ---- shared below: keep identical in both copies ----

/** Switches the server can flip without an app release. */
export type Features = { forumsEnabled: boolean };

/** Used when nothing is known yet (no saved value, fetch failed): forums OFF. */
export const DEFAULT_FEATURES: Features = { forumsEnabled: false };

/** Where the last known value is kept on the device (web localStorage, mobile AsyncStorage). */
export const FEATURES_STORAGE_KEY = 'features_v1';

/** Reads `features.forums_enabled` from the public status payload. null = wrong shape. */
export function featuresFromStatus(status: unknown): Features | null {
  if (!status || typeof status !== 'object') return null;
  const features = (status as { features?: unknown }).features;
  if (!features || typeof features !== 'object') return null;
  const forums = (features as { forums_enabled?: unknown }).forums_enabled;
  if (typeof forums !== 'boolean') return null;
  return { forumsEnabled: forums };
}

/** Fresh read wins, then the saved value, then the default (forums OFF). */
export function pickFeatures(fetched: Features | null, saved: Features | null): Features {
  return fetched ?? saved ?? DEFAULT_FEATURES;
}

/**
 * True once the answer is final enough to act on: a value is already known (this session's cache or a
 * saved one), or the fetch has settled (success OR failure, so a failed fetch with nothing saved ends
 * on the OFF default rather than a permanent blank).
 */
export function featuresReady(state: { cached: boolean; saved: Features | null; settled: boolean }): boolean {
  return state.cached || state.saved !== null || state.settled;
}

/** Links only: no claims about these communities and no affiliation. One list, one place to edit. */
export const OUTSIDE_COMMUNITIES: { label: string; url: string }[] = [
  { label: 'r/tarantulas', url: 'https://www.reddit.com/r/tarantulas/' },
  { label: 'r/jumpingspiders', url: 'https://www.reddit.com/r/jumpingspiders/' },
  { label: 'Arachnoboards', url: 'https://arachnoboards.com/' },
];

export const FORUMS_PAUSED_TITLE = 'Forums are paused';
export const FORUMS_PAUSED_BODY =
  "The forums were quiet, so we've put them away for now. Nothing has been deleted. To talk with other keepers, try these communities:";
