/**
 * Change an animal's taxon — the keeper-facing side of retaxon_service.
 *
 * WHY THIS IS A SHEET AND NOT A CHIP GROUP ON THE EDIT FORM
 * ---------------------------------------------------------
 * Taxon looks like just another field, so the cheap build is a chip row next
 * to Sex and Life stage. That would be wrong twice over:
 *
 *  - Server-side it isn't a field. POST /inverts/{id}/change-taxon deletes a
 *    legacy mirror row and rewrites foreign keys on every log table. Firing
 *    that from "Save changes", alongside a nickname edit, means a keeper can
 *    trigger it by brushing a chip and never know.
 *  - The species link doesn't survive the move. A tarantula's species_id is
 *    meaningless on a jumping spider, so it gets cleared unless a new one is
 *    picked here. Silently blanking a field the keeper spent effort on is the
 *    kind of thing that reads as data loss even when nothing was lost.
 *
 * So: two steps, an explicit confirm, and the species re-pick built into the
 * same flow rather than left as homework.
 *
 * WHAT THE COPY PROMISES
 * ----------------------
 * "Feedings, molts, photos and notes all stay" is a guarantee the backend
 * actually keeps — it re-counts child rows and rolls back on any mismatch. Do
 * not soften this into "should be preserved"; hedging a promise the system
 * enforces just makes keepers distrust a safe operation.
 *
 * Module-level StyleSheet (see the StyleSheet-in-component note). Colors come
 * from the theme; the token is `error`, not `danger`.
 */
import React, { useState } from 'react';
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
import { InvertSpeciesPicker } from './InvertSpeciesPicker';
import {
  INVERT_TAXA,
  INVERT_TAXON_ORDER,
  type InvertSpecies,
  type InvertTaxon,
} from '../lib/inverts';

interface Props {
  visible: boolean;
  /** The animal's taxon right now — offered as the disabled "current" row. */
  current: InvertTaxon;
  /** Shown in the confirm step so the keeper knows which animal this is. */
  animalName: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (taxon: InvertTaxon, speciesId: string | null) => void;
}

export function ChangeTaxonSheet({
  visible,
  current,
  animalName,
  saving = false,
  onClose,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [picked, setPicked] = useState<InvertTaxon | null>(null);
  const [species, setSpecies] = useState<InvertSpecies | null>(null);
  const [scientific, setScientific] = useState('');

  // Reset on every open. A sheet that reopens holding the last attempt's
  // destination taxon is how someone confirms a change they didn't mean.
  const reset = () => {
    setPicked(null);
    setSpecies(null);
    setScientific('');
  };
  const close = () => {
    reset();
    onClose();
  };

  const pickedMeta = picked ? INVERT_TAXA[picked] : null;

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
                  is. Feedings, molts, photos and notes all stay.
                </Text>

                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {INVERT_TAXON_ORDER.map((key) => {
                    const meta = INVERT_TAXA[key];
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
                          style={[
                            styles.rowIcon,
                            { backgroundColor: colors.surfaceElevated },
                          ]}
                        >
                          <Text style={styles.rowGlyph}>{meta.glyph}</Text>
                        </View>
                        <Text
                          style={[styles.rowLabel, { color: colors.textPrimary }]}
                        >
                          {meta.label}
                        </Text>
                        {isCurrent ? (
                          <Text
                            style={[styles.currentTag, { color: colors.textTertiary }]}
                          >
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
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {INVERT_TAXA[current].label} → {pickedMeta?.label}
                </Text>

                {/* Species is not optional-in-spirit: leaving it blank clears
                    the old link rather than keeping it. Say so plainly here
                    instead of letting the keeper discover a blank field. */}
                {!pickedMeta?.freeform && (
                  <View style={styles.speciesBlock}>
                    <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
                      Species
                    </Text>
                    <InvertSpeciesPicker
                      taxon={picked}
                      valueId={species?.id ?? null}
                      valueScientific={scientific}
                      onChange={(s) => {
                        setSpecies(s);
                        setScientific(s?.scientific_name ?? '');
                      }}
                      placeholder={`Search ${pickedMeta?.label.toLowerCase()} species…`}
                    />
                    {!species && (
                      <Text style={[styles.hint, { color: colors.textTertiary }]}>
                        Optional — but the old species won't carry over, so
                        leaving this blank means no care sheet until you set one.
                      </Text>
                    )}
                  </View>
                )}

                <View
                  style={[
                    styles.keepBox,
                    { backgroundColor: colors.surfaceElevated },
                  ]}
                >
                  {/* check-circle, not history: both read right here, but
                      this one is already used elsewhere in the app, so it's
                      confirmed present in the bundled glyph map. An unverified
                      MDI name renders as a blank box in production. */}
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={colors.success}
                  />
                  <Text style={[styles.keepText, { color: colors.textSecondary }]}>
                    Every feeding, molt, substrate change and photo stays with{' '}
                    {animalName}.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirm,
                    { backgroundColor: colors.primary },
                    saving && styles.dim,
                  ]}
                  disabled={saving}
                  onPress={() => onConfirm(picked, species?.id ?? null)}
                  accessibilityRole="button"
                  accessibilityLabel={`Change to ${pickedMeta?.label}`}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmText}>
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
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  avoider: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
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
  // Capped so the sheet can't grow past roughly two-thirds of a phone screen
  // with ten taxa in the list.
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
    borderRadius: 10,
    marginTop: 16,
  },
  keepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  confirm: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  back: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
});
