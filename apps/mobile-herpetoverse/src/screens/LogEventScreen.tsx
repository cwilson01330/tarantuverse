/**
 * Log event — health & lifecycle notes (ADR-015 D5, audit-2 M12). Also edits.
 *
 * HV twin of TV mobile's app/invert/add-event.tsx: same picker order,
 * severity only for injury / illness, same per-type note prompts, same copy.
 * Laid out like the other HV log screens (LogShedScreen): text date field,
 * ChipGroup, SubmitButton, and Delete in edit mode.
 *
 * EDIT MODE: `?eventId=` pre-fills the form. There's no GET-one route for
 * events, so the animal's list is fetched and the row picked out — an animal
 * has a handful of events, not hundreds.
 *
 * The detail screen only links here for an animal that isn't closed (died /
 * transferred) and, in edit mode, only for an entry the viewer may change.
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
  extractErrorMessage,
  todayISO,
} from '../components/forms/FormPrimitives';
import {
  ANIMAL_EVENT_LABELS,
  ANIMAL_EVENT_NOTE_HINT,
  ANIMAL_EVENT_ORDER,
  ANIMAL_EVENT_SEVERITIES,
  type AnimalEventSeverity,
  type AnimalEventType,
  createAnimalEvent,
  deleteAnimalEvent,
  eventHasSeverity,
  listAnimalEvents,
  updateAnimalEvent,
} from '../lib/animal-events';

const TYPE_OPTIONS = ANIMAL_EVENT_ORDER.map((t) => ({ value: t, label: ANIMAL_EVENT_LABELS[t] }));

export function LogEventScreen() {
  const router = useRouter();
  const { id, eventId } = useLocalSearchParams<{ id?: string; eventId?: string }>();
  const isEdit = Boolean(eventId);
  const { colors, layout } = useTheme();

  const [type, setType] = useState<AnimalEventType>('observation');
  const [date, setDate] = useState(() => todayISO());
  const [severity, setSeverity] = useState<AnimalEventSeverity | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !id || !eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await listAnimalEvents(id as string);
        if (cancelled) return;
        const e = all.find((x) => x.id === eventId);
        if (!e) {
          setError("Couldn't find this event — it may have been deleted.");
          return;
        }
        setType(e.event_type);
        setDate(e.occurred_at.slice(0, 10));
        setSeverity(e.severity ?? '');
        setNotes(e.notes ?? '');
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, "Couldn't load this event."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id, eventId]);

  const showSeverity = eventHasSeverity(type);

  async function handleSubmit() {
    if (submitting) return;
    if (!isEdit && !id) return;
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Use a date in YYYY-MM-DD format.');
      return;
    }
    if (date.trim() > todayISO()) {
      setError("That date hasn't happened yet.");
      return;
    }
    const payload = {
      event_type: type,
      occurred_at: date.trim(),
      // Don't smuggle a stale severity through if the type was switched.
      severity: showSeverity ? severity || null : null,
      notes: notes.trim() || null,
    };
    setSubmitting(true);
    try {
      if (isEdit && eventId) {
        await updateAnimalEvent(eventId as string, payload);
      } else {
        await createAnimalEvent(id as string, payload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this event.'));
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!isEdit || !eventId || deleting) return;
    Alert.alert('Delete this event?', 'This permanently removes it. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setError(null);
          try {
            await deleteAnimalEvent(eventId as string);
            router.back();
          } catch (err) {
            setError(extractErrorMessage(err, 'Could not delete this event.'));
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title={isEdit ? 'Edit event' : 'Log event'} leftAction={<HeaderBackButton />} />
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
            <Field label="What happened?" required>
              <ChipGroup options={TYPE_OPTIONS} value={type} onChange={setType} />
            </Field>

            <Field
              label="When"
              required
              hint="YYYY-MM-DD. Most events get noticed after the fact — backdating is normal."
            >
              <ThemedInput
                value={date}
                onChangeText={setDate}
                placeholder="2026-04-27"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </Field>

            {showSeverity && (
              <Field label="How bad?" hint="Optional">
                <View style={styles.chipRow}>
                  {ANIMAL_EVENT_SEVERITIES.map((sv) => {
                    const sel = sv === severity;
                    const label = sv[0].toUpperCase() + sv.slice(1);
                    return (
                      <TouchableOpacity
                        key={sv}
                        onPress={() => setSeverity(sel ? '' : sv)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: sel ? colors.warning : colors.background,
                            borderColor: sel ? colors.warning : colors.border,
                            borderRadius: layout.radius.sm,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={label}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            { color: sel ? '#0B0B0B' : colors.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>
            )}

            <Field label="Notes" hint="Optional">
              <ThemedInput
                value={notes}
                onChangeText={setNotes}
                placeholder={ANIMAL_EVENT_NOTE_HINT[type]}
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, paddingTop: 12 }}
              />
            </Field>

            {error && <FormErrorBanner message={error} />}

            <SubmitButton
              label={isEdit ? 'Save changes' : 'Save event'}
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
                accessibilityLabel="Delete this event"
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                    <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                      Delete event
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
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
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
  deleteButtonText: { fontSize: 15, fontWeight: '600' },
});
