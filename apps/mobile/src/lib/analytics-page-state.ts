/**
 * Which block of the Analytics page shows, as pure functions (no React, no
 * network) so jest can pin every README §3 state. The screen
 * `app/analytics/index.tsx` feeds it what it knows and renders the answer.
 *
 * Mirrors the web page (`apps/web/src/app/dashboard/analytics/page.tsx`).
 */

export type LoadStatus = 'loading' | 'ready' | 'error';
/** What the keeper's plan is: 'unknown' until `/promo-codes/me/limits` has answered once. */
export type PlanState = 'unknown' | 'free' | 'premium';
export type AdvancedStatus = 'idle' | 'loading' | 'ready' | 'gated' | 'error';

export type PageBody = 'loading' | 'error' | 'empty' | 'content';
export type PremiumKind = 'loading' | 'error' | 'member' | 'preview' | 'sample';

/**
 * The main body: the skeleton while `/collection` is pending, the error card when
 * it failed (never the empty-state copy after a failure), the empty card with
 * zero animals, else the cards.
 */
export function pageBody(status: LoadStatus, animals: number): PageBody {
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return animals > 0 ? 'content' : 'empty';
}

/**
 * The Premium slot under the free cards; null when it must not render at all
 * (still loading, or `/collection` failed).
 *
 *   plan unknown            -> a skeleton (a member never sees the preview flash)
 *   free                    -> the blurred preview, or the grey sample with zero animals
 *   Premium, /advanced/ ok  -> the member cards
 *   Premium, 402            -> the preview / sample (the server says not Premium after all)
 *   Premium, other error    -> the one-card "couldn't load your Premium insights"
 *   Premium, pending        -> a skeleton
 */
export function premiumKind(args: {
  status: LoadStatus;
  animals: number;
  plan: PlanState;
  advanced: AdvancedStatus;
}): PremiumKind | null {
  if (args.status !== 'ready') return null;
  const fallback: PremiumKind = args.animals > 0 ? 'preview' : 'sample';
  if (args.plan === 'unknown') return 'loading';
  if (args.plan === 'free') return fallback;
  if (args.advanced === 'ready') return 'member';
  if (args.advanced === 'gated') return fallback;
  if (args.advanced === 'error') return 'error';
  return 'loading';
}

/** True when a screen that was left and returned to should quietly refetch (data older than `maxAgeMs`). */
export function isStale(fetchedAtMs: number | null, nowMs: number, maxAgeMs = 30_000): boolean {
  return fetchedAtMs != null && nowMs - fetchedAtMs > maxAgeMs;
}

/**
 * The plan when `/promo-codes/me/limits` could not be read. Never assume "free": a
 * paying member on a bad connection would see the paywall. An unknown plan is
 * probed with `/analytics/advanced/` instead (200 = member, 402 = the free
 * preview, other failure = the "couldn't load your Premium insights" card);
 * an answer we already had stays.
 */
export function planOnLimitsError(current: PlanState): PlanState {
  return current === 'unknown' ? 'premium' : current;
}

/** The plan from a `/promo-codes/me/limits` body. Anything unreadable is free (the same fallback the web hook uses). */
export function planFromLimits(body: unknown): PlanState {
  return (body as { is_premium?: unknown } | null | undefined)?.is_premium === true ? 'premium' : 'free';
}
