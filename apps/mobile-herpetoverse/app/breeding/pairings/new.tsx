/**
 * New pairing form — Sprint 5b.
 *
 * Mobile port of apps/web-herpetoverse/.../breeding/pairings/new/page.tsx.
 *
 * Flow:
 *   1. Taxon picker (snake / lizard) — flips which collection feeds the
 *      parent slots and resets the parent selections.
 *   2. Male + Female parent — modal picker pulled from the unified
 *      animals endpoint, scoped to the chosen taxon. Male slot accepts
 *      male+unknown sex; female slot accepts female+unknown. We allow
 *      unknown in both because plenty of slings/hatchlings get paired
 *      before sex is confirmed.
 *   3. Paired date (required) + Separated date (optional). Both
 *      YYYY-MM-DD; we validate before submit.
 *   4. Pairing type chip group (natural / cohabitation / assisted / ai).
 *   5. Privacy — defaults to private, with the same explainer copy as
 *      web. Keepers protecting morph projects don't want the row
 *      visible until offspring are ready to list.
 *   6. Notes (free text).
 *
 * Submit → createPairing → router.replace to the pairing detail screen.
 *
 * Honesty-first: when the keeper's collection has zero males (or zero
 * females) of the selected taxon, the form shows an honest "no
 * candidate parents in your collection yet" message instead of
 * pretending an empty dropdown is functional.
 *
 * Hermes-prod safety: static JSX branches only. No dynamic component
 * variables — see feedback_dynamic_component_hermes_prod_crash memory.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import UpgradeModal from '../../../src/components/UpgradeModal';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  dateToISO,
  extractErrorMessage,
  todayISO,
} from '../../../src/components/forms/FormPrimitives';
import { useTheme } from '../../../src/contexts/ThemeContext';
import {
  PAIRING_TYPE_LABEL,
  type CreatePairingPayload,
  type ReptilePairingType,
  type Taxon,
  createPairing,
} from '../../../src/lib/breeding';
// ADR-003/011: per-taxon libs collapsed into lib/animals. We fetch the
// whole collection once and scope the parent dropdowns to the selected
// taxon in-memory, so any herp group in the registry can be paired.
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  type Animal,
  type AnimalTaxon,
  type Sex,
  listAnimals,
} from '../../../src/lib/animals';

interface ParentOption {
  id: string;
  taxon: AnimalTaxon;
  display_name: string;
  sex: Sex | null;
  scientific_name: string | null;
  /** Herp species FK. Used to filter cross-species pairings — a
   *  gargoyle gecko and a bearded dragon shouldn't appear as valid
   *  pair candidates. NULL when the keeper hasn't linked a species. */
  herp_species_id: string | null;
}

function animalToOption(a: Animal): ParentOption {
  return {
    id: a.id,
    taxon: a.taxon,
    display_name:
      a.name || a.common_name || a.scientific_name || 'Unnamed reptile',
    sex: a.sex,
    scientific_name: a.scientific_name,
    herp_species_id: a.herp_species_id,
  };
}

/**
 * Cross-species check with graceful fallback. Mirrors the same helper
 * shipped on TV (apps/mobile/app/breeding/pairings/new.tsx and the web
 * equivalent). Keep them in sync.
 *
 *   1. herp_species_id match — canonical comparison when both
 *      parents were picked from the species autocomplete.
 *   2. scientific_name match — fallback for keepers who typed names
 *      freely before linking, or for species not yet in the catalog.
 *      Trim + lowercase so casing/whitespace differences don't false-
 *      positive.
 *   3. Insufficient data — return true (allow). Can't enforce.
 */
function speciesMatches(a: ParentOption, b: ParentOption): boolean {
  if (a.herp_species_id && b.herp_species_id) {
    return a.herp_species_id === b.herp_species_id;
  }
  const aName = a.scientific_name?.trim().toLowerCase();
  const bName = b.scientific_name?.trim().toLowerCase();
  if (aName && bName) {
    return aName === bName;
  }
  return true;
}

