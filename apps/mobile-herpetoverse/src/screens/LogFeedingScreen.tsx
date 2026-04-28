/**
 * Log feeding — shared screen for snake and lizard.
 *
 * Two route entries (`/reptile/log-feeding/[id]` and
 * `/lizard/log-feeding/[id]`) wrap this component, passing `taxon`. The
 * screen routes its createFeeding call to the right lib so the request
 * lands on `/snakes/<id>/feedings` or `/lizards/<id>/feedings`.
 *
 * Form contract matches the web equivalent's CreateFeedingPayload:
 *   - fed_at (ISO datetime, required)
 *   - food_type (string | null)
 *   - prey_weight_g (string | null)
 *   - accepted (bool — yes/no/regurg gets serialized to two fields)
 *   - notes (string | null)
 *
 * The "regurg" outcome is a UX convenience — it sets accepted=false and
 * prepends "Regurgitation. " to notes, since the backend doesn't have a
 * dedicated regurg flag yet. Web does the same; keeping parity matters
 * because keepers split between platforms.
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
  type CreateFeedingPayload,
  createFeeding as createFeedingSnake,
} from '../lib/snakes';
import { createFeeding as createFeedingLizard } from '../lib/lizards';

type Outcome = 'yes' | 'no' | 'regurg';

const OUTCOME_OPTIONS = [
  { value: 'yes' as const, label: 'Accepted' },
  { value: 'no' as const, label: 'Refused' },
  { value: 'regurg' as const, label: 'Regurg' },
];

export function LogFeedingScreen({ taxon }: { taxon: 'snake' | 'lizard' }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [foodType, setFoodType] = useState('');
  const [preyWeight, setPreyWeight] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('yes');
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

    const preyG = preyWeight.trim();
    if (preyG && !Number.isFinite(Number(preyG))) {
      setError("Prey weight needs to be a number, or leave it blank.");
      return;
    }

    const noteText = notes.trim();
    const finalNotes =
      outcome === 'regurg'
        ? `Regurgitation. ${noteText}`.trim()
        : noteText || null;

    const payload: CreateFeedingPayload = {
      fed_at: fedIso,
      food_type: foodType.trim() || null,
      prey_weight_g: preyG ? Number(preyG) : null,
      accepted: outcome === 'yes',
      notes: finalNotes,
    };

    setSubmitting(true);
    try {
      if (taxon === 'snake') {
        await createFeedingSnake(id, payload);
      } else {
        await createFeedingLizard(id, payload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save feeding.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Log feeding', headerBackTitle: 'Back' }} />
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

          <Field label="Outcome" required>
            <ChipGroup
              options={OUTCOME_OPTIONS}
              value={outcome}
              onChange={setOutcome}
            />
          </Field>

          <Field label="Prey type" hint="e.g. frozen-thawed rat, dubia, mealworm">
            <ThemedInput
              value={foodType}
              onChangeText={setFoodType}
              placeholder="Frozen-thawed rat"
              autoCapitalize="sentences"
            />
          </Field>

          <Field label="Prey weight (g)" hint="Optional. Used for prey:body-weight ratios.">
            <ThemedInput
              value={preyWeight}
              onChangeText={setPreyWeight}
              placeholder="52"
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Notes" hint="Optional">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Struck fast, took 20 minutes to coil…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label="Save feeding"
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
