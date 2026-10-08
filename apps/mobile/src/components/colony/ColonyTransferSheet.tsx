/**
 * Transfer or sell a colony: the whole colony, or part of it ("25 of 360").
 *
 * Owner-only (the screen hides it from everyone else and the API refuses
 * them). Making a link takes nothing out of the colony; the counts move when
 * the buyer claims on the web claim page, and the API checks them again then.
 * We never process the sale — the price is a private note for the seller.
 *
 * After the link is made the system share sheet opens with it, same as the
 * animal transfer. Open links for this colony are listed with Share again /
 * Cancel so a keeper can withdraw one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { formatLocalDate } from '../../utils/date';
import { getErrorMessage } from '../../utils/errors';
import { WEB_BASE_URL } from '../../utils/image-url';
import {
  cancelColonyTransfer,
  createColonyTransfer,
  listColonyTransfers,
  type ColonyTransferMode,
  type ColonyTransferRow,
  type StageCounts,
} from '../../lib/colonies';

const NOTE_MAX = 2000;
// The claim page is on the web, same host the API builds claim_url from.
const WEB_BASE = WEB_BASE_URL.replace(/\/$/, '');

interface Props {
  visible: boolean;
  onClose: () => void;
  colonyId: string;
  name: string;
  stageCounts: StageCounts | null | undefined;
  estimated: boolean;
  /** Species or colony name for the share message. */
  shareLabel: string;
}

function stageWord(stage: string): string {
  return stage.replace(/_/g, ' ');
}

