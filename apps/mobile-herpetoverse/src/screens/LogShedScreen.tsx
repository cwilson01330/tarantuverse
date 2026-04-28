/**
 * Log shed — shared screen for snake and lizard.
 *
 * Lighter than weight + feeding because shed entries are simpler: a
 * date, whether the shed came off cleanly, whether anything retained,
 * and free-text notes. Length/weight before-after captured on the web
 * detail are gated behind an "Advanced" disclosure since they're not
 * commonly logged on phone — keepers usually have a scale + tape on a
 * desk anyway.
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
  type CreateShedPayload,
  createShed as createShedSnake,
} from '../lib/snakes';
import { createShed as createShedLizard } from '../lib/lizards';

const COMPLETE_OPTIONS = [
  { value: 'yes' as const, label: 'One piece' },
  { value: 'no' as const, label: 'Broken up' },
];

const RETAINED_OPTIONS = [
  { value: 'no' as const, label: 'No' },
  { value: 'yes' as const, label: 'Yes' },
];

export function LogShedScreen({ taxon }: { taxon: 'snake' | 'lizard' }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [complete, setComplete] = useState<'yes' | 'no'>('yes');
  const [retained, setRetained] = useState<'yes' | 'no'>('no');
  const [retainedNotes, setRetainedNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!id || submitting) return;
    setError(null);

    const shedIso = dateToISO(date);
    if (!shedIso) {
      setError('Use a date in YYYY-MM-DD format.');
      return;
    }

    const payload: CreateShedPayload = {
      shed_at: shedIso,
      is_complete_shed: complete === 'yes',
      has_retained_shed: retained === 'yes',
      retained_shed_notes:
        retained === 'yes' ? retainedNotes.trim() || null : null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (taxon === 'snake') {
        await createShedSnake(id, payload);
      } else {
        await createShedLizard(id, payload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save shed.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Log shed', headerBackTitle: 'Back' }} />
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

          <Field label="Came off as" required>
            <ChipGroup
              options={COMPLETE_OPTIONS}
              value={complete}
              onChange={setComplete}
            />
          </Field>

          <Field label="Retained shed?" required>
            <ChipGroup
              options={RETAINED_OPTIONS}
              value={retained}
              onChange={setRetained}
            />
          </Field>

          {retained === 'yes' && (
            <Field
              label="Where retained"
              hint="Eye caps, tail tip, etc. — helpful when looking back at trends."
            >
              <ThemedInput
                value={retainedNotes}
                onChangeText={setRetainedNotes}
                placeholder="Eye caps + tail tip"
                autoCapitalize="sentences"
              />
            </Field>
          )}

          <Field label="Notes" hint="Optional">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Soaked overnight, came off in two pieces…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label="Save shed"
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
