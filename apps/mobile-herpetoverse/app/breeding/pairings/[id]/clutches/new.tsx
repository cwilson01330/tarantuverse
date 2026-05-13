/**
 * New clutch form — Sprint 5c.
 *
 * Mobile port of apps/web-herpetoverse/.../breeding/pairings/[id]/clutches/new.
 *
 * UX intent: only `laid_date` is required. Everything else (incubation
 * conditions, counts, lifecycle dates) is optional and lives under an
 * expandable "More details" section so the initial form stays welcoming
 * and the keeper can fill in numbers as they observe them.
 *
 * Date inputs are YYYY-MM-DD text fields validated via dateToISO — same
 * pattern as the pairing form. Numeric fields are stored as strings and
 * coerced at submit time so empty inputs serialize cleanly to null.
 *
 * Honesty-first: we surface the constraint ranges (temp 40-120°F,
 * humidity 0-100, count 0-200) as hint text rather than silently
 * clamping. If a keeper types 250, we reject with an explicit message.
 *
 * Hermes-prod safety: static JSX branches only — no dynamic component
 * variables. See feedback_dynamic_component_hermes_prod_crash memory.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../../src/components/AppHeader';
import { HeaderBackButton } from '../../../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../../../src/components/ErrorBoundary';
import {
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
  type CreateClutchPayload,
  createClutch,
} from '../../../../../src/lib/breeding';

/** Parse a numeric text input into number | null, with range check. */
function parseNumber(
  raw: string,
  field: string,
  min: number,
  max: number,
  allowDecimal: boolean,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} should be a number.` };
  }
  if (!allowDecimal && !Number.isInteger(n)) {
    return { ok: false, error: `${field} should be a whole number.` };
  }
  if (n < min || n > max) {
    return {
      ok: false,
      error: `${field} should be between ${min} and ${max}.`,
    };
  }
  return { ok: true, value: n };
}

function NewClutchScreen() {
  const router = useRouter();
  const { id: pairingId } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [laidDate, setLaidDate] = useState<string>(() => todayISO());
  const [pulledDate, setPulledDate] = useState<string>('');
  const [expectedHatchDate, setExpectedHatchDate] = useState<string>('');
  const [hatchDate, setHatchDate] = useState<string>('');

  const [tempMin, setTempMin] = useState<string>('');
  const [tempMax, setTempMax] = useState<string>('');
  const [humMin, setHumMin] = useState<string>('');
  const [humMax, setHumMax] = useState<string>('');

  const [expectedCount, setExpectedCount] = useState<string>('');
  const [fertileCount, setFertileCount] = useState<string>('');
  const [slugCount, setSlugCount] = useState<string>('');
  const [hatchedCount, setHatchedCount] = useState<string>('');
  const [viableCount, setViableCount] = useState<string>('');

  const [notes, setNotes] = useState<string>('');

  const [moreOpen, setMoreOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!pairingId) {
      setError('Missing pairing id — go back and try again.');
      return;
    }
    setError(null);

    // Validate laid_date first since it's the only required field.
    const laidIso = dateToISO(laidDate);
    if (!laidIso) {
      setError('Laid date is required and should be YYYY-MM-DD.');
      return;
    }

    // Each optional date — empty is fine, otherwise must parse.
    const parsedDates: Record<string, string | null> = {};
    for (const [key, raw] of [
      ['pulled_date', pulledDate],
      ['expected_hatch_date', expectedHatchDate],
      ['hatch_date', hatchDate],
    ] as const) {
      const trimmed = raw.trim();
      if (!trimmed) {
        parsedDates[key] = null;
        continue;
      }
      const iso = dateToISO(trimmed);
      if (!iso) {
        setError(
          `${key.replace(/_/g, ' ')} should be YYYY-MM-DD or empty.`,
        );
        return;
      }
      parsedDates[key] = iso.slice(0, 10);
    }

    // Numeric validation.
    const numericFields: Array<{
      raw: string;
      field: string;
      min: number;
      max: number;
      allowDecimal: boolean;
      key: string;
    }> = [
      { raw: tempMin, field: 'Temp min', min: 40, max: 120, allowDecimal: true, key: 'incubation_temp_min_f' },
      { raw: tempMax, field: 'Temp max', min: 40, max: 120, allowDecimal: true, key: 'incubation_temp_max_f' },
      { raw: humMin, field: 'Humidity min', min: 0, max: 100, allowDecimal: false, key: 'incubation_humidity_min_pct' },
      { raw: humMax, field: 'Humidity max', min: 0, max: 100, allowDecimal: false, key: 'incubation_humidity_max_pct' },
      { raw: expectedCount, field: 'Initial egg count', min: 0, max: 200, allowDecimal: false, key: 'expected_count' },
      { raw: fertileCount, field: 'Fertile count', min: 0, max: 200, allowDecimal: false, key: 'fertile_count' },
      { raw: slugCount, field: 'Slug count', min: 0, max: 200, allowDecimal: false, key: 'slug_count' },
      { raw: hatchedCount, field: 'Hatched count', min: 0, max: 200, allowDecimal: false, key: 'hatched_count' },
      { raw: viableCount, field: 'Viable count', min: 0, max: 200, allowDecimal: false, key: 'viable_count' },
    ];
    const numericValues: Record<string, number | null> = {};
    for (const f of numericFields) {
      const r = parseNumber(f.raw, f.field, f.min, f.max, f.allowDecimal);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      numericValues[f.key] = r.value;
    }

    // Cross-field sanity: min ≤ max where both are present.
    if (
      numericValues.incubation_temp_min_f != null &&
      numericValues.incubation_temp_max_f != null &&
      numericValues.incubation_temp_min_f > numericValues.incubation_temp_max_f
    ) {
      setError('Temp min should be ≤ temp max.');
      return;
    }
    if (
      numericValues.incubation_humidity_min_pct != null &&
      numericValues.incubation_humidity_max_pct != null &&
      numericValues.incubation_humidity_min_pct >
        numericValues.incubation_humidity_max_pct
    ) {
      setError('Humidity min should be ≤ humidity max.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateClutchPayload = {
        pairing_id: pairingId as string,
        laid_date: laidIso.slice(0, 10),
        pulled_date: parsedDates.pulled_date,
        expected_hatch_date: parsedDates.expected_hatch_date,
        hatch_date: parsedDates.hatch_date,
        incubation_temp_min_f: numericValues.incubation_temp_min_f,
        incubation_temp_max_f: numericValues.incubation_temp_max_f,
        incubation_humidity_min_pct:
          numericValues.incubation_humidity_min_pct,
        incubation_humidity_max_pct:
          numericValues.incubation_humidity_max_pct,
        expected_count: numericValues.expected_count,
        fertile_count: numericValues.fertile_count,
        slug_count: numericValues.slug_count,
        hatched_count: numericValues.hatched_count,
        viable_count: numericValues.viable_count,
        notes: notes.trim() || null,
      };
      const created = await createClutch(payload);
      router.replace(`/breeding/clutches/${created.id}` as never);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't save the clutch."));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New clutch" leftAction={<HeaderBackButton />} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Record what was laid. You can update incubation conditions and
            counts later as the clutch develops.
          </Text>

          <Field label="Laid date" required hint="YYYY-MM-DD">
            <ThemedInput
              value={laidDate}
              onChangeText={setLaidDate}
              placeholder={todayISO()}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </Field>

          <Field
            label="Initial egg count"
            hint="Total eggs laid — fertile + slug + anything in-between. 0–200."
          >
            <ThemedInput
              value={expectedCount}
              onChangeText={setExpectedCount}
              placeholder="e.g. 8"
              keyboardType="number-pad"
            />
          </Field>

          {/* Disclosure for the long-tail of fields. Static branching —
              no dynamic component pattern. */}
          <TouchableOpacity
            onPress={() => setMoreOpen((v) => !v)}
            style={[
              styles.disclosureHeader,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: layout.radius.md,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
          >
            <MaterialCommunityIcons
              name={moreOpen ? 'chevron-down' : 'chevron-right'}
              size={20}
              color={colors.textSecondary}
            />
            <Text
              style={[styles.disclosureTitle, { color: colors.textPrimary }]}
            >
              Incubation + lifecycle
            </Text>
            <Text
              style={[
                styles.disclosureHint,
                { color: colors.textTertiary },
              ]}
            >
              optional
            </Text>
          </TouchableOpacity>

          {moreOpen && (
            <View style={{ gap: 16 }}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Pulled" hint="YYYY-MM-DD">
                    <ThemedInput
                      value={pulledDate}
                      onChangeText={setPulledDate}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                  </Field>
                </View>
                <View style={styles.col}>
                  <Field label="Expected hatch" hint="YYYY-MM-DD">
                    <ThemedInput
                      value={expectedHatchDate}
                      onChangeText={setExpectedHatchDate}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                  </Field>
                </View>
              </View>

              <Field label="Actual hatch date" hint="YYYY-MM-DD">
                <ThemedInput
                  value={hatchDate}
                  onChangeText={setHatchDate}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </Field>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Temp min (°F)" hint="40–120">
                    <ThemedInput
                      value={tempMin}
                      onChangeText={setTempMin}
                      placeholder="e.g. 86"
                      keyboardType="decimal-pad"
                    />
                  </Field>
                </View>
                <View style={styles.col}>
                  <Field label="Temp max (°F)" hint="40–120">
                    <ThemedInput
                      value={tempMax}
                      onChangeText={setTempMax}
                      placeholder="e.g. 91"
                      keyboardType="decimal-pad"
                    />
                  </Field>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Humidity min %" hint="0–100">
                    <ThemedInput
                      value={humMin}
                      onChangeText={setHumMin}
                      placeholder="e.g. 75"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
                <View style={styles.col}>
                  <Field label="Humidity max %" hint="0–100">
                    <ThemedInput
                      value={humMax}
                      onChangeText={setHumMax}
                      placeholder="e.g. 95"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Fertile" hint="0–200">
                    <ThemedInput
                      value={fertileCount}
                      onChangeText={setFertileCount}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
                <View style={styles.col}>
                  <Field label="Slugs (infertile)" hint="0–200">
                    <ThemedInput
                      value={slugCount}
                      onChangeText={setSlugCount}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Hatched" hint="0–200">
                    <ThemedInput
                      value={hatchedCount}
                      onChangeText={setHatchedCount}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
                <View style={styles.col}>
                  <Field label="Viable" hint="0–200, survived to weaning">
                    <ThemedInput
                      value={viableCount}
                      onChangeText={setViableCount}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </Field>
                </View>
              </View>
            </View>
          )}

          <Field label="Notes" hint="Optional">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Cutting strategy, problem eggs, observations…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label="Save clutch"
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: { flex: 1 },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  disclosureTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  disclosureHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});

export default withErrorBoundary(NewClutchScreen, 'clutches-new');
