/**
 * Split animals out of a group: each becomes its own animal in the
 * collection (named "<group> #n" by the server). THE SHEET IS THE CONFIRM.
 * Count steps 1..splitMax(total); the date defaults to today; life stage
 * defaults to sling. At the free cap the API answers 402; the sheet stays
 * open and says how many fit; the owner gets a "See plans" action, a
 * co-keeper is told to ask the owner.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import DateInput from './DateInput';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { toISODateLocal, parseLocalDate } from '../utils/date';
import { getErrorMessage } from '../utils/errors';
import { splitMax, splitNoun } from '../lib/broods';
import {
  SPLIT_STAGES,
  capDetailFromError,
  splitCapMessage,
  type CapDetail,
  type SplitLifeStage,
  type SplitResult,
} from '../lib/egg-sacs';
import { splitOutOfColony } from '../lib/egg-sacs-api';

interface Props {
  visible: boolean;
  onClose: () => void;
  colonyId: string;
  taxon: string;
  total: number;
  name: string;
  onDone: (result: SplitResult) => void;
  /** Owner can upgrade; a co-keeper only sees the text (ask the owner). */
  isOwner: boolean;
  /** "See plans" on a 402 (owner only): caller closes the sheet and opens the upgrade. */
  onUpgrade: (detail: CapDetail) => void;
}

export function SplitOutSheet({ visible, onClose, colonyId, taxon, total, name, onDone, isOwner, onUpgrade }: Props) {
  const { colors, layout } = useTheme();
  const max = splitMax(total);
  const [count, setCount] = useState(1);
  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [stage, setStage] = useState<SplitLifeStage>('sling');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cap, setCap] = useState<CapDetail | null>(null);

  // A fresh open never shows the last attempt's error.
  useEffect(() => {
    if (visible) {
      setError('');
      setCap(null);
    }
  }, [visible]);

  const noun = splitNoun(taxon);
  const shown = Math.min(Math.max(count, 1), Math.max(max, 1));

  const handleClose = () => {
    if (saving) return;
    setError('');
    setCap(null);
    onClose();
  };

  const step = (delta: number) => setCount(Math.min(Math.max(shown + delta, 1), Math.max(max, 1)));

  const submit = async () => {
    if (saving || max < 1) return;
    setSaving(true);
    setError('');
    setCap(null);
    try {
      const res = await splitOutOfColony(colonyId, { count: shown, split_on: date, life_stage: stage });
      setSaving(false);
      setCount(1);
      onDone(res);
    } catch (e: any) {
      setSaving(false);
      const capErr = capDetailFromError(e);
      if (capErr) {
        setCap(capErr);
        setError(splitCapMessage(capErr.can_add ?? 0, isOwner));
        return;
      }
      setError(getErrorMessage(e, 'Couldn’t split those out. Nothing has changed. Try again.'));
    }
  };

  const stepper = (icon: 'minus' | 'plus', delta: number, disabled: boolean, label: string) => (
    <TouchableOpacity
      onPress={() => step(delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.stepBtn, { borderColor: colors.border, borderRadius: layout.radius.md }, disabled && { opacity: 0.4 }]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.textPrimary} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderTopLeftRadius: layout.radius.lg, borderTopRightRadius: layout.radius.lg },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border, borderRadius: layout.radius.sm }]} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>Split out</Text>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                {`Each one becomes its own animal in your collection, and ${name} keeps the rest.`}
              </Text>

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>{`HOW MANY ${noun.toUpperCase()}`}</Text>
              <View style={styles.stepRow}>
                {stepper('minus', -1, shown <= 1 || saving, 'One fewer')}
                <Text style={[TYPE.title, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
                  {shown}
                </Text>
                {stepper('plus', 1, shown >= max || saving, 'One more')}
              </View>
              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{`Up to ${max} at a time`}</Text>

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>DATE</Text>
              <DateInput
                value={parseLocalDate(date) ?? new Date()}
                onChange={(d) => setDate(toISODateLocal(d))}
                maximumDate={new Date()}
                label="Date split out"
              />

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>LIFE STAGE</Text>
              <View style={styles.chipWrap}>
                {SPLIT_STAGES.map((s) => {
                  const sel = s.value === stage;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setStage(s.value)}
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
                      <Text style={[TYPE.label, { color: sel ? colors.background : colors.textPrimary }]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error !== '' && (
                <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}
              {cap && isOwner && (
                <TouchableOpacity
                  onPress={() => {
                    setError('');
                    onUpgrade(cap);
                    setCap(null);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>See plans</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.confirm, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md }, (saving || max < 1) && { opacity: 0.6 }]}
                onPress={submit}
                disabled={saving || max < 1}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[TYPE.subheading, { color: colors.background }]}>{`Split out ${shown}`}</Text>
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
  label: { letterSpacing: 0.5 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xl },
  stepBtn: { width: 48, height: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderWidth: 1 },
  confirm: { marginTop: SPACING.xs, paddingVertical: 15, alignItems: 'center' },
  cancel: { textAlign: 'center', paddingVertical: SPACING.sm },
});
