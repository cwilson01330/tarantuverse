/**
 * Notification preferences — Herpetoverse mobile.
 *
 * v1 surfaces the two settings that actually drive behavior on this
 * app: feeding reminders (used by LogFeedingScreen) and quiet hours
 * (respected by the notifications service when scheduling). The shared
 * backend table also carries substrate / molt / feeder-low-stock and
 * community push fields, but none apply to Herpetoverse v1 — those
 * rows are left alone in the PUT payload.
 *
 * The feeding-reminders toggle requests OS permission on the way to ON,
 * so an opt-in flips into real OS state in the same gesture.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  extractErrorMessage,
  type ChipOption,
} from '../src/components/forms/FormPrimitives';
import { requestNotificationPermissions } from '../src/services/notifications';

interface PrefsResponse {
  feeding_reminders_enabled: boolean;
  feeding_reminder_hours: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const HOUR_OPTIONS: ChipOption<string>[] = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '2 days' },
  { value: '72', label: '3 days' },
  { value: '168', label: '1 week' },
];

const HHMM_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function NotificationPreferencesScreen() {
  const { colors, layout } = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [feedingEnabled, setFeedingEnabled] = useState(true);
  const [feedingHours, setFeedingHours] = useState('24');
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  useEffect(() => {
    load();
  }, []);

  function markDirty() {
    setSaved(false);
    setSaveError(null);
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await apiClient.get<PrefsResponse>(
        '/notification-preferences/',
      );
      setFeedingEnabled(data.feeding_reminders_enabled);
      setFeedingHours(String(data.feeding_reminder_hours || 24));
      setQuietEnabled(data.quiet_hours_enabled);
      setQuietStart(data.quiet_hours_start || '22:00');
      setQuietEnd(data.quiet_hours_end || '08:00');
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFeeding(next: boolean) {
    markDirty();
    if (next) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        setPermissionDenied(true);
        return; // toggle stays off
      }
      setPermissionDenied(false);
    }
    setFeedingEnabled(next);
  }

  async function handleSave() {
    if (saving) return;
    if (
      quietEnabled &&
      (!HHMM_RE.test(quietStart) || !HHMM_RE.test(quietEnd))
    ) {
      setSaveError('Quiet hours must be in HH:MM 24-hour format.');
      return;
    }
    const hours = parseInt(feedingHours, 10);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      setSaveError('Reminder hours must be between 1 and 168.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await apiClient.put('/notification-preferences/', {
        feeding_reminders_enabled: feedingEnabled,
        feeding_reminder_hours: hours,
        quiet_hours_enabled: quietEnabled,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(extractErrorMessage(err, 'Could not save preferences.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Notifications" leftAction={<HeaderBackButton />} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
            Couldn&apos;t load your notification settings.
          </Text>
          <TouchableOpacity
            onPress={load}
            style={[styles.retryBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ------------------- Feeding reminders ------------------- */}
          <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
            FEEDING REMINDERS
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
              },
            ]}
          >
            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  Remind me to feed
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  We&apos;ll schedule a local reminder after each accepted
                  feeding.
                </Text>
              </View>
              <Switch
                value={feedingEnabled}
                onValueChange={handleToggleFeeding}
                trackColor={{
                  false: colors.surfaceRaised,
                  true: colors.primary,
                }}
                thumbColor="#0B0B0B"
              />
            </View>

            {feedingEnabled && (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.subSection}>
                  <Text style={[styles.subLabel, { color: colors.textTertiary }]}>
                    REMIND ME AFTER
                  </Text>
                  <ChipGroup
                    options={HOUR_OPTIONS}
                    value={feedingHours}
                    onChange={(v) => {
                      markDirty();
                      setFeedingHours(v);
                    }}
                  />
                </View>
              </>
            )}

            {permissionDenied && (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.subSection}>
                  <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>
                    Notifications are turned off for Herpetoverse in your
                    device settings. Enable them there to receive reminders.
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ----------------------- Quiet hours --------------------- */}
          <Text
            style={[
              styles.sectionHeader,
              { color: colors.textTertiary, marginTop: 22 },
            ]}
          >
            QUIET HOURS
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
              },
            ]}
          >
            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  Don&apos;t buzz me at night
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  Reminders that would land in this window get pushed to the
                  end of it.
                </Text>
              </View>
              <Switch
                value={quietEnabled}
                onValueChange={(v) => {
                  markDirty();
                  setQuietEnabled(v);
                }}
                trackColor={{
                  false: colors.surfaceRaised,
                  true: colors.primary,
                }}
                thumbColor="#0B0B0B"
              />
            </View>
            {quietEnabled && (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <Field label="Start" hint="24h, e.g. 22:00">
                      <ThemedInput
                        value={quietStart}
                        onChangeText={(v) => {
                          markDirty();
                          setQuietStart(v);
                        }}
                        placeholder="22:00"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </Field>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="End" hint="24h, e.g. 08:00">
                      <ThemedInput
                        value={quietEnd}
                        onChangeText={(v) => {
                          markDirty();
                          setQuietEnd(v);
                        }}
                        placeholder="08:00"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </Field>
                  </View>
                </View>
              </>
            )}
          </View>

          {saveError ? (
            <View style={{ marginTop: 16 }}>
              <FormErrorBanner message={saveError} />
            </View>
          ) : null}
          {saved && (
            <Text
              style={{
                color: colors.primary,
                marginTop: 14,
                textAlign: 'center',
                fontWeight: '600',
              }}
              role="status"
            >
              Saved.
            </Text>
          )}

          <View style={{ marginTop: 22 }}>
            <SubmitButton
              label="Save preferences"
              busy={saving}
              onPress={handleSave}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  retryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 10,
  },
  content: { padding: 16, paddingBottom: 80 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowHint: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  subSection: { padding: 16, gap: 10 },
  subLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timeRow: { padding: 16, gap: 12, flexDirection: 'row' },
});

export default withErrorBoundary(
  NotificationPreferencesScreen,
  'notification-preferences',
);
