/**
 * Generic invert: log substrate change — ADR-007.
 */
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import { getInvert, createInvertSubstrateChange, updateInvertSubstrateChange, type InvertTaxon } from '../../src/lib/inverts';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

const REASONS = ['Routine maintenance', 'Mold or mites', 'Rehouse', 'Other'];

export default function AddInvertSubstrateChangeScreen() {
  const router = useRouter();
  // logId present ⇒ edit mode (PUT) with the row's values prefilled.
  const { id, logId, changed_at, substrate_type, substrate_depth, reason: reasonParam, notes: notesParam } =
    useLocalSearchParams<{ id?: string; logId?: string; changed_at?: string; substrate_type?: string; substrate_depth?: string; reason?: string; notes?: string }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null);
  const [date, setDate] = useState(changed_at || toISODateLocal(new Date()));
  const [substrateType, setSubstrateType] = useState(substrate_type || '');
  const [substrateDepth, setSubstrateDepth] = useState(substrate_depth || '');
  const [reason, setReason] = useState(reasonParam && REASONS.includes(reasonParam) ? reasonParam : REASONS[0]);
  const [notes, setNotes] = useState(notesParam || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) getInvert(id).then((i) => setTaxon(i.taxon)).catch(() => {}); }, [id]);

  const handleSave = async () => {
    if (!id || !taxon) return;
    try {
      setSaving(true);
      const payload = { changed_at: date, substrate_type: substrateType.trim() || null, substrate_depth: substrateDepth.trim() || null, reason, notes: notes.trim() || null };
      if (isEdit && logId) {
        await updateInvertSubstrateChange(logId, payload);
      } else {
        await createInvertSubstrateChange(taxon, id, payload);
      }
      router.back();
    } catch (err) { Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setSaving(false); }
  };

  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title={isEdit ? 'Edit substrate change' : 'Log substrate change'} leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Date" colors={colors}><DateInput value={parseLocalDate(date) ?? new Date()} onChange={(d) => setDate(toISODateLocal(d))} maximumDate={new Date()} label="Substrate change date" /></Field>
          <Field label="Substrate type" colors={colors}><TextInput style={styles.input} value={substrateType} onChangeText={setSubstrateType} placeholder="Coco fiber / topsoil" placeholderTextColor={colors.textTertiary} /></Field>
          <Field label="Substrate depth" colors={colors}><TextInput style={styles.input} value={substrateDepth} onChangeText={setSubstrateDepth} placeholder="3 inches" placeholderTextColor={colors.textTertiary} /></Field>
          <Field label="Reason" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REASONS.map((r) => { const sel = r === reason; return (
                <TouchableOpacity key={r} onPress={() => setReason(r)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{r}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          <Field label="Notes (optional)" colors={colors}><TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textTertiary} /></Field>
          <TouchableOpacity style={[styles.saveButton, (saving || !taxon) && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || !taxon}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : isEdit ? 'Update substrate change' : 'Save substrate change'}</Text>
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
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
