/**
 * First-run routing — who sees the welcome carousel, and who must not.
 *
 * THE TRAP THIS EXISTS TO AVOID
 * ----------------------------
 * `app/onboarding.tsx` shipped a long time ago and was never wired up: nothing
 * navigated to it, so `onboarding_completed` was never written for ANYBODY.
 * That makes the obvious implementation — "show it when the flag is unset" —
 * actively wrong. It would greet every existing keeper with a four-screen
 * tutorial on their next login, including people with hundreds of animals.
 *
 * So membership is decided by "is this account new", never by the flag alone:
 *
 *   - OAuth: the server already tells us. `POST /auth/oauth-login` returns
 *     `is_new_user` (schemas/oauth.py) and the client was throwing it away.
 *   - Password register: the register screen doesn't log you in, so the signal
 *     has to survive a trip to the login screen. It's parked in
 *     ONBOARDING_PENDING and consumed by the next successful login.
 *
 * An existing keeper has no pending marker and gets `is_new_user: false`, so
 * they route straight to the tabs. That property is the whole point — if you
 * change this file, keep it.
 *
 * PENDING vs COMPLETED are deliberately two keys. Pending means "owed a
 * carousel", completed means "has seen it". Two keys make the flow resumable:
 * force-quit halfway through and the next cold start picks it back up
 * (app/index.tsx), rather than silently skipping it forever.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED = 'onboarding_completed';
export const ONBOARDING_PENDING = 'onboarding_pending';

/** Post-auth destination. Pass the server's `is_new_user` when you have it. */
export type PostAuthRoute = '/onboarding' | '/(tabs)';

/**
 * Called when a password registration succeeds, so the next login knows this
 * person is new. Registration doesn't establish a session, which is why this
 * can't just be a variable.
 */
export async function markOnboardingPending(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_PENDING, 'true');
  } catch {
    // Non-fatal: they miss the carousel, they don't lose their account.
  }
}

/** Carousel finished (or skipped). Clears both keys. */
export async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ONBOARDING_PENDING]);
    await AsyncStorage.setItem(ONBOARDING_COMPLETED, 'true');
  } catch {
    // Non-fatal.
  }
}

/**
 * Where to send someone who just authenticated.
 *
 * `isNewUser` comes from the OAuth response. Password logins pass nothing and
 * rely on the pending marker left by registration.
 *
 * Fails toward the tabs on any storage error — showing the app to someone who
 * was owed a tutorial is a much smaller problem than blocking their way in.
 */
export async function resolvePostAuthRoute(isNewUser = false): Promise<PostAuthRoute> {
  try {
    const [completed, pending] = await AsyncStorage.multiGet([
      ONBOARDING_COMPLETED,
      ONBOARDING_PENDING,
    ]);
    if (completed[1] === 'true') return '/(tabs)';
    if (isNewUser || pending[1] === 'true') return '/onboarding';
    return '/(tabs)';
  } catch (error) {
    // Logged, not swallowed silently. A broken read here disables onboarding
    // for everyone, permanently, and looks identical to the feature simply
    // being off — which is exactly how a test harness bug fooled me while this
    // was being written. If first-run ever "just stops working", look here.
    console.warn('[onboarding] could not read first-run flags; skipping', error);
    return '/(tabs)';
  }
}

/**
 * Cold-start variant: no auth event to read `is_new_user` from, so only a
 * pending marker can route someone to the carousel. This is what makes a
 * force-quit mid-onboarding resumable.
 */
export async function resolveColdStartRoute(): Promise<PostAuthRoute> {
  return resolvePostAuthRoute(false);
}
