/**
 * LastFedSheet - bottom sheet that asks "When did it last eat?" for one animal
 * (Day-one, 2026-10-27). Opened from a row of the FirstFeedingCard.
 *
 * Chips: Today / Yesterday / Pick a date / Not yet.
 *   - Today / Yesterday log at once (local noon of that day).
 *   - Pick a date reveals the JS-only DateInput (no future days); choosing a
 *     day logs it.
 *   - Not yet closes the sheet without logging anything.
 * The caller does the logging (`onPick`). If it throws, the sheet shows the
 * usual error Alert and stays open so the keeper can try again.
 *
 * Pattern copied from PauseFeedingSheet (Modal, backdrop tap, onRequestClose).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { FIRST_FEEDING_COPY, lastFedIso } from '../lib/first-feeding';
import { SPACING, TYPE } from '../theme/tokens';
import DateInput from './DateInput';

export interface LastFedSheetProps {
  visible: boolean;
  animalName: string;
  onClose: () => void;
  /** Log a feeding at this ISO time. Throw to keep the sheet open. */
  onPick: (iso: string) => Promise<void>;
}

/** Same wording the app uses elsewhere for a failed save. */
function describeError(e: any): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  return e?.message || 'Could not save. Try again?';
}

export function LastFedSheet({ visible, animalName, onClose, onPick }: LastFedSheetProps) {
  const { colors, layout } = useTheme();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // A ref, not state: two taps in the same frame both see busy === false
  // until React re-renders, and would post the feeding twice.
  const inFlight = useRef(false);

  // A fresh sheet every time it opens.
  useEffect(() => {
    if (visible) {
      inFlight.current = false;
      setBusy(false);
      setPicking(false);
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
    } catch (e: any) {
      inFlight.current = false;
      setBusy(false);
      Alert.alert('Could not save', describeError(e));
    }
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
          borderRadius: layout.radius.full,
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
                <DateInput
                  value={new Date()}
                  onChange={(d) => void submit(lastFedIso('pick', d))}
                  maximumDate={new Date()}
                  label={FIRST_FEEDING_COPY.nudgeRowButton}
                />
              </View>
            )}

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
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  name: { marginTop: SPACING.xs },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: { marginTop: SPACING.md },
  busy: { marginTop: SPACING.md },
});

export default LastFedSheet;
