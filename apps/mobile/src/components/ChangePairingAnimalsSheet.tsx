/**
 * Correct which two animals a pairing records.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until recently the API couldn't do this at all for a non-tarantula:
 * `PairingUpdate` had no invert fields, and the legacy `male_id`/`female_id`
 * are foreign keys into `tarantulas`, which a mantis has no row in. So a
 * pairing logged against the wrong animal was permanent. The server side is
 * fixed; this is the way in.
 *
 * BOTH SLOTS IN ONE SHEET
 * -----------------------
 * The server validates the resulting PAIR, not the half that changed — same
 * taxon, not the same animal twice, sexes not both known-equal. Editing one
 * slot at a time would let a keeper stage a change that gets refused for a
 * reason sitting in the other half, with nothing on screen explaining it.
 *
 * THE CLIENT DOESN'T RE-IMPLEMENT THE RULES
 * -----------------------------------------
 * It filters to the pairing's taxon and greys out the animal already in the
 * other slot — the two cases where offering the choice would be pointless.
 * Everything else (sex checks, cross-species advice) is the server's, and its
 * message is shown verbatim. Two copies of a rule is how they drift.
 *
 * Module-level StyleSheet — never build styles inside the component.
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';

export interface PairCandidate {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon?: string | null;
  sex?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (args: { maleId: string; femaleId: string }) => Promise<void>;
  /** Every animal the keeper owns; filtered to `pairTaxon` in here. */
  candidates: PairCandidate[];
  currentMaleId: string | null;
  currentFemaleId: string | null;
  /** The taxon this pairing is locked to; null when it can't be determined. */
  pairTaxon: string | null;
}

function displayName(a: PairCandidate): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}

/** Advisory only — the server decides. Shown so a keeper can see why a pick
 *  might be refused before they try it. */
function sexMark(a: PairCandidate): string {
  if (a.sex === 'male') return '♂';
  if (a.sex === 'female') return '♀';
  return '?';
}

export function ChangePairingAnimalsSheet({
  visible,
  onClose,
  onSubmit,
  candidates,
  currentMaleId,
  currentFemaleId,
  pairTaxon,
}: Props) {
  const { colors, layout } = useTheme();
  const [maleId, setMaleId] = useState<string | null>(currentMaleId);
  const [femaleId, setFemaleId] = useState<string | null>(currentFemaleId);
  const [slot, setSlot] = useState<'male' | 'female'>('male');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed on open so a cancelled edit doesn't persist into the next one.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setMaleId(currentMaleId);
      setFemaleId(currentFemaleId);
      setSlot('male');
      setSearch('');
      setError(null);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = candidates
    .filter((a) => !pairTaxon || !a.taxon || a.taxon === pairTaxon)
    .filter((a) =>
      !q
        ? true
        : [a.name, a.common_name, a.scientific_name]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
    );

  const picked = slot === 'male' ? maleId : femaleId;
  const other = slot === 'male' ? femaleId : maleId;
  const setPicked = slot === 'male' ? setMaleId : setFemaleId;

  const dirty = maleId !== currentMaleId || femaleId !== currentFemaleId;
  const canSave = Boolean(maleId && femaleId) && dirty && !busy;

  const submit = async () => {
    if (!maleId || !femaleId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ maleId, femaleId });
      onClose();
    } catch (e: any) {
      // Server refusals (same sex, mixed taxon, paired with itself) surface
      // here verbatim — they explain the problem better than anything this
      // component could invent.
      setError(e?.message || "Couldn't change the animals.");
    } finally {
      setBusy(false);
    }
  };

  const nameFor = (id: string | null) => {
    if (!id) return 'Not set';
    const found = candidates.find((a) => a.id === id);
    return found ? displayName(found) : 'Unknown animal';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Change animals
            </Text>
            <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
              Anything already recorded under this pairing stays attached.
            </Text>

            {/* Slot switcher — which side you're picking for. */}
            <View style={styles.slotRow}>
              {(['male', 'female'] as const).map((s) => {
                const on = s === slot;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSlot(s)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Pick the ${s}`}
                    style={[
                      styles.slotTab,
                      {
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on
                          ? colors.surfaceElevated
                          : 'transparent',
                        borderRadius: layout.radius.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotLabel,
                        { color: on ? colors.primary : colors.textTertiary },
                      ]}
                    >
                      {s === 'male' ? '♂ Male' : '♀ Female'}
                    </Text>
                    <Text
                      style={[styles.slotValue, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {nameFor(s === 'male' ? maleId : femaleId)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name…"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Search animals"
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  backgroundColor: colors.background,
                  borderRadius: layout.radius.md,
                },
              ]}
            />

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {shown.length === 0 ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  No animals match.
                </Text>
              ) : (
                shown.map((a) => {
                  const isOther = a.id === other;
                  const on = a.id === picked;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      disabled={isOther}
                      onPress={() => setPicked(a.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: isOther }}
                      accessibilityLabel={displayName(a)}
                      accessibilityHint={
                        isOther ? 'Already in the other slot' : undefined
                      }
                      style={[
                        styles.option,
                        {
                          borderColor: on ? colors.primary : colors.border,
                          backgroundColor: on
                            ? colors.surfaceElevated
                            : 'transparent',
                          borderRadius: layout.radius.md,
                          opacity: isOther ? 0.45 : 1,
                        },
                      ]}
                    >
                      {/* Confirmed present in the bundled glyph map — both are
                          used elsewhere in the app. An unverified MDI name
                          renders as a blank box in production. */}
                      <MaterialCommunityIcons
                        name={on ? 'check-circle' : 'check-circle-outline'}
                        size={18}
                        color={on ? colors.primary : colors.textTertiary}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.optName, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {displayName(a)} {sexMark(a)}
                        </Text>
                        <Text
                          style={[styles.optMeta, { color: colors.textTertiary }]}
                          numberOfLines={1}
                        >
                          {isOther
                            ? 'Already in the other slot'
                            : a.scientific_name || ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {error ? (
              <Text style={[styles.errorHint, { color: '#fca5a5' }]}>{error}</Text>
            ) : null}

            <TouchableOpacity
              disabled={!canSave}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel="Save the new animals"
              style={[
                styles.primary,
                {
                  backgroundColor: canSave ? colors.primary : colors.surfaceElevated,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: canSave ? '#fff' : colors.textTertiary },
                  ]}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancel, { backgroundColor: colors.surfaceElevated }]}
              onPress={busy ? undefined : onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  slotRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  slotTab: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slotLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  slotValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 12,
  },
  list: { maxHeight: 280, marginTop: 10 },
  hint: { fontSize: 13, lineHeight: 19 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  optName: { fontSize: 14, fontWeight: '600' },
  optMeta: { fontSize: 11, marginTop: 1 },
  errorHint: { fontSize: 12, marginTop: 8 },
  primary: { marginTop: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  cancel: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
