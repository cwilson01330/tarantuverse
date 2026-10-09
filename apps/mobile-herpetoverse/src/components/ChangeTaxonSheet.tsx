/**
 * Change an animal's taxon — HV mirror of Tarantuverse's ChangeTaxonSheet
 * (audit-2 M10). Backend: POST /animals/{id}/change-taxon.
 *
 * WHY A SHEET AND NOT A CHIP GROUP ON THE EDIT FORM
 * -------------------------------------------------
 * Taxon is deliberately off the ordinary update, and the species link doesn't
 * survive the move — a corn snake's care sheet on a gecko drives the wrong
 * prey sizes and cadence, so the server clears it unless a new one is picked
 * here. Firing that from "Save changes" alongside a nickname edit means a
 * keeper could trigger it by brushing a chip. So: two steps, an explicit
 * confirm, and the species re-pick built into the same flow.
 *
 * "Everything stays" is a promise the server keeps — every log, photo, gene
 * and breeding row hangs off the animal's id, which doesn't change. Don't
 * soften it into "should be preserved".
 *
 * Taxa come from the registry (ANIMAL_TAXON_ORDER), not a copy. Colors come
 * from ThemeContext only.
 */
import { useState } from 'react';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../contexts/ThemeContext';
import { ReptileSpeciesAutocomplete } from './forms/ReptileSpeciesAutocomplete';
import { ANIMAL_TAXA, ANIMAL_TAXON_ORDER, type AnimalTaxon } from '../lib/animals';

interface Props {
  visible: boolean;
  /** The animal's taxon right now — offered as the disabled "current" row. */
  current: AnimalTaxon;
  /** Shown in the copy so the keeper knows which animal this is. */
  animalName: string;
  /** The animal carries a CGD diet override that the change will reset. */
  hasDietOverride?: boolean;
  saving?: boolean;
  /** Shown under the confirm when the server refused; nothing was changed. */
  error?: string | null;
  onClose: () => void;
  onConfirm: (taxon: AnimalTaxon, speciesId: string | null) => void;
}

export function ChangeTaxonSheet({
  visible,
  current,
  animalName,
  hasDietOverride = false,
  saving = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [picked, setPicked] = useState<AnimalTaxon | null>(null);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [scientific, setScientific] = useState('');

  // Reset on every close. A sheet that reopens holding the last attempt's
  // destination taxon is how someone confirms a change they didn't mean.
  const reset = () => {
    setPicked(null);
    setSpeciesId(null);
    setScientific('');
  };
  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const pickedMeta = picked ? ANIMAL_TAXA[picked] : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss change type menu"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
        >
          {/* Swallows taps so they don't dismiss via the backdrop. */}
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: layout.radius.xl,
                borderTopRightRadius: layout.radius.xl,
                paddingBottom: 24 + insets.bottom,
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            {picked === null ? (
              <>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Change type
                </Text>
                <Text style={[styles.lede, { color: colors.textSecondary }]}>
                  Filed the wrong kind of animal? Pick what {animalName} really
                  is. Feedings, sheds, weigh-ins, photos, genes and breeding
                  records all stay.
                </Text>

                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {ANIMAL_TAXON_ORDER.map((key) => {
                    const meta = ANIMAL_TAXA[key];
                    const isCurrent = key === current;
                    return (
                      <TouchableOpacity
                        key={key}
                        disabled={isCurrent}
                        onPress={() => setPicked(key)}
                        accessibilityRole="button"
                        accessibilityLabel={meta.label}
                        accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
                        accessibilityHint={
                          isCurrent
                            ? 'Already this type'
                            : `Change to ${meta.label.toLowerCase()}`
                        }
                        style={[
                          styles.row,
                          { borderTopColor: colors.border },
                          isCurrent && styles.rowDisabled,
                        ]}
                      >
                        <View
                          style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}
                        >
                          <Text style={styles.rowGlyph}>{meta.glyph}</Text>
                        </View>
                        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                          {meta.label}
                        </Text>
                        {isCurrent ? (
                          <Text style={[styles.currentTag, { color: colors.textTertiary }]}>
                            Current
                          </Text>
                        ) : (
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={20}
                            color={colors.textTertiary}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={styles.back}
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.backText, { color: colors.textSecondary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {ANIMAL_TAXA[current].label} → {pickedMeta?.label}
                </Text>

                <View style={styles.speciesBlock}>
                  <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                    Species (optional)
                  </Text>
                  <ReptileSpeciesAutocomplete
                    taxon={picked}
                    speciesId={speciesId}
                    scientificName={scientific}
                    onChange={({ id, scientificName }) => {
                      setSpeciesId(id);
                      setScientific(scientificName);
                    }}
                    placeholder={`Search ${pickedMeta?.label.toLowerCase()} species…`}
                  />
                  {!speciesId && (
                    <Text style={[styles.hint, { color: colors.textTertiary }]}>
                      The old species won't carry over, so leaving this blank
                      means no care sheet or prey suggestions until you set one.
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.keepBox,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={18}
                    color={colors.success}
                  />
                  <Text style={[styles.keepText, { color: colors.textSecondary }]}>
                    Every feeding, shed, weigh-in, photo and gene stays with{' '}
                    {animalName}, and so do its pairings, clutches and offspring.
                    {hasDietOverride
                      ? ' Its CGD diet setting goes back to following the species.'
                      : ''}
                  </Text>
                </View>

                {error ? (
                  <Text
                    style={[styles.error, { color: colors.danger }]}
                    accessibilityRole="alert"
                  >
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.confirm,
                    { backgroundColor: colors.primary, borderRadius: layout.radius.md },
                    saving && styles.dim,
                  ]}
                  disabled={saving}
                  onPress={() => onConfirm(picked, speciesId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Change to ${pickedMeta?.label}`}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={[styles.confirmText, { color: colors.background }]}>
                      Change to {pickedMeta?.label.toLowerCase()}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.back}
                  disabled={saving}
                  onPress={reset}
                  accessibilityRole="button"
                  accessibilityLabel="Back to type list"
                >
                  <Text style={[styles.backText, { color: colors.textSecondary }]}>
                    Back
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Scrim, same as MarkDiedSheet / FeedingCadenceSheet (not a theme surface).
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  avoider: { justifyContent: 'flex-end' },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  lede: { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 4 },
  list: { maxHeight: 340 },
  listContent: { paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  rowDisabled: { opacity: 0.45 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowGlyph: { fontSize: 22 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  currentTag: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  speciesBlock: { marginTop: 16 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  keepBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginTop: 16,
  },
  keepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 12 },
  confirm: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  confirmText: { fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  back: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
});
