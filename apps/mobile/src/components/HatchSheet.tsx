/**
 * Hatch an egg sac: start a group of slings (nymphs, scorplings) from it.
 * THE SHEET IS THE CONFIRM. One count, an "about" box for estimates, and the
 * hatch date (today by default). On success the caller opens the new group.
 * At the free cap the API answers 402; the sheet closes itself and hands the
 * detail to the caller, which shows the same limit message and upgrade path
 * as the add-animal screen.
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
import { MaterialCommunityIcons } from '@expo/vector-icons';

import DateInput from './DateInput';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { toISODateLocal, parseLocalDate } from '../utils/date';
import { getErrorMessage } from '../utils/errors';
import { broodBucket, hatchButtonLabel } from '../lib/taxon-modules';
import { HATCH_MAX, buildHatchPayload, capDetailFromError, type CapDetail } from '../lib/egg-sacs';
import { hatchEggSac } from '../lib/egg-sacs-api';

interface Props {
  visible: boolean;
  onClose: () => void;
  sacId: string;
  taxon: string;
  /** Starting count, e.g. from the sac's own count. */
  initialCount?: number | null;
  onHatched: (colonyId: string) => void;
  onCap: (detail: CapDetail) => void;
}

export function HatchSheet({ visible, onClose, sacId, taxon, initialCount, onHatched, onCap }: Props) {
  const { colors, layout } = useTheme();
  const [countText, setCountText] = useState(initialCount ? String(initialCount) : '');
  const [estimated, setEstimated] = useState(false);
  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const bucket = broodBucket(taxon);

  const handleClose = () => {
    if (saving) return;
    setError('');
    onClose();
  };

  const submit = async () => {
    if (saving) return;
    const built = buildHatchPayload({ countText, estimated, hatchedOn: date });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await hatchEggSac(sacId, built.payload);
      setSaving(false);
      onHatched(res.colony.id);
    } catch (e: any) {
      setSaving(false);
      const cap = capDetailFromError(e);
      if (cap) {
        onCap(cap);
        return;
      }
      // Stay open on failure: closing would look like it worked.
      setError(getErrorMessage(e, 'Couldn’t save that. Nothing has changed. Try again.'));
    }
  };

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
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{hatchButtonLabel(taxon)}</Text>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                {`This starts one group of ${bucket} you can feed, track and split up later.`}
              </Text>

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>{`HOW MANY ${bucket.toUpperCase()}`}</Text>
              <TextInput
                value={countText}
                onChangeText={setCountText}
                keyboardType="number-pad"
                placeholder={`1 to ${HATCH_MAX}`}
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`How many ${bucket}`}
                style={[
                  TYPE.body,
                  styles.input,
                  { borderColor: colors.border, borderRadius: layout.radius.sm, color: colors.textPrimary, backgroundColor: colors.background },
                ]}
              />
              <TouchableOpacity
                onPress={() => setEstimated(!estimated)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: estimated }}
                style={styles.checkRow}
              >
                <MaterialCommunityIcons
                  name={estimated ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={22}
                  color={estimated ? colors.textPrimary : colors.textTertiary}
                />
                <Text style={[TYPE.body, { color: colors.textPrimary }]}>About this many</Text>
              </TouchableOpacity>

              <Text style={[TYPE.caption, styles.label, { color: colors.textTertiary }]}>DATE HATCHED</Text>
              <DateInput
                value={parseLocalDate(date) ?? new Date()}
                onChange={(d) => setDate(toISODateLocal(d))}
                maximumDate={new Date()}
                label="Date hatched"
              />

              {error !== '' && (
                <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.confirm, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md }, saving && { opacity: 0.6 }]}
                onPress={submit}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[TYPE.subheading, { color: colors.background }]}>{`Start the ${bucket} group`}</Text>
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
  input: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  confirm: { marginTop: SPACING.xs, paddingVertical: 15, alignItems: 'center' },
  cancel: { textAlign: 'center', paddingVertical: SPACING.sm },
});
