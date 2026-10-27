import { isStale, pageBody, planFromLimits, planOnLimitsError, premiumKind } from '../analytics-page-state';

describe('pageBody', () => {
  test('loading is the skeleton, whatever the animal count is', () => {
    expect(pageBody('loading', 0)).toBe('loading');
    expect(pageBody('loading', 12)).toBe('loading');
  });
  test('a failed fetch is the error card and never the empty state', () => {
    expect(pageBody('error', 0)).toBe('error');
    expect(pageBody('error', 5)).toBe('error');
  });
  test('zero animals is the empty card; one animal already shows the cards', () => {
    expect(pageBody('ready', 0)).toBe('empty');
    expect(pageBody('ready', 1)).toBe('content');
  });
});

describe('premiumKind', () => {
  const base = { status: 'ready' as const, animals: 3, plan: 'free' as const, advanced: 'idle' as const };
  test('nothing renders while loading or after a /collection error', () => {
    expect(premiumKind({ ...base, status: 'loading' })).toBeNull();
    expect(premiumKind({ ...base, status: 'error' })).toBeNull();
    expect(premiumKind({ ...base, status: 'error', plan: 'premium', advanced: 'ready' })).toBeNull();
  });
  test('plan not known yet: a skeleton, never the preview', () => {
    expect(premiumKind({ ...base, plan: 'unknown' })).toBe('loading');
    expect(premiumKind({ ...base, plan: 'unknown', animals: 0 })).toBe('loading');
  });
  test('free keeper: the preview with animals, the grey sample with none; /advanced/ is irrelevant', () => {
    expect(premiumKind(base)).toBe('preview');
    expect(premiumKind({ ...base, animals: 0 })).toBe('sample');
    expect(premiumKind({ ...base, advanced: 'ready' })).toBe('preview');
  });
  test('Premium keeper: skeleton while /advanced/ is pending, member cards once it answers', () => {
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'idle' })).toBe('loading');
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'loading' })).toBe('loading');
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'ready' })).toBe('member');
    // A Premium member with zero animals still gets their own cards (with their own empty lines).
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'ready', animals: 0 })).toBe('member');
  });
  test('a 402 on /advanced/ switches to the preview (or the sample with no animals)', () => {
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'gated' })).toBe('preview');
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'gated', animals: 0 })).toBe('sample');
  });
  test('any other /advanced/ failure is the one-card error', () => {
    expect(premiumKind({ ...base, plan: 'premium', advanced: 'error' })).toBe('error');
  });
});

describe('isStale', () => {
  test('never fetched is not stale (the mount effect owns the first load)', () => {
    expect(isStale(null, 1_000_000)).toBe(false);
  });
  test('older than the window is stale', () => {
    expect(isStale(0, 29_999)).toBe(false);
    expect(isStale(0, 30_001)).toBe(true);
    expect(isStale(0, 5_001, 5_000)).toBe(true);
  });
});

describe('planFromLimits', () => {
  test('only an explicit is_premium: true is Premium', () => {
    expect(planFromLimits({ is_premium: true })).toBe('premium');
    expect(planFromLimits({ is_premium: false })).toBe('free');
    expect(planFromLimits({})).toBe('free');
    expect(planFromLimits(null)).toBe('free');
    expect(planFromLimits(undefined)).toBe('free');
    expect(planFromLimits({ is_premium: 'true' })).toBe('free');
  });
});

describe('planOnLimitsError', () => {
  it('probes /advanced/ instead of guessing free when the plan was never read', () => {
    expect(planOnLimitsError('unknown')).toBe('premium');
    // ...and the page then shows the cards (200), the preview (402) or the error card, never the paywall by default.
    expect(premiumKind({ status: 'ready', animals: 3, plan: planOnLimitsError('unknown'), advanced: 'loading' })).toBe('loading');
    expect(premiumKind({ status: 'ready', animals: 3, plan: planOnLimitsError('unknown'), advanced: 'ready' })).toBe('member');
    expect(premiumKind({ status: 'ready', animals: 3, plan: planOnLimitsError('unknown'), advanced: 'gated' })).toBe('preview');
    expect(premiumKind({ status: 'ready', animals: 3, plan: planOnLimitsError('unknown'), advanced: 'error' })).toBe('error');
  });
  it('keeps an answer it already had', () => {
    expect(planOnLimitsError('free')).toBe('free');
    expect(planOnLimitsError('premium')).toBe('premium');
  });
});
