/**
 * PostHog client for Herpetoverse mobile.
 *
 * Shares ONE PostHog project with Tarantuverse web, Herpetoverse web, and
 * (later) Tarantuverse mobile — identify() uses the shared user.id so a
 * single keeper shows up as one identity across all surfaces. Events are
 * tagged with `app: "herpetoverse-mobile"` so we can segment by surface.
 *
 * Fails open: if EXPO_PUBLIC_POSTHOG_KEY is unset, `posthog` stays null
 * and every capture / identify is a no-op. This lets us ship the plumbing
 * before a PostHog key is wired to the Expo build environment.
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
    // We send $screen events manually on navigation rather than relying
    // on the SDK's captureLifecycleEvents wiring — navigation events are
    // finicky with expo-router.
    captureAppLifecycleEvents: true,
    // No autocapture — only events we explicitly send.
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
  ph.identify(userId, { ...properties, app: 'herpetoverse-mobile' });
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
  ph.capture(event, { ...properties, app: 'herpetoverse-mobile' });
}

/** Capture a screen-view for navigation tracking. */
export function captureScreen(screenName: string) {
  const ph = getPostHog();
  if (!ph) return;
  ph.screen(screenName, { app: 'herpetoverse-mobile' });
}
