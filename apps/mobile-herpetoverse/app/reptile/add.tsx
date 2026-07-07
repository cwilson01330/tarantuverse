/**
 * Add reptile — Sprint 8 Bundle 4.
 *
 * Slim version of web-herpetoverse `/app/reptiles/add`. Lets a keeper
 * pick taxon (snake, lizard, or frog), then captures the minimum a row
 * needs to be useful: name, sex, scientific name, hatch date, source,
 * optional starting weight + notes.
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
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
import UpgradeModal from '../../src/components/UpgradeModal';
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  type AnimalTaxon,
  type CreateAnimalPayload,
  type Sex,
  type Source,
  createAnimal,
  isAnimalTaxon,
} from '../../src/lib/animals';

// Taxon chips sourced from the registry (ADR-011) — glyph + label per
// entry, in display order. Adding a herp group in lib/animals.ts makes
// it selectable here with no code change.
const TAXON_OPTIONS = ANIMAL_TAXON_ORDER.map((t) => ({
  value: t,
  label: `${ANIMAL_TAXA[t].glyph} ${ANIMAL_TAXA[t].label}`,
}));

// Per-taxon example values for input placeholders, so the form speaks
// the keeper's animal instead of always sounding snake-first. Taxa
// without a bespoke example fall back to a generic prompt via
// `exampleFor()` below.
const TAXON_EXAMPLES: Partial<
  Record<AnimalTaxon, { name: string; common: string; weight: string }>
> = {
  snake: { name: 'Hex', common: 'Ball python', weight: '650' },
  lizard: { name: 'Kiwi', common: 'Leopard gecko', weight: '60' },
  turtle: { name: 'Shelly', common: 'Red-eared slider', weight: '400' },
  tortoise: { name: 'Tank', common: 'Russian tortoise', weight: '350' },
  frog: { name: 'Bean', common: 'Pacman frog', weight: '90' },
  salamander: { name: 'Sal', common: 'Tiger salamander', weight: '40' },
};

const GENERIC_EXAMPLE = { name: 'Rex', common: 'Species name', weight: '100' };

function exampleFor(taxon: AnimalTaxon): {
  name: string;
  common: string;
  weight: string;
} {
  return TAXON_EXAMPLES[taxon] ?? GENERIC_EXAMPLE;
}

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

// CGD override picker. 'auto' inherits the species default, yes/no
// explicitly overrides for this animal.
const CGD_OVERRIDE_OPTIONS: { value: 'auto' | 'yes' | 'no'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

function AddReptileScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  // Query params let the species care sheet (and any future deeplink)
  // pre-fill this form with a species + taxon. `useLocalSearchParams`
  // returns whatever's in the route at mount; `useState`'s lazy
  // initializer reads them once so the user can still edit the values
  // afterward without us clobbering them on re-render.
  const params = useLocalSearchParams<{
    taxon?: string;
    species_id?: string;
    scientific_name?: string;
    common_name?: string;
  }>();

  const [taxon, setTaxon] = useState<AnimalTaxon>(
    isAnimalTaxon(params.taxon) ? params.taxon : 'snake',
  );
  const [name, setName] = useState('');
  const [scientificName, setScientificName] = useState(
    typeof params.scientific_name === 'string' ? params.scientific_name : '',
  );
  const [speciesId, setSpeciesId] = useState<string | null>(
    typeof params.species_id === 'string' ? params.species_id : null,
  );
  const [enclosureId, setEnclosureId] = useState<string | null>(null);
  const [commonName, setCommonName] = useState(
    typeof params.common_name === 'string' ? params.common_name : '',
  );
  const [sex, setSex] = useState<Sex>('unknown');
  const [hatchDate, setHatchDate] = useState('');
  const [source, setSource] = useState<SourceChoice>('unset');
  const [currentWeight, setCurrentWeight] = useState('');
  // CGD override — 'auto' inherits the species default, yes/no
  // explicitly overrides. Most keepers leave it on auto.
  const [cgdOverride, setCgdOverride] = useState<'auto' | 'yes' | 'no'>(
    'auto',
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Free-tier cap gate. When the create POST returns HTTP 402 we show the
  // (informational) UpgradeModal instead of an inline error. `capDetail`
  // holds the server's structured detail ({ message, current_count,
  // limit }) so the modal can show the exact numbers.
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [capDetail, setCapDetail] = useState<{
    message?: string;
    current_count?: number;
    limit?: number;
  } | null>(null);

  // Placeholder examples for the currently-selected taxon.
  const ex = exampleFor(taxon);

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

    const payload: CreateAnimalPayload = {
      taxon,
      name: trimmedName || null,
      scientific_name: trimmedSci || null,
      common_name: trimmedCommon || null,
      herp_species_id: speciesId,
      enclosure_id: enclosureId,
      sex,
      hatch_date: hatchIso,
      source: source === 'unset' ? null : source,
      current_weight_g: weightN ? Number(weightN) : null,
      feeds_on_cgd_override:
        cgdOverride === 'yes' ? true : cgdOverride === 'no' ? false : null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      // ADR-003: one create call — the taxon discriminator rides in the
      // payload instead of routing to per-taxon endpoints.
      const created = await createAnimal(payload);
      // Replace so back goes to collection, not back to this form.
      // ADR-003: one detail route for every taxon.
      router.replace(`/reptile/${created.id}` as never);
    } catch (err) {
      // Free-tier cap: the backend returns HTTP 402 with a structured
      // detail. Surface the upgrade modal instead of a generic error so
      // the keeper knows why the save was blocked. Every other error
      // behaves as before (inline banner).
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 402) {
        const detail = (
          err as {
            response?: {
              data?: {
                detail?: {
                  message?: string;
                  current_count?: number;
                  limit?: number;
                };
              };
            };
          }
        )?.response?.data?.detail;
        setCapDetail(detail ?? null);
        setShowUpgrade(true);
        setSubmitting(false);
        return;
      }
      setError(extractErrorMessage(err, 'Could not save this reptile.'));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Add reptile" leftAction={<HeaderBackButton />} />
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
              placeholder={ex.name}
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

          <Field label="Common name" hint={`e.g. ${ex.common}`}>
            <ThemedInput
              value={commonName}
              onChangeText={setCommonName}
              placeholder={ex.common}
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
              placeholder={ex.weight}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field
            label="Feeds on CGD"
            hint="Auto follows the species default. Override only if this individual is fed differently."
          >
            <ChipGroup
              options={CGD_OVERRIDE_OPTIONS}
              value={cgdOverride}
              onChange={setCgdOverride}
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
            label={`Save ${ANIMAL_TAXA[taxon].label.toLowerCase()}`}
            busy={submitting}
            onPress={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Free-tier cap gate — informational, no in-app purchase yet. */}
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        message={
          capDetail?.message ??
          'The free plan tracks up to 5 animals. Premium keepers get unlimited animals.'
        }
        currentCount={capDetail?.current_count ?? null}
        limit={capDetail?.limit ?? null}
      />
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
