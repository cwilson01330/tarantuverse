/**
 * LastFedSheet - bottom sheet that asks "When did it last eat?" for one animal
 * (HV day one, 2026-11-18; mirrors Tarantuverse's LastFedSheet). Opened from a
 * row of the FirstFeedingCard.
 *
 * Chips: Today / Yesterday / Pick a date / Not yet.
 *   - Today / Yesterday log at once (local noon of that day).
 *   - Pick a date reveals a YYYY-MM-DD field (HV's forms take dates as typed
 *     text; no native picker) and a Save button; no future days.
 *   - Not yet closes the sheet without logging anything.
 * The caller does the logging (`onPick`). If it throws, the sheet shows the
 * usual error Alert and stays open so the keeper can try again.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { FIRST_FEEDING_COPY, lastFedIso, lastFedPickError, parseLocalYmd } from '../lib/first-feeding';
import { TYPE } from '../theme/type';
import { ThemedInput, extractErrorMessage, todayISO } from './forms/FormPrimitives';

export interface LastFedSheetProps {
  visible: boolean;
  animalName: string;
  onClose: () => void;
  /** Log a feeding at this ISO time. Throw to keep the sheet open. */
  onPick: (iso: string) => Promise<void>;
}

export function LastFedSheet({ visible, animalName, onClose, onPick }: LastFedSheetProps) {
  const { colors, layout } = useTheme();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  // A ref, not state: two taps in the same frame both see busy === false
  // until React re-renders, and would post the feeding twice.
  const inFlight = useRef(false);

  // A fresh sheet every time it opens.
  useEffect(() => {
    if (visible) {
      inFlight.current = false;
      setBusy(false);
      setPicking(false);
      setTyped(todayISO());
      setPickError(null);
    }
  }, [visible]);

  const submit = async (iso: string | null) => {
    if (inFlight.current || !iso) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await onPick(iso);
      inFlight.current = false;
      setBusy(false);
      onClose();
    } catch (e) {
      inFlight.current = false;
      setBusy(false);
      Alert.alert('Could not save', extractErrorMessage(e, 'Could not save. Try again?'));
    }
  };

  const savePicked = () => {
    const problem = lastFedPickError(typed);
    if (problem) {
      setPickError(problem);
      return;
    }
    setPickError(null);
    void submit(lastFedIso('pick', parseLocalYmd(typed)));
  };

  const chip = (label: string, onPress: () => void, selected = false) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, selected }}
      style={[
        styles.chip,
        {
          borderRadius: layout.radius.xl,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary + '1F' : 'transparent',
          opacity: busy ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[TYPE.label, { color: selected ? colors.primary : colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Not accessible: a labelled wrapper would hide the sheet's own controls from screen readers. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          accessible={false}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
        >
          <SafeAreaView edges={['bottom']}>
            <Text style={[TYPE.heading, { color: colors.textPrimary }]} accessibilityRole="header">
              {FIRST_FEEDING_COPY.nudgeRowButton}
            </Text>
            <Text style={[TYPE.body, styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
              {animalName}
            </Text>

            <View style={styles.chips}>
              {chip(FIRST_FEEDING_COPY.nudgeChipToday, () => void submit(lastFedIso('today', null)))}
              {chip(FIRST_FEEDING_COPY.nudgeChipYesterday, () => void submit(lastFedIso('yesterday', null)))}
              {chip(FIRST_FEEDING_COPY.nudgeChipPickDate, () => setPicking(true), picking)}
              {chip(FIRST_FEEDING_COPY.nudgeChipNotYet, onClose)}
            </View>

            {picking && (
              <View style={styles.pickRow}>
                <View style={styles.pickInput}>
                  <ThemedInput
                    value={typed}
                    onChangeText={(v) => {
                      setTyped(v);
                      setPickError(null);
                    }}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                    autoCapitalize="none"
                    maxLength={10}
                    editable={!busy}
                    accessibilityLabel={`${FIRST_FEEDING_COPY.nudgeRowButton} (YYYY-MM-DD)`}
                  />
                </View>
                <TouchableOpacity
                  onPress={savePicked}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Save date"
                  style={[styles.save, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
                >
                  <Text style={[TYPE.bodyStrong, styles.onPrimary]}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
            {picking && pickError ? (
              <Text style={[TYPE.caption, styles.pickError, { color: colors.danger }]} role="alert">
                {pickError}
              </Text>
            ) : null}

            {busy && <ActivityIndicator style={styles.busy} color={colors.primary} />}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  name: { marginTop: 4 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickInput: { flex: 1 },
  save: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  onPrimary: { color: '#0B0B0B' },
  pickError: { marginTop: 6 },
  busy: { marginTop: 12 },
});

export default LastFedSheet;
