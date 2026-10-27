/**
 * What's new client — see the shared half below the marker.
 * Transport: a plain `fetch` with the NextAuth session's access token (NOT `apiClient`, whose 401
 * interceptor clears storage and redirects to /login — a stale token must never bounce a visitor
 * off a public page; here 401/403 just mean "not signed in"). Paths are relative to `/api/v1`.
 * Client components only.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession } from 'next-auth/react';

type TransportResult = { status: number; data: any };

/** Which product's feed this copy reads. */
const APP = 'tarantuverse';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

let tokenLookup: Promise<string> | null = null;

/** The NextAuth session's access token, or '' when signed out. Concurrent callers share one lookup. */
function sessionToken(): Promise<string> {
  if (typeof window === 'undefined') return Promise.resolve('');
  if (!tokenLookup) {
    tokenLookup = getSession()
      .then((s) => (s?.accessToken as string | undefined) ?? '')
      .catch(() => '')
      .finally(() => {
        tokenLookup = null;
      });
  }
  return tokenLookup;
}

/** HTTP adapter. Resolves with the status and parsed body for ANY response; only network failures throw. */
async function transport(method: string, path: string, body?: unknown): Promise<TransportResult> {
  const token = await sessionToken();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  return { status: res.status, data };
}

/**
 * Identifies the signed-in session, so a different account never reads another's cached feed:
 * the NextAuth access token ('' when signed out). Sign-out does NOT reload TV web (it calls
 * `signOut({ redirect: false })` then `router.push`), so the sign-out handlers (TopBar, dashboard
 * expired-token) call `resetWhatsNewCache()` as well.
 */
async function sessionKey(): Promise<string> {
  return sessionToken();
}

/** Where each entry button goes in THIS app. `null` = this app has no such screen: no button. */
export const TARGET_ROUTES: Record<WhatsNewTarget, string | null> = {
  expenses: '/dashboard/expenses',
  feeding_day: '/dashboard/feeding-day',
  analytics_advanced: '/dashboard/analytics#premium',
  collection: '/dashboard/tarantulas',
  species: '/species',
  settings: '/dashboard/settings',
};

// ---- shared below: keep identical in all four copies ----
//
// "What's new" client (API: routers/whats_new.py, spec 2026-10-23).
//
// FOUR COPIES, byte-identical below the marker above (only the imports, `APP`,
// the `transport` / `sessionKey` adapters and `TARGET_ROUTES` at the top differ):
//   apps/web/src/lib/whatsNew.ts
//   apps/mobile/src/lib/whats-new.ts
//   apps/web-herpetoverse/src/lib/whatsNew.ts
//   apps/mobile-herpetoverse/src/lib/whats-new.ts
// Pinned by apps/mobile/src/lib/__tests__/whats-new.test.ts; the TARGET_ROUTES
// keys are pinned against the API by apps/api/tests/test_whats_new_targets_in_sync.py.
//
// One GET per app session: the card, the Profile/sidebar dot and the page all
// read the same cached promise. The cache is keyed by the session token, so a
// different account never sees another's feed. `markWhatsNewSeen` clears the
// cached `unseen` locally (no second GET) and tells every `useWhatsNew` so the
// card and the dot update together.

/** Screens an entry's button can open (must match the API's WHATS_NEW_TARGETS). */
export type WhatsNewTarget =
  | 'expenses'
  | 'feeding_day'
  | 'analytics_advanced'
  | 'collection'
  | 'species'
  | 'settings';

export interface WhatsNewAction {
  label: string;
  /** A WhatsNewTarget; typed loosely so a newer API never breaks an older app. */
  target: string;
}

export interface WhatsNewEntry {
  id: string;
  published_on: string; // YYYY-MM-DD
  title: string;
  body: string;
  premium: boolean;
  action: WhatsNewAction | null;
}

export interface WhatsNewWeek {
  week_of: string; // Monday, YYYY-MM-DD
  entries: WhatsNewEntry[];
}

export interface WhatsNewFeed {
  /** Every live entry grouped by week, newest first (the page). */
  weeks: WhatsNewWeek[];
  /** What the card shows: newest first, already trimmed by the server. */
  unseen: WhatsNewEntry[];
}

/** The route for a target in this app, or null (unknown target, or no screen here). */
export function routeForTarget(target: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(TARGET_ROUTES, target)) return null;
  return TARGET_ROUTES[target as WhatsNewTarget];
}

