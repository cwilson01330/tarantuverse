/**
 * TV create-offspring form — Sprint 6h.
 *
 * Routes off egg sac detail. v1 form shape:
 *   - Status chips: kept / sold / traded / given_away / died / unknown
 *     (TV's 6-status enum, smaller than HV's 8).
 *   - Status date: defaults to today; can be cleared.
 *   - Price sold (USD, 0-9999), buyer info: optional. Sensible
 *     defaults if status is 'sold' and these are blank — the keeper
 *     can fill them in on the detail screen later.
 *   - Notes: free text.
 *
 * Deferred: linking to a live tarantula record (`tarantula_id`). Same
 * v1 punt we made on HV — needs a tarantula picker UX that's its own
 * sprint.
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

type Status = 'kept' | 'sold' | 'traded' | 'given_away' | 'died' | 'unknown';

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'kept', label: 'Kept' },
  { value: 'sold', label: 'Sold' },
  { value: 'traded', label: 'Traded' },
  { value: 'given_away', label: 'Given away' },
  { value: 'died', label: 'Died' },
  { value: 'unknown', label: 'Unknown' },
];

function NewOffspringScreen() {
  const router = useRouter();
  const { id: eggSacId } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const styles = useStyles();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [status, setStatus] = useState<Status>('kept');
  const [statusDate, setStatusDate] = useState<Date | null>(new Date());
  const [priceSold, setPriceSold] = useState('');
  const [buyerInfo, setBuyerInfo] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!eggSacId) {
      setError('Missing egg sac id — go back and try again.');
      return;
    }
    setError(null);

    // Price sanity check — optional, but if provided must be valid.
    let priceN: number | null = null;
    if (priceSold.trim()) {
      const n = Number(priceSold.trim());
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        setError('Price should be a number between 0 and 9999, or leave it blank.');
        return;
      }
      priceN = n;
    }

    setSubmitting(true);
    try {
      const payload = {
        egg_sac_id: eggSacId as string,
        status,
        status_date: statusDate ? toISODateLocal(statusDate) : null,
        price_sold: priceN,
        buyer_info: buyerInfo.trim() || null,
        notes: notes.trim() || null,
      };
      const res = await apiClient.post('/offspring/', payload);
      router.replace(`/breeding/offspring/${res.data.id}` as never);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't save this offspring.",
      );
      setSubmitting(false);
    }
  }

  const isSaleStatus =
    status === 'sold' || status === 'traded' || status === 'given_away';

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New offspring" leftAction={backButton} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Track one spiderling from this sac. You can update status
            and sale info on the offspring detail screen as things
            change.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status *</Text>
            <View style={styles.optionGrid}>
              {STATUS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionButton,
                    status === opt.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      status === opt.value && styles.optionButtonTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status date</Text>
            <DateInput
              value={statusDate ?? new Date()}
              onChange={setStatusDate}
              maximumDate={new Date()}
            />
            {statusDate && (
              <TouchableOpacity
                onPress={() => setStatusDate(null)}
                style={styles.clearDateButton}
              >
                <Text style={[styles.clearDateText, { color: colors.primary }]}>
                  Clear status date
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Defaults to today. Clear to leave blank.
            </Text>
          </View>

          {isSaleStatus && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Price sold ($)</Text>
                <TextInput
                  value={priceSold}
                  onChangeText={setPriceSold}
                  placeholder="e.g. 75"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  Optional. 0–9999.
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Buyer info</Text>
                <TextInput
                  value={buyerInfo}
                  onChangeText={setBuyerInfo}
                  placeholder="Name, contact, expo, anything to remember them by…"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anomalies, identifying marks, sale terms…"
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
              <Text style={styles.submitButtonText}>Save offspring</Text>
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

    // 6 status options — 3 per row on phones.
    optionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionButton: {
      width: '31.5%',
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: 'center',
    },
    optionButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    optionButtonTextActive: { color: '#fff' },

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

export default withErrorBoundary(NewOffspringScreen, 'tv-offspring-new');
