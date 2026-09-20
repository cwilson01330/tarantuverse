/**
 * The rule worth testing here is a NEGATIVE one: an existing keeper must never
 * be shown the welcome carousel.
 *
 * `app/onboarding.tsx` shipped unreachable, so `onboarding_completed` was never
 * written for anybody. That makes "show it when the flag is unset" — the
 * obvious implementation, and the one a future refactor will drift back toward
 * — actively wrong: it would greet every existing user with a tutorial,
 * including keepers with hundreds of animals. There is no error and no crash,
 * just a bad first impression for the people who least deserve one, which is
 * exactly the class of bug that reaches production.
 *
 * So the first test is the one to keep.
 */
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
  };
});

const mock = AsyncStorage as unknown as {
  __reset: () => void;
  __seed: (k: string, v: string) => void;
  multiGet: jest.Mock;
};

beforeEach(() => {
  mock.__reset();
  jest.clearAllMocks();
});

describe('existing keepers are never shown onboarding', () => {
  test('a returning user with no flags set goes straight to the tabs', async () => {
    // This is every pre-existing account: the completed flag was never written
    // because the screen was never reachable. Routing on the flag alone would
    // send all of them to the carousel.
    await expect(resolvePostAuthRoute(false)).resolves.toBe('/(tabs)');
  });

  test('a cold start with no flags set goes straight to the tabs', async () => {
    await expect(resolveColdStartRoute()).resolves.toBe('/(tabs)');
  });

  test('a completed flag wins even if something set pending by mistake', async () => {
    mock.__seed(ONBOARDING_COMPLETED, 'true');
    mock.__seed(ONBOARDING_PENDING, 'true');
    await expect(resolvePostAuthRoute(true)).resolves.toBe('/(tabs)');
  });
});

describe('genuinely new accounts do get onboarding', () => {
  test("the server's is_new_user routes an OAuth signup to the carousel", async () => {
    await expect(resolvePostAuthRoute(true)).resolves.toBe('/onboarding');
  });

  test('a password registration survives the trip through the login screen', async () => {
    // register.tsx doesn't establish a session — it hands off to /login — so
    // the signal has to outlive a navigation.
    await markOnboardingPending();
    await expect(resolvePostAuthRoute(false)).resolves.toBe('/onboarding');
  });

  test('an unfinished carousel resumes on the next cold start', async () => {
    await markOnboardingPending();
    await expect(resolveColdStartRoute()).resolves.toBe('/onboarding');
  });

  test('finishing it stops it coming back, on both paths', async () => {
    await markOnboardingPending();
    await completeOnboarding();
    await expect(resolvePostAuthRoute(false)).resolves.toBe('/(tabs)');
    await expect(resolveColdStartRoute()).resolves.toBe('/(tabs)');
    // And even if the same OAuth response still claims new — belt and braces
    // against a double-navigation showing it twice.
    await expect(resolvePostAuthRoute(true)).resolves.toBe('/(tabs)');
  });
});

describe('storage failures fail toward letting people in', () => {
  test('a throwing multiGet routes to the tabs, not the carousel', async () => {
    mock.multiGet.mockRejectedValueOnce(new Error('AsyncStorage unavailable'));
    // Missing a tutorial is a far smaller harm than being unable to reach your
    // own collection, so the fallback is deliberate rather than incidental.
    await expect(resolvePostAuthRoute(true)).resolves.toBe('/(tabs)');
  });

  test('markOnboardingPending never throws into the register flow', async () => {
    const storage = AsyncStorage as unknown as { setItem: jest.Mock };
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    // A storage hiccup must not surface as "Registration Failed" on a
    // registration that actually succeeded.
    await expect(markOnboardingPending()).resolves.toBeUndefined();
  });
});
