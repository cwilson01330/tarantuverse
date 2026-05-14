/**
 * Log shed — shared screen for every taxon, also handles edit.
 *
 * Lighter than weight + feeding because shed entries are simpler: a
 * date, whether the shed came off cleanly, whether anything retained,
 * and free-text notes. Length/weight before-after captured on the web
 * detail are gated behind an "Advanced" disclosure since they're not
 * commonly logged on phone — keepers usually have a scale + tape on a
 * desk anyway.
 *
 * EDIT MODE: when the route includes a `shedId` query param, pre-fill
 * via GET /sheds/{id} and PUT on save. ADR-003: shed rows carry a single
 * `animal_id` and both create + edit hit taxon-agnostic routes.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { AppHeader } from '../components/AppHeader';
import { HeaderBackButton } from '../components/HeaderBackButton';
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
  createShed,
  getShed,
  updateShed,
} from '../lib/animals';

const COMPLETE_OPTIONS = [
  { value: 'yes' as const, label: 'One piece' },
  { value: 'no' as const, label: 'Broken up' },
];

const RETAINED_OPTIONS = [
  { value: 'no' as const, label: 'No' },
  { value: 'yes' as const, label: 'Yes' },
];

/** Format an ISO datetime as YYYY-MM-DD in the user's local TZ. */
function isoToYMD(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayISO();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LogShedScreen() {
  const router = useRouter();
  const { id, shedId } = useLocalSearchParams<{
    id?: string;
    shedId?: string;
  }>();
  const isEdit = Boolean(shedId);
  const { colors } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [complete, setComplete] = useState<'yes' | 'no'>('yes');
  const [retained, setRetained] = useState<'yes' | 'no'>('no');
  const [retainedNotes, setRetainedNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  // Edit mode — pre-fill from existing shed.
  useEffect(() => {
    if (!isEdit || !shedId) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getShed(shedId as string);
        if (cancelled) return;
        setDate(isoToYMD(s.shed_at));
        setComplete(s.is_complete_shed ? 'yes' : 'no');
        setRetained(s.has_retained_shed ? 'yes' : 'no');
        setRetainedNotes(s.retained_shed_notes ?? '');
        setNotes(s.notes ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Couldn't load this shed."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, shedId]);

  async function handleSubmit() {
    if (submitting) return;
    if (!isEdit && !id) return;
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
      if (isEdit && shedId) {
        await updateShed(shedId as string, payload);
      } else {
        await createShed(id as string, payload);
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
      <AppHeader
        title={isEdit ? 'Edit shed' : 'Log shed'}
        leftAction={<HeaderBackButton />}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
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
            label={isEdit ? 'Save changes' : 'Save shed'}
            busy={submitting}
            onPress={handleSubmit}
          />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
});
