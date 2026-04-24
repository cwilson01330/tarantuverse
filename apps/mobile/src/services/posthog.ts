/**
 * PostHog client for Tarantuverse mobile.
 *
 * Shares ONE PostHog project with Tarantuverse web, Herpetoverse web, and
 * Herpetoverse mobile — `identify()` uses the shared user.id so a single
 * keeper resolves to one identity across every surface. Events are tagged
 * with `app: "tarantuverse-mobile"` so we can segment by platform.
 *
 * Fails open: if EXPO_PUBLIC_POSTHOG_KEY is unset, `posthog` stays null
 * and every capture / identify is a no-op. This lets the app keep
 * running (and keep shipping OTA updates) even if the key isn't wired
 * to the EAS build env yet.
 */
import PostHog from 'posthog-react-native';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export async function initPostHog(): Promise<PostHog | null> {
  if (posthog) return posthog;
  if (!POSTHOG_KEY) return null;

  posthog = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
  });
  await posthog.ready;
  return posthog;
}

export function getPostHog(): PostHog | null {
  return posthog;
}

/** Identify the signed-in keeper. */
export function identifyUser(
  userId: string,
  properties: Record<string, unknown> = {},
) {
  const ph = getPostHog();
  if (!ph) return;
  ph.identify(userId, { ...properties, app: 'tarantuverse-mobile' });
}

/** Drop identity on sign-out. */
export function resetPostHog() {
  const ph = getPostHog();
  if (!ph) return;
  ph.reset();
}

/** Capture a named event. */
export function captureEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  const ph = getPostHog();
  if (!ph) return;
  ph.capture(event, { ...properties, app: 'tarantuverse-mobile' });
}

/** Capture a screen-view for navigation tracking. */
export function captureScreen(screenName: string) {
  const ph = getPostHog();
  if (!ph) return;
  ph.screen(screenName, { app: 'tarantuverse-mobile' });
}
