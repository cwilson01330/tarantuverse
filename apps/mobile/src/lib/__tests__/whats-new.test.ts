/**
 * What's new client lib. The same file ships in four copies (TV web/mobile, HV
 * web/mobile); everything below the "shared below" marker is byte-identical, so
 * this one test pins the shared half. TARGET_ROUTES is per app. The transport
 * and the token store are mocked.
 */
import {
  TARGET_ROUTES,
  getWhatsNew,
  markWhatsNewSeen,
  resetWhatsNewCache,
  routeForTarget,
  useWhatsNew,
  type WhatsNewFeed,
} from '../whats-new';

// A just-enough React: hook slots per "component", effects run once on mount.
// (No react-test-renderer in this app; this pins the subscribe/notify wiring.)
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  const h: { slots: unknown[]; i: number; mounted: boolean; cleanups: (() => void)[] } = {
    slots: [],
    i: 0,
    mounted: false,
    cleanups: [],
  };
  (globalThis as any).__hookHarness = h;
  return {
    ...actual,
    useState: (init: unknown) => {
      const idx = h.i++;
      if (!(idx in h.slots)) h.slots[idx] = typeof init === 'function' ? (init as () => unknown)() : init;
      return [h.slots[idx], (v: unknown) => { h.slots[idx] = v; }];
    },
    useEffect: (fn: () => void | (() => void)) => {
      if (h.mounted) return;
      const cleanup = fn();
      if (cleanup) h.cleanups.push(cleanup);
    },
    useCallback: (fn: unknown) => fn,
  };
});

function mountHook() {
  const h = (globalThis as any).__hookHarness;
  h.slots = [];
  h.mounted = false;
  h.cleanups = [];
  const useRender = () => {
    h.i = 0;
    const out = useWhatsNew();
    h.mounted = true;
    return out;
  };
  return { read: useRender, unmount: () => h.cleanups.forEach((c: () => void) => c()) };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mockRequest = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
  default: { request: (...args: unknown[]) => mockRequest(...args) },
}));

let mockToken: string | null = 'token-a';
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => mockToken) },
  getItem: jest.fn(async () => mockToken),
}));

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  published_on: id.slice(0, 10),
  title: 'Title',
  body: 'Body',
  premium: false,
  action: null,
  ...extra,
});

const FEED: WhatsNewFeed = {
  weeks: [{ week_of: '2026-10-19', entries: [entry('2026-10-23-a'), entry('2026-10-20-b')] }],
  unseen: [entry('2026-10-23-a'), entry('2026-10-20-b')],
};

const ok = (data: unknown) => ({ status: 200, data });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

beforeEach(() => {
  mockRequest.mockReset();
  mockToken = 'token-a';
  resetWhatsNewCache();
});

describe('routeForTarget', () => {
  it('maps a known target to this app\'s route', () => {
    expect(routeForTarget('expenses')).toBe('/expenses');
    expect(routeForTarget('feeding_day')).toBe('/feeding-day');
    expect(routeForTarget('analytics_advanced')).toBe('/analytics');
    expect(routeForTarget('collection')).toBe('/(tabs)/collection');
    expect(routeForTarget('species')).toBe('/(tabs)/species');
    expect(routeForTarget('settings')).toBe('/settings');
  });

  it('returns null for an unknown target', () => {
    expect(routeForTarget('nope')).toBeNull();
    expect(routeForTarget('')).toBeNull();
    expect(routeForTarget('__proto__')).toBeNull();
    expect(routeForTarget('toString')).toBeNull();
  });

  it('names every target, with an explicit null where the app has no screen', () => {
    expect(Object.keys(TARGET_ROUTES).sort()).toEqual(
      ['analytics_advanced', 'collection', 'expenses', 'feeding_day', 'settings', 'species'],
    );
  });
});

