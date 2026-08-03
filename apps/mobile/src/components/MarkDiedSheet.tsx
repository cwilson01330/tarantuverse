/**
 * Mark as died — ADR-015 / design handoff 1a, frames 2 and 3.
 *
 * THE SHEET IS THE CONFIRM. The date is already defaulted to today, so the
 * whole flow completes in one tap. Cause and note live behind a single optional
 * line, so the sheet never reads as a form — someone logging a sling that
 * didn't make its second molt can be done in four seconds, and someone marking
 * a twelve-year-old female can take as long as they need.
 *
 * The line that does the most work is the one saying nothing was thrown away.
 * It names real counts (from the detail screen's existing fetch, so it costs no
 * extra request) because "her 41 feedings, 9 molts and 12 photos stay" is
 * concrete in a way "nothing is deleted" isn't.
 *
 * Deliberately absent: any checkmark, any success toast, any celebratory
 * colour. See NEVER_WRITE in lib/lifecycle-copy.
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
import { toISODateLocal, parseLocalDate } from '../utils/date';
import {
  DEATH_CAUSE_LABELS,
  DEATH_CAUSE_ORDER,
  markInvertDied,
  type DeathCause,
} from '../lib/inverts';
import {
  COPY,
  nothingIsDeletedLine,
  pronounsFor,
} from '../lib/lifecycle-copy';

interface Props {
  visible: boolean;
  onClose: () => void;
  invertId: string;
  name: string;
  sex: string | null | undefined;
  /** From the detail screen's existing fetch — null where genuinely unknown,
   *  which swaps the key line to its generic form rather than claiming zero. */
  counts: { feedings: number | null; molts: number | null; photos: number | null };
  onDone: () => void;
}

export function MarkDiedSheet({
  visible,
  onClose,
  invertId,
  name,
  sex,
  counts,
  onDone,
}: Props) {
  const { colors, layout } = useTheme();

  const [date, setDate] = useState(toISODateLocal(new Date()));
  // Collapsed by default. Expanding is a choice, never a step.
  const [expanded, setExpanded] = useState(false);
  const [cause, setCause] = useState<DeathCause | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const p = pronounsFor(sex);
  const styles = makeStyles(colors);

  const reset = () => {
    setDate(toISODateLocal(new Date()));
    setExpanded(false);
    setCause('');
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
    setSaving(true);
    setError('');
    try {
      await markInvertDied(invertId, {
        died_at: date,
        // '' means the keeper didn't pick one — send null, not an empty string.
        death_cause: cause || null,
        death_notes: note.trim() || null,
      });
      reset();
      // The caller refetches and swaps the screen in place. No toast, no
      // checkmark — the screen changing IS the acknowledgement.
      onDone();
    } catch (e) {
      // Stay open on failure. Closing the sheet on an error would look like it
      // worked, and the keeper would find the animal still in their collection
      // later with no idea why.
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Couldn’t save that. Nothing has changed — try again.',
      );
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.sheet, { borderTopLeftRadius: layout.radius.lg, borderTopRightRadius: layout.radius.lg }]}>
            <View style={styles.grabber} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
              <Text style={styles.title}>{COPY.sheetTitle(name)}</Text>

              {/* The most reassuring fact available, and it was invisible
                  before this screen existed. */}
              <Text style={styles.reassure}>
                {nothingIsDeletedLine(counts, p.possessive)}
              </Text>

              <Text style={styles.fieldLabel}>{COPY.dateLabel.toUpperCase()}</Text>
              <DateInput
                value={parseLocalDate(date) ?? new Date()}
                onChange={(d) => setDate(toISODateLocal(d))}
                maximumDate={new Date()}
                label={COPY.dateLabel}
              />
              <Text style={styles.helper}>{COPY.dateHelper}</Text>

              {expanded && (
                <>
                  <View style={styles.optionalHeader}>
                    <Text style={styles.fieldLabel}>{COPY.causeLabel.toUpperCase()}</Text>
                    <Text style={styles.optionalTag}>{COPY.optional}</Text>
                  </View>
                  {/* Chips, not a dropdown — "I don't know" has to be as easy
                      to tap as a real cause, or people guess. */}
                  <View style={styles.chipWrap}>
                    {DEATH_CAUSE_ORDER.map((c) => {
                      const sel = c === cause;
                      return (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setCause(sel ? '' : c)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: sel }}
                          style={[
                            styles.chip,
                            {
                              borderColor: sel ? colors.textPrimary : colors.border,
                              backgroundColor: sel ? colors.textPrimary : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: sel ? colors.background : colors.textPrimary,
                              fontSize: 13,
                              fontWeight: '600',
                            }}
                          >
                            {DEATH_CAUSE_LABELS[c]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.optionalHeader}>
                    <Text style={styles.fieldLabel}>{COPY.noteLabel.toUpperCase()}</Text>
                    <Text style={styles.optionalTag}>{COPY.optional}</Text>
                  </View>
                  <TextInput
                    style={styles.textarea}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    placeholder={COPY.notePlaceholder}
                    placeholderTextColor={colors.textTertiary}
                    textAlignVertical="top"
                  />
                </>
              )}

              {error !== '' && (
                <Text style={[styles.helper, { color: colors.error }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}

              {/* Neutral ink, never colors.primary — that's a user-chosen
                  accent, and someone who picked hot pink shouldn't get it on
                  this button. Never colors.error either: red means destructive
                  everywhere else in this app, and this doesn't destroy. */}
              <TouchableOpacity
                style={[styles.confirm, saving && { opacity: 0.6 }]}
                onPress={submit}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.confirmText}>{COPY.confirm}</Text>
                )}
              </TouchableOpacity>

              {!expanded && (
                <TouchableOpacity onPress={() => setExpanded(true)} accessibilityRole="button">
                  <Text style={styles.optionalLink}>{COPY.optionalToggle}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={handleClose} accessibilityRole="button">
                <Text style={styles.cancel}>{COPY.cancel}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    backdropFill: { flex: 1 },
    sheet: { backgroundColor: colors.surface, paddingBottom: 28, maxHeight: '90%' },
    grabber: {
      alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
      backgroundColor: colors.border, marginTop: 10, marginBottom: 6,
    },
    scroll: { paddingHorizontal: 20, paddingTop: 10, gap: 14 },
    title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    reassure: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    fieldLabel: {
      fontSize: 12, fontWeight: '700', color: colors.textTertiary,
      letterSpacing: 0.5,
    },
    helper: { fontSize: 12, color: colors.textTertiary },
    optionalHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    optionalTag: { fontSize: 12, color: colors.textTertiary },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    textarea: {
      minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary,
      backgroundColor: colors.background, fontSize: 15,
    },
    confirm: {
      marginTop: 4, backgroundColor: colors.textPrimary, paddingVertical: 15,
      borderRadius: 12, alignItems: 'center',
    },
    confirmText: { color: colors.background, fontSize: 16, fontWeight: '700' },
    optionalLink: {
      textAlign: 'center', color: colors.textSecondary, fontSize: 14,
      fontWeight: '600', paddingVertical: 10,
    },
    cancel: {
      textAlign: 'center', color: colors.textTertiary, fontSize: 15, paddingVertical: 8,
    },
  });
