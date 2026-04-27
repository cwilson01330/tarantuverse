/**
 * Calendar-day "N days ago" / "Today" / "Yesterday" formatter.
 *
 * Mirrors the web implementation in `apps/web-herpetoverse/src/lib/snakes.ts`.
 * Both use local-Date constructors to compute the diff in calendar days
 * in the user's timezone, NOT a UTC time-delta floor — the latter flips
 * at UTC midnight and shows "Today" for hours after a keeper fed their
 * snake the previous evening (Brooke-on-EST bug class, 2026-04-24).
 */
export function relativeDays(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const now = new Date();
  // Reset both anchors to local midnight so the diff aligns to calendar
  // days in the user's zone.
  const thenLocal = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nowLocal.getTime() - thenLocal.getTime()) / 86_400_000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

/**
 * Returns just the day count for color-coding badges. Same calendar-day
 * semantics. null for "never fed" / invalid input.
 */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const now = new Date();
  const thenLocal = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(
    0,
    Math.round((nowLocal.getTime() - thenLocal.getTime()) / 86_400_000),
  );
}
