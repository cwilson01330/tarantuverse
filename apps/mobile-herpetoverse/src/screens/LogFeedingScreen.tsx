/**
 * Log feeding — shared screen for every taxon, also handles edit.
 *
 * ADR-003: snakes/lizards/frogs collapsed into one `animals` table, so
 * create posts to `/animals/<id>/feedings` and the screen no longer
 * needs a `taxon` prop. The canonical route is `/reptile/log-feeding/[id]`;
 * the legacy `/lizard/log-feeding/[id]` route redirects there.
 *
 * EDIT MODE: when the route includes a `feedingId` query param the screen
 * pre-fills via GET /feedings/{id} and PUTs on save — feeding rows carry
 * a single `animal_id` and the route is taxon-agnostic.
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { AppHeader } from '../components/AppHeader';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { PauseFeedingSheet } from '../components/PauseFeedingSheet';
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
  type PreySuggestion,
  createFeeding,
  getAnimal,
  getFeeding,
  getPreySuggestion,
  updateFeeding,
} from '../lib/animals';

const PAUSE_REASON_LABELS: Record<string, string> = {
  hunger_strike: 'Hunger strike',
  post_rehouse: 'Post-rehouse',
  recovering: 'Recovering',
  breeding_season: 'Breeding season',
  other: 'Paused',
};

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

export function LogFeedingScreen() {
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
  // Feeding-pause state for the animal — surfaced in this screen so
  // the keeper can pause / edit / resume in the same flow as logging
  // a refused feeding. The natural moment is "she just refused → I
  // think she's in [hunger strike / brumation prep / post-rehouse] →
  // mute reminders". See migration pst_20260502 / pse_20260502.
  const [animalName, setAnimalName] = useState<string | null>(null);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [showPauseSheet, setShowPauseSheet] = useState(false);
  const [showPauseHelp, setShowPauseHelp] = useState(false);
  // Prey-size guidance. Only fetched in create mode (editing an old
  // log shouldn't surface real-time suggestions for the current state
  // of the animal — the keeper is correcting historical data).
  const [suggestion, setSuggestion] = useState<PreySuggestion | null>(null);

  /** Pulls the animal record so we can show current pause state inline.
   *  Called on mount and again after the PauseFeedingSheet saves. */
  async function loadAnimalPauseState() {
    if (!id) return;
    try {
      const animal = await getAnimal(id as string);
      setAnimalName(
        animal.name || animal.scientific_name || 'This animal',
      );
      setPausedReason(animal.feeding_paused_reason ?? null);
      setPausedUntil(animal.feeding_paused_until ?? null);
    } catch {
      // Non-fatal — pause section just shows the default copy.
    }
  }

  // Load pause state once we have an id (skipped in edit mode where
  // the screen is purely about correcting an existing log).
  useEffect(() => {
    if (id && !isEdit) loadAnimalPauseState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // Fetch species-aware prey suggestion so the prey-weight field can
  // show a live "X% of body weight" hint as the keeper types. Skipped
  // in edit mode — correcting an old log shouldn't show advice based
  // on the animal's CURRENT weight (which may have drifted since the
  // log was originally entered).
  useEffect(() => {
    if (!id || isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getPreySuggestion(id as string);
        if (!cancelled) setSuggestion(s);
      } catch {
        // Non-fatal — hint just won't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  /**
   * Live prey:body-weight ratio hint. Returns null when there isn't
   * enough data to compute (empty input, no snake weight, missing
   * species brackets). The tone drives the color in the field hint:
   *   - 'ok'      → green, within suggested range
   *   - 'caution' → amber, outside [min..max] but below power threshold
   *   - 'warn'    → red, at or above power-feeding threshold
   *   - 'neutral' → muted, missing animal weight so percent is unknown
   */
  const preyHint = useMemo<{
    tone: 'ok' | 'caution' | 'warn' | 'neutral';
    text: string;
  } | null>(() => {
    if (!suggestion || !suggestion.is_data_available) return null;
    const preyG = Number(preyWeight);
    if (!Number.isFinite(preyG) || preyG <= 0) return null;
    const bwG = Number(suggestion.snake_weight_g);
    if (!Number.isFinite(bwG) || bwG <= 0) {
      return {
        tone: 'neutral',
        text: 'No animal weight on file — log a weight to see the ratio.',
      };
    }
    const pct = (preyG / bwG) * 100;
    const pctLabel = pct.toFixed(1).replace(/\.?0+$/, '');
    const thresholdG = suggestion.power_feeding_threshold_g
      ? Number(suggestion.power_feeding_threshold_g)
      : null;
    const minG = suggestion.suggested_min_g
      ? Number(suggestion.suggested_min_g)
      : null;
    const maxG = suggestion.suggested_max_g
      ? Number(suggestion.suggested_max_g)
      : null;
    if (thresholdG != null && preyG >= thresholdG) {
      return {
        tone: 'warn',
        text: `${pctLabel}% of body weight — above the power-feeding line.`,
      };
    }
    if (minG != null && maxG != null && (preyG < minG || preyG > maxG)) {
      return {
        tone: 'caution',
        text: `${pctLabel}% of body weight — outside the suggested range for this stage.`,
      };
    }
    return { tone: 'ok', text: `${pctLabel}% of body weight.` };
  }, [suggestion, preyWeight]);

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
      } else {
        await createFeeding(id as string, payload);
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
              {preyHint && (
                <Text
                  style={[
                    styles.preyHint,
                    {
                      color:
                        preyHint.tone === 'warn'
                          ? '#fca5a5'
                          : preyHint.tone === 'caution'
                            ? '#fcd34d'
                            : preyHint.tone === 'ok'
                              ? '#86efac'
                              : colors.textTertiary,
                    },
                  ]}
                >
                  {preyHint.text}
                </Text>
              )}
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

            {/* Pause feeding row — discoverable in-context with the
                log-feeding flow. "She just refused — I think she's
                in a hunger strike" is the moment most keepers reach
                for a mute. Hidden in edit mode (correcting an old
                log isn't the right time to manage pause state). */}
            {!isEdit && id && (
              <View style={styles.pauseSection}>
                <View style={styles.pauseHeaderRow}>
                  <Text style={[styles.pauseLabel, { color: colors.textTertiary }]}>
                    {pausedReason ? 'FEEDING PAUSED' : 'GOING OFF FEED?'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowPauseHelp((v) => !v)}
                    hitSlop={8}
                    accessibilityLabel="What does pausing feedings do?"
                  >
                    <MaterialCommunityIcons
                      name="information-outline"
                      size={16}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>
                {showPauseHelp && (
                  <View
                    style={[
                      styles.tooltip,
                      {
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.tooltipText, { color: colors.textSecondary }]}>
                      Snakes and lizards can refuse food for weeks during
                      hunger strikes, brumation prep, post-rehouse settling,
                      or breeding season. Pause to mute "overdue" reminders
                      so they don't drown out real ones on your other
                      animals. You can resume any time.
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setShowPauseSheet(true)}
                  style={[
                    styles.pauseRow,
                    {
                      backgroundColor: pausedReason
                        ? colors.surfaceRaised
                        : 'transparent',
                      borderColor: pausedReason ? colors.info : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    pausedReason
                      ? 'Edit or resume feeding pause'
                      : 'Pause feeding reminders'
                  }
                >
                  <MaterialCommunityIcons
                    name={pausedReason ? 'pause-circle' : 'pause-circle-outline'}
                    size={22}
                    color={pausedReason ? colors.info : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 15,
                        fontWeight: '600',
                      }}
                    >
                      {pausedReason
                        ? PAUSE_REASON_LABELS[pausedReason] ?? 'Paused'
                        : 'Pause feeding reminders'}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {pausedReason
                        ? pausedUntil
                          ? `Auto-resumes ${new Date(pausedUntil).toLocaleDateString()} — tap to edit`
                          : 'Indefinite — tap to edit or resume'
                        : 'Mute overdue alerts during hunger strikes or fasting'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            )}

            {error && <FormErrorBanner message={error} />}

            <SubmitButton
              label={isEdit ? 'Save changes' : 'Save feeding'}
              busy={submitting}
              onPress={handleSubmit}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Pause sheet — refetches animal state on save so the row
          above reflects the new state without leaving this screen. */}
      {!isEdit && id && (
        <PauseFeedingSheet
          visible={showPauseSheet}
          onClose={() => setShowPauseSheet(false)}
          animalId={id as string}
          animalName={animalName}
          currentReason={pausedReason}
          currentUntil={pausedUntil}
          onChange={loadAnimalPauseState}
        />
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
  pauseSection: {
    gap: 8,
  },
  pauseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pauseLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  tooltip: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  tooltipText: {
    fontSize: 12,
    lineHeight: 17,
  },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  preyHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    fontWeight: '600',
  },
});
