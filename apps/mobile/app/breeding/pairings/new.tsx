/**
 * TV create-pairing form — Sprint 6h.
 *
 * Mirror of the HV create-pairing form, adapted for TV:
 *   - No taxon picker (all tarantulas).
 *   - 3 pairing types: natural / assisted / forced (TV's enum).
 *   - Modal parent picker with three filters:
 *       1. Sex — male slot accepts male + unknown; female slot accepts
 *          female + unknown. Plenty of slings get paired before sex
 *          is confirmed.
 *       2. Same tarantula — picker excludes whoever's in the other slot.
 *       3. Species — when one slot has a parent with a non-null
 *          species_id, the other slot only shows candidates with the
 *          matching species. Cross-genus pairings can't produce.
 *
 * Required: male, female, paired_date. Everything else optional.
 *
 * Submit → POST /pairings/ → routes to the new pairing's detail.
 *
 * Inline types match TV mobile's existing convention. DateInput
 * component takes Date objects (different from HV's text inputs).
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import DateInput from '../../../src/components/DateInput';
import UpgradeModal from '../../../src/components/UpgradeModal';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { apiClient } from '../../../src/services/api';
import { toISODateLocal } from '../../../src/utils/date';
import { getErrorMessage, isPaymentRequired } from '../../../src/utils/errors';

interface Tarantula {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: string | null;
  species_id: string | null;
}

interface ParentOption {
  id: string;
  display_name: string;
  sex: string | null;
  scientific_name: string | null;
  species_id: string | null;
}

function tarantulaToOption(t: Tarantula): ParentOption {
  return {
    id: t.id,
    display_name:
      t.name || t.common_name || t.scientific_name || 'Unnamed',
    sex: t.sex,
    scientific_name: t.scientific_name,
    species_id: t.species_id,
  };
}

/**
 * Cross-species check with graceful fallback. Mirrors the web logic in
 * apps/web/src/app/dashboard/breeding/pairings/add/page.tsx — keep
 * them in sync.
 *
 *   1. species_id match — canonical comparison when both parents were
 *      picked from the species autocomplete.
 *   2. scientific_name match — fallback for keepers who typed names
 *      freely. Trim + lowercase normalize so casing differences don't
 *      false-positive.
 *   3. Insufficient data — return true (allow). Can't enforce.
 */
function speciesMatches(a: ParentOption, b: ParentOption): boolean {
  if (a.species_id && b.species_id) {
    return a.species_id === b.species_id;
  }
  const aName = a.scientific_name?.trim().toLowerCase();
  const bName = b.scientific_name?.trim().toLowerCase();
  if (aName && bName) {
    return aName === bName;
  }
  return true;
}

const PAIRING_TYPE_OPTIONS = [
  { value: 'natural', label: 'Natural' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'forced', label: 'Forced' },
] as const;

function NewPairingScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const styles = useStyles();

  // Allow prefill via query params so a future "create from spider"
  // entry point (e.g. tarantula detail → start pairing) drops in.
  const params = useLocalSearchParams<{
    male_id?: string;
    female_id?: string;
  }>();

  const [tarantulas, setTarantulas] = useState<ParentOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [maleId, setMaleId] = useState<string>(
    typeof params.male_id === 'string' ? params.male_id : '',
  );
  const [femaleId, setFemaleId] = useState<string>(
    typeof params.female_id === 'string' ? params.female_id : '',
  );
  const [pairedDate, setPairedDate] = useState<Date>(new Date());
  const [separatedDate, setSeparatedDate] = useState<Date | null>(null);
  const [pairingType, setPairingType] = useState<
    'natural' | 'assisted' | 'forced'
  >('natural');
  const [notes, setNotes] = useState('');

  const [pickerOpen, setPickerOpen] = useState<'male' | 'female' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<Tarantula[]>('/tarantulas/');
        if (cancelled) return;
        setTarantulas(res.data.map(tarantulaToOption));
        setLoadError(null);
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err, "Couldn't load your collection."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const males = useMemo(
    () =>
      (tarantulas ?? []).filter(
        (t) => t.sex === 'male' || t.sex === 'unknown' || !t.sex,
      ),
    [tarantulas],
  );
  const females = useMemo(
    () =>
      (tarantulas ?? []).filter(
        (t) => t.sex === 'female' || t.sex === 'unknown' || !t.sex,
      ),
    [tarantulas],
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
    setError(null);

    if (!maleId || !femaleId) {
      setError('Pick both parents before saving.');
      return;
    }
    if (maleId === femaleId) {
      setError('Male and female must be different tarantulas.');
      return;
    }
    // Cross-species backstop — picker filters cover the forward path,
    // but a stale female selection from before the male changed could
    // bypass it. Uses speciesMatches() so free-typed scientific names
    // also enforce, not just species_id-linked tarantulas.
    if (maleOption && femaleOption && !speciesMatches(maleOption, femaleOption)) {
      const a = maleOption.scientific_name || 'this male';
      const b = femaleOption.scientific_name || 'this female';
      setError(
        `${a} and ${b} are different species — they can't pair. Update one parent's species or pick a matching mate.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        male_id: maleId,
        female_id: femaleId,
        paired_date: toISODateLocal(pairedDate),
        separated_date: separatedDate
          ? toISODateLocal(separatedDate)
          : null,
        pairing_type: pairingType,
        notes: notes.trim() || null,
      };
      const res = await apiClient.post('/pairings/', payload);
      router.replace(`/breeding/pairings/${res.data.id}` as never);
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        setShowUpgradeModal(true);
        setSubmitting(false);
        return;
      }
      setError(getErrorMessage(err, "Couldn't save this pairing."));
      setSubmitting(false);
    }
  }

  // Picker options reflect all three filters in one place — same shape
  // as HV's create-pairing. Species filter now uses speciesMatches(),
  // which falls back to scientific_name when species_id isn't linked.
  //
  // For the empty-state copy we distinguish "filter excluded everyone"
  // vs "only candidate is the other slot" by checking the intermediate
  // step — running same-tarantula filter alone first, then species on
  // top. If species filter is what dropped the list to zero, show the
  // species-mismatch message; otherwise show the only-candidate one.
  const pickerData = (() => {
    const otherParent =
      pickerOpen === 'male'
        ? females.find((p) => p.id === femaleId)
        : pickerOpen === 'female'
          ? males.find((p) => p.id === maleId)
          : null;
    const sourceList = pickerOpen === 'male' ? males : females;
    const otherSlotId = pickerOpen === 'male' ? femaleId : maleId;

    const afterSameTarantula = sourceList.filter((p) => p.id !== otherSlotId);
    const filteredOptions = afterSameTarantula.filter((p) =>
      otherParent ? speciesMatches(p, otherParent) : true,
    );

    let emptyOverride: string | null = null;
    if (sourceList.length === 0) {
      // No candidates at all — fall through to default empty copy.
    } else if (
      filteredOptions.length === 0 &&
      afterSameTarantula.length > 0 &&
      otherParent
    ) {
      // Species filter took the list to zero.
      const speciesLabel =
        otherParent.scientific_name ?? 'the selected species';
      emptyOverride = `No ${speciesLabel} candidates in your collection match the other parent's species. Add another ${speciesLabel} to pair this one.`;
    } else if (filteredOptions.length === 0 && otherSlotId) {
      // Same-tarantula filter took the list to zero.
      emptyOverride =
        pickerOpen === 'male'
          ? 'The only candidate is already picked as the female.'
          : 'The only candidate is already picked as the male.';
    }
    return { filteredOptions, emptyOverride };
  })();

  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const collectionLoaded = tarantulas !== null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New pairing" leftAction={backButton} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Record a male × female mating attempt. You can add egg sacs
            (and offspring) later as the season progresses.
          </Text>

          {loadError && (
            <View
              style={[
                styles.errorBlock,
                {
                  borderColor: 'rgba(239,68,68,0.4)',
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          )}

          {!collectionLoaded && !loadError && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          )}

          {collectionLoaded && (
            <>
              <ParentPickerButton
                label="Male parent"
                hint={
                  males.length === 0
                    ? 'No tarantulas with male or unknown sex in your collection.'
                    : 'Male or unknown-sex tarantulas only.'
                }
                selected={maleOption}
                placeholder="Pick the male"
                disabled={males.length === 0}
                onPress={() => setPickerOpen('male')}
              />

              <ParentPickerButton
                label="Female parent"
                hint={
                  females.length === 0
                    ? 'No tarantulas with female or unknown sex in your collection.'
                    : 'Female or unknown-sex tarantulas only.'
                }
                selected={femaleOption}
                placeholder="Pick the female"
                disabled={females.length === 0}
                onPress={() => setPickerOpen('female')}
              />

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Paired date *</Text>
                <DateInput
                  value={pairedDate}
                  onChange={setPairedDate}
                  maximumDate={new Date()}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Separated date</Text>
                <DateInput
                  value={separatedDate ?? pairedDate}
                  onChange={setSeparatedDate}
                  maximumDate={new Date()}
                />
                {separatedDate && (
                  <TouchableOpacity
                    onPress={() => setSeparatedDate(null)}
                    style={styles.clearDateButton}
                  >
                    <Text style={[styles.clearDateText, { color: colors.primary }]}>
                      Clear separated date
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  Leave blank while still paired.
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pairing type *</Text>
                <View style={styles.optionRow}>
                  {PAIRING_TYPE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.optionButton,
                        pairingType === opt.value && styles.optionButtonActive,
                      ]}
                      onPress={() => setPairingType(opt.value)}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          pairingType === opt.value &&
                            styles.optionButtonTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Pairing strategy, observations…"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {error && (
                <View
                  style={[
                    styles.errorBlock,
                    {
                      borderColor: 'rgba(239,68,68,0.4)',
                      backgroundColor: 'rgba(239,68,68,0.12)',
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={
                  submitting || males.length === 0 || females.length === 0
                }
                style={[
                  styles.submitButton,
                  (submitting ||
                    males.length === 0 ||
                    females.length === 0) &&
                    styles.submitButtonDisabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Save pairing</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ParentPickerModal
        visible={pickerOpen !== null}
        onClose={() => setPickerOpen(null)}
        options={pickerData.filteredOptions}
        selectedId={pickerOpen === 'male' ? maleId : femaleId}
        title={pickerOpen === 'male' ? 'Pick the male' : 'Pick the female'}
        emptyOverride={pickerData.emptyOverride}
        onPick={(id) => {
          if (pickerOpen === 'male') setMaleId(id);
          else if (pickerOpen === 'female') setFemaleId(id);
          setPickerOpen(null);
        }}
      />

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade to Premium"
        message="Unlock the full breeding module"
        feature="Breeding"
      />
    </SafeAreaView>
  );
}

// ─── ParentPickerButton — trigger row that opens the modal ────────────

function ParentPickerButton({
  label,
  hint,
  selected,
  placeholder,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  selected: ParentOption | null;
  placeholder: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label} *</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.pickerButton,
          {
            borderColor: colors.border,
            backgroundColor: disabled ? colors.surfaceElevated : colors.surface,
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
                  styles.pickerButtonTitle,
                  { color: colors.textPrimary },
                ]}
                numberOfLines={1}
              >
                {selected.display_name}
              </Text>
              {(selected.scientific_name ||
                selected.sex === 'unknown' ||
                !selected.sex) && (
                <Text
                  style={[
                    styles.pickerButtonMeta,
                    { color: colors.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {selected.scientific_name ?? ''}
                  {selected.scientific_name &&
                  (selected.sex === 'unknown' || !selected.sex)
                    ? ' · '
                    : ''}
                  {selected.sex === 'unknown' || !selected.sex
                    ? 'sex unknown'
                    : ''}
                </Text>
              )}
            </>
          ) : (
            <Text
              style={[
                styles.pickerButtonPlaceholder,
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
      <Text style={[styles.hint, { color: colors.textTertiary }]}>{hint}</Text>
    </View>
  );
}

// ─── ParentPickerModal — scrollable list ──────────────────────────────

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
  emptyOverride: string | null;
  onPick: (id: string) => void;
}) {
  const { colors, layout } = useTheme();
  const styles = useStyles();
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
                  style={[styles.modalEmpty, { color: colors.textSecondary }]}
                >
                  {emptyOverride ??
                    'No candidates available. Add a tarantula of the right sex to your collection first.'}
                </Text>
              ) : (
                options.map((p) => {
                  const selected = p.id === selectedId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => onPick(p.id)}
                      style={[
                        styles.optionRowFull,
                        { borderBottomColor: colors.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          selected ? 'radiobox-marked' : 'radiobox-blank'
                        }
                        size={20}
                        color={selected ? colors.primary : colors.textSecondary}
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
                          {p.sex === 'unknown' || !p.sex
                            ? ' · sex unknown'
                            : ''}
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

// ─── Styles — match TV mobile's tarantula/add.tsx conventions ─────────

function useStyles() {
  const { colors, layout } = useTheme();
  return StyleSheet.create({
    safeArea: { flex: 1 },
    flex: { flex: 1 },
    scroll: { padding: 16, paddingBottom: 48, gap: 16 },
    intro: { fontSize: 13, lineHeight: 19 },

    loading: { paddingVertical: 40, alignItems: 'center' },
    errorBlock: { borderWidth: 1, padding: 12 },
    errorText: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },

    inputGroup: { gap: 8 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    hint: { fontSize: 11, marginTop: 4 },

    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    textArea: { minHeight: 80, paddingTop: 12 },

    optionRow: { flexDirection: 'row', gap: 8 },
    optionButton: {
      flex: 1,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      alignItems: 'center',
    },
    optionButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    optionButtonTextActive: { color: '#fff' },

    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    pickerButtonTitle: { fontSize: 14, fontWeight: '600' },
    pickerButtonMeta: { fontSize: 11, marginTop: 2 },
    pickerButtonPlaceholder: { fontSize: 14 },

    clearDateButton: { paddingVertical: 4 },
    clearDateText: { fontSize: 12, fontWeight: '600' },

    submitButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
      minHeight: 260,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 12,
    },
    modalTitle: { fontSize: 15, fontWeight: '700' },
    modalEmpty: {
      fontSize: 13,
      lineHeight: 19,
      paddingHorizontal: 16,
      paddingVertical: 28,
      textAlign: 'center',
    },
    optionRowFull: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
    },
  });
}

export default withErrorBoundary(NewPairingScreen, 'tv-pairings-new');
