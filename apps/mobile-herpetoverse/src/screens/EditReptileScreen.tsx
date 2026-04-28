/**
 * Edit reptile — Sprint 8 Bundle 5.
 *
 * Mirror of /reptile/add but pre-filled and PUTs instead of POSTs.
 * Includes a destructive Delete button that confirms then cascades
 * (DELETE on /snakes/<id> or /lizards/<id> CASCADEs to weight logs,
 * feedings, sheds, and photos via FK constraints).
 *
 * Why a separate file from AddReptileScreen instead of a shared form
 * component: the add form was finalized in Bundle 4; refactoring it now
 * adds risk we don't need. Both forms will live side-by-side until a
 * future cleanup pass extracts the shared body into a `ReptileForm`
 * component that both screens compose. Add a TODO to revisit.
 *
 * TODO(bundle 6+): Extract shared form body into `<ReptileForm />` so
 * add + edit don't drift in field shape, validation, or copy.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
} from '../components/forms/FormPrimitives';
import { EnclosurePicker } from '../components/forms/EnclosurePicker';
import { ReptileSpeciesAutocomplete } from '../components/forms/ReptileSpeciesAutocomplete';
import {
  type CreateSnakePayload,
  type Sex,
  type Snake,
  type Source,
  deleteSnake,
  getSnake,
  snakeTitle,
  updateSnake,
} from '../lib/snakes';
import {
  type CreateLizardPayload,
  type Lizard,
  deleteLizard,
  getLizard,
  lizardTitle,
  updateLizard,
} from '../lib/lizards';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unknown', label: 'Unknown' },
];

type SourceChoice = Source | 'unset';
const SOURCE_OPTIONS: { value: SourceChoice; label: string }[] = [
  { value: 'unset', label: '—' },
  { value: 'bred', label: 'Bred' },
  { value: 'bought', label: 'Bought' },
  { value: 'wild_caught', label: 'Wild-caught' },
];

type AnimalRow = Snake | Lizard;

export function EditReptileScreen({ taxon }: { taxon: 'snake' | 'lizard' }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [animal, setAnimal] = useState<AnimalRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch + prefill. We don't refetch on every focus — only on first
  // mount — because the user is in mid-edit and an unsolicited refetch
  // would clobber their typing. Pull-to-refresh and explicit save are
  // the only state mutations after initial load.
  useFocusEffect(
    useCallback(() => {
      if (!id || animal) return; // already loaded
      let cancelled = false;
      setLoading(true);
      setLoadError(null);

      const fetcher = taxon === 'snake' ? getSnake : getLizard;
      fetcher(id)
        .then((data) => {
          if (cancelled) return;
          setAnimal(data);
          setName(data.name ?? '');
          setScientificName(data.scientific_name ?? '');
          setSpeciesId(data.reptile_species_id);
          setEnclosureId(data.enclosure_id);
          setCommonName(data.common_name ?? '');
          setSex(data.sex ?? 'unknown');
          setHatchDate(data.hatch_date ?? '');
          setSource(data.source ?? 'unset');
          setCurrentWeight(data.current_weight_g ?? '');
          setNotes(data.notes ?? '');
        })
        .catch((err) => {
          if (cancelled) return;
          setLoadError(extractErrorMessage(err, "Couldn't load this reptile."));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [id, taxon, animal]),
  );

  async function handleSave() {
    if (!id || submitting) return;
    setError(null);

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
      if (taxon === 'snake') {
        await updateSnake(id, payload as CreateSnakePayload);
      } else {
        await updateLizard(id, payload as CreateLizardPayload);
      }
      router.back();
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't save changes."));
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!id || deleting) return;
    const title =
      animal && (taxon === 'snake'
        ? snakeTitle(animal as Snake)
        : lizardTitle(animal as Lizard));
    const label = title || (taxon === 'snake' ? 'this snake' : 'this lizard');
    Alert.alert(
      `Delete ${label}?`,
      "This permanently removes the reptile and all weigh-ins, feedings, sheds, and photos attached to it. There is no undo.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setError(null);
            try {
              if (taxon === 'snake') {
                await deleteSnake(id);
              } else {
                await deleteLizard(id);
              }
              // Pop back to root collection — the detail screen we
              // came from no longer exists.
              router.replace('/' as never);
            } catch (err) {
              setError(extractErrorMessage(err, "Couldn't delete this reptile."));
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  // ---- Loading + error gates ----
  if (loading && !animal) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen
          options={{ title: 'Edit reptile', headerBackTitle: 'Back' }}
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (loadError && !animal) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <Stack.Screen
          options={{ title: 'Edit reptile', headerBackTitle: 'Back' }}
        />
        <View style={styles.center}>
          <FormErrorBanner message={loadError} />
        </View>
      </SafeAreaView>
    );
  }
  if (!animal) return null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: 'Edit reptile',
          headerBackTitle: 'Back',
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Name" hint="What you call them.">
            <ThemedInput
              value={name}
              onChangeText={setName}
              placeholder="Hex"
              autoCapitalize="words"
            />
          </Field>

          <Field
            label="Species"
            hint="Type 2+ letters to search. Picking a match links the care sheet + prey suggestions."
          >
            <ReptileSpeciesAutocomplete
              speciesId={speciesId}
              scientificName={scientificName}
              onChange={({ id, scientificName: sci }) => {
                setSpeciesId(id);
                setScientificName(sci);
              }}
              onPick={(species) => {
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
            hint="Backend updates this automatically when you log a weigh-in."
          >
            <ThemedInput
              value={currentWeight}
              onChangeText={setCurrentWeight}
              placeholder="650"
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Notes" hint="Anything that doesn't fit above.">
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
            label="Save changes"
            busy={submitting}
            onPress={handleSave}
          />

          {/* Destructive zone — visually separated from the save action
              so a fat-finger doesn't trash a year of records. The
              confirm modal is the real safeguard but the visual gap
              helps. */}
          <View style={[styles.dangerZone, { borderTopColor: colors.border }]}>
            <Text
              style={[
                styles.dangerLabel,
                { color: colors.textTertiary },
              ]}
            >
              DANGER ZONE
            </Text>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={[
                styles.deleteButton,
                {
                  borderColor: colors.danger,
                  borderRadius: layout.radius.md,
                  opacity: deleting ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                {deleting ? 'Deleting…' : 'Delete this reptile'}
              </Text>
            </TouchableOpacity>
            <Text
              style={[
                styles.dangerHelp,
                { color: colors.textTertiary },
              ]}
            >
              Permanently removes weigh-ins, feedings, sheds, and photos.
            </Text>
          </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dangerZone: {
    marginTop: 16,
    paddingTop: 24,
    borderTopWidth: 1,
    gap: 8,
  },
  dangerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  deleteButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dangerHelp: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
