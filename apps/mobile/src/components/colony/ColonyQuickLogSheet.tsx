/**
 * Quick log for a colony — design handoff, screen 8, "Colony detail" item 3.
 *
 * Four buttons cover what keepers actually log day to day: births, deaths,
 * removals and a recount. Each opens this sheet, which asks only two things —
 * which stage, and how many — and logs it for today. Everything else (the
 * other seven event types, a past date, severity, notes) is one tap further,
 * behind "More options", which opens the full event form.
 *
 * Recount is the odd one out: the keeper enters the NEW count for a stage and
 * we log the difference as a count_correction, because that's how a recount
 * happens at the tub — you count what's there, you don't compute a delta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/tokens';
import { createColonyEvent, type ColonyEventType, type StageCounts } from '../../lib/colonies';
import { bucketKey, bucketLabel, suggestedBuckets } from '../../lib/colony-buckets';
import { PrimaryButton } from '../PrimaryButton';
import { toISODateLocal } from '../../utils/date';

export type QuickKind = 'birth' | 'death' | 'removed' | 'recount';

const COPY: Record<QuickKind, { title: string; count: string; type: ColonyEventType; sign: 1 | -1 | 0 }> = {
  birth: { title: 'Log births', count: 'How many were born?', type: 'birth', sign: 1 },
  death: { title: 'Log deaths', count: 'How many died?', type: 'death', sign: -1 },
  removed: { title: 'Log a removal', count: 'How many were removed?', type: 'removed', sign: -1 },
  recount: { title: 'Recount', count: 'How many are there now?', type: 'count_correction', sign: 0 },
};

export default function ColonyQuickLogSheet({
  kind,
  colonyId,
  taxon,
  stageCounts,
  onClose,
  onSaved,
  onMore,
}: {
  kind: QuickKind | null;
  colonyId: string;
  taxon: string;
  stageCounts: StageCounts | null | undefined;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Opens the full event form preset to this event type. */
  onMore: (type: ColonyEventType) => void;
}) {
  const { colors, layout } = useTheme();
  const [stage, setStage] = useState<string>('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buckets by their stored spelling (bucketKey), so a colony that still has
  // "Unsexed" from before keys were canonical reads as one "unsexed" bucket,
  // and the suggestion "Unsexed" is sent as "unsexed" — never as a second
  // bucket for the same animals. Chips show bucketLabel.
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(stageCounts ?? {})) {
      const key = bucketKey(k) || 'mixed';
      m[key] = (m[key] ?? 0) + (Number(v) || 0);
    }
    return m;
  }, [stageCounts]);

  // The colony's own buckets first (largest first), then the taxon's
  // suggestions it doesn't have yet. Recounts only make sense against a
  // bucket that exists or is being started.
  const stages = useMemo(() => {
    const own = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    return [...own, ...suggestedBuckets(taxon, counts).map(bucketKey)];
  }, [counts, taxon]);

  useEffect(() => {
    if (!kind) return;
    setStage(stages[0] ?? 'mixed');
    setCount('');
    setError(null);
  }, [kind, stages]);

  if (!kind) return null;
  const copy = COPY[kind];
  const current = counts[stage] ?? 0;

  const save = async () => {
    const n = Number.parseInt(count, 10);
    if (!Number.isFinite(n) || n < 0 || (kind !== 'recount' && n === 0)) {
      setError(kind === 'recount' ? 'Enter the number you counted.' : 'Enter how many.');
      return;
    }
    const delta = kind === 'recount' ? n - current : copy.sign * n;
    if (kind === 'recount' && delta === 0) {
      onClose(); // nothing changed — don't write a zero event
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createColonyEvent(colonyId, {
        event_type: copy.type,
        stage: stage || null,
        count_delta: delta,
        occurred_at: toISODateLocal(new Date()),
        severity: null,
        notes: null,
      });
      await onSaved();
      onClose();
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      setError(typeof d === 'string' ? d : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const recountHint =
    kind === 'recount' && count !== '' && Number.isFinite(Number(count))
      ? (() => {
          const d = Number(count) - current;
          return d === 0 ? 'No change from what’s recorded.' : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString()} from the ${current.toLocaleString()} recorded.`;
        })()
      : kind === 'recount'
        ? `${current.toLocaleString()} recorded now.`
        : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: layout.radius.lg, borderTopRightRadius: layout.radius.lg }]}>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]} accessibilityRole="header">{copy.title}</Text>

          <Text style={[TYPE.label, { color: colors.textSecondary }]}>Stage</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {stages.map((s) => {
              const on = s === stage;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStage(s)}
                  style={[styles.chip, { borderRadius: layout.radius.md, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[TYPE.bodyStrong, on ? styles.onPrimary : { color: colors.textSecondary }]}>{bucketLabel(s)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[TYPE.label, { color: colors.textSecondary }]}>{copy.count}</Text>
          <TextInput
            value={count}
            onChangeText={(v) => { if (/^\d*$/.test(v)) setCount(v); }}
            keyboardType="number-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={[TYPE.title, styles.input, { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md }]}
            accessibilityLabel={copy.count}
          />
          {recountHint ? <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{recountHint}</Text> : null}
          {error ? <Text style={[TYPE.caption, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}

          <PrimaryButton
            onPress={() => void save()}
            disabled={busy}
            style={[styles.save, { borderRadius: layout.radius.md }]}
            outerStyle={[styles.saveOuter, { borderRadius: layout.radius.md, opacity: busy ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
          >
            {/* White on the brand fill — same convention as every other primary button. */}
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={[TYPE.bodyStrong, styles.onPrimary]}>Log for today</Text>}
          </PrimaryButton>

          <TouchableOpacity
            onPress={() => { onClose(); onMore(copy.type); }}
            style={styles.more}
            accessibilityRole="button"
            accessibilityHint="Opens the full event form — other event types, a past date, notes"
          >
            <MaterialCommunityIcons name="dots-horizontal" size={18} color={colors.accent} />
            <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>More options</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderWidth: 1, borderBottomWidth: 0, padding: 20, paddingBottom: 32, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  save: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveOuter: { marginTop: 6 },
  onPrimary: { color: '#fff' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
});
