/**
 * The keeper's animal count, handed from Home to the You tab without a request.
 *
 * Home already loads `/analytics/collection`; the You tab's Analytics row shows
 * "{n} animals" from that same response. Nothing is fetched here, and nothing
 * is shown until Home has loaded once this session. The count is filed under
 * the signed-in user's id, so a different account never sees the last one's
 * number.
 */
import { useSyncExternalStore } from 'react';

let current: { userId: string; animals: number } | null = null;
const listeners = new Set<() => void>();

/** Home calls this with the analytics response's animal count (or clears it with null). */
export function setCollectionAnimalCount(userId: string | null | undefined, animals: number | null): void {
  const next =
    userId && typeof animals === 'number' && Number.isFinite(animals) && animals >= 0
      ? { userId, animals: Math.round(animals) }
      : null;
  if (current?.userId === next?.userId && current?.animals === next?.animals) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The animal count for this user, or null until Home has loaded it. */
export function useCollectionAnimalCount(userId: string | null | undefined): number | null {
  const snapshot = useSyncExternalStore(subscribe, () => current, () => current);
  return userId && snapshot && snapshot.userId === userId ? snapshot.animals : null;
}
