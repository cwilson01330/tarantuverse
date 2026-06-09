/**
 * Generic invert: log feeding — ADR-007.
 */
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { getInvert, createInvertFeeding, updateInvertFeeding, type InvertTaxon } from '../../src/lib/inverts';
import { toISODateLocal } from '../../src/utils/date';

const FOOD_TYPES = ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'];

export default function AddInvertFeedingScreen() {
  const router = useRouter();
  // logId present ⇒ edit mode (PUT). The detail screen passes the current
  // values as params so we prefill without a single-log GET endpoint.
  const { id, logId, fed_at, food_type, accepted: acceptedParam, notes: notesParam } =
    useLocalSearchParams<{ id?: string; logId?: string; fed_at?: string; food_type?: string; accepted?: string; notes?: string }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null);
  const [date, setDate] = useState(fed_at ? toISODateLocal(new Date(fed_at)) : toISODateLocal(new Date()));
  const [foodType, setFoodType] = useState(food_type || 'Cricket');
  const [accepted, setAccepted] = useState(acceptedParam ? acceptedParam === 'true' : true);
  const [notes, setNotes] = useState(notesParam || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) getInvert(id).then((i) => setTaxon(i.taxon)).catch(() => {}); }, [id]);

  const handleSave = async () => {
    if (!id || !taxon) return;
    try {
      setSaving(true);
      const payload = { fed_at: new Date(date + 'T12:00:00').toISOString(), food_type: foodType, accepted, notes: notes.trim() || null };
      if (isEdit && logId) {
        await updateInvertFeeding(logId, payload);
      } else {
        await createInvertFeeding(taxon, id, payload);
      }
      router.back();
    } catch (err) { Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setSaving(false); }
  };

  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title={isEdit ? 'Edit feeding' : 'Log feeding'} leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Date" colors={colors}><TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} autoCapitalize="none" /></Field>
          <Field label="Food type" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FOOD_TYPES.map((f) => { const sel = f === foodType; return (
                <TouchableOpacity key={f} onPress={() => setFoodType(f)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{f}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          <Field label="Outcome" colors={colors}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[{ v: true, l: 'Accepted', i: 'check-circle' as const }, { v: false, l: 'Refused', i: 'close-circle' as const }].map((opt) => { const sel = opt.v === accepted; return (
                <TouchableOpacity key={opt.l} onPress={() => setAccepted(opt.v)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <MaterialCommunityIcons name={opt.i} size={18} color={sel ? '#fff' : colors.textTertiary} />
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600' }}>{opt.l}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          <Field label="Notes (optional)" colors={colors}><TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textTertiary} /></Field>
          <TouchableOpacity style={[styles.saveButton, (saving || !taxon) && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || !taxon}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : isEdit ? 'Update feeding' : 'Save feeding'}</Text>
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
