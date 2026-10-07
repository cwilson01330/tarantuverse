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
import { getInvert, getInvertMolt, createInvertMolt, updateInvertMolt, invertDisplayName, type Invert, type InvertTaxon, type MoltOutcome } from '../../src/lib/inverts';
import { useAuth } from '../../src/contexts/AuthContext';
import { can, useCollectionRole } from '../../src/lib/co-keepers';
import { COPY as LIFECYCLE_COPY, pronounsFor } from '../../src/lib/lifecycle-copy';
import { requestMarkDied } from '../../src/lib/pending-intent';
import { finalMoltCopy, growthLengthLabel } from '../../src/lib/taxon-modules';
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
  const { id, logId, molted_at, notes: notesParam, from } =
    useLocalSearchParams<{ id?: string; logId?: string; molted_at?: string; notes?: string; from?: string }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null);
  const [animal, setAnimal] = useState<Invert | null>(null);
  const { user } = useAuth();
  const { role } = useCollectionRole(user?.id, animal?.user_id);
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
  /** The ultimate molt (ult_20260911) — the one after which this animal will
   *  not molt again. Off by default and it must stay that way: it permanently
   *  suppresses premolt prediction, so a pre-ticked box would silently switch
   *  the feature off for animals that are still growing. */
  const [isUltimate, setIsUltimate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) getInvert(id).then((i) => { setTaxon(i.taxon); setAnimal(i); }).catch(() => {}); }, [id]);

  // Edit mode: prefill measurements from the existing log (params only
  // carry date + notes).
  useEffect(() => {
    if (!logId) return;
    getInvertMolt(logId).then((m) => {
      if (m.leg_span_before != null) setLengthBefore(String(m.leg_span_before));
      if (m.leg_span_after != null) setLengthAfter(String(m.leg_span_after));
      if (m.outcome) setOutcome(m.outcome);
      if (m.complication_notes) setComplication(m.complication_notes);
      if (m.is_ultimate) setIsUltimate(true);
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
        is_ultimate: isUltimate,
      };
      let created: { id: string } | null = null;
      if (isEdit && logId) {
        await updateInvertMolt(logId, payload);
      } else {
        created = await createInvertMolt(taxon, id, payload);
      }
      // Handoff §14.9: offer the path AFTER the molt saves — never before,
      // never automatically. A fatal outcome still doesn't set died_at
      // (ADR-015 D6); this only makes the next step one tap. Only for new
      // logs by someone allowed to mark the animal died.
      if (!isEdit && outcome === 'fatal' && animal && !animal.died_at && can(role, 'keeper')) {
        const p = pronounsFor(animal.sex);
        Alert.alert(
          'Molt saved',
          LIFECYCLE_COPY.afterFatalMolt(invertDisplayName(animal), p.object),
          [
            { text: 'Not now', style: 'cancel', onPress: () => router.back() },
            {
              text: 'Mark as died',
              onPress: () => {
                requestMarkDied(id);
                // From the detail screen: go back to it. From anywhere else
                // (the collection's quick "Log molt"): there's no detail
                // screen beneath us, so open it in this one's place.
                if (from === 'detail') router.back();
                else router.replace(`/invert/${id}` as any);
              },
            },
          ],
          { cancelable: true, onDismiss: () => router.back() },
        );
        return;
      }
      // Offer a share card after a NEW, non-fatal molt (never forced). The
      // fatal branch above stays first so a death never offers a card.
      if (!isEdit && created && outcome !== 'fatal' && can(role, 'keeper')) {
        const molt = created;
        // Same post-save navigation as the fatal offer: back to the detail
        // screen we came from, else open it in this screen's place.
        const leave = () => { if (from === 'detail') router.back(); else router.replace(`/invert/${id}` as any); };
        Alert.alert('Molt saved', 'Make a card of it?', [
          { text: 'Not now', style: 'cancel', onPress: leave },
          { text: 'Make a card', onPress: () => router.replace(`/share/${id}?kind=molt&moltId=${molt.id}` as any) },
        ], { cancelable: true, onDismiss: leave });
        return;
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
              <Field label={`${lengthLabel} before (in)`} colors={colors}><TextInput style={styles.input} value={lengthBefore} onChangeText={setLengthBefore} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
            </View>
            <View style={styles.measureCol}>
              <Field label={`${lengthLabel} after (in)`} colors={colors}><TextInput style={styles.input} value={lengthAfter} onChangeText={setLengthAfter} placeholder="Optional" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" /></Field>
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
              Saving this won&apos;t mark the animal as died.
              {!isEdit && can(role, 'keeper') ? ' After it saves you\u2019ll be offered that step, if you want it.' : ''}
            </Text>
          )}
          {/* The ultimate molt (ult_20260911).
              Sits below outcome because it's rare and consequential, not part
              of the routine flow. Ticking it permanently stops premolt
              prediction for this animal, which is correct — a matured male
              cannot molt again — but it's a one-way-feeling change, so the
              copy says plainly what it does rather than relying on the label.
              Not restricted to tarantulas: mantids terminate in both sexes. */}
          {finalMoltCopy(taxon ?? '').offered && (
          <Field label="Was this the final molt?" colors={colors}>
            <TouchableOpacity
              onPress={() => setIsUltimate((v) => !v)}
              style={[
                styles.ultimateRow,
                {
                  borderColor: isUltimate ? colors.primary : colors.border,
                  backgroundColor: isUltimate ? colors.surfaceElevated : colors.surface,
                },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isUltimate }}
              accessibilityLabel={finalMoltCopy(taxon ?? '').label}
              accessibilityHint={finalMoltCopy(taxon ?? '').hint}
            >
              <MaterialCommunityIcons
                name={isUltimate ? 'check-circle' : 'checkbox-blank-circle-outline'}
                size={22}
                color={isUltimate ? colors.primary : colors.textTertiary}
              />
              <Text style={[styles.ultimateLabel, { color: colors.textPrimary }]}>
                {finalMoltCopy(taxon ?? '').label}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6 }}>
              {isUltimate ? finalMoltCopy(taxon ?? '').done : finalMoltCopy(taxon ?? '').hint}
            </Text>
          </Field>
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
  ultimateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  ultimateLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  measureRow: { flexDirection: 'row', gap: 12 },
  measureCol: { flex: 1 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