const PAIRING_TYPE_OPTIONS = (
  Object.keys(PAIRING_TYPE_LABEL) as ReptilePairingType[]
).map((k) => ({ value: k, label: PAIRING_TYPE_LABEL[k] }));

function NewPairingScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  const [taxon, setTaxon] = useState<Taxon>('snake');
  // Whole collection in one bag; the taxon picker + parent lists filter
  // it in-memory. null until the fetch resolves.
  const [animals, setAnimals] = useState<ParentOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [maleId, setMaleId] = useState<string>('');
  const [femaleId, setFemaleId] = useState<string>('');
  const [pairedDate, setPairedDate] = useState<string>(() => todayISO());
  const [separatedDate, setSeparatedDate] = useState<string>('');
  const [pairingType, setPairingType] =
    useState<ReptilePairingType>('natural');
  const [isPrivate, setIsPrivate] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Breeding is HV-premium: a 402 opens the upgrade modal.
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [capMessage, setCapMessage] = useState<string | null>(null);

  // Modal state for parent pickers.
  const [pickerOpen, setPickerOpen] = useState<'male' | 'female' | null>(
    null,
  );

  // Load both collections on focus so the form is hot when the user
  // arrives. useFocusEffect (vs useEffect) covers the case where a
  // keeper adds a new reptile, comes back, and expects to see it.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const all = await listAnimals();
          if (cancelled) return;
          setAnimals(all.map(animalToOption));
          setLoadError(null);
        } catch (err) {
          if (cancelled) return;
          setLoadError(
            extractErrorMessage(err, "Couldn't load your collection."),
          );
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Taxa the keeper owns, in registry order — drives the taxon picker so
  // it never offers a group with no animals to pair.
  const taxonOptions = useMemo(() => {
    const present = new Set((animals ?? []).map((a) => a.taxon));
    return ANIMAL_TAXON_ORDER.filter((t) => present.has(t)).map((t) => ({
      value: t,
      label: `${ANIMAL_TAXA[t].glyph} ${ANIMAL_TAXA[t].label}`,
    }));
  }, [animals]);

  // Keep the selected taxon valid: default to the first owned taxon once
  // the collection loads (or if the current pick isn't owned).
  useEffect(() => {
    if (taxonOptions.length === 0) return;
    if (!taxonOptions.some((o) => o.value === taxon)) {
      setTaxon(taxonOptions[0].value);
    }
  }, [taxonOptions, taxon]);

  // Reset parent selections when taxon flips so we never end up
  // submitting a cross-taxon pairing (backend rejects it anyway, but
  // the UI shouldn't even let the keeper try).
  useEffect(() => {
    setMaleId('');
    setFemaleId('');
  }, [taxon]);

  const allOfTaxon = useMemo(
    () => (animals ?? []).filter((a) => a.taxon === taxon),
    [animals, taxon],
  );

  const males = useMemo(
    () =>
      allOfTaxon.filter((p) => p.sex === 'male' || p.sex === 'unknown'),
    [allOfTaxon],
  );
  const females = useMemo(
    () =>
      allOfTaxon.filter((p) => p.sex === 'female' || p.sex === 'unknown'),
    [allOfTaxon],
  );

  const maleOption = useMemo(
    () => males.find((p) => p.id === maleId) ?? null,
    [males, maleId],
  );
  const femaleOption = useMemo(
    () => females.find((p) => p.id === femaleId) ?? null,
    [females, femaleId],
  );

  async function handleSubmit() {
    if (submitting) return;
    setSubmitError(null);

    if (!maleId || !femaleId) {
      setSubmitError('Pick both parents before saving.');
      return;
    }
    if (maleId === femaleId) {
      setSubmitError('Male and female must be different reptiles.');
      return;
    }
    // Defensive cross-species check. Reachable only if the keeper
    // picked the female first, then changed the male to a different
    // species afterwards — the picker filter blocks the forward path.
    // Uses speciesMatches() so free-typed scientific names enforce too,
    // not just herp_species_id-linked records.
    if (maleOption && femaleOption && !speciesMatches(maleOption, femaleOption)) {
      const a = maleOption.scientific_name ?? 'this male';
      const b = femaleOption.scientific_name ?? 'this female';
      setSubmitError(
        `${a} and ${b} are different species — they can't pair. Update one parent's species or pick a matching mate.`,
      );
      return;
    }

    const pairedIso = dateToISO(pairedDate);
    if (!pairedIso) {
      setSubmitError('Paired date should be YYYY-MM-DD.');
      return;
    }
    let separatedIso: string | null = null;
    if (separatedDate.trim()) {
      const iso = dateToISO(separatedDate);
      if (!iso) {
        setSubmitError('Separated date should be YYYY-MM-DD or empty.');
        return;
      }
      separatedIso = iso.slice(0, 10);
    }

    setSubmitting(true);
    try {
      const payload: CreatePairingPayload = {
        taxon,
        male_id: maleId,
        female_id: femaleId,
        // Backend wants Date, not datetime. Slice to YYYY-MM-DD so we
        // don't accidentally ship a timezone-tagged datetime that
        // shifts the date in the keeper's local TZ.
        paired_date: pairedIso.slice(0, 10),
        separated_date: separatedIso,
        pairing_type: pairingType,
        is_private: isPrivate,
        notes: notes.trim() || null,
      };
      const created = await createPairing(payload);
      // Replace so back navigation lands on the breeding tab rather
      // than the now-stale empty form.
      router.replace(`/breeding/pairings/${created.id}` as never);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 402) {
        const detail = (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail;
        setCapMessage(detail?.message ?? null);
        setShowUpgrade(true);
        setSubmitting(false);
        return;
      }
      setSubmitError(extractErrorMessage(err, "Couldn't save this pairing."));
      setSubmitting(false);
    }
  }

  const collectionLoaded = animals !== null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New pairing" leftAction={<HeaderBackButton />} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Record a male × female mating attempt. You can add clutches
            (and their offspring) later as the season progresses.
          </Text>

          {loadError && <FormErrorBanner message={loadError} />}

          {!collectionLoaded && !loadError && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          )}

          {collectionLoaded && taxonOptions.length === 0 && !loadError && (
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Add at least two animals of the same taxon to your collection
              before recording a pairing.
            </Text>
          )}

          {collectionLoaded && taxonOptions.length > 0 && (
            <>
              <Field label="Taxon" required>
                <ChipGroup
                  options={taxonOptions}
                  value={taxon}
                  onChange={setTaxon}
                />
              </Field>

              {/* Male picker */}
              <Field
                label="Male parent"
                required
                hint={
                  males.length === 0
                    ? `No ${taxon}s with male or unknown sex in your collection yet.`
                    : 'Male or unknown-sex reptiles only.'
                }
              >
                <ParentPickerButton
                  selected={maleOption}
                  placeholder="Pick the male"
                  disabled={males.length === 0}
                  onPress={() => setPickerOpen('male')}
                />
              </Field>

              {/* Female picker */}
              <Field
                label="Female parent"
                required
                hint={
                  females.length === 0
                    ? `No ${taxon}s with female or unknown sex in your collection yet.`
                    : 'Female or unknown-sex reptiles only.'
                }
              >
                <ParentPickerButton
                  selected={femaleOption}
                  placeholder="Pick the female"
                  disabled={females.length === 0}
                  onPress={() => setPickerOpen('female')}
                />
              </Field>

              <Field label="Paired date" required hint="YYYY-MM-DD">
                <ThemedInput
                  value={pairedDate}
                  onChangeText={setPairedDate}
                  placeholder={todayISO()}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </Field>

              <Field
                label="Separated date"
                hint="Optional. YYYY-MM-DD or leave blank if still paired."
              >
                <ThemedInput
                  value={separatedDate}
                  onChangeText={setSeparatedDate}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </Field>

              <Field label="Pairing type" required>
                <ChipGroup
                  options={PAIRING_TYPE_OPTIONS}
                  value={pairingType}
                  onChange={setPairingType}
                />
              </Field>

              {/* Privacy toggle */}
              <TouchableOpacity
                onPress={() => setIsPrivate((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isPrivate }}
                style={[
                  styles.privacyRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    isPrivate
                      ? 'checkbox-marked'
                      : 'checkbox-blank-outline'
                  }
                  size={22}
                  color={isPrivate ? colors.primary : colors.textTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.privacyTitle, { color: colors.textPrimary }]}
                  >
                    Keep this pairing private
                  </Text>
                  <Text
                    style={[styles.privacyBody, { color: colors.textSecondary }]}
                  >
                    Hidden from other keepers regardless of your collection
                    visibility setting. Toggle off when you&apos;re ready
                    to share progress publicly.
                  </Text>
                </View>
              </TouchableOpacity>

              <Field label="Notes" hint="Optional">
                <ThemedInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Pairing strategy, observations…"
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80, paddingTop: 12 }}
                />
              </Field>

              {submitError && <FormErrorBanner message={submitError} />}

              <SubmitButton
                label="Save pairing"
                busy={submitting}
                onPress={handleSubmit}
                disabled={males.length === 0 || females.length === 0}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Parent picker modal — same scrollable-list pattern as
          morph-calculator's PickGeneModal.

          Filters applied (in order):
            1. Exclude the OTHER slot's current selection so the keeper
               can't pick the same animal twice. Submit-time
               `maleId === femaleId` check stays as a defensive backstop
               but should be unreachable.
               Bug 2026-05-11 (Cory): Bindi could be picked for both
               slots and the error only surfaced on save.
            2. Same-species enforcement — if the other slot has a parent
               with a non-null herp_species_id, only show candidates
               with the matching species. A gargoyle gecko and a
               bearded dragon are both lizards but biologically can't
               cross, and the app shouldn't let a keeper accidentally
               record a cross-species pairing.
               Edge: if either side has NO species linked, we don't
               filter (the keeper hasn't given us enough info to enforce
               — we trust them).
               Bug 2026-05-13 (Cory): could pair gargoyle gecko ×
               bearded dragon. */}
      {(() => {
        const otherParent =
          pickerOpen === 'male'
            ? females.find((p) => p.id === femaleId)
            : pickerOpen === 'female'
              ? males.find((p) => p.id === maleId)
              : null;
        const sourceList = pickerOpen === 'male' ? males : females;
        const otherSlotId = pickerOpen === 'male' ? femaleId : maleId;
        // Two-step filter so the empty-state copy can distinguish
        // "species filter excluded everyone" from "only candidate is
        // the other slot."
        const afterSameAnimal = sourceList.filter(
          (p) => p.id !== otherSlotId,
        );
        const filteredOptions = afterSameAnimal.filter((p) =>
          otherParent ? speciesMatches(p, otherParent) : true,
        );

        // Empty-state copy adapts to the failing-filter reason so the
        // keeper knows exactly why nothing shows up.
        let emptyOverride: string | null = null;
        if (sourceList.length === 0) {
          // No candidates at all — leave the default copy.
        } else if (
          filteredOptions.length === 0 &&
          afterSameAnimal.length > 0 &&
          otherParent
        ) {
          const speciesLabel =
            otherParent.scientific_name ?? 'the selected species';
          emptyOverride = `No ${speciesLabel} candidates in your collection match the other parent's species. Add another ${speciesLabel} to pair this one.`;
        } else if (filteredOptions.length === 0 && otherSlotId) {
          emptyOverride =
            pickerOpen === 'male'
              ? 'The only candidate is already picked as the female. Add another male to pair this one.'
              : 'The only candidate is already picked as the male. Add another female to pair this one.';
        }

        return (
          <ParentPickerModal
            visible={pickerOpen !== null}
            onClose={() => setPickerOpen(null)}
            options={filteredOptions}
            selectedId={pickerOpen === 'male' ? maleId : femaleId}
            title={
              pickerOpen === 'male' ? 'Pick the male' : 'Pick the female'
            }
            emptyOverride={emptyOverride}
            onPick={(id) => {
              if (pickerOpen === 'male') setMaleId(id);
              else if (pickerOpen === 'female') setFemaleId(id);
              setPickerOpen(null);
            }}
          />
        );
      })()}

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        message={
          capMessage ??
          'Breeding tracking is a Herpetoverse premium feature. Upgrade to unlock it.'
        }
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ParentPickerButton — the trigger row that opens the modal. Shows
// the current selection or a placeholder.
// ---------------------------------------------------------------------------

