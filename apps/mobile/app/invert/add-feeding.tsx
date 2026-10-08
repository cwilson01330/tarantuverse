/**
 * Generic invert: log feeding — ADR-007.
 */
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import {
  getInvert, createInvertFeeding, updateInvertFeeding, foodVocabularyFor, splitStoredFood, foodTypeToSave,
  type InvertTaxon,
} from '../../src/lib/inverts';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';
import { SPACING } from '../../src/theme/tokens';

// Food chips come from the per-taxon FOOD_VOCABULARY (src/lib/inverts.ts):
// a mantis gets flies, an isopod gets leaf litter, not a tarantula feeder list.

// Prey sizes: same three values the tarantula form has always used. Kept identical so the
// existing food_size data stays consistent — the column is free-text VARCHAR(50)
// and would happily accept a fourth spelling of "medium".
const FOOD_SIZES = ['Small', 'Medium', 'Large'];

export default function AddInvertFeedingScreen() {
  const router = useRouter();
  // logId present ⇒ edit mode (PUT). The detail screen passes the current
  // values as params so we prefill without a single-log GET endpoint.
  const { id, logId, fed_at, food_type, food_size, accepted: acceptedParam, notes: notesParam } =
    useLocalSearchParams<{ id?: string; logId?: string; fed_at?: string; food_type?: string; food_size?: string; accepted?: string; notes?: string }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [taxon, setTaxon] = useState<InvertTaxon | null>(null);
  const [date, setDate] = useState(fed_at ? toISODateLocal(new Date(fed_at)) : toISODateLocal(new Date()));
  /** Selected chip ('' = none — an edited feeding that never had a food type
   *  stays without one rather than becoming a guessed "Cricket"). Resolved once
   *  the taxon is known, because the chip list depends on it. */
  const [foodType, setFoodType] = useState('');
  /** Free text under "Other" — saved as the food_type itself. */
  const [otherFood, setOtherFood] = useState('');
  const [foodReady, setFoodReady] = useState(false);
  const vocab = foodVocabularyFor(taxon);
  /** Prey size. Optional — '' means the keeper didn't record one, which is a
   *  real answer and must not be sent as a guess.
   *
   *  This form is now the feeding path for EVERY taxon including tarantulas
   *  (ADR-013 merged the detail screens), but it never carried a size picker,
   *  so tarantula keepers silently lost the one they'd had on
   *  `tarantula/add-feeding`. Reported by a keeper 2026-07-28. */
  const [foodSize, setFoodSize] = useState(food_size || '');
  const [accepted, setAccepted] = useState(acceptedParam ? acceptedParam === 'true' : true);
  const [notes, setNotes] = useState(notesParam || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (id) getInvert(id).then((i) => setTaxon(i.taxon)).catch(() => {}); }, [id]);

  // Once the taxon is known: a new feeding defaults to that taxon's most common
  // food; an edit selects what was recorded (or "Other" + the recorded text).
  useEffect(() => {
    if (!taxon || foodReady) return;
    const { foods } = foodVocabularyFor(taxon);
    if (isEdit) {
      const split = splitStoredFood(food_type, foods);
      setFoodType(split.chip);
      setOtherFood(split.other);
    } else {
      setFoodType(foods[0]);
    }
    setFoodReady(true);
  }, [taxon, foodReady, isEdit, food_type]);

  const handleSave = async () => {
    if (!id || !taxon) return;
    try {
      setSaving(true);
      const payload: { fed_at: string; food_type: string | null; food_size?: string | null; accepted: boolean; notes: string | null } = {
        fed_at: new Date(date + 'T12:00:00').toISOString(),
        food_type: foodTypeToSave(foodType, otherFood),
        accepted,
        notes: notes.trim() || null,
      };
      // null, not '' — an unrecorded size should read as absent, and on edit
      // it has to be able to CLEAR a previously saved value. Taxa without a
      // prey-size picker leave the stored value alone on edit.
      if (vocab.preySize) payload.food_size = foodSize || null;
      else if (!isEdit) payload.food_size = null;
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Date" colors={colors}><DateInput value={parseLocalDate(date) ?? new Date()} onChange={(d) => setDate(toISODateLocal(d))} maximumDate={new Date()} label="Feeding date" /></Field>
          <Field label="Food type" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {vocab.foods.map((f) => { const sel = f === foodType; return (
                <TouchableOpacity key={f} onPress={() => setFoodType(f)} accessibilityRole="button" accessibilityState={{ selected: sel }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{f}</Text>
                </TouchableOpacity>); })}
            </View>
            {foodType === 'Other' && (
              <TextInput
                style={[styles.input, styles.otherInput]}
                value={otherFood}
                onChangeText={setOtherFood}
                placeholder="What did you feed?"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Food fed"
                maxLength={100}
              />
            )}
          </Field>
          {/* Optional, and tappable to deselect — a keeper who doesn't measure
              prey shouldn't be forced to pick one, and forcing a default would
              put a size on the record that nobody actually observed. Hidden
              for grazers, whose food has no prey size. */}
          {vocab.preySize && (
          <Field label="Prey size (optional)" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FOOD_SIZES.map((s) => { const sel = s === foodSize; return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setFoodSize(sel ? '' : s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{s}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          )}
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
  otherInput: { marginTop: SPACING.sm },
  saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
