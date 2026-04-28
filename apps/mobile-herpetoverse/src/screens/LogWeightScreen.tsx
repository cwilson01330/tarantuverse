/**
 * Log weight — shared screen for snake and lizard.
 *
 * Mirrors the web LogWeightForm minus the chart preview. Backend
 * denormalizes `current_weight_g` on the parent record when the new log
 * is the most recent one, so the detail screen will see the updated
 * weight on next refresh.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  dateToISO,
  extractErrorMessage,
  todayISO,
} from '../components/forms/FormPrimitives';
import {
  type CreateWeightLogPayload,
  type WeightContext,
  createWeightLog as createWeightLogSnake,
  WEIGHT_CONTEXT_LABELS,
} from '../lib/snakes';
import { createWeightLog as createWeightLogLizard } from '../lib/lizards';

const CONTEXT_OPTIONS = (
  Object.keys(WEIGHT_CONTEXT_LABELS) as WeightContext[]
).map((value) => ({ value, label: WEIGHT_CONTEXT_LABELS[value] }));

export function LogWeightScreen({ taxon }: { taxon: 'snake' | 'lizard' }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [grams, setGrams] = useState('');
  const [context, setContext] = useState<WeightContext>('routine');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!id || submitting) return;
    setError(null);

    const fedIso = dateToISO(date);
    if (!fedIso) {
      setError('Use a date in YYYY-MM-DD format.');
      return;
    }
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) {
      setError('Enter a weight greater than zero.');
      return;
    }

    const payload: CreateWeightLogPayload = {
      weighed_at: fedIso,
      weight_g: g,
      context,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (taxon === 'snake') {
        await createWeightLogSnake(id, payload);
      } else {
        await createWeightLogLizard(id, payload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save weight.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Log weight', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Date" required hint="YYYY-MM-DD">
            <ThemedInput
              value={date}
              onChangeText={setDate}
              placeholder="2026-04-27"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </Field>

          <Field label="Weight (grams)" required>
            <ThemedInput
              value={grams}
              onChangeText={setGrams}
              placeholder="650"
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Context" hint="When during your routine you weighed.">
            <ChipGroup
              options={CONTEXT_OPTIONS}
              value={context}
              onChange={setContext}
            />
          </Field>

          <Field label="Notes" hint="Optional">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Pre-feed, looked a little thin…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label="Save weight"
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
});
