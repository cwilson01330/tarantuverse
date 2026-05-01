/**
 * Log feeding — shared screen for snake and lizard, also handles edit.
 *
 * Two route entries (`/reptile/log-feeding/[id]` and
 * `/lizard/log-feeding/[id]`) wrap this component, passing `taxon`. The
 * screen routes its createFeeding call to the right lib so the request
 * lands on `/snakes/<id>/feedings` or `/lizards/<id>/feedings`.
 *
 * EDIT MODE: when the route includes a `feedingId` query param the screen
 * pre-fills via GET /feedings/{id} and PUTs on save. The taxon-specific
 * snake/lizard libs aren't needed for edit since /feedings/{id} is
 * polymorphic (resolved server-side via the row's snake_id / lizard_id).
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
  type CreateFeedingPayload,
  createFeeding as createFeedingSnake,
  getFeeding,
  updateFeeding,
} from '../lib/snakes';
import { createFeeding as createFeedingLizard } from '../lib/lizards';

type Outcome = 'yes' | 'no' | 'regurg';

const OUTCOME_OPTIONS = [
  { value: 'yes' as const, label: 'Accepted' },
  { value: 'no' as const, label: 'Refused' },
  { value: 'regurg' as const, label: 'Regurg' },
];

const REGURG_PREFIX = 'Regurgitation. ';

/** Format an ISO datetime as YYYY-MM-DD in the user's local TZ. */
function isoToYMD(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayISO();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LogFeedingScreen({ taxon }: { taxon: 'snake' | 'lizard' }) {
  const router = useRouter();
  const { id, feedingId } = useLocalSearchParams<{
    id?: string;
    feedingId?: string;
  }>();
  const isEdit = Boolean(feedingId);
  const { colors } = useTheme();

  const [date, setDate] = useState(() => todayISO());
  const [foodType, setFoodType] = useState('');
  const [preyWeight, setPreyWeight] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('yes');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  // Edit mode — pre-fill from the existing feeding record.
  useEffect(() => {
    if (!isEdit || !feedingId) return;
    let cancelled = false;
    (async () => {
      try {
        const f = await getFeeding(feedingId as string);
        if (cancelled) return;
        setDate(isoToYMD(f.fed_at));
        setFoodType(f.food_type ?? '');
        setPreyWeight(f.prey_weight_g != null ? String(f.prey_weight_g) : '');

        // Reverse-map the regurg sentinel back to the chip.
        const rawNotes = f.notes ?? '';
        if (!f.accepted && rawNotes.startsWith(REGURG_PREFIX)) {
          setOutcome('regurg');
          setNotes(rawNotes.slice(REGURG_PREFIX.length));
        } else {
          setOutcome(f.accepted ? 'yes' : 'no');
          setNotes(rawNotes);
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Couldn't load this feeding."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, feedingId]);

  async function handleSubmit() {
    if (submitting) return;
    if (!isEdit && !id) return;
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
        ? `${REGURG_PREFIX}${noteText}`.trim()
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
      if (isEdit && feedingId) {
        await updateFeeding(feedingId as string, payload);
      } else if (taxon === 'snake') {
        await createFeedingSnake(id as string, payload);
      } else {
        await createFeedingLizard(id as string, payload);
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
      <AppHeader
        title={isEdit ? 'Edit feeding' : 'Log feeding'}
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
              label={isEdit ? 'Save changes' : 'Save feeding'}
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
