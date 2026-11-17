const mockGet = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

import {
  DEFAULT_FEATURES,
  FEATURES_STORAGE_KEY,
  FORUMS_PAUSED_BODY,
  FORUMS_PAUSED_TITLE,
  OUTSIDE_COMMUNITIES,
  featuresFromStatus,
  featuresReady,
  getSystemStatus,
  pickFeatures,
} from '../features';

describe('features', () => {
  it('reads the forums switch from the status payload', () => {
    expect(featuresFromStatus({ features: { forums_enabled: false } })).toEqual({ forumsEnabled: false });
    expect(featuresFromStatus({ features: { forums_enabled: true, other: 1 } })).toEqual({ forumsEnabled: true });
  });

  it('returns null for a wrong shape', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { features: null }, { features: {} }, { features: { forums_enabled: 'true' } }]) {
      expect(featuresFromStatus(bad)).toBeNull();
    }
  });

  it('picks fetched, then saved, then default OFF', () => {
    expect(pickFeatures(null, null)).toEqual({ forumsEnabled: false });
    expect(pickFeatures(null, { forumsEnabled: true })).toEqual({ forumsEnabled: true });
    expect(pickFeatures({ forumsEnabled: false }, { forumsEnabled: true })).toEqual({ forumsEnabled: false });
    expect(pickFeatures({ forumsEnabled: true }, null)).toEqual({ forumsEnabled: true });
  });

  it('keeps the exact constants', () => {
    expect(DEFAULT_FEATURES).toEqual({ forumsEnabled: false });
    expect(FEATURES_STORAGE_KEY).toBe('features_v1');
    expect(FORUMS_PAUSED_TITLE).toBe('Forums are paused');
    expect(FORUMS_PAUSED_BODY).toBe(
      "The forums were quiet, so we've put them away for now. Nothing has been deleted. To talk with other keepers, try these communities:",
    );
    expect(OUTSIDE_COMMUNITIES).toEqual([
      { label: 'r/tarantulas', url: 'https://www.reddit.com/r/tarantulas/' },
      { label: 'r/jumpingspiders', url: 'https://www.reddit.com/r/jumpingspiders/' },
      { label: 'Arachnoboards', url: 'https://arachnoboards.com/' },
    ]);
  });

  it('fetches the status once per session', async () => {
    mockGet.mockResolvedValue({ data: { features: { forums_enabled: true } } });
    const a = await getSystemStatus();
    const b = await getSystemStatus();
    expect(featuresFromStatus(a)).toEqual({ forumsEnabled: true });
    expect(b).toBe(a);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/system/status');
  });
  it('is ready when a value is known or the fetch settled (even on failure)', () => {
    expect(featuresReady({ cached: false, saved: null, settled: false })).toBe(false);
    expect(featuresReady({ cached: true, saved: null, settled: false })).toBe(true);
    expect(featuresReady({ cached: false, saved: { forumsEnabled: true }, settled: false })).toBe(true);
    expect(featuresReady({ cached: false, saved: null, settled: true })).toBe(true);
  });
});
