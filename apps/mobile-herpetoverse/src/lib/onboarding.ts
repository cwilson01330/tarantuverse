/**
 * First-run routing for Herpetoverse mobile (HV day one, 2026-11-18) — who
 * sees the welcome screen, and who must not. Mirrors Tarantuverse
 * apps/mobile/src/lib/onboarding.ts; HV's tabs land on the dashboard.
 *
 * THE TRAP THIS EXISTS TO AVOID
 * ----------------------------
 * Nothing on HV has ever written `onboarding_completed` (the screen is new),
 * so "show it when the flag is unset" would greet every existing keeper with
 * a welcome screen on their next sign-in. Membership is decided by "is this
 * account new", never by the flag alone:
 *
 *   - Password sign-up: register.tsx parks ONBOARDING_PENDING on success. With
 *     email verification on, the keeper signs in later from the login screen,
 *     so the marker has to outlive that trip; it's consumed by the next
 *     successful sign-in (or cold start).
 *   - Google / Apple: the sign-in helpers return the server's `is_new_user`
 *     (true when the social sign-in just created the account), and callers
 *     pass it as `isNewUser`; a pending marker routes here too.
 *
 * An existing keeper has no pending marker, so they go straight to the
 * dashboard. That property is the whole point — if you change this file, keep
 * it.
 *
 * PENDING vs COMPLETED are deliberately two keys. Pending means "owed the
 * welcome", completed means "has seen it". Two keys make the flow resumable:
 * force-quit before choosing and the next cold start (app/index.tsx) picks it
 * back up, rather than silently skipping it forever.
 *
 * A parked transfer claim (lib/claim.ts takePostAuthRoute) always wins over
 * this: callers check it first. The pending marker survives, so the welcome
 * shows on the next cold start instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED = 'onboarding_completed';
export const ONBOARDING_PENDING = 'onboarding_pending';

/** Post-auth destination. */
export type PostAuthRoute = '/onboarding' | '/(tabs)/dashboard';

const DASHBOARD: PostAuthRoute = '/(tabs)/dashboard';

/**
 * Called when a password sign-up succeeds, so the next sign-in knows this
 * person is new. Never throws: a storage hiccup must not surface as a failed
 * registration.
 */
export async function markOnboardingPending(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_PENDING, 'true');
  } catch {
    // Non-fatal: they miss the welcome, they don't lose their account.
  }
}

/** Welcome finished (any of its buttons). Clears pending, sets completed. Never throws. */
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
 * Fails toward the dashboard on any storage error — showing the app to someone
 * who was owed a welcome is a much smaller problem than blocking their way in.
 */
export async function resolvePostAuthRoute(isNewUser = false): Promise<PostAuthRoute> {
  try {
    const [completed, pending] = await AsyncStorage.multiGet([
      ONBOARDING_COMPLETED,
      ONBOARDING_PENDING,
    ]);
    if (completed[1] === 'true') return DASHBOARD;
    if (isNewUser || pending[1] === 'true') return '/onboarding';
    return DASHBOARD;
  } catch (error) {
    // Logged, not swallowed silently: a broken read here disables the welcome
    // for everyone and looks identical to the feature simply being off.
    console.warn('[onboarding] could not read first-run flags; skipping', error);
    return DASHBOARD;
  }
}

/**
 * Cold-start variant: no auth event, so only a pending marker can route to the
 * welcome. This is what makes a force-quit mid-welcome resumable.
 */
export async function resolveColdStartRoute(): Promise<PostAuthRoute> {
  return resolvePostAuthRoute(false);
}
