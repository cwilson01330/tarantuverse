/**
 * Log weight — shared screen for every taxon, also handles edit.
 *
 * Mirrors the web LogWeightForm minus the chart preview. Backend
 * denormalizes `current_weight_g` on the parent record when the new log
 * is the most recent one, so the detail screen will see the updated
 * weight on next refresh.
 *
 * EDIT MODE: when the route includes a `weightId` query param, pre-fill
 * via GET /weight-logs/{id} and PUT on save. Edit dispatches taxon-
 * agnostically since /weight-logs/{id} is polymorphic. Per the API,
 * editing a historical weight does NOT recompute the parent record's
 * current_weight_g hint — that's intentional and rare enough not to
 * matter.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  type CreateWeightLogPayload,
  type WeightContext,
  createWeightLog,
  deleteWeightLog,
  getWeightLog,
  updateWeightLog,
  WEIGHT_CONTEXT_LABELS,
} from '../lib/animals';

const CONTEXT_OPTIONS = (
  Object.keys(WEIGHT_CONTEXT_LABELS) as WeightContext[]
).map((value) => ({ value, label: WEIGHT_CONTEXT_LABELS[value] }));

/** Format an ISO datetime as YYYY-MM-DD in the user's local TZ. */
function isoToYMD(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayISO();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LogWeightScreen() {
  const router = useRouter();
  const { id, weightId } = useLocalSearchParams<{
    id?: string;
    weightId?: string;
  }>();
  const isEdit = Boolean(weightId);
  const { colors, layout } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [grams, setGrams] = useState('');
  const [context, setContext] = useState<WeightContext>('routine');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  // Edit mode — pre-fill from existing weight log.
  useEffect(() => {
    if (!isEdit || !weightId) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await getWeightLog(weightId as string);
        if (cancelled) return;
        setDate(isoToYMD(w.weighed_at));
        setGrams(String(w.weight_g));
        setContext(w.context);
        setNotes(w.notes ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Couldn't load this weigh-in."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, weightId]);

  async function handleSubmit() {
    if (submitting) return;
    if (!isEdit && !id) return;
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
      if (isEdit && weightId) {
        await updateWeightLog(weightId as string, payload);
      } else {
        await createWeightLog(id as string, payload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save weight.'));
      setSubmitting(false);
    }
  }

  // Delete this weight log. Only reachable in edit mode. Note the
  // backend does NOT recompute the parent animal's current_weight_g
  // hint when a historical log is removed — that's intentional and
  // rare enough not to matter.
  function handleDelete() {
    if (!isEdit || !weightId || deleting) return;
    Alert.alert(
      'Delete this weigh-in?',
      'This permanently removes the weight log. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setError(null);
            try {
              await deleteWeightLog(weightId as string);
              router.back();
            } catch (err) {
              setError(
                extractErrorMessage(err, 'Could not delete this weight.'),
              );
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title={isEdit ? 'Edit weight' : 'Log weight'}
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
              label={isEdit ? 'Save changes' : 'Save weight'}
              busy={submitting}
              onPress={handleSubmit}
            />

            {isEdit && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting || submitting}
                style={[
                  styles.deleteButton,
                  {
                    borderColor: colors.danger,
                    borderRadius: layout.radius.md,
                    opacity: deleting || submitting ? 0.5 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Delete this weigh-in"
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color={colors.danger}
                    />
                    <Text
                      style={[styles.deleteButtonText, { color: colors.danger }]}
                    >
                      Delete weigh-in
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
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
  deleteButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
