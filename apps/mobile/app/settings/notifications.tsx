import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';
import { requestNotificationPermissions, getExpoPushToken } from '../../src/services/notifications';

interface NotificationPreferences {
  feeding_reminders_enabled: boolean;
  feeding_reminder_hours: number;
  substrate_reminders_enabled: boolean;
  substrate_reminder_days: number;
  molt_predictions_enabled: boolean;
  maintenance_reminders_enabled: boolean;
  maintenance_reminder_days: number;
  push_notifications_enabled: boolean;
  direct_messages_enabled: boolean;
  forum_replies_enabled: boolean;
  new_followers_enabled: boolean;
  community_activity_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    feeding_reminders_enabled: true,
    feeding_reminder_hours: 24,
    substrate_reminders_enabled: true,
    substrate_reminder_days: 90,
    molt_predictions_enabled: true,
    maintenance_reminders_enabled: true,
    maintenance_reminder_days: 30,
    push_notifications_enabled: true,
    direct_messages_enabled: true,
    forum_replies_enabled: true,
    new_followers_enabled: true,
    community_activity_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });

  useEffect(() => {
    loadPreferences();
    checkNotificationPermissions();
  }, []);

  const checkNotificationPermissions = async () => {
    const hasPermission = await requestNotificationPermissions();
    setPermissionGranted(hasPermission);

    if (hasPermission) {
      // Register push token with backend
      const token = await getExpoPushToken();
      if (token) {
        try {
          await apiClient.post('/notification-preferences/push-token', { token });
        } catch (error) {
          console.error('Error registering push token:', error);
        }
      }
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await apiClient.get('/notification-preferences/');
      setPreferences(response.data);
    } catch (error: any) {
      console.error('Error loading notification preferences:', error);
      Alert.alert('Error', 'Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put('/notification-preferences/', preferences);
      Alert.alert('Success', 'Notification preferences saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const requestPermissions = async () => {
    const granted = await requestNotificationPermissions();
    setPermissionGranted(granted);

    if (granted) {
      Alert.alert('Success', 'Notification permissions granted!');
      const token = await getExpoPushToken();
      if (token) {
        try {
          await apiClient.post('/notification-preferences/push-token', { token });
        } catch (error) {
          console.error('Error registering push token:', error);
        }
      }
    } else {
      Alert.alert('Permissions Denied', 'You need to enable notifications in your device settings.');
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    permissionBanner: {
      backgroundColor: colors.primary + '20',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    permissionBannerText: {
      flex: 1,
      marginLeft: 12,
      color: colors.textPrimary,
    },
    permissionButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    permissionButtonText: {
      color: '#ffffff',
      fontWeight: '600',
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    settingRowLast: {
      borderBottomWidth: 0,
    },
    settingInfo: {
      flex: 1,
      marginRight: 12,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    cancelButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Permission Banner */}
        {!permissionGranted && (
          <View style={styles.permissionBanner}>
            <MaterialCommunityIcons name="bell-off" size={24} color={colors.primary} />
            <Text style={styles.permissionBannerText}>
              Enable notifications to receive reminders for feeding, substrate changes, and more.
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
              <Text style={styles.permissionButtonText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Local Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🕷️ Tarantula Care Reminders</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Feeding Reminders</Text>
              <Text style={styles.settingDescription}>
                Get notified when it's time to feed your tarantulas (based on their last feeding)
              </Text>
            </View>
            <Switch
              value={preferences.feeding_reminders_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, feeding_reminders_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Substrate Change Reminders</Text>
              <Text style={styles.settingDescription}>
                Reminders to change substrate (default: every 90 days)
              </Text>
            </View>
            <Switch
              value={preferences.substrate_reminders_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, substrate_reminders_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Molt Predictions</Text>
              <Text style={styles.settingDescription}>
                Get notified when a tarantula might be approaching a molt
              </Text>
            </View>
            <Switch
              value={preferences.molt_predictions_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, molt_predictions_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Maintenance Reminders</Text>
              <Text style={styles.settingDescription}>
                General maintenance reminders (water dishes, enclosure cleaning)
              </Text>
            </View>
            <Switch
              value={preferences.maintenance_reminders_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, maintenance_reminders_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Push Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 Community Notifications</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Direct Messages</Text>
              <Text style={styles.settingDescription}>
                When someone sends you a message
              </Text>
            </View>
            <Switch
              value={preferences.direct_messages_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, direct_messages_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Forum Replies</Text>
              <Text style={styles.settingDescription}>
                When someone replies to your forum posts
              </Text>
            </View>
            <Switch
              value={preferences.forum_replies_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, forum_replies_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>New Followers</Text>
              <Text style={styles.settingDescription}>
                When someone follows you
              </Text>
            </View>
            <Switch
              value={preferences.new_followers_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, new_followers_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Community Activity</Text>
              <Text style={styles.settingDescription}>
                Updates from keepers you follow
              </Text>
            </View>
            <Switch
              value={preferences.community_activity_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, community_activity_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌙 Quiet Hours</Text>

          <View style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable Quiet Hours</Text>
              <Text style={styles.settingDescription}>
                Pause notifications during nighttime (10 PM - 8 AM by default)
              </Text>
            </View>
            <Switch
              value={preferences.quiet_hours_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, quiet_hours_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Preferences</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
