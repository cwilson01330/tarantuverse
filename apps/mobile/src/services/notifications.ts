/**
 * Notification Service
 * Handles local notifications, permissions, and push notification tokens
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Check if running in Expo Go (which doesn't support push notifications in SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// Configure notification behavior (only if not in Expo Go)
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export interface NotificationPreferences {
  feeding_reminders_enabled: boolean;
  feeding_reminder_hours: number;
  substrate_reminders_enabled: boolean;
  substrate_reminder_days: number;
  molt_predictions_enabled: boolean;
  maintenance_reminders_enabled: boolean;
  maintenance_reminder_days: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }

  return true;
}

/**
 * Get Expo push notification token
 * Note: Push notifications are not supported in Expo Go with SDK 53+
 */
export async function getExpoPushToken(): Promise<string | null> {
  // Skip push token registration in Expo Go
  if (isExpoGo) {
    console.log('Push notifications are not supported in Expo Go. Use a development build for push notifications.');
    return null;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: '9c77e4ff-6ee4-4dc8-8866-e56c72bf8f75', // Your Expo project ID from app.json
    });

    return token.data;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
    return null;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  trigger: Notifications.NotificationTriggerInput,
  data?: any
): Promise<string> {
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger,
  });
}

/**
 * Schedule feeding reminder for a tarantula
 */
export async function scheduleFeedingReminder(
  tarantulaId: string,
  tarantulaName: string,
  hoursUntilReminder: number
): Promise<string | null> {
  try {
    // Cancel existing reminders for this tarantula
    await cancelFeedingReminder(tarantulaId);

    // Schedule new reminder
    const notificationId = await scheduleLocalNotification(
      `Time to feed ${tarantulaName}`,
      `It's been ${hoursUntilReminder} hours since ${tarantulaName}'s last feeding.`,
      {
        seconds: hoursUntilReminder * 3600, // Convert hours to seconds
      },
      {
        type: 'feeding_reminder',
        tarantulaId,
      }
    );

    // Store notification ID for later cancellation
    await AsyncStorage.setItem(`feeding_reminder_${tarantulaId}`, notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling feeding reminder:', error);
    return null;
  }
}

/**
 * Cancel feeding reminder for a tarantula
 */
export async function cancelFeedingReminder(tarantulaId: string): Promise<void> {
  try {
    const notificationId = await AsyncStorage.getItem(`feeding_reminder_${tarantulaId}`);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`feeding_reminder_${tarantulaId}`);
    }
  } catch (error) {
    console.error('Error canceling feeding reminder:', error);
  }
}

/**
 * Schedule substrate change reminder
 */
export async function scheduleSubstrateReminder(
  tarantulaId: string,
  tarantulaName: string,
  daysUntilReminder: number
): Promise<string | null> {
  try {
    await cancelSubstrateReminder(tarantulaId);

    const notificationId = await scheduleLocalNotification(
      `Substrate change for ${tarantulaName}`,
      `It's been ${daysUntilReminder} days since ${tarantulaName}'s last substrate change.`,
      {
        seconds: daysUntilReminder * 86400, // Convert days to seconds
      },
      {
        type: 'substrate_reminder',
        tarantulaId,
      }
    );

    await AsyncStorage.setItem(`substrate_reminder_${tarantulaId}`, notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling substrate reminder:', error);
    return null;
  }
}

/**
 * Cancel substrate change reminder
 */
export async function cancelSubstrateReminder(tarantulaId: string): Promise<void> {
  try {
    const notificationId = await AsyncStorage.getItem(`substrate_reminder_${tarantulaId}`);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`substrate_reminder_${tarantulaId}`);
    }
  } catch (error) {
    console.error('Error canceling substrate reminder:', error);
  }
}

/**
 * Schedule molt prediction notification
 * Triggered when premolt probability is high
 */
export async function scheduleMoltPredictionNotification(
  tarantulaId: string,
  tarantulaName: string,
  probability: number,
  daysUntilCheck: number = 3
): Promise<string | null> {
  try {
    // Cancel existing molt prediction for this tarantula
    await cancelMoltPredictionNotification(tarantulaId);

    const notificationId = await scheduleLocalNotification(
      `${tarantulaName} may be in premolt! 🦋`,
      `${probability}% chance of premolt. Watch for signs: darker abdomen, webbing, refusing food. Check again in ${daysUntilCheck} days.`,
      {
        seconds: daysUntilCheck * 86400, // Convert days to seconds
      },
      {
        type: 'molt_prediction',
        tarantulaId,
      }
    );

    // Store notification ID for later cancellation
    await AsyncStorage.setItem(`molt_prediction_${tarantulaId}`, notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling molt prediction notification:', error);
    return null;
  }
}

/**
 * Cancel molt prediction notification
 */
export async function cancelMoltPredictionNotification(tarantulaId: string): Promise<void> {
  try {
    const notificationId = await AsyncStorage.getItem(`molt_prediction_${tarantulaId}`);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`molt_prediction_${tarantulaId}`);
    }
  } catch (error) {
    console.error('Error canceling molt prediction notification:', error);
  }
}

/**
 * Schedule maintenance reminder for a tarantula
 * General reminders for water dish, enclosure cleaning, etc.
 */
export async function scheduleMaintenanceReminder(
  tarantulaId: string,
  tarantulaName: string,
  maintenanceType: string,
  daysUntilReminder: number
): Promise<string | null> {
  try {
    // Cancel existing maintenance reminder for this tarantula and type
    await cancelMaintenanceReminder(tarantulaId, maintenanceType);

    const messages: { [key: string]: string } = {
      water_dish: `Time to refill ${tarantulaName}'s water dish`,
      enclosure_cleaning: `Time to clean ${tarantulaName}'s enclosure`,
      general: `Maintenance reminder for ${tarantulaName}`,
    };

    const notificationId = await scheduleLocalNotification(
      `Maintenance: ${tarantulaName}`,
      messages[maintenanceType] || messages.general,
      {
        seconds: daysUntilReminder * 86400, // Convert days to seconds
      },
      {
        type: 'maintenance_reminder',
        tarantulaId,
        maintenanceType,
      }
    );

    // Store notification ID for later cancellation
    await AsyncStorage.setItem(`maintenance_${tarantulaId}_${maintenanceType}`, notificationId);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling maintenance reminder:', error);
    return null;
  }
}

/**
 * Cancel maintenance reminder
 */
export async function cancelMaintenanceReminder(tarantulaId: string, maintenanceType: string): Promise<void> {
  try {
    const notificationId = await AsyncStorage.getItem(`maintenance_${tarantulaId}_${maintenanceType}`);
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`maintenance_${tarantulaId}_${maintenanceType}`);
    }
  } catch (error) {
    console.error('Error canceling maintenance reminder:', error);
  }
}

/**
 * Check if current time is within quiet hours
 */
export function isWithinQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle quiet hours that span midnight
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime <= endTime;
  }

  return currentTime >= startTime && currentTime <= endTime;
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all scheduled notifications
 */
export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'ios') {
    await Notifications.setBadgeCountAsync(count);
  }
}

/**
 * Clear notification badge
 */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}
