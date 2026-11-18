jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getAllKeys: jest.fn(),
    getItem: jest.fn(),
    multiRemove: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {},
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('../api', () => ({ apiClient: {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelAllFeedingReminders } from '../notifications';

const store = AsyncStorage as unknown as Record<string, jest.Mock>;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('cancelAllFeedingReminders', () => {
  it('cancels every stored hv_feeding_reminder_ id and removes only those keys', async () => {
    store.getAllKeys.mockResolvedValue([
      'hv_feeding_reminder_a',
      'hv_feeder_low_stock_x',
      'hv_feeding_reminder_b',
      'other',
    ]);
    store.getItem.mockImplementation(async (k: string) => `id-${k}`);
    await cancelAllFeedingReminders();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith('id-hv_feeding_reminder_a');
    expect(cancel).toHaveBeenCalledWith('id-hv_feeding_reminder_b');
    expect(store.multiRemove).toHaveBeenCalledWith(['hv_feeding_reminder_a', 'hv_feeding_reminder_b']);
  });

  it('does nothing when none are stored', async () => {
    store.getAllKeys.mockResolvedValue(['other']);
    await cancelAllFeedingReminders();
    expect(cancel).not.toHaveBeenCalled();
    expect(store.multiRemove).not.toHaveBeenCalled();
  });

  it('never throws, and keeps going past one failing cancel', async () => {
    store.getAllKeys.mockResolvedValue(['hv_feeding_reminder_a', 'hv_feeding_reminder_b']);
    store.getItem.mockResolvedValue('x');
    cancel.mockRejectedValueOnce(new Error('boom'));
    await expect(cancelAllFeedingReminders()).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(store.multiRemove).toHaveBeenCalled();
    store.getAllKeys.mockRejectedValue(new Error('disk'));
    await expect(cancelAllFeedingReminders()).resolves.toBeUndefined();
  });
});