describe('getWhatsNew', () => {
  it('asks the API once per session, however many callers', async () => {
    mockRequest.mockResolvedValue(ok(clone(FEED)));
    const [a, b] = await Promise.all([getWhatsNew(), getWhatsNew()]);
    const c = await getWhatsNew();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      url: '/whats-new/?app=tarantuverse',
    });
    expect(a).toBe(b);
    expect(c.unseen).toHaveLength(2);
  });

  it('signed out (no token): an empty feed and no request', async () => {
    mockToken = null;
    const feed = await getWhatsNew();
    expect(feed).toEqual({ weeks: [], unseen: [] });
    await markWhatsNewSeen(); // no-op, no throw
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('fresh bypasses the cache', async () => {
    mockRequest.mockResolvedValue(ok(clone(FEED)));
    await getWhatsNew();
    await getWhatsNew({ fresh: true });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('keeps a different account\'s feed apart', async () => {
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await getWhatsNew();
    mockToken = 'token-b';
    mockRequest.mockResolvedValueOnce(ok({ weeks: [], unseen: [] }));
    const other = await getWhatsNew();
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(other.unseen).toEqual([]);
  });

  it.each([401, 403])('reads %s as "not signed in": an empty feed, no throw, not cached', async (status) => {
    mockRequest.mockResolvedValueOnce({ status, data: { detail: 'Not authenticated' } });
    await expect(getWhatsNew()).resolves.toEqual({ weeks: [], unseen: [] });
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    const next = await getWhatsNew();
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(next.unseen).toHaveLength(2);
  });

  it('rejects on a server error and does not cache the failure', async () => {
    mockRequest.mockResolvedValueOnce({ status: 500, data: null });
    await expect(getWhatsNew()).rejects.toThrow();
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await expect(getWhatsNew()).resolves.toMatchObject({ unseen: expect.any(Array) });
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('tolerates a malformed body as an empty feed', async () => {
    mockRequest.mockResolvedValueOnce(ok({ nope: true }));
    await expect(getWhatsNew()).resolves.toEqual({ weeks: [], unseen: [] });
  });
});

describe('useWhatsNew', () => {
  it('loads the feed and counts the unseen entries', async () => {
    mockRequest.mockResolvedValue(ok(clone(FEED)));
    const hook = mountHook();
    expect(hook.read()).toMatchObject({ feed: null, unseenCount: 0, loading: true });
    await flush();
    expect(hook.read()).toMatchObject({ unseenCount: 2, loading: false });
    hook.unmount();
  });

  it('a request error leaves feed null and the count 0', async () => {
    mockRequest.mockRejectedValue(new Error('network down'));
    const hook = mountHook();
    hook.read(); // first render: subscribes and starts the load
    await flush();
    expect(hook.read()).toMatchObject({ feed: null, unseenCount: 0, loading: false });
    hook.unmount();
  });

  it('markSeen updates every subscriber at once, with no second GET, and never throws', async () => {
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    const hook = mountHook();
    hook.read();
    await flush();
    expect(hook.read().unseenCount).toBe(2);

    mockRequest.mockResolvedValueOnce(ok({ seen_through: '2026-10-23' }));
    await hook.read().markSeen();
    expect(hook.read().unseenCount).toBe(0);
    expect(hook.read().feed?.weeks).toHaveLength(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);

    mockRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(hook.read().markSeen()).resolves.toBeUndefined();
    hook.unmount();
  });
});

describe('markWhatsNewSeen', () => {
  it('POSTs, then empties the cached unseen without a second GET', async () => {
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await getWhatsNew();
    mockRequest.mockResolvedValueOnce(ok({ seen_through: '2026-10-23' }));
    await markWhatsNewSeen();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      method: 'POST',
      url: '/whats-new/seen',
      data: { app: 'tarantuverse' },
    });

    const after = await getWhatsNew();
    expect(mockRequest).toHaveBeenCalledTimes(2); // still no second GET
    expect(after.unseen).toEqual([]);
    expect(after.weeks[0].entries).toHaveLength(2); // the page's list is untouched
  });

  it('markSeen while the GET is still in flight: the feed lands with unseen = []', async () => {
    let finish: (v: unknown) => void = () => undefined;
    mockRequest.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = getWhatsNew();
    await flush(); // let sessionKey settle so the GET is really in flight
    mockRequest.mockResolvedValueOnce(ok({ seen_through: '2026-10-23' }));
    await markWhatsNewSeen();
    finish(ok(clone(FEED)));
    const landed = await pending;
    expect(landed.unseen).toEqual([]);
    expect(landed.weeks[0].entries).toHaveLength(2);
    expect((await getWhatsNew()).unseen).toEqual([]);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('markSeen while the GET is in flight and then fails: no unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    let fail: (e: Error) => void = () => undefined;
    mockRequest.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = getWhatsNew();
    pending.catch(() => undefined);
    await flush();
    mockRequest.mockResolvedValueOnce(ok({ seen_through: '2026-10-23' }));
    await markWhatsNewSeen();
    fail(new Error('network'));
    await expect(pending).rejects.toThrow('network');
    await flush();
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('throws on a failed POST and leaves the cached unseen alone', async () => {
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await getWhatsNew();
    mockRequest.mockResolvedValueOnce({ status: 500, data: null });
    await expect(markWhatsNewSeen()).rejects.toThrow();
    expect((await getWhatsNew()).unseen).toHaveLength(2);
  });

  it('does not touch another account\'s cache if the session changed mid-request', async () => {
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await getWhatsNew();
    mockRequest.mockImplementationOnce(async () => {
      mockToken = 'token-b';
      return ok({ seen_through: '2026-10-23' });
    });
    mockRequest.mockResolvedValueOnce(ok(clone(FEED)));
    await markWhatsNewSeen();
    const b = await getWhatsNew(); // token-b: its own fetch, unseen intact
    expect(b.unseen).toHaveLength(2);
  });
});
