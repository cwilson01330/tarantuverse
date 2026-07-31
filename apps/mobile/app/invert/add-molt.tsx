/**
 * Generic invert: log molt — ADR-007.
 */
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import { getInvert, getInvertMolt, createInvertMolt, updateInvertMolt, type InvertTaxon, type MoltOutcome } from '../../src/lib/inverts';
import { growthLengthLabel } from '../../src/lib/taxon-modules';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

/** successful / stuck / lost_limb / fatal — the backend vocabulary. Finer
 *  gradations would be guesses about a process the keeper mostly didn't watch. */
const MOLT_OUTCOMES: { value: MoltOutcome; label: string; color: (c: any) => string }[] = [
  { value: 'successful', label: 'Went fine', color: (c: any) => c.success ?? '#22c55e' },
  { value: 'stuck', label: 'Stuck molt', color: (c: any) => c.warning ?? '#d97706' },
  { value: 'lost_limb', label: 'Lost a limb', color: (c: any) => c.warning ?? '#d97706' },
  { value: 'fatal', label: 'Died in molt', color: (c: any) => c.error ?? '#dc2626' },
];

export default function AddInvertMoltScreen() {
  const router = useRouter();
  // logId present ⇒ edit mode. On edit we prefill notes verbatim (the molt
  // number, if any, is embedded there) and leave the molt-number input blank.
  const { id, logId, molted_at, notes: notesParam } =
    useLocalSearchParams<{ id?: string; logId?: string; molted_at?: string; notes?: string }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null);
  const [date, setDate] = useState(molted_at ? toISODateLocal(new Date(molted_at)) : toISODateLocal(new Date()));
  const [moltNum, setMoltNum] = useState('');
  const [notes, setNotes] = useState(notesParam || '');
  // Optional measurements (ADR-008 growth module). Stored on the legacy
  // leg_span_* columns; the label adapts per taxon (leg span vs body length).
  const [lengthBefore, setLengthBefore] = useState('');
  const [lengthAfter, setLengthAfter] = useState('');
  const [weightBefore, setWeightBefore] = useState('');
  const [weightAfter, setWeightAfter] = useState('');
  /** When premolt was first observed. Optional, and genuinely often unknown —
   *  keepers notice premolt at different points. Gated behind a toggle because
   *  DateInput requires a concrete Date, and defaulting to "today" would write
   *  an observation nobody made.
   *
   *  The tarantula molt form has always had this; the generic form didn't, so
   *  ADR-013's detail-screen merge silently removed it for tarantula keepers.
   *  It feeds premolt_service's interval analysis, so losing it degrades molt
   *  prediction quietly rather than visibly. */
  const [hasPremoltStart, setHasPremoltStart] = useState(false);
  const [premoltStart, setPremoltStart] = useState(toISODateLocal(new Date()));
  /** Molt outcome (ADR-015). Blank by default and stays blank unless the
   *  keeper says otherwise — most molts are routine, and a pre-selected
   *  "Successful" would record a judgment nobody made. */
  const [outcome, setOutcome] = useState<MoltOutcome | ''>('');
  const [complication, setComplication] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) getInvert(id).then((i) => setTaxon(i.taxon)).catch(() => {}); }, [id]);

  // Edit mode: prefill measurements from the existing log (params only
  // carry date + notes).
  useEffect(() => {
    if (!logId) return;
    getInvertMolt(logId).then((m) => {
      if (m.leg_span_before != null) setLengthBefore(String(m.leg_span_before));
      if (m.leg_span_after != null) setLengthAfter(String(m.leg_span_after));
      if (m.outcome) setOutcome(m.outcome);
      if (m.complication_notes) setComplication(m.complication_notes);
      if (m.weight_before != null) setWeightBefore(String(m.weight_before));
      if (m.weight_after != null) setWeightAfter(String(m.weight_after));
      if (m.premolt_started_at) {
        setHasPremoltStart(true);
        setPremoltStart(toISODateLocal(new Date(m.premolt_started_at)));
      }
    }).catch(() => {});
  }, [logId]);

  const lengthLabel = growthLengthLabel(taxon ?? '');

  const parseMeasure = (v: string): number | null => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSave = async () => {
    if (!id || !taxon) return;
    try {
      setSaving(true);
      const combined = [moltNum ? `Molt #${moltNum}` : null, notes.trim() || null].filter(Boolean).join('\n\n') || null;
      const payload = {
        molted_at: new Date(date + 'T12:00:00').toISOString(),
        notes: combined,
        // null when the toggle is off — on edit that has to be able to CLEAR a
        // previously recorded date, not just leave it untouched.
        premolt_started_at: hasPremoltStart
          ? new Date(premoltStart + 'T12:00:00').toISOString()
          : null,
        leg_span_before: parseMeasure(lengthBefore),
        leg_span_after: parseMeasure(lengthAfter),
        weight_before: parseMeasure(weightBefore),
        weight_after: parseMeasure(weightAfter),
        outcome: outcome || null,
        complication_notes: complication.trim() || null,
      };
      if (isEdit && logId) {
        await updateInvertMolt(logId, payload);
      } else {
        await createInvertMolt(taxon, id, payload);
      }
      router.back();
    } catch (err) { Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setSaving(false); }
  };

  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title={isEdit ? 'Edit molt' : 'Log molt'} leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      <KeyboardAvoidingView style={styles.flex} behavior={'padding'}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Date molted" colors={colors}><DateInput value={parseLocalDate(date) ?? new Date()} onChange={(d) => setDate(toISODateLocal(d))} maximumDate={new Date()} label="Date molted" /></Field>
          <Field label="Molt number (optional)" colors={colors}><TextInput style={styles.input} value={moltNum} onChangeText={setMoltNum} placeholder="e.g. 4" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" /></Field>
          {/* Premolt start. Hidden behind a toggle so an unrecorded date stays
              unrecorded rather than silently defaulting to today. */}
          <Field label="Premolt started (optional)" colors={colors}>
            <TouchableOpacity
              onPress={() => setHasPremoltStart(!hasPremoltStart)}
              accessibilityRole="switch"
              accessibilityState={{ checked: hasPremoltStart }}
              accessibilityLabel="Record when premolt started"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons
                name={hasPremoltStart ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={hasPremoltStart ? colors.primary : colors.textTertiary}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1 }}>
                I know when premolt started
              </Text>
            </TouchableOpacity>
            {hasPremoltStart && (
              <DateInput
                value={parseLocalDate(premoltStart) ?? new Date()}
                onChange={(d) => setPremoltStart(toISODateLocal(d))}
                maximumDate={parseLocalDate(date) ?? new Date()}
                label="Premolt start date"
              />
            )}
          </Field>
          <View style={styles.measureRow}>
            <View style={styles.measureCol}>
              <Field label={`${lengthLabel} before (cm)`} colors={colors}><TextInput style={styles.input} value={lengthBefore} onChangeText={setLengthBefore} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
            </View>
            <View style={styles.measureCol}>
              <Field label={`${lengthLabel} after (cm)`} colors={colors}><TextInput style={styles.input} value={lengthAfter} onChangeText={setLengthAfter} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
            </View>
          </View>
          <View style={styles.measureRow}>
            <View style={styles.measureCol}>
              <Field label="Weight before (g)" colors={colors}><TextInput style={styles.input} value={weightBefore} onChangeText={setWeightBefore} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
            </View>
            <View style={styles.measureCol}>
              <Field label="Weight after (g)" colors={colors}><TextInput style={styles.input} value={weightAfter} onChangeText={setWeightAfter} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
            </View>
          </View>
          {/* Molting is the most dangerous thing these animals do and the most
              common way one dies. Until now there was nowhere to say a molt
              went wrong except free text, where nothing could find it. */}
          <Field label="How did it go? (optional)" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MOLT_OUTCOMES.map((o) => {
                const sel = o.value === outcome;
                return (
                  <TouchableOpacity
                    key={o.value}
                    onPress={() => setOutcome(sel ? '' : o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: sel ? o.color(colors) : colors.border,
                      backgroundColor: sel ? o.color(colors) : colors.surface,
                    }}
                  >
                    <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6 }}>
              Leave blank if it was unremarkable — we won&apos;t assume either way.
            </Text>
          </Field>
          {outcome !== '' && outcome !== 'successful' && (
            <Field label="What happened? (optional)" colors={colors}>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={complication}
                onChangeText={setComplication}
                placeholder="e.g. stuck on the old exuvia, lost a rear leg"
                placeholderTextColor={colors.textTertiary}
                multiline
              />
            </Field>
          )}
          {outcome === 'fatal' && (
            /* Deliberately a prompt, not an action. Inferring a death from a
               log entry and silently retiring the animal would be the app
               deciding something that grave on the keeper's behalf. */
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginBottom: 16 }}>
              You can mark {'\u2018'}died{'\u2019'} on the animal itself when you&apos;re ready.
              Saving this won&apos;t do it for you.
            </Text>
          )}
          <Field label="Notes (optional)" colors={colors}><TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="How they look post-molt, behavior, etc." placeholderTextColor={colors.textTertiary} multiline /></Field>
          <TouchableOpacity style={[styles.saveButton, (saving || !taxon) && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || !taxon}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save molt'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (<View style={{ marginBottom: 16 }}><Text style={{ fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>{children}</View>);
}
const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 48 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
  measureRow: { flexDirection: 'row', gap: 12 },
  measureCol: { flex: 1 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
