/**
 * First-run routing for Herpetoverse mobile. Same rules as the Tarantuverse
 * test (apps/mobile/src/lib/__tests__/onboarding.test.ts); HV lands on the
 * dashboard tab, not the tabs index.
 *
 * The rule worth testing is a NEGATIVE one: an existing keeper must never be
 * shown the welcome screen. Nothing ever wrote `onboarding_completed` on HV
 * (the screen didn't exist), so "show it when the flag is unset" would greet
 * every existing keeper with it on their next sign-in.
 *
 * No @types/jest in this app: the test API comes from `@jest/globals`.
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ONBOARDING_COMPLETED,
  ONBOARDING_PENDING,
  completeOnboarding,
  markOnboardingPending,
  resolveColdStartRoute,
  resolvePostAuthRoute,
} from '../onboarding';

// Minimal in-memory AsyncStorage. The real module is native; this only needs
// to honour multiGet/multiRemove/setItem semantics.
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      __reset: () => {
        store = {};
      },
      __seed: (k: string, v: string) => {
        store[k] = v;
      },
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, store[k] ?? null])),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((k) => delete store[k]);
      }),
    },
  };
});

type FailOnce = { mockRejectedValueOnce: (e: unknown) => unknown };
const mock = AsyncStorage as unknown as {
  __reset: () => void;
  __seed: (k: string, v: string) => void;
  multiGet: FailOnce;
  setItem: FailOnce;
};

const DASHBOARD = '/(tabs)/dashboard';

beforeEach(() => {
  mock.__reset();
  jest.clearAllMocks();
});

describe('existing keepers are never shown the welcome screen', () => {
  test('a returning keeper with no flags set goes straight to the dashboard', async () => {
    await expect(resolvePostAuthRoute(false)).resolves.toBe(DASHBOARD);
  });

  test('a cold start with no flags set goes straight to the dashboard', async () => {
    await expect(resolveColdStartRoute()).resolves.toBe(DASHBOARD);
  });

  test('a completed flag wins even if something set pending by mistake', async () => {
    mock.__seed(ONBOARDING_COMPLETED, 'true');
    mock.__seed(ONBOARDING_PENDING, 'true');
    await expect(resolvePostAuthRoute(true)).resolves.toBe(DASHBOARD);
  });
});

describe('genuinely new accounts do get the welcome screen', () => {
  test('a caller that knows the account is new routes to it', async () => {
    await expect(resolvePostAuthRoute(true)).resolves.toBe('/onboarding');
  });

  test('a password sign-up survives the trip through the login screen', async () => {
    // With email verification on, register.tsx shows "check your email" and
    // the keeper signs in later from /login, so the signal must outlive that.
    await markOnboardingPending();
    await expect(resolvePostAuthRoute(false)).resolves.toBe('/onboarding');
  });

  test('an unfinished welcome resumes on the next cold start', async () => {
    await markOnboardingPending();
    await expect(resolveColdStartRoute()).resolves.toBe('/onboarding');
  });

  test('finishing it stops it coming back, on both paths', async () => {
    await markOnboardingPending();
    await completeOnboarding();
    await expect(resolvePostAuthRoute(false)).resolves.toBe(DASHBOARD);
    await expect(resolveColdStartRoute()).resolves.toBe(DASHBOARD);
    await expect(resolvePostAuthRoute(true)).resolves.toBe(DASHBOARD);
  });
});

describe('storage failures fail toward letting people in', () => {
  test('a throwing multiGet routes to the dashboard, not the welcome screen', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mock.multiGet.mockRejectedValueOnce(new Error('AsyncStorage unavailable'));
    await expect(resolvePostAuthRoute(true)).resolves.toBe(DASHBOARD);
    warn.mockRestore();
  });

  test('markOnboardingPending never throws into the register flow', async () => {
    mock.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(markOnboardingPending()).resolves.toBeUndefined();
  });

  test('completeOnboarding never throws into the welcome screen', async () => {
    mock.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(completeOnboarding()).resolves.toBeUndefined();
  });
});
