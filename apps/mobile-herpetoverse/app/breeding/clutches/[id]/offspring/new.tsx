/**
 * New offspring (hatchling) under a clutch — Sprint 5d.
 *
 * Mobile port of apps/web-herpetoverse/.../breeding/clutches/[id]/offspring/new.
 *
 * UX intent: quick record. Most hatchling fields evolve over time
 * (status moves hatched → kept/sold/etc., sale info added later,
 * genotype refined as the morph clarifies). The form captures only
 * what's known at hatching; everything else gets filled in on the
 * offspring detail screen as it becomes real.
 *
 * Required: nothing technically, but at least the morph label or a
 * non-default status is needed to make the row distinguishable. We
 * default status to 'hatched' and status_date to today so a one-tap
 * save still produces a useful record.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../../src/components/AppHeader';
import { HeaderBackButton } from '../../../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../../../src/components/ErrorBoundary';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  dateToISO,
  extractErrorMessage,
  todayISO,
} from '../../../../../src/components/forms/FormPrimitives';
import { useTheme } from '../../../../../src/contexts/ThemeContext';
import {
  OFFSPRING_STATUS_LABEL,
  type CreateOffspringPayload,
  type OffspringStatus,
  createOffspring,
} from '../../../../../src/lib/breeding';

const STATUS_OPTIONS = (
  Object.keys(OFFSPRING_STATUS_LABEL) as OffspringStatus[]
).map((k) => ({ value: k, label: OFFSPRING_STATUS_LABEL[k] }));

/** Parse weight/length text into number | null with range check. */
function parsePositive(
  raw: string,
  field: string,
  max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} should be a number.` };
  }
  if (n < 0 || n > max) {
    return { ok: false, error: `${field} should be between 0 and ${max}.` };
  }
  return { ok: true, value: n };
}

function NewOffspringScreen() {
  const router = useRouter();
  const { id: clutchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [morphLabel, setMorphLabel] = useState('');
  const [status, setStatus] = useState<OffspringStatus>('hatched');
  const [statusDate, setStatusDate] = useState<string>(() => todayISO());
  const [hatchWeight, setHatchWeight] = useState<string>('');
  const [hatchLength, setHatchLength] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!clutchId) {
      setError('Missing clutch id — go back and try again.');
      return;
    }
    setError(null);

    // Status date — required by the schema if provided; empty means
    // the keeper doesn't know yet.
    let statusIso: string | null = null;
    if (statusDate.trim()) {
      const iso = dateToISO(statusDate);
      if (!iso) {
        setError('Status date should be YYYY-MM-DD or empty.');
        return;
      }
      statusIso = iso.slice(0, 10);
    }

    // Hatchling weight is grams. 200g is plenty for a hatching that
    // size (largest python species are ~120g at hatch).
    const weight = parsePositive(hatchWeight, 'Hatch weight', 200);
    if (!weight.ok) {
      setError(weight.error);
      return;
    }
    // Length in inches. 30 is a generous ceiling — boa hatchlings
    // are the longest at ~22-26 inches.
    const length = parsePositive(hatchLength, 'Hatch length', 30);
    if (!length.ok) {
      setError(length.error);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateOffspringPayload = {
        clutch_id: clutchId as string,
        morph_label: morphLabel.trim() || null,
        status,
        status_date: statusIso,
        hatch_weight_g: weight.value,
        hatch_length_in: length.value,
        notes: notes.trim() || null,
      };
      const created = await createOffspring(payload);
      router.replace(`/breeding/offspring/${created.id}` as never);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't save this offspring."));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New hatchling" leftAction={<HeaderBackButton />} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Quick record — most fields can be filled in or updated on the
            offspring detail screen later (sale, status changes, genotype).
          </Text>

          <Field
            label="Morph label"
            hint='Free-text. e.g. "Pied het Albino", or just a nickname like "Hex Jr."'
          >
            <ThemedInput
              value={morphLabel}
              onChangeText={setMorphLabel}
              placeholder="Pied het Albino"
              autoCapitalize="words"
            />
          </Field>

          <Field label="Status" required>
            <ChipGroup
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          </Field>

          <Field
            label="Status date"
            hint="YYYY-MM-DD. Defaults to today; clear to leave empty."
          >
            <ThemedInput
              value={statusDate}
              onChangeText={setStatusDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </Field>

          <View style={styles.row}>
            <View style={styles.col}>
              <Field label="Hatch weight (g)" hint="Optional. 0–200.">
                <ThemedInput
                  value={hatchWeight}
                  onChangeText={setHatchWeight}
                  placeholder="e.g. 65"
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
            <View style={styles.col}>
              <Field label="Hatch length (in)" hint="Optional. 0–30.">
                <ThemedInput
                  value={hatchLength}
                  onChangeText={setHatchLength}
                  placeholder="e.g. 16"
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
          </View>

          <Field label="Notes" hint="Optional">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Pip notes, anomalies, observations…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label="Save hatchling"
            busy={submitting}
            onPress={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
  },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
});

export default withErrorBoundary(NewOffspringScreen, 'offspring-new');
