/**
 * TV create-egg-sac form — Sprint 6h.
 *
 * Routes off the pairing detail screen — the pairing_id is in the
 * route param. Only `laid_date` is required; everything else (dates
 * + counts + notes) is optional and gets filled in as the sac
 * develops.
 *
 * Schema (matches /api/v1/egg-sacs/ POST):
 *   - pairing_id: from route
 *   - laid_date: required, ISO date
 *   - pulled_date, hatch_date: optional ISO dates
 *   - spiderling_count, viable_count: optional ints 0–500 (cap is
 *     generous; some species lay 1000+ but it's rare and reads as a
 *     typo anywhere near that)
 *   - notes: optional text
 *
 * Honest range hints in field labels rather than silent clamping —
 * a keeper typing 5000 by mistake sees the legal range, not a
 * mysteriously truncated value.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../../src/components/AppHeader';
import { withErrorBoundary } from '../../../../../src/components/ErrorBoundary';
import DateInput from '../../../../../src/components/DateInput';
import { useTheme } from '../../../../../src/contexts/ThemeContext';
import { apiClient } from '../../../../../src/services/api';
import { toISODateLocal } from '../../../../../src/utils/date';

function parseCount(
  raw: string,
  field: string,
):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${field} should be a whole number.` };
  }
  if (n < 0 || n > 500) {
    return { ok: false, error: `${field} should be between 0 and 500.` };
  }
  return { ok: true, value: n };
}

function NewEggSacScreen() {
  const router = useRouter();
  const { id: pairingId } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const styles = useStyles();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [laidDate, setLaidDate] = useState<Date>(new Date());
  const [pulledDate, setPulledDate] = useState<Date | null>(null);
  const [hatchDate, setHatchDate] = useState<Date | null>(null);
  const [spiderlingCount, setSpiderlingCount] = useState('');
  const [viableCount, setViableCount] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!pairingId) {
      setError('Missing pairing id — go back and try again.');
      return;
    }
    setError(null);

    const spider = parseCount(spiderlingCount, 'Spiderling count');
    if (!spider.ok) {
      setError(spider.error);
      return;
    }
    const viable = parseCount(viableCount, 'Viable count');
    if (!viable.ok) {
      setError(viable.error);
      return;
    }
    if (
      spider.value != null &&
      viable.value != null &&
      viable.value > spider.value
    ) {
      setError('Viable count should be ≤ spiderling count.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        pairing_id: pairingId as string,
        laid_date: toISODateLocal(laidDate),
        pulled_date: pulledDate ? toISODateLocal(pulledDate) : null,
        hatch_date: hatchDate ? toISODateLocal(hatchDate) : null,
        spiderling_count: spider.value,
        viable_count: viable.value,
        notes: notes.trim() || null,
      };
      const res = await apiClient.post('/egg-sacs/', payload);
      router.replace(`/breeding/egg-sacs/${res.data.id}` as never);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't save this egg sac.",
      );
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New egg sac" leftAction={backButton} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Record what she laid. You can update counts and dates later
            as the sac develops.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Laid date *</Text>
            <DateInput
              value={laidDate}
              onChange={setLaidDate}
              maximumDate={new Date()}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pulled date</Text>
            <DateInput
              value={pulledDate ?? laidDate}
              onChange={setPulledDate}
              maximumDate={new Date()}
            />
            {pulledDate && (
              <TouchableOpacity
                onPress={() => setPulledDate(null)}
                style={styles.clearDateButton}
              >
                <Text style={[styles.clearDateText, { color: colors.primary }]}>
                  Clear pulled date
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Optional. When you pulled the sac from the female.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Hatch date</Text>
            <DateInput
              value={hatchDate ?? laidDate}
              onChange={setHatchDate}
              maximumDate={new Date()}
            />
            {hatchDate && (
              <TouchableOpacity
                onPress={() => setHatchDate(null)}
                style={styles.clearDateButton}
              >
                <Text style={[styles.clearDateText, { color: colors.primary }]}>
                  Clear hatch date
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Optional. When the spiderlings emerged.
            </Text>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Spiderling count</Text>
              <TextInput
                value={spiderlingCount}
                onChangeText={setSpiderlingCount}
                placeholder="e.g. 200"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                0–500
              </Text>
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Viable count</Text>
              <TextInput
                value={viableCount}
                onChangeText={setViableCount}
                placeholder="e.g. 180"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
              />
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                0–500
              </Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Sac condition, drop date specifics, observations…"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, styles.textArea]}
              multiline
              numberOfLines={3}
            />
          </View>

          {error && (
            <View
              style={[
                styles.errorBlock,
                {
                  borderColor: 'rgba(239,68,68,0.4)',
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Save egg sac</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    safeArea: { flex: 1 },
    flex: { flex: 1 },
    scroll: { padding: 16, paddingBottom: 48, gap: 16 },
    intro: { fontSize: 13, lineHeight: 19 },

    errorBlock: { borderWidth: 1, padding: 12 },
    errorText: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },

    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    hint: { fontSize: 11, marginTop: 4 },

    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    textArea: { minHeight: 80, paddingTop: 12 },

    row: { flexDirection: 'row', gap: 12 },

    clearDateButton: { paddingVertical: 4 },
    clearDateText: { fontSize: 12, fontWeight: '600' },

    submitButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}

export default withErrorBoundary(NewEggSacScreen, 'tv-egg-sacs-new');
