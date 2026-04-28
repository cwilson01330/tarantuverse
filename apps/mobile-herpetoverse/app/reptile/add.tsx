/**
 * Add reptile — Sprint 8 Bundle 4.
 *
 * Slim version of web-herpetoverse `/app/reptiles/add`. Lets a keeper
 * pick taxon (snake/lizard), then captures the minimum a row needs to
 * be useful: name, sex, scientific name, hatch date, source, optional
 * starting weight + notes.
 *
 * Species autocomplete + enclosure picker are deferred to Bundle 5 —
 * Bundle 4 ships the create flow so keepers can stop hopping to web
 * just to add an animal. Once a row exists they can edit on web (or
 * via Bundle 5's edit screen) to attach a species or enclosure.
 *
 * Routing: on success we replace the route with the detail screen for
 * the new animal so back navigation lands on the collection (not on a
 * stale add screen).
 */
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  dateToISO,
  extractErrorMessage,
} from '../../src/components/forms/FormPrimitives';
import { EnclosurePicker } from '../../src/components/forms/EnclosurePicker';
import { ReptileSpeciesAutocomplete } from '../../src/components/forms/ReptileSpeciesAutocomplete';
import {
  type CreateSnakePayload,
  type Sex,
  type Source,
  createSnake,
} from '../../src/lib/snakes';
import {
  type CreateLizardPayload,
  createLizard,
} from '../../src/lib/lizards';

const TAXON_OPTIONS = [
  { value: 'snake' as const, label: 'Snake' },
  { value: 'lizard' as const, label: 'Lizard' },
];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unknown', label: 'Unknown' },
];

// Source is optional — represented as `unset | bred | bought | wild_caught`
// internally so the chip picker can show "—" as a default. We translate
// `unset` → null in the payload.
type SourceChoice = Source | 'unset';
const SOURCE_OPTIONS: { value: SourceChoice; label: string }[] = [
  { value: 'unset', label: '—' },
  { value: 'bred', label: 'Bred' },
  { value: 'bought', label: 'Bought' },
  { value: 'wild_caught', label: 'Wild-caught' },
];

function AddReptileScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [taxon, setTaxon] = useState<'snake' | 'lizard'>('snake');
  const [name, setName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [enclosureId, setEnclosureId] = useState<string | null>(null);
  const [commonName, setCommonName] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [hatchDate, setHatchDate] = useState('');
  const [source, setSource] = useState<SourceChoice>('unset');
  const [currentWeight, setCurrentWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    // No required fields beyond the implicit "something the row can be
    // identified by" — backend allows a fully-blank reptile, but a
    // keeper without name/scientific/common will see "Unnamed" forever.
    // Soft-warn but don't block.
    const trimmedName = name.trim();
    const trimmedSci = scientificName.trim();
    const trimmedCommon = commonName.trim();
    if (!trimmedName && !trimmedSci && !trimmedCommon) {
      setError('Add at least a name, scientific name, or common name.');
      return;
    }

    let hatchIso: string | null = null;
    if (hatchDate.trim()) {
      const iso = dateToISO(hatchDate);
      if (!iso) {
        setError('Hatch date should be YYYY-MM-DD or empty.');
        return;
      }
      // Backend `hatch_date` is a date column (no time), strip to date.
      hatchIso = iso.slice(0, 10);
    }

    const weightN = currentWeight.trim();
    if (weightN && !Number.isFinite(Number(weightN))) {
      setError('Current weight needs to be a number, or leave it blank.');
      return;
    }

    const payload: CreateSnakePayload | CreateLizardPayload = {
      name: trimmedName || null,
      scientific_name: trimmedSci || null,
      common_name: trimmedCommon || null,
      reptile_species_id: speciesId,
      enclosure_id: enclosureId,
      sex,
      hatch_date: hatchIso,
      source: source === 'unset' ? null : source,
      current_weight_g: weightN ? Number(weightN) : null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      const created =
        taxon === 'snake'
          ? await createSnake(payload as CreateSnakePayload)
          : await createLizard(payload as CreateLizardPayload);
      // Replace so back goes to collection, not back to this form.
      const detailPath =
        taxon === 'snake' ? `/reptile/${created.id}` : `/lizard/${created.id}`;
      router.replace(detailPath as never);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this reptile.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Add reptile', headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Taxon" required>
            <ChipGroup
              options={TAXON_OPTIONS}
              value={taxon}
              onChange={setTaxon}
            />
          </Field>

          <Field label="Name" hint="What you call them. Optional but most keepers fill it.">
            <ThemedInput
              value={name}
              onChangeText={setName}
              placeholder="Hex"
              autoCapitalize="words"
            />
          </Field>

          <Field
            label="Species"
            hint="Type 2+ letters to search our care-sheet library. Picking a match unlocks prey suggestions later."
          >
            <ReptileSpeciesAutocomplete
              speciesId={speciesId}
              scientificName={scientificName}
              onChange={({ id, scientificName: sci }) => {
                setSpeciesId(id);
                setScientificName(sci);
              }}
              onPick={(species) => {
                // Auto-fill common name from the matched species when
                // the keeper hasn't typed one yet — they can still
                // overwrite if "Royal Python" feels stuffy and they'd
                // prefer "Ball Python."
                if (!commonName.trim() && species.common_names[0]) {
                  setCommonName(species.common_names[0]);
                }
              }}
            />
          </Field>

          <Field label="Common name" hint="e.g. Ball python">
            <ThemedInput
              value={commonName}
              onChangeText={setCommonName}
              placeholder="Ball python"
              autoCapitalize="words"
            />
          </Field>

          <Field label="Sex">
            <ChipGroup options={SEX_OPTIONS} value={sex} onChange={setSex} />
          </Field>

          <Field label="Hatch date" hint="YYYY-MM-DD. Optional.">
            <ThemedInput
              value={hatchDate}
              onChangeText={setHatchDate}
              placeholder="2023-09-15"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </Field>

          <Field label="Source" hint="Optional.">
            <ChipGroup
              options={SOURCE_OPTIONS}
              value={source}
              onChange={setSource}
            />
          </Field>

          <Field
            label="Enclosure"
            hint="Optional. Link to a setup so feedings + sheds roll up there."
          >
            <EnclosurePicker value={enclosureId} onChange={setEnclosureId} />
          </Field>

          <Field
            label="Current weight (g)"
            hint="Optional. You can also log this as a weigh-in afterwards."
          >
            <ThemedInput
              value={currentWeight}
              onChangeText={setCurrentWeight}
              placeholder="650"
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Notes" hint="Optional. Anything that doesn't fit above.">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Got from a friend at the Tinley reptile expo…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label={`Save ${taxon}`}
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

export default withErrorBoundary(AddReptileScreen, 'add-reptile');
