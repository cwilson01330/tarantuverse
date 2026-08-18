/**
 * FeedingCadenceSheet — set or clear a keeper's own feeding interval. ADR-017.
 *
 * WHY THIS EXISTS
 * ---------------
 * A keeper who feeds weekly against a care sheet saying every 3 days is told
 * she's behind on every animal she owns, every day. The sheets aren't wrong —
 * the platform median really is 4 days for slings and juveniles — but there was
 * no way to say "this is my cadence". This is that.
 *
 * DESIGN CONSTRAINTS (from the ADR)
 * ---------------------------------
 * Most keepers will never open this, and that's the intended outcome. The
 * failure mode to avoid isn't under-discovery — it's every keeper having to
 * form an opinion about a number they were happy to let the app choose. So:
 *
 *   - the current derived value is shown as the starting point, not a blank box
 *   - clearing is as easy as setting, and says plainly what it returns to
 *   - the copy never implies the care sheet was wrong; both can be right
 *
 * Module-level StyleSheet with theme colours applied inline — never build
 * styles inside the component.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';
import { bulkSetFeedingCadence, updateInvert } from '../lib/inverts';
import { getErrorMessage } from '../utils/errors';

/** Common cadences, so the usual answer is one tap rather than typing. */
const PRESETS = [3, 4, 5, 7, 10, 14];

interface Props {
  visible: boolean;
  invertId: string;
  /** Current keeper-set value, or null when the app is deriving it. */
  current: number | null;
  /** The derived interval + where it came from, for honest framing. */
  derivedDays: number | null;
  derivedSource: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FeedingCadenceSheet({
  visible,
  invertId,
  current,
  derivedDays,
  derivedSource,
  onClose,
  onSaved,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyAll, setApplyAll] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Seed with whatever is in force today — their own number if set, else the
    // derived one. Starting from the current reality beats an empty box the
    // keeper has to guess into.
    setDays(String(current ?? derivedDays ?? 7));
    setError(null);
    // Always off on open. Applying to a whole collection is a big action and
    // must be chosen each time, never inherited from a previous visit.
    setApplyAll(false);
  }, [visible, current, derivedDays]);

  const parsed = parseInt(days, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 365;

  const save = async (value: number | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (applyAll) {
        await bulkSetFeedingCadence(value);
      } else {
        await updateInvert(invertId, { feeding_interval_days: value });
      }
      onSaved();
      onClose();
    } catch (e) {
      // Stays open on failure so the number isn't lost.
      setError(getErrorMessage(e, 'Could not save that.'));
    } finally {
      setSaving(false);
    }
  };

  // What clearing returns them to — named honestly. "The care sheet" is only
  // true when the derived value actually came from one.
  const fallbackLabel =
    derivedSource === 'species'
      ? `the care sheet (every ${derivedDays}d)`
      : derivedDays
        ? `our default (every ${derivedDays}d)`
        : 'our default';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>Feed on my own schedule</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              How often do you feed this animal? We'll use your number instead of
              the care sheet — nothing else changes.
            </Text>

            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={styles.chips}>
                {PRESETS.map((n) => {
                  const sel = parsed === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setDays(String(n))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={[
                        styles.chip,
                        {
                          borderColor: sel ? colors.primary : colors.border,
                          backgroundColor: sel ? colors.primary : colors.surfaceElevated,
                        },
                      ]}
                    >
                      <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600' }}>
                        {n}d
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Or enter days</Text>
              <TextInput
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                maxLength={3}
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceElevated },
                ]}
              />

              {/* Phase 3 — the answer for someone who feeds their whole
                  collection the same way. Setting the same number thirty seven
                  times is a chore that replaces a complaint, not a fix. */}
              <TouchableOpacity
                onPress={() => setApplyAll((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: applyAll }}
                style={styles.applyAll}
              >
                <MaterialCommunityIcons
                  name={applyAll ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={applyAll ? colors.primary : colors.textTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.applyAllText, { color: colors.textPrimary }]}>
                    Apply to every animal in my collection
                  </Text>
                  <Text style={[styles.applyAllHint, { color: colors.textTertiary }]}>
                    You can still change any individual afterwards.
                  </Text>
                </View>
              </TouchableOpacity>

              {error ? (
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
              ) : null}

              <TouchableOpacity
                onPress={() => valid && save(parsed)}
                disabled={!valid || saving}
                accessibilityRole="button"
                style={[
                  styles.primary,
                  { backgroundColor: colors.primary, opacity: !valid || saving ? 0.5 : 1 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>
                    {applyAll
                      ? `Feed everything every ${valid ? parsed : '—'} days`
                      : `Feed every ${valid ? parsed : '—'} days`}
                  </Text>
                )}
              </TouchableOpacity>

              {current != null && (
                <TouchableOpacity
                  onPress={() => save(null)}
                  disabled={saving}
                  accessibilityRole="button"
                  style={styles.clear}
                >
                  <MaterialCommunityIcons name="undo-variant" size={16} color={colors.textTertiary} />
                  <Text style={[styles.clearText, { color: colors.textTertiary }]}>
                    Go back to {fallbackLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '85%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  applyAll: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  applyAllText: { fontSize: 14, fontWeight: '600' },
  applyAllHint: { fontSize: 12, marginTop: 1 },
  error: { fontSize: 13, marginTop: 10 },
  primary: { marginTop: 18, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  clear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  clearText: { fontSize: 14 },
  cancel: { marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600' },
});
