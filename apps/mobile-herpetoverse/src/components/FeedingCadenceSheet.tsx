/**
 * FeedingCadenceSheet — set or clear a keeper's own feeding interval. ADR-017.
 *
 * WHY THIS MATTERS MORE ON THE REPTILE SIDE
 * -----------------------------------------
 * Invertebrate cadences cluster tightly — days, not months — so a species
 * default there is a useful safety net. Reptiles don't work that way: a
 * juvenile gecko may eat daily while an adult boa eats monthly. That's why
 * `_animal_feeding_interval` walks a careful chain (complete diet → weight
 * bracket → the keeper's own written schedule → species frequency) and returns
 * nothing rather than guessing when they all miss.
 *
 * A number the keeper states is the only cadence the app can ever be certain
 * of, so it sits above every one of those inferences.
 *
 * Module-level StyleSheet with theme colours applied inline.
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
import { bulkSetFeedingCadence, setFeedingCadence } from '../lib/animals';
import { getErrorMessage } from '../utils/errors';

/** Reptile-appropriate presets. The spread is wider than the invert set on
 *  purpose — weekly suits a young snake, monthly an adult boa. */
const PRESETS = [3, 7, 10, 14, 21, 30];

interface Props {
  visible: boolean;
  animalId: string;
  /** Current keeper-set value, or null when the app is working it out. */
  current: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FeedingCadenceSheet({
  visible,
  animalId,
  current,
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
    setDays(String(current ?? 14));
    setError(null);
    // Off on every open — applying to a whole collection is chosen, never
    // inherited from a previous visit.
    setApplyAll(false);
  }, [visible, current]);

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
        await setFeedingCadence(animalId, value);
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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Feeding schedule</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              How often do you feed this animal? We&apos;ll use your number
              instead of working one out — nothing else changes.
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
                          backgroundColor: sel ? colors.primary : colors.surfaceRaised,
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
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceRaised },
                ]}
              />

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

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

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
                    Go back to working it out for me
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.cancel, { backgroundColor: colors.surfaceRaised }]}
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
