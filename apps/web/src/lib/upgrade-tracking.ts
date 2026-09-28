'use client'

/**
 * Upgrade-prompt attribution.
 *
 * Every upgrade prompt says WHY it opened (`source`), and that source rides
 * along to the pricing/subscription screen and into the purchase event. Until
 * this existed there was no way to tell whether a subscription came from the
 * animal cap, the breeding gate, or a feature preview — so no premium
 * feature could be judged by whether it actually sells.
 *
 * KEEP IN LOCKSTEP across the four apps (same event names, same source
 * vocabulary), or PostHog funnels split in two:
 *   apps/mobile/src/lib/upgrade-tracking.ts
 *   apps/mobile-herpetoverse/src/lib/upgrade-tracking.ts
 *   apps/web/src/lib/upgrade-tracking.ts
 *   apps/web-herpetoverse/src/lib/upgrade-tracking.ts
 */
import posthog from 'posthog-js'

export const UPGRADE_SOURCES = [
  // Walls that exist today
  'collection_cap',
  'photo_cap',
  'breeding',
  'advanced_analytics',
  'feeders',
  'settings',
  // Premium Scope features, reserved so their previews slot straight in
  'forecast',
  'benchmark',
  'genetics_planner',
  'care_routines',
  'breeder_desk',
  'vet_case_file',
  'sensors',
  'shared_keeping',
] as const;

export type UpgradeSource = (typeof UPGRADE_SOURCES)[number];

export const UPGRADE_EVENTS = {
  shown: 'upgrade_prompt_shown',
  clicked: 'upgrade_prompt_clicked',
  dismissed: 'upgrade_prompt_dismissed',
  pricingViewed: 'pricing_viewed',
  purchased: 'upgrade_purchased',
} as const;

/**
 * Narrow an untrusted value (a route param) to a known source. Anything else
 * becomes 'direct' — never forwarded raw, so a hand-typed URL can't write
 * arbitrary strings into analytics.
 */
export function sourceFromParam(value: unknown): UpgradeSource | 'direct' {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (UPGRADE_SOURCES as readonly string[]).includes(v)
    ? (v as UpgradeSource)
    : 'direct';
}

export function trackUpgrade(
  event: (typeof UPGRADE_EVENTS)[keyof typeof UPGRADE_EVENTS],
  source: UpgradeSource | 'direct',
  extra: Record<string, unknown> = {},
) {
  try {
    // Stamped explicitly: the mobile apps' captureEvent adds `app`, and the
    // funnels split on it. Wrapped because telemetry must never be the reason
    // a prompt breaks — an ad blocker or a failed PostHog init isn't the
    // keeper's problem.
    posthog.capture(event, { source, ...extra, app: 'tarantuverse-web' })
  } catch {
    // ignore
  }
}