function ParentPickerButton({
  selected,
  placeholder,
  disabled,
  onPress,
}: {
  selected: ParentOption | null;
  placeholder: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.parentButton,
        {
          borderColor: colors.border,
          backgroundColor: disabled ? colors.surfaceRaised : colors.surface,
          borderRadius: layout.radius.md,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={selected ? selected.display_name : placeholder}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {selected ? (
          <>
            <Text
              style={[
                styles.parentButtonTitle,
                { color: colors.textPrimary },
              ]}
              numberOfLines={1}
            >
              {selected.display_name}
            </Text>
            {(selected.scientific_name || selected.sex === 'unknown') && (
              <Text
                style={[
                  styles.parentButtonMeta,
                  { color: colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {selected.scientific_name ?? ''}
                {selected.scientific_name && selected.sex === 'unknown'
                  ? ' · '
                  : ''}
                {selected.sex === 'unknown' ? 'sex unknown' : ''}
              </Text>
            )}
          </>
        ) : (
          <Text
            style={[
              styles.parentButtonPlaceholder,
              { color: colors.textTertiary },
            ]}
          >
            {placeholder}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// ParentPickerModal — bottom sheet with scrollable list of candidates.
// ---------------------------------------------------------------------------

function ParentPickerModal({
  visible,
  onClose,
  options,
  selectedId,
  title,
  emptyOverride,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  options: ParentOption[];
  selectedId: string;
  title: string;
  /** Optional empty-state copy — used when filtering removed the
   *  only candidate vs no candidates existed at all. */
  emptyOverride?: string | null;
  onPick: (id: string) => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.modalHeader}>
              <View style={{ width: 24 }} />
              <Text
                style={[styles.modalTitle, { color: colors.textPrimary }]}
              >
                {title}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
            >
              {options.length === 0 ? (
                <Text
                  style={[
                    styles.modalEmpty,
                    { color: colors.textSecondary },
                  ]}
                >
                  {emptyOverride ??
                    'No candidates available. Add a reptile of the right sex to your collection first.'}
                </Text>
              ) : (
                options.map((p) => {
                  const selected = p.id === selectedId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => onPick(p.id)}
                      style={[
                        styles.optionRow,
                        { borderBottomColor: colors.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          selected
                            ? 'radiobox-marked'
                            : 'radiobox-blank'
                        }
                        size={20}
                        color={
                          selected ? colors.primary : colors.textSecondary
                        }
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontWeight: '600',
                            fontSize: 14,
                          }}
                          numberOfLines={1}
                        >
                          {p.display_name}
                        </Text>
                        <Text
                          style={{
                            color: colors.textTertiary,
                            fontSize: 11,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {p.scientific_name ?? '—'}
                          {p.sex === 'unknown' ? ' · sex unknown' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
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
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  parentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  parentButtonTitle: { fontSize: 14, fontWeight: '600' },
  parentButtonMeta: { fontSize: 11, marginTop: 2 },
  parentButtonPlaceholder: { fontSize: 14 },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  privacyTitle: { fontSize: 14, fontWeight: '600' },
  privacyBody: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '85%',
    // Floor so short content (single empty-state line) still has
    // visual presence as a bottom sheet rather than a cramped strip.
    minHeight: 260,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomColor: 'transparent',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalEmpty: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingVertical: 28,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});

export default withErrorBoundary(NewPairingScreen, 'pairings-new');
