/**
 * Notification preferences — Herpetoverse mobile.
 *
 * Quiet hours (respected server-side on every push) and sitter activity
 * live here. The shared backend table also
 * carries Tarantuverse-only fields; this screen's PUT never sends them.
 * The old phone-side "reminder after a feeding" was removed 2026-11-18 (the
 * server digest replaced it; leftovers are cancelled at launch).
 *
 * HV day one (2026-11-18): the server's daily feeding reminder (digest push +
 * hour) and the opt-in daily email are set here too, mirroring Tarantuverse
 * app/settings/notifications.tsx. Opening this screen never raises the OS
 * dialog: it reads the permission, registers the push token only when it is
 * already granted, and shows a banner ("Enable", or "Open phone settings"
 * once the OS won't ask again) otherwise.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
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
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  extractErrorMessage,
} from '../src/components/forms/FormPrimitives';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getPermissionStatus,
  registerPushToken,
  requestNotificationPermissions,
} from '../src/services/notifications';
import { FIRST_FEEDING_COPY } from '../src/lib/first-feeding';
import type { Permission } from '../src/lib/notification-ask';

interface PrefsResponse {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  sitter_activity_enabled?: boolean;
  /** Older API builds omit these three; the defaults below match the server's. */
  daily_digest_enabled?: boolean;
  digest_hour?: number;
  email_digest_enabled?: boolean;
  /** Smart reminders. Older API builds omit them (treated as off). */
  smart_reminders_enabled?: boolean;
  refusal_restarts_wait?: boolean;
}

type ReminderSwitchKey = 'smart_reminders_enabled' | 'refusal_restarts_wait';

// Same two switches as Tarantuverse, minus the post-molt one (no pause around
// sheds on Herpetoverse).
const REMINDER_SWITCHES: { key: ReminderSwitchKey; title: string; line: string }[] = [
  {
    key: 'smart_reminders_enabled',
    title: 'Reminders for each animal',
    line: 'When 1–3 animals are due, get a reminder for each with Fed, Refused and Tomorrow buttons. With more due, you get one summary.',
  },
  {
    key: 'refusal_restarts_wait',
    title: 'A refusal restarts the wait',
    line: "A refused meal counts as an offer, so you're not reminded again until the next normal feeding time.",
  },
];

/** "9:00 AM" — the digest hour as the keeper reads a clock. */
function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Whether a whole hour falls inside the quiet window — same rule as the
 *  server's notification_service.in_quiet_hours (start inclusive, end
 *  exclusive, wraps midnight). */
