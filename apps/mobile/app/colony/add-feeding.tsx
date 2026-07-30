/**
 * Colony: log a group feeding — cph_20260729_colony_logs.
 *
 * ONE log per feeding event, not one per animal: you drop prey into a communal
 * and the group takes it, and nobody can see which spider ate which cricket.
 *
 * That makes `quantity` the important field here, in a way it isn't for a
 * solitary animal. "Fed a cricket" is a complete record for one tarantula;
 * for an eleven-spider communal the useful fact is "six crickets for eleven
 * animals". Without the count the log says almost nothing.
 *
 * `accepted` also shifts meaning — for a group it's "did they take it",
 * and a whole communal refusing is a real signal worth keeping.
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import { createColonyFeeding } from '../../src/lib/colonies';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

/**
 * Prey list, per taxon.
 *
 * A communal tarantula eats live prey and the list matches every other
 * predatory animal in the app. A roach or millipede colony does not — feeding
 * a dubia bin means dropping in vegetables and a protein source, and offering
 * "Cricket / Superworm" as the options makes the form read as though it was
 * written for something else. Detritivore colonies get the vocabulary their
 * keepers actually use.
 */
const PREDATOR_FOODS = ['Cricket', 'Dubia Roach', 'Red Runner', 'Mealworm', 'Superworm', 'Other'];
const DETRITIVORE_FOODS = ['Veg / greens', 'Fruit', 'Dry gutload', 'Protein (fish flake)', 'Leaf litter', 'Other'];

function foodTypesFor(taxon: string | undefined): string[] {
  // Roaches and millipedes are the colony taxa fed as detritivores today.
  // feeding_mode lives on invert_species, not on the colony, so this reads
  // from taxon — honest for the taxa that can currently BE a colony.
  return taxon === 'roach' || taxon === 'millipede' ? DETRITIVORE_FOODS : PREDATOR_FOODS;
}

// Same three values the tarantula form has always used. Kept identical so the
// existing food_size data stays consistent — the column is free-text VARCHAR(50)
// and would happily accept a fourth spelling of "medium".
const FOOD_SIZES = ['Small', 'Medium', 'Large'];

export default function AddColonyFeedingScreen() {
  const router = useRouter();
  const { id, taxon } = useLocalSearchParams<{ id?: string; taxon?: string }>();
  const foodTypes = foodTypesFor(taxon);
  // Prey size is a live-prey concept — a handful of greens has no 'Medium'.
  const showsPreySize = foodTypes === PREDATOR_FOODS;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [foodType, setFoodType] = useState(foodTypes[0]);
  /** Prey size. Optional — '' means the keeper didn't record one. */
  const [foodSize, setFoodSize] = useState('');
  /** Prey count. Blank means unrecorded — we send null rather than defaulting
   *  to 1, because "1 cricket" for an 11-spider communal would be a claim
   *  nobody made. The backend column defaults to 1 for individuals, which is
   *  right there and wrong here. */
  const [quantity, setQuantity] = useState('');
  const [accepted, setAccepted] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);


  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      const n = parseInt(quantity, 10);
      await createColonyFeeding(id, {
        fed_at: new Date(date + 'T12:00:00').toISOString(),
        food_type: foodType,
        food_size: foodSize || null,
        // null, not 1 — an unrecorded count stays unrecorded.
        quantity: Number.isFinite(n) && n > 0 ? n : null,
        accepted,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (err) { Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setSaving(false); }
  };

  const styles = makeStyles(colors);
  return (
    <View style={styles.flex}>
      <AppHeader title="Log feeding" leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Date" colors={colors}><DateInput value={parseLocalDate(date) ?? new Date()} onChange={(d) => setDate(toISODateLocal(d))} maximumDate={new Date()} label="Feeding date" /></Field>
          <Field label="Food type" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {foodTypes.map((f) => { const sel = f === foodType; return (
                <TouchableOpacity key={f} onPress={() => setFoodType(f)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{f}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          {/* Optional, and tappable to deselect — a keeper who doesn't measure
              prey shouldn't be forced to pick one, and forcing a default would
              put a size on the record that nobody actually observed. */}
          {showsPreySize && (
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
          <Field label={showsPreySize ? 'How many?' : 'Amount (optional)'} colors={colors}>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 6"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
            />
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6 }}>
              {showsPreySize
                ? 'Number of prey items offered to the group — six crickets for eleven spiders tells you far more than “fed”.'
                : 'Portions or items offered. Leave blank if you didn’t count.'}
            </Text>
          </Field>
          <Field label="Outcome" colors={colors}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[{ v: true, l: 'Taken', i: 'check-circle' as const }, { v: false, l: 'Refused', i: 'close-circle' as const }].map((opt) => { const sel = opt.v === accepted; return (
                <TouchableOpacity key={opt.l} onPress={() => setAccepted(opt.v)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primary : colors.surface }}>
                  <MaterialCommunityIcons name={opt.i} size={18} color={sel ? '#fff' : colors.textTertiary} />
                  <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontWeight: '600' }}>{opt.l}</Text>
                </TouchableOpacity>); })}
            </View>
          </Field>
          <Field label="Notes (optional)" colors={colors}><TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textTertiary} /></Field>
          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save feeding'}</Text>
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
