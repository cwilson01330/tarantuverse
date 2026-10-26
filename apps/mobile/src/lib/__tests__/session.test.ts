/**
 * Sign-in session rules (lib/session.ts; Herpetoverse has an identical copy).
 *
 * The two that matter most:
 *  - a token is refreshed only when it is OLD and we haven't just tried -
 *    refreshing too eagerly hammers a rate-limited endpoint, too lazily lets
 *    the 14-day clock run out (the original bug);
 *  - only an OBJECT detail with code `oauth_no_account` is the "ask before
 *    creating an account" case. The same route's other 409 carries a plain
 *    string and must stay an ordinary error.
 */
import {
  MIN_REFRESH_GAP_HOURS,
  NO_ACCOUNT_BODY,
  PASSWORD_HINT,
  REFRESH_AFTER_HOURS,
  decodeJwtPayload,
  detailMessage,
  isNoAccountError,
  isSignInMethod,
  lastMethodLine,
  makeNoAccountError,
  noAccountTitle,
  parseNoAccountDetail,
  shouldRefresh,
  tokenAgeHours,
  tokenIssuedAt,
  withPasswordHint,
  createSessionEpoch,
} from '../session';

const HOUR = 60 * 60 * 1000;

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.sig`;
}

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const tokenIssuedHoursAgo = (h: number) => makeToken({ sub: 'u1', jti: 'j', iat: Math.floor((NOW - h * HOUR) / 1000) });

describe('JWT decoding', () => {
  it('reads iat from the payload', () => {
    const t = makeToken({ sub: 'u1', iat: 1_780_000_000 });
    expect(tokenIssuedAt(t)).toBe(1_780_000_000);
  });

  it('handles base64url characters and multi-byte claims', () => {
    // "???>>>" style bytes produce - and _ in base64url; the name has non-ASCII.
    const t = makeToken({ sub: '??>>', name: 'Zoë 🕷', iat: 1_780_000_000 });
    expect(decodeJwtPayload(t)?.name).toBe('Zoë 🕷');
    expect(tokenIssuedAt(t)).toBe(1_780_000_000);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['not a jwt', 'abc'],
    ['two parts', 'a.b'],
    ['bad base64', 'a.!!!!.c'],
    ['payload not json', `a.${b64url('nope')}.c`],
    ['payload is an array', `a.${b64url('[1,2]')}.c`],
  ])('returns null for %s', (_name, value) => {
    expect(decodeJwtPayload(value as string | null | undefined)).toBeNull();
    expect(tokenIssuedAt(value as string | null | undefined)).toBeNull();
    expect(tokenAgeHours(value as string | null | undefined, NOW)).toBeNull();
  });

  it('has no iat when the claim is missing or not a positive number', () => {
    expect(tokenIssuedAt(makeToken({ sub: 'u1' }))).toBeNull();
    expect(tokenIssuedAt(makeToken({ iat: '1780000000' }))).toBeNull();
    expect(tokenIssuedAt(makeToken({ iat: 0 }))).toBeNull();
  });
});

describe('tokenAgeHours', () => {
  it('is the elapsed hours since iat', () => {
    expect(tokenAgeHours(tokenIssuedHoursAgo(30), NOW)).toBeCloseTo(30, 5);
    expect(tokenAgeHours(tokenIssuedHoursAgo(0.5), NOW)).toBeCloseTo(0.5, 5);
  });

  it('is never negative when the phone clock is behind the server', () => {
    const future = makeToken({ iat: Math.floor((NOW + 5 * HOUR) / 1000) });
    expect(tokenAgeHours(future, NOW)).toBe(0);
  });
});

describe('shouldRefresh', () => {
  it('does not refresh a young token', () => {
    expect(shouldRefresh(tokenIssuedHoursAgo(1), null, NOW)).toBe(false);
    expect(shouldRefresh(tokenIssuedHoursAgo(REFRESH_AFTER_HOURS - 0.01), null, NOW)).toBe(false);
  });

  it('refreshes a token older than 24 h that was never tried', () => {
    expect(shouldRefresh(tokenIssuedHoursAgo(REFRESH_AFTER_HOURS + 0.01), null, NOW)).toBe(true);
    expect(shouldRefresh(tokenIssuedHoursAgo(24 * 13), undefined, NOW)).toBe(true);
  });

  it('refreshes right at the 24 h boundary', () => {
    expect(shouldRefresh(tokenIssuedHoursAgo(REFRESH_AFTER_HOURS), null, NOW)).toBe(true);
  });

  it('waits out the retry gap after an attempt, whatever its outcome', () => {
    const old = tokenIssuedHoursAgo(48);
    expect(shouldRefresh(old, NOW - 1 * HOUR, NOW)).toBe(false);
    expect(shouldRefresh(old, NOW - (MIN_REFRESH_GAP_HOURS - 0.01) * HOUR, NOW)).toBe(false);
    expect(shouldRefresh(old, NOW - MIN_REFRESH_GAP_HOURS * HOUR, NOW)).toBe(true);
    expect(shouldRefresh(old, NOW - 72 * HOUR, NOW)).toBe(true);
  });

  it('ignores a last attempt in the future (clock moved back) instead of blocking forever', () => {
    expect(shouldRefresh(tokenIssuedHoursAgo(48), NOW + 10 * HOUR, NOW)).toBe(true);
  });

  it('treats a token with no readable age as old, still rate-limited', () => {
    const noIat = makeToken({ sub: 'u1' });
    expect(shouldRefresh(noIat, null, NOW)).toBe(true);
    expect(shouldRefresh(noIat, NOW - HOUR, NOW)).toBe(false);
  });

  it('never refreshes when there is no token', () => {
    expect(shouldRefresh(null, null, NOW)).toBe(false);
    expect(shouldRefresh('', null, NOW)).toBe(false);
  });
});

describe('last sign-in method line', () => {
  it('uses the exact copy for each method', () => {
    expect(lastMethodLine('google')).toBe('Last time you signed in with Google on this device.');
    expect(lastMethodLine('apple')).toBe('Last time you signed in with Apple on this device.');
    expect(lastMethodLine('password')).toBe(
      'Last time you signed in with your email and password on this device.',
    );
  });

  it('shows nothing for an unknown or missing method', () => {
    expect(lastMethodLine(null)).toBeNull();
    expect(lastMethodLine(undefined)).toBeNull();
    expect(lastMethodLine('github')).toBeNull();
    expect(lastMethodLine('')).toBeNull();
  });

  it('recognises only the three stored values', () => {
    expect(['password', 'google', 'apple'].every(isSignInMethod)).toBe(true);
    expect(isSignInMethod('email')).toBe(false);
    expect(isSignInMethod(null)).toBe(false);
  });
});

describe('password failure hint', () => {
  it('adds the exact hint on its own line under the message', () => {
    expect(PASSWORD_HINT).toBe('If you signed up with Google or Apple, use that button instead.');
    expect(withPasswordHint('Incorrect email or password')).toBe(
      'Incorrect email or password\n\nIf you signed up with Google or Apple, use that button instead.',
    );
  });
});

describe('no-account detail', () => {
  it('parses the object detail the API sends', () => {
    expect(parseNoAccountDetail({ code: 'oauth_no_account', provider: 'google', email: 'a@b.com' })).toEqual({
      provider: 'google',
      email: 'a@b.com',
    });
    expect(parseNoAccountDetail({ code: 'oauth_no_account', provider: 'apple', email: null })).toEqual({
      provider: 'apple',
      email: null,
    });
  });

  it('does NOT treat the "not verified" string 409 as a no-account case', () => {
    expect(parseNoAccountDetail('An account with this email exists but is not verified')).toBeNull();
  });

  it.each([
    ['another code', { code: 'something_else', provider: 'google', email: 'a@b.com' }],
    ['unknown provider', { code: 'oauth_no_account', provider: 'github', email: 'a@b.com' }],
    ['array', [{ code: 'oauth_no_account' }]],
    ['null', null],
    ['undefined', undefined],
    ['number', 409],
  ])('rejects %s', (_n, detail) => {
    expect(parseNoAccountDetail(detail)).toBeNull();
  });

  it('treats a blank email as missing', () => {
    expect(parseNoAccountDetail({ code: 'oauth_no_account', provider: 'google', email: '' })?.email).toBeNull();
  });
});

describe('no-account confirm copy', () => {
  it('titles it with the address', () => {
    expect(noAccountTitle('keeper@example.com', 'google')).toBe('No account for keeper@example.com');
  });

  it('names the provider when Apple hides the address', () => {
    expect(noAccountTitle(null, 'apple')).toBe('No account for this Apple account');
    expect(noAccountTitle('  ', 'google')).toBe('No account for this Google account');
  });

  it('uses the exact body', () => {
    expect(NO_ACCOUNT_BODY).toBe('Create a new account, or go back and sign in the way you did before.');
  });
});

describe('NoAccountError', () => {
  it('carries the retry and is recognised by shape', async () => {
    const retry = jest.fn().mockResolvedValue('created');
    const err = makeNoAccountError({ provider: 'google', email: 'a@b.com' }, retry);
    expect(isNoAccountError(err)).toBe(true);
    expect(err.message).toBe('No account for a@b.com');
    expect(err.provider).toBe('google');
    expect(retry).not.toHaveBeenCalled();
    await expect(err.createAccount()).resolves.toBe('created');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('does not mistake ordinary errors for it', () => {
    expect(isNoAccountError(new Error('boom'))).toBe(false);
    expect(isNoAccountError(Object.assign(new Error('x'), { code: 'oauth_no_account' }))).toBe(false);
    expect(isNoAccountError(null)).toBe(false);
  });
});

describe('detailMessage', () => {
  it('uses a string detail and never prints an object', () => {
    expect(detailMessage('Account disabled', 'fallback')).toBe('Account disabled');
    expect(detailMessage({ code: 'x' }, 'fallback')).toBe('fallback');
    expect(detailMessage([{ msg: 'bad' }], 'fallback')).toBe('fallback');
    expect(detailMessage('   ', 'fallback')).toBe('fallback');
    expect(detailMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('createSessionEpoch', () => {
  it('starts current and goes stale after a bump', () => {
    const epoch = createSessionEpoch();
    const taken = epoch.snapshot();
    expect(epoch.isCurrent(taken)).toBe(true);
    epoch.bump();
    expect(epoch.isCurrent(taken)).toBe(false);
    expect(epoch.isCurrent(epoch.snapshot())).toBe(true);
  });

  it('a refresh that lands after logout is dropped', () => {
    const epoch = createSessionEpoch();
    const saved: string[] = [];
    const startRefresh = () => {
      const taken = epoch.snapshot();
      return (fresh: string) => {
        if (epoch.isCurrent(taken)) saved.push(fresh);
      };
    };
    const land = startRefresh();
    epoch.bump(); // logout
    land('fresh-token');
    expect(saved).toEqual([]);
  });

  it('a refresh that lands with no sign-in or sign-out in between is kept', () => {
    const epoch = createSessionEpoch();
    const taken = epoch.snapshot();
    expect(epoch.isCurrent(taken)).toBe(true);
  });

  it('a sign-in during the request also invalidates it', () => {
    const epoch = createSessionEpoch();
    const taken = epoch.snapshot();
    epoch.bump(); // logout
    epoch.bump(); // another account signs in
    expect(epoch.isCurrent(taken)).toBe(false);
  });

  it('each context has its own counter', () => {
    const a = createSessionEpoch();
    const b = createSessionEpoch();
    const taken = a.snapshot();
    b.bump();
    expect(a.isCurrent(taken)).toBe(true);
  });
});
