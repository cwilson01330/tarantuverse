/**
 * Mark as died — HV mirror of TV's MarkDiedSheet (ADR-015, handoff §14.2).
 *
 * THE SHEET IS THE CONFIRM. The date defaults to today, so one tap completes
 * it. Cause and note sit behind a single optional line so it never reads as a
 * form. No toast and no checkmark afterwards — the detail screen changing in
 * place is the acknowledgement.
 *
 * The confirm is neutral ink: never colors.primary (a chosen accent) and never
 * colors.danger (red means destructive, and this destroys nothing).
 */
import { useState } from 'react';
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
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { ThemedInput, extractErrorMessage, todayISO } from './forms/FormPrimitives';
import {
  COPY,
  DEATH_CAUSE_LABELS,
  HV_DEATH_CAUSE_ORDER,
  markAnimalDied,
  pronounsFor,
  type DeathCause,
} from '../lib/lifecycle';

const GRABBER_W = 36;
const GRABBER_H = 4;

export function MarkDiedSheet({
  visible,
  onClose,
  animalId,
  name,
  sex,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  animalId: string;
  name: string;
  sex: string | null | undefined;
  onDone: () => void;
}) {
  const { colors, layout } = useTheme();
  const [date, setDate] = useState(todayISO());
  const [expanded, setExpanded] = useState(false);
  const [cause, setCause] = useState<DeathCause | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const p = pronounsFor(sex);

  const reset = () => {
    setDate(todayISO());
    setExpanded(false);
    setCause('');
    setNote('');
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    const ymd = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setError('Use a date in YYYY-MM-DD format.');
      return;
    }
    if (ymd > todayISO()) {
      setError('That date is in the future.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await markAnimalDied(animalId, {
        died_at: ymd,
        death_cause: cause || null,
        death_notes: note.trim() || null,
      });
      reset();
      onDone();
    } catch (e) {
      // Stay open — closing on an error would look like it worked.
      setError(extractErrorMessage(e, 'Couldn’t save that. Nothing has changed — try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.flex} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderTopLeftRadius: layout.radius.xl, borderTopRightRadius: layout.radius.xl },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
              <Text style={[TYPE.title, { color: colors.textPrimary }]} accessibilityRole="header">
                {COPY.sheetTitle(name)}
              </Text>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>{COPY.sheetBody(p)}</Text>

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>
                {COPY.dateLabel.toUpperCase()}
              </Text>
              <ThemedInput
                value={date}
                onChangeText={setDate}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                accessibilityLabel={COPY.dateLabel}
              />
              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                {date === todayISO() ? 'Today. ' : ''}{COPY.dateHelper}
              </Text>

              {expanded ? (
                <>
                  <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>
                    {COPY.causeLabel.toUpperCase()} · OPTIONAL
                  </Text>
                  <View style={styles.chips}>
                    {HV_DEATH_CAUSE_ORDER.map((c) => {
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
                              borderRadius: layout.radius.xl,
                              borderColor: sel ? colors.textPrimary : colors.border,
                              backgroundColor: sel ? colors.textPrimary : 'transparent',
                            },
                          ]}
                        >
                          <Text style={[TYPE.bodyStrong, { color: sel ? colors.background : colors.textPrimary }]}>
                            {DEATH_CAUSE_LABELS[c]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>
                    {COPY.noteLabel.toUpperCase()} · OPTIONAL
                  </Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={colors.textTertiary}
                    style={[
                      TYPE.body,
                      styles.note,
                      { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background, borderRadius: layout.radius.md },
                    ]}
                    accessibilityLabel={COPY.noteLabel}
                  />
                </>
              ) : null}

              {error ? (
                <Text style={[TYPE.caption, { color: colors.danger }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={() => void submit()}
                disabled={saving}
                style={[styles.confirm, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md, opacity: saving ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[TYPE.subheading, styles.bold, { color: colors.background }]}>{COPY.confirm}</Text>
                )}
              </TouchableOpacity>

              {!expanded ? (
                <TouchableOpacity onPress={() => setExpanded(true)} accessibilityRole="button" style={styles.link}>
                  <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>{COPY.optionalToggle}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={close} accessibilityRole="button" style={styles.link}>
                <Text style={[TYPE.body, { color: colors.textTertiary }]}>{COPY.cancel}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { paddingBottom: 28, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: GRABBER_W, height: GRABBER_H, borderRadius: GRABBER_H / 2, marginTop: 10, marginBottom: 6 },
  scroll: { paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  label: { letterSpacing: 0.5, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  note: { minHeight: 72, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  confirm: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  bold: { fontWeight: '700' },
  link: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