function hourIsQuiet(hour: number, start: string, end: string): boolean {
  const toMin = (v: string) => {
    const [h, m] = String(v ?? '').split(':').map((x) => Number(x));
    return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null || a === b) return false;
  const t = hour * 60;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

const SHARED_SETTINGS_NOTE =
  'These reminder and email settings also apply to Tarantuverse if you use it.';

const HHMM_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function NotificationPreferencesScreen() {
  const { colors, layout } = useTheme();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');
  const [sitterEnabled, setSitterEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestHour, setDigestHour] = useState(9);
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);
  const [reminderSwitches, setReminderSwitches] = useState<Record<ReminderSwitchKey, boolean>>({
    smart_reminders_enabled: false,
    refusal_restarts_wait: false,
  });
  const [switchError, setSwitchError] = useState<string | null>(null);
  // null = not read yet (no banner flash).
  const [permission, setPermission] = useState<Permission | null>(null);

  // Never raises the OS dialog: read the status, and register the push token
  // only when it is already granted.
  const checkPermission = useCallback(async () => {
    const status = await getPermissionStatus();
    setPermission(status);
    if (status === 'granted') await registerPushToken();
  }, []);

  useEffect(() => {
    load();
    void checkPermission();
  }, [checkPermission]);

  // Coming back from the phone's Settings app: pick up a changed permission.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  // The banner button. Undetermined: the keeper chose this moment, so the OS
  // dialog is fine. Denied for good: the OS won't show it again, so send them
  // to the phone's settings instead of a dead end.
  async function handleEnablePermission() {
    if (permission === 'denied') {
      try {
        await Linking.openSettings();
      } catch {
        Alert.alert(
          'Open Settings',
          "Open your phone's Settings, find Herpetoverse, and turn on Notifications.",
        );
      }
      return;
    }
    const granted = await requestNotificationPermissions();
    if (granted) {
      await registerPushToken();
    }
    // Re-read rather than assume: a refusal leaves 'denied' (button becomes
    // "Open phone settings") or, where the OS will ask again, 'undetermined'.
    setPermission(await getPermissionStatus());
  }

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
      setQuietEnabled(data.quiet_hours_enabled);
      setQuietStart(data.quiet_hours_start || '22:00');
      setQuietEnd(data.quiet_hours_end || '08:00');
      setSitterEnabled(data.sitter_activity_enabled ?? true);
      setDigestEnabled(data.daily_digest_enabled ?? true);
      setDigestHour(typeof data.digest_hour === 'number' ? data.digest_hour : 9);
      setEmailDigestEnabled(data.email_digest_enabled ?? false);
      setReminderSwitches({
        smart_reminders_enabled: data.smart_reminders_enabled ?? false,
        refusal_restarts_wait: data.refusal_restarts_wait ?? false,
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  // Optimistic: flip now, PUT just this field (the API applies only fields
  // sent), revert with a short line on failure.
  async function toggleReminderSwitch(key: ReminderSwitchKey, value: boolean) {
    const previous = reminderSwitches[key];
    setSwitchError(null);
    setReminderSwitches((p) => ({ ...p, [key]: value }));
    try {
      await apiClient.put('/notification-preferences/', { [key]: value });
    } catch {
      setReminderSwitches((p) => ({ ...p, [key]: previous }));
      setSwitchError("Couldn't save that change. Please try again.");
    }
  }

  function stepHour(delta: number) {
    markDirty();
    setDigestHour((h) => (((h + delta) % 24) + 24) % 24);
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
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await apiClient.put('/notification-preferences/', {
        quiet_hours_enabled: quietEnabled,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        sitter_activity_enabled: sitterEnabled,
        daily_digest_enabled: digestEnabled,
        digest_hour: digestHour,
        email_digest_enabled: emailDigestEnabled,
        // So the reminder hour means that hour where this phone is.
        tz_offset_minutes: new Date().getTimezoneOffset(),
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
          {/* ------------------- OS permission banner ------------------- */}
          {permission !== null && permission !== 'granted' && (
            <View
              style={[
                styles.banner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.lg,
                },
              ]}
            >
              <MaterialCommunityIcons name="bell-off-outline" size={22} color={colors.primary} />
              <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
                Turn on notifications to get your daily feeding reminder on this phone.
              </Text>
              <TouchableOpacity
                onPress={handleEnablePermission}
                style={[styles.bannerButton, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
                accessibilityRole="button"
                accessibilityLabel={
                  permission === 'denied' ? FIRST_FEEDING_COPY.openPhoneSettings : 'Enable notifications'
                }
              >
                <Text style={styles.bannerButtonText}>
                  {permission === 'denied' ? FIRST_FEEDING_COPY.openPhoneSettings : 'Enable'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ------------------- Daily feeding reminder (server) ------------------- */}
          <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
            DAILY FEEDING REMINDER
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: layout.radius.lg,
                marginBottom: 22,
              },
            ]}
          >
            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  Daily feeding digest
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  One notification a day saying how many animals are due, using the
                  same schedule as Feeding Day. Nothing is sent on days when nothing
                  is due.
                </Text>
              </View>
              <Switch
                value={digestEnabled}
                onValueChange={(v) => {
                  markDirty();
                  setDigestEnabled(v);
                }}
                trackColor={{
                  false: colors.surfaceRaised,
                  true: colors.primary,
                }}
                thumbColor="#0B0B0B"
                accessibilityLabel="Daily feeding digest"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={[styles.row, !digestEnabled && styles.disabled]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Time</Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  {quietEnabled && hourIsQuiet(digestHour, quietStart, quietEnd)
                    ? "In this phone's time zone. This is inside your quiet hours, so the digest will wait in your notifications list instead of buzzing."
                    : "In this phone's time zone."}
                </Text>
              </View>
              <View style={styles.hourStepper}>
                <TouchableOpacity
                  onPress={() => stepHour(-1)}
                  disabled={!digestEnabled}
                  style={[styles.hourButton, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="One hour earlier"
                >
                  <MaterialCommunityIcons name="minus" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text
                  style={[styles.hourValue, { color: colors.textPrimary }]}
                  accessibilityLabel={`Digest time ${formatHour(digestHour)}`}
                >
                  {formatHour(digestHour)}
                </Text>
                <TouchableOpacity
                  onPress={() => stepHour(1)}
                  disabled={!digestEnabled}
                  style={[styles.hourButton, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="One hour later"
                >
                  <MaterialCommunityIcons name="plus" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Opt-in email on the same days and at the same hour. The server
                sends it from the daily digest run, so it follows the digest
                switch above (off there = no email either). */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={[styles.row, !digestEnabled && styles.disabled]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  {FIRST_FEEDING_COPY.dailyEmailSwitch}
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  {FIRST_FEEDING_COPY.dailyEmailHelp}
                </Text>
              </View>
              <Switch
                value={emailDigestEnabled}
                onValueChange={(v) => {
                  markDirty();
                  setEmailDigestEnabled(v);
                }}
                disabled={!digestEnabled}
                trackColor={{
                  false: colors.surfaceRaised,
                  true: colors.primary,
                }}
                thumbColor="#0B0B0B"
                accessibilityLabel={FIRST_FEEDING_COPY.dailyEmailSwitch}
                accessibilityState={{ disabled: !digestEnabled }}
              />
            </View>
            {REMINDER_SWITCHES.map((item) => {
              // Per-animal reminders go out from the daily digest run, so that
              // one does nothing while the digest is off.
              const locked = item.key === 'smart_reminders_enabled' && !digestEnabled;
              return (
                <React.Fragment key={item.key}>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={[styles.row, locked && styles.disabled]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                        {item.line}
                      </Text>
                    </View>
                    <Switch
                      value={reminderSwitches[item.key]}
                      onValueChange={(v) => void toggleReminderSwitch(item.key, v)}
                      disabled={locked}
                      trackColor={{
                        false: colors.surfaceRaised,
                        true: colors.primary,
                      }}
                      thumbColor="#0B0B0B"
                      accessibilityLabel={item.title}
                      accessibilityState={{ disabled: locked }}
                    />
                  </View>
                </React.Fragment>
              );
            })}
            {switchError ? (
              <Text
                style={[styles.rowHint, { color: colors.danger, padding: 16, paddingTop: 0 }]}
                accessibilityLiveRegion="polite"
              >
                {switchError}
              </Text>
            ) : null}
            <Text
              style={[styles.rowHint, { color: colors.textSecondary, padding: 16, paddingTop: 4 }]}
            >
              {SHARED_SETTINGS_NOTE}
            </Text>
          </View>

          {/* ------------------- Sitter links ------------------- */}
          <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
            SITTER LINKS
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
                  Sitter activity
                </Text>
                <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
                  When a sitter starts logging feedings on one of your links
                  (once per round). Lockouts always notify you.
                </Text>
              </View>
              <Switch
                value={sitterEnabled}
                onValueChange={(v) => { markDirty(); setSitterEnabled(v); }}
                trackColor={{
                  false: colors.surfaceRaised,
                  true: colors.primary,
                }}
                thumbColor="#0B0B0B"
                accessibilityLabel="Sitter activity notifications"
              />
            </View>
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
  disabled: { opacity: 0.5 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 22,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  bannerButton: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  bannerButtonText: { color: '#0B0B0B', fontSize: 13, fontWeight: '700' },
  hourStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourValue: { fontSize: 14, fontWeight: '600', minWidth: 72, textAlign: 'center' },
});

export default withErrorBoundary(
  NotificationPreferencesScreen,
  'notification-preferences',
);