export function ColonyTransferSheet({
  visible,
  onClose,
  colonyId,
  name,
  stageCounts,
  estimated,
  shareLabel,
}: Props) {
  const { colors, layout } = useTheme();

  const stages = useMemo(
    () => Object.entries(stageCounts ?? {}).filter(([, n]) => typeof n === 'number' && n > 0),
    [stageCounts],
  );
  const colonyTotal = stages.reduce((sum, [, n]) => sum + n, 0);
  const approx = estimated ? '~' : '';

  const [mode, setMode] = useState<ColonyTransferMode>('full');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [includePhotos, setIncludePhotos] = useState(true);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ColonyTransferRow[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const partialTotal = stages.reduce((sum, [stage]) => {
    const n = Number.parseInt(counts[stage] ?? '', 10);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const loadRows = useCallback(async () => {
    try {
      const all = await listColonyTransfers(colonyId);
      setRows(all.filter((r) => r.status === 'pending'));
    } catch {
      setRows([]);
    }
  }, [colonyId]);

  useEffect(() => {
    if (!visible) return;
    setMode('full');
    setCounts({});
    setIncludePhotos(true);
    setPrice('');
    setNote('');
    setError('');
    void loadRows();
  }, [visible, loadRows]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const partialProblem = (): string | null => {
    for (const [stage, have] of stages) {
      const raw = (counts[stage] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) return `Enter a whole number for ${stageWord(stage)}.`;
      if (n > have) return `You have ${have} ${stageWord(stage)}, so you can hand over at most ${have}.`;
    }
    if (partialTotal === 0) return 'Enter how many of at least one stage you’re handing over.';
    if (partialTotal >= colonyTotal) return 'That’s every animal in the colony. Choose Whole colony instead.';
    return null;
  };

  const share = async (url: string, howMany: string) => {
    await Share.share({
      message: `I'm sending you ${howMany}${shareLabel} on Tarantuverse — claim them here: ${url}`,
    });
  };

  const submit = async () => {
    if (saving) return;
    setError('');
    let payloadCounts: StageCounts | undefined;
    if (mode === 'partial') {
      const problem = partialProblem();
      if (problem) {
        setError(problem);
        return;
      }
      payloadCounts = {};
      for (const [stage] of stages) {
        const n = Number.parseInt(counts[stage] ?? '', 10);
        if (Number.isFinite(n) && n > 0) payloadCounts[stage] = n;
      }
    }
    const priceNum = price.trim() ? Number(price.replace(/[^0-9.]/g, '')) : null;
    if (priceNum != null && !Number.isFinite(priceNum)) {
      setError('Enter the price as a number, or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      const res = await createColonyTransfer(colonyId, {
        mode,
        counts: payloadCounts,
        include_photos: includePhotos,
        sale_price: priceNum,
        note: note.trim() || null,
      });
      setSaving(false);
      onClose();
      await share(res.claim_url, mode === 'partial' ? `${partialTotal} ` : 'my colony of ');
    } catch (e) {
      // Stay open on failure: closing would look like it worked.
      setError(getErrorMessage(e));
      setSaving(false);
    }
  };

  const cancelRow = (r: ColonyTransferRow) => {
    Alert.alert(
      'Cancel this link?',
      'Anyone holding it won’t be able to claim.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel link',
          style: 'destructive',
          onPress: async () => {
            setCancelling(r.token);
            try {
              await cancelColonyTransfer(r.token);
              await loadRows();
            } catch (e) {
              Alert.alert('Could not cancel', getErrorMessage(e));
            } finally {
              setCancelling(null);
            }
          },
        },
      ],
    );
  };

  const inputStyle = {
    borderColor: colors.border,
    borderRadius: layout.radius.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background,
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
              <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{`Transfer ${name}`}</Text>
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                Make a link the new keeper uses to add the animals to their collection. Nothing leaves
                this colony until they claim. We never process the sale.
              </Text>

              {rows.length > 0 && (
                <View style={{ gap: SPACING.sm }}>
                  <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>OPEN LINKS</Text>
                  {rows.map((r) => (
                    <View
                      key={r.id}
                      style={[styles.row, { borderColor: colors.border, borderRadius: layout.radius.sm }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{r.label ?? 'Transfer'}</Text>
                        <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                          {`Link works until ${formatLocalDate(r.expires_at, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => share(`${WEB_BASE}/claim/${r.token}`, r.transfer_total ? `${r.transfer_total} ` : 'my colony of ')}
                        accessibilityRole="button"
                        accessibilityLabel="Share this link again"
                      >
                        <Text style={[TYPE.label, { color: colors.accent }]}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => cancelRow(r)}
                        disabled={cancelling === r.token}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel this link"
                      >
                        <Text style={[TYPE.label, { color: colors.textSecondary }]}>
                          {cancelling === r.token ? '…' : 'Cancel'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>WHAT ARE YOU HANDING OVER?</Text>
              <View style={styles.chipWrap}>
                {(['full', 'partial'] as const).map((m) => {
                  const sel = m === mode;
                  const disabled = m === 'partial' && colonyTotal === 0;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => { setMode(m); setError(''); }}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel, disabled }}
                      style={[
                        styles.chip,
                        {
                          borderRadius: layout.radius.lg,
                          borderColor: sel ? colors.textPrimary : colors.border,
                          backgroundColor: sel ? colors.textPrimary : 'transparent',
                        },
                        disabled && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={[TYPE.label, { color: sel ? colors.background : colors.textPrimary }]}>
                        {m === 'full' ? 'Whole colony' : 'Part of it'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {mode === 'full' ? (
                <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                  {colonyTotal > 0
                    ? `All ${approx}${colonyTotal.toLocaleString()} animals. When the link is claimed, this colony moves to the new keeper and becomes a transferred record here.`
                    : 'When the link is claimed, this colony moves to the new keeper and becomes a transferred record here.'}
                </Text>
              ) : (
                <View style={{ gap: SPACING.sm }}>
                  <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                    How many of each stage? The rest stay in this colony.
                  </Text>
                  {stages.map(([stage, have]) => (
                    <View key={stage} style={styles.stageRow}>
                      <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>
                        {stageWord(stage)}
                        <Text style={{ color: colors.textTertiary }}>{`  of ${approx}${have.toLocaleString()}`}</Text>
                      </Text>
                      <TextInput
                        style={[TYPE.body, styles.countInput, inputStyle]}
                        value={counts[stage] ?? ''}
                        onChangeText={(t) => setCounts((c) => ({ ...c, [stage]: t.replace(/[^0-9]/g, '') }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                        accessibilityLabel={`${stageWord(stage)} to hand over`}
                      />
                    </View>
                  ))}
                  <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
                    {`${partialTotal.toLocaleString()} of ${approx}${colonyTotal.toLocaleString()}`}
                  </Text>
                </View>
              )}

              <View style={styles.switchRow}>
                <Text style={[TYPE.body, { color: colors.textPrimary, flex: 1 }]}>Include this colony’s photos</Text>
                <Switch
                  value={includePhotos}
                  onValueChange={setIncludePhotos}
                  accessibilityLabel="Include this colony’s photos"
                />
              </View>

              <View style={styles.optionalHeader}>
                <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>SALE PRICE</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Private, for your records only</Text>
              </View>
              <TextInput
                style={[TYPE.body, styles.input, inputStyle]}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="Optional"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Sale price, private"
              />

              <View style={styles.optionalHeader}>
                <Text style={[TYPE.caption, styles.fieldLabel, { color: colors.textTertiary }]}>NOTE TO THE NEW KEEPER</Text>
                <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Optional</Text>
              </View>
              <TextInput
                style={[TYPE.body, styles.textarea, inputStyle]}
                value={note}
                onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
                multiline
                textAlignVertical="top"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Note to the new keeper"
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
                  saving && { opacity: 0.6 },
                ]}
                onPress={submit}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[TYPE.subheading, { color: colors.background }]}>Make claim link</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} accessibilityRole="button">
                <Text style={[TYPE.body, styles.cancel, { color: colors.textTertiary }]}>Close</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  countInput: { width: 96, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, textAlign: 'right' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  input: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  textarea: { minHeight: 72, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  confirm: { marginTop: SPACING.xs, paddingVertical: 15, alignItems: 'center' },
  cancel: { textAlign: 'center', paddingVertical: SPACING.sm },
});