const emptyFeed = (): WhatsNewFeed => ({ weeks: [], unseen: [] });

function normalize(data: any): WhatsNewFeed {
  return {
    weeks: Array.isArray(data?.weeks) ? data.weeks : [],
    unseen: Array.isArray(data?.unseen) ? data.unseen : [],
  };
}

const isOk = (status: number) => status >= 200 && status < 300;
/** No/invalid token (the API answers 403 with no header, 401 with a bad one). */
const isNotSignedIn = (status: number) => status === 401 || status === 403;

interface CacheEntry {
  key: string;
  /** The settled feed, once there is one (read synchronously by `useWhatsNew`). */
  feed: WhatsNewFeed | null;
  promise: Promise<WhatsNewFeed>;
  /** markWhatsNewSeen ran while this was still in flight. */
  seen: boolean;
}

let cache: CacheEntry | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Forget the cached feed (sign-out hooks and tests). Mounted `useWhatsNew`s drop it too. */
export function resetWhatsNewCache(): void {
  cache = null;
  notify();
}

/**
 * The feed, fetched at most once per session. A missing/rejected sign-in gives
 * an empty feed (a missing one without any request) (never throws); any other failure rejects and is not cached.
 * `fresh: true` bypasses the cache.
 */
export async function getWhatsNew(opts: { fresh?: boolean } = {}): Promise<WhatsNewFeed> {
  const key = await sessionKey();
  if (!key) return emptyFeed(); // signed out: no request
  // Once settled, hand out the settled feed (markWhatsNewSeen replaces it); while in flight, the
  // promise itself applies `seen` when the GET lands.
  if (!opts.fresh && cache && cache.key === key) return cache.feed ?? cache.promise;

  const entry: CacheEntry = { key, feed: null, seen: false, promise: Promise.resolve(emptyFeed()) };
  entry.promise = transport('GET', `/whats-new/?app=${APP}`)
    .then((res) => {
      if (isNotSignedIn(res.status)) {
        if (cache === entry) cache = null;
        return emptyFeed();
      }
      if (!isOk(res.status)) throw new Error(`What's new: request failed (${res.status})`);
      const feed = normalize(res.data);
      if (entry.seen) feed.unseen = [];
      entry.feed = feed;
      if (cache === entry) notify();
      return feed;
    })
    .catch((e) => {
      if (cache === entry) cache = null;
      throw e;
    });

  cache = entry;
  notify(); // anything mounted drops the previous session's / previous fetch's feed
  return entry.promise;
}

/**
 * Tell the API the keeper has seen the feed, then empty the cached `unseen`
 * (no second GET) and notify every `useWhatsNew`. Throws if the POST fails, and
 * then leaves the cache alone.
 */
export async function markWhatsNewSeen(): Promise<void> {
  const key = await sessionKey();
  if (!key) return; // signed out: nothing to mark
  const res = await transport('POST', '/whats-new/seen', { app: APP });
  if (!isOk(res.status)) throw new Error(`What's new: could not mark seen (${res.status})`);

  const current = cache;
  if (!current || current.key !== key) return; // a different session now; nothing of ours is cached
  current.seen = true;
  if (current.feed) current.feed = { ...current.feed, unseen: [] };
  notify();
}

export interface UseWhatsNew {
  /** null until loaded, and when the request failed. */
  feed: WhatsNewFeed | null;
  /** feed.unseen.length; 0 while loading or on error. */
  unseenCount: number;
  loading: boolean;
  /** markWhatsNewSeen that never throws: on failure the card simply stays. */
  markSeen: () => Promise<void>;
}

/**
 * The shared feed for a screen. Errors leave `feed` null and `unseenCount` 0
 * (a broken feed must never break Home). Every instance updates together when
 * anything calls `markWhatsNewSeen`.
 */
export function useWhatsNew(): UseWhatsNew {
  const [feed, setFeed] = useState<WhatsNewFeed | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const onChange = () => {
      if (alive) setFeed(cache?.feed ?? null);
    };
    listeners.add(onChange);
    getWhatsNew()
      .then((f) => {
        if (alive) setFeed(f);
      })
      .catch(() => {
        if (alive) setFeed(null);
      })
      .then(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  const markSeen = useCallback(async () => {
    try {
      await markWhatsNewSeen();
    } catch {
      // The card stays and the next visit tries again; never break the screen.
    }
  }, []);

  return { feed, unseenCount: feed?.unseen.length ?? 0, loading, markSeen };
}
