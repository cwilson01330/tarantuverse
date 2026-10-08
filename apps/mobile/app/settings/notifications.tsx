/**
 * Notification settings (TV mobile).
 *
 * Every switch here changes something the server actually does (audit-2 H4).
 * The old "Animal Care Reminders" block — feeding, substrate, molt prediction
 * and maintenance — saved flags that only the retired `app/tarantula/add-*`
 * screens read, so they controlled nothing. Animal-care reminders are the
 * server's daily feeding digest now (services/digest_service.py: one push a
 * day, only when something is due, using Feeding Day's schedule), so that is
 * what this screen controls: on/off and the hour, in this phone's time zone.
 *
 * Kept in step with apps/web/src/app/dashboard/settings/notifications.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { apiClient } from '../../src/services/api';
import { requestNotificationPermissions, getExpoPushToken } from '../../src/services/notifications';
import { SPACING, TYPE } from '../../src/theme/tokens';

interface NotificationPreferences {
  daily_digest_enabled: boolean;
  digest_hour: number;
  push_notifications_enabled: boolean;
  direct_messages_enabled: boolean;
  forum_replies_enabled: boolean;
  new_followers_enabled: boolean;
  sitter_activity_enabled?: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

/** "9:00 AM" from 9, "12:00 PM" from 12. */
function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Whether a whole hour falls inside the quiet window — same rule as the
 *  server's notification_service.in_quiet_hours (start inclusive, end exclusive,
 *  wraps midnight). */
function hourIsQuiet(hour: number, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = String(s ?? '').split(':').map((x) => Number(x));
    return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null || a === b) return false;
  const t = hour * 60;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** "22:00" → "10:00 PM". Falls back to the raw string if it doesn't parse. */
function formatClock(hhmm: string | null | undefined): string {
  const [h, m] = String(hhmm ?? '').split(':').map((x) => Number(x));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return String(hhmm ?? '');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    daily_digest_enabled: true,
    digest_hour: 9,
    push_notifications_enabled: true,
    direct_messages_enabled: true,
    forum_replies_enabled: true,
    new_followers_enabled: true,
    sitter_activity_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });

  useEffect(() => {
    loadPreferences();
    checkNotificationPermissions();
  }, []);

  const registerToken = async () => {
    const token = await getExpoPushToken();
    if (!token) return;
    try {
      // The device time zone rides along: the digest hour is this phone's hour.
      await apiClient.post('/notification-preferences/push-token', {
        token,
        tz_offset_minutes: new Date().getTimezoneOffset(),
      });
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  };

  const checkNotificationPermissions = async () => {
    const hasPermission = await requestNotificationPermissions();
    setPermissionGranted(hasPermission);
    if (hasPermission) await registerToken();
  };

  const loadPreferences = async () => {
    try {
      const response = await apiClient.get('/notification-preferences/');
      const d = response.data ?? {};
      setPreferences((prev) => ({
        ...prev,
        ...d,
        // Older API builds don't return these; keep the defaults the server uses.
        daily_digest_enabled: d.daily_digest_enabled ?? true,
        digest_hour: typeof d.digest_hour === 'number' ? d.digest_hour : 9,
      }));
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
      // Only the fields this screen edits. Herpetoverse shares this row and has
      // its own settings (e.g. its per-animal feeding reminders), so sending
      // back everything we loaded could overwrite a change made there.
      await apiClient.put('/notification-preferences/', {
        daily_digest_enabled: preferences.daily_digest_enabled,
        digest_hour: preferences.digest_hour,
        tz_offset_minutes: new Date().getTimezoneOffset(),
        direct_messages_enabled: preferences.direct_messages_enabled,
        forum_replies_enabled: preferences.forum_replies_enabled,
        new_followers_enabled: preferences.new_followers_enabled,
        sitter_activity_enabled: preferences.sitter_activity_enabled ?? true,
        quiet_hours_enabled: preferences.quiet_hours_enabled,
      });
      Alert.alert('Saved', 'Notification preferences saved.');
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
      await registerToken();
    } else {
      Alert.alert('Permissions Denied', 'You need to enable notifications in your device settings.');
    }
  };

  const stepHour = (delta: number) =>
    setPreferences((p) => ({ ...p, digest_hour: (((p.digest_hour + delta) % 24) + 24) % 24 }));

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
    hourStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    hourButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: layout.radius.full,
      backgroundColor: colors.background,
    },
    hourValue: {
      ...TYPE.bodyStrong,
      color: colors.textPrimary,
      minWidth: 76,
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.4,
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Notifications" leftAction={backButton} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const digestOn = preferences.daily_digest_enabled;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Notifications" leftAction={backButton} />

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {/* Permission Banner */}
        {!permissionGranted && (
          <View style={styles.permissionBanner}>
            <MaterialCommunityIcons name="bell-off" size={24} color={colors.primary} />
            <Text style={styles.permissionBannerText}>
              Turn on notifications to get your daily feeding digest and community alerts on this phone.
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
              <Text style={styles.permissionButtonText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Daily feeding digest — the server-side animal-care reminder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feeding reminders</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Daily feeding digest</Text>
              <Text style={styles.settingDescription}>
                One notification a day saying how many animals are due, using the same schedule as Feeding Day. Nothing is sent on days when nothing is due.
              </Text>
            </View>
            <Switch
              value={digestOn}
              onValueChange={(value) => setPreferences({ ...preferences, daily_digest_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel="Daily feeding digest"
            />
          </View>

          <View style={[styles.settingRow, styles.settingRowLast, !digestOn && styles.disabled]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Time</Text>
              <Text style={styles.settingDescription}>
                {preferences.quiet_hours_enabled &&
                hourIsQuiet(preferences.digest_hour, preferences.quiet_hours_start, preferences.quiet_hours_end)
                  ? "In this phone's time zone. This is inside your quiet hours, so the digest will wait in your notifications list instead of buzzing."
                  : "In this phone's time zone."}
              </Text>
            </View>
            <View style={styles.hourStepper}>
              <TouchableOpacity
                style={styles.hourButton}
                onPress={() => stepHour(-1)}
                disabled={!digestOn}
                accessibilityRole="button"
                accessibilityLabel="One hour earlier"
              >
                <MaterialCommunityIcons name="minus" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.hourValue} accessibilityLabel={`Digest time ${formatHour(preferences.digest_hour)}`}>
                {formatHour(preferences.digest_hour)}
              </Text>
              <TouchableOpacity
                style={styles.hourButton}
                onPress={() => stepHour(1)}
                disabled={!digestOn}
                accessibilityRole="button"
                accessibilityLabel="One hour later"
              >
                <MaterialCommunityIcons name="plus" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
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
              <Text style={styles.settingLabel}>Sitter activity</Text>
              <Text style={styles.settingDescription}>
                When a sitter starts logging feedings on one of your links (once per round). Lockouts always notify you.
              </Text>
            </View>
            <Switch
              value={preferences.sitter_activity_enabled ?? true}
              onValueChange={(value) => setPreferences({ ...preferences, sitter_activity_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel="Sitter activity notifications"
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
                No push notifications from {formatClock(preferences.quiet_hours_start)} to {formatClock(preferences.quiet_hours_end)}, this phone's time. They still wait in your notifications list. Sitter-link lockouts still come through.
              </Text>
            </View>
            <Switch
              value={preferences.quiet_hours_enabled}
              onValueChange={(value) => setPreferences({ ...preferences, quiet_hours_enabled: value })}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel="Quiet hours"
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
    </View>
  );
}
