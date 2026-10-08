/**
 * End colony.
 *
 * The colony counterpart of MarkDiedSheet. A colony is a population, so it
 * doesn't die; it ends, and the one thing worth recording is why (crashed,
 * sold, merged, other). THE SHEET IS THE CONFIRM: the date is defaulted to
 * today, so the flow is one pick and one tap.
 *
 * Same copy rules as the died sheet (see NEVER_WRITE in lib/lifecycle-copy):
 * no checkmark, no success toast, no celebratory colour. The caller refetches
 * and the screen changing in place IS the acknowledgement. Neutral ink on the
 * button, never colors.primary (user-chosen accent) and never colors.error
 * (red means destructive, and this destroys nothing).
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import DateInput from './DateInput';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { toISODateLocal, parseLocalDate } from '../utils/date';
import {
  COLONY_END_REASON_LABELS,
  COLONY_END_REASON_ORDER,
  endColony,
  type ColonyEndReason,
} from '../lib/colonies';

const NOTE_MAX = 2000;

interface Props {
  visible: boolean;
  onClose: () => void;
  colonyId: string;
  name: string;
  onDone: () => void;
}

export function EndColonySheet({ visible, onClose, colonyId, name, onDone }: Props) {
  const { colors, layout } = useTheme();

  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [reason, setReason] = useState<ColonyEndReason | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setDate(toISODateLocal(new Date()));
    setReason('');
    setNote('');
    setError('');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    if (!reason) {
      setError('Pick a reason.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await endColony(colonyId, {
        ended_at: date,
        reason,
        notes: note.trim() || null,
      });
      reset();
      onDone();
    } catch (e: any) {
      // Stay open on failure: closing would look like it worked.
      const detail = e?.response?.data?.detail;
      setError(
        typeof detail === 'string' && detail
          ? detail
          : 'Couldn’t save that. Nothing has changed. Try again.',
      );
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border, borderRadius: layout.radius.sm }]} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{`End ${name}`}</Text>

              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                Nothing is deleted. Every event, feeding and photo stays in your records, and the
                colony stops counting toward your plan. You can reopen it later.
              </Text>

              <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>DATE IT ENDED</Text>
              <DateInput
                value={parseLocalDate(date) ?? new Date()}
                onChange={(d) => setDate(toISODateLocal(d))}
                maximumDate={new Date()}
                label="Date it ended"
              />

              <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>REASON</Text>
              {/* Chips, not a dropdown: four options, all visible at once. */}
              <View style={styles.chipWrap}>
                {COLONY_END_REASON_ORDER.map((r) => {
                  const sel = r === reason;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setReason(sel ? '' : r)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={[
                        styles.chip,
                        {
                          borderRadius: layout.radius.lg,
                          borderColor: sel ? colors.textPrimary : colors.border,
                          backgroundColor: sel ? colors.textPrimary : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[TYPE.label, { color: sel ? colors.background : colors.textPrimary }]}>
                        {COLONY_END_REASON_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.optionalHeader}>
                <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>NOTE</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Optional</Text>
              </View>
              <TextInput
                style={[
                  TYPE.body,
                  styles.textarea,
                  {
                    borderColor: colors.border,
                    borderRadius: layout.radius.sm,
                    color: colors.textPrimary,
                    backgroundColor: colors.background,
                  },
                ]}
                value={note}
                onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Note"
              />

              {error !== '' && (
                <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.confirm,
                  { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md },
                  (saving || !reason) && { opacity: 0.6 },
                ]}
                onPress={submit}
                disabled={saving || !reason}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[TYPE.subheading, { color: colors.background }]}>End colony</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} accessibilityRole="button">
                <Text style={[TYPE.body, styles.cancel, { color: colors.textTertiary }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  backdropFill: { flex: 1 },
  sheet: { paddingBottom: SPACING.xl, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, marginTop: 10, marginBottom: 6 },
  scroll: { paddingHorizontal: 20, paddingTop: 10, gap: SPACING.md },
  fieldLabel: { letterSpacing: 0.5 },
  optionalHeader: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderWidth: 1 },
  textarea: { minHeight: 72, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  confirm: { marginTop: SPACING.xs, paddingVertical: 15, alignItems: 'center' },
  cancel: { textAlign: 'center', paddingVertical: SPACING.sm },
});
