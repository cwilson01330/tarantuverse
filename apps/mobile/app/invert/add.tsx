/**
 * Generic invert add form — ADR-007.
 *
 * Taxon comes from ?taxon=. All non-tarantula taxa share this one screen;
 * the registry supplies label/size/species scope. Posts via createInvert
 * (per-taxon facade, taxon forced server-side).
 */
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { InvertSpeciesPicker } from '../../src/components/InvertSpeciesPicker';
import { INVERT_TAXA, createInvert, isInvertTaxon, type Sex, type Source, type InvertTaxon } from '../../src/lib/inverts';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'bred', label: 'Captive bred' },
  { value: 'bought', label: 'Bought' },
  { value: 'wild_caught', label: 'Wild caught' },
];

const ENCLOSURE_OPTIONS: { value: string; label: string }[] = [
  { value: 'terrestrial', label: 'Terrestrial' },
  { value: 'arboreal', label: 'Arboreal' },
  { value: 'fossorial', label: 'Fossorial' },
];

const WATER_DISH_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export default function AddInvertScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const { taxon: taxonParam } = useLocalSearchParams<{ taxon?: string }>();
  const taxon: InvertTaxon = isInvertTaxon(taxonParam) ? taxonParam : 'scorpion';
  const meta = INVERT_TAXA[taxon];

  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [molts, setMolts] = useState('');
  const [sizeMm, setSizeMm] = useState('');
  // Acquisition (parity with the tarantula form)
  const [dateAcquired, setDateAcquired] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [pricePaid, setPricePaid] = useState('');
  // Husbandry
  const [enclosureType, setEnclosureType] = useState<string>(meta.defaultEnclosureType);
  const [enclosureSize, setEnclosureSize] = useState('');
  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [humidityMin, setHumidityMin] = useState('');
  const [humidityMax, setHumidityMax] = useState('');
  const [waterDish, setWaterDish] = useState(true);
  const [mistingSchedule, setMistingSchedule] = useState('');
  const [lastCleaning, setLastCleaning] = useState('');
  const [enclosureNotes, setEnclosureNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name && !commonName && !scientificName) {
      Alert.alert('Add an identifier', `Pick a species or give your ${meta.label.toLowerCase()} a name before saving.`);
      return;
    }
    try {
      setSaving(true);
      const created = await createInvert(taxon, {
        name: name.trim() || null,
        common_name: commonName.trim() || null,
        scientific_name: scientificName.trim() || null,
        species_id: speciesId,
        sex,
        current_instar: molts ? Number(molts) : null,
        current_length_mm: sizeMm.trim() || null,
        date_acquired: dateAcquired.trim() || null,
        source: source ?? null,
        price_paid: pricePaid.trim() || null,
        enclosure_type: enclosureType || null,
        enclosure_size: enclosureSize.trim() || null,
        substrate_type: substrateType.trim() || null,
        substrate_depth: substrateDepth.trim() || null,
        target_temp_min: tempMin.trim() || null,
        target_temp_max: tempMax.trim() || null,
        target_humidity_min: humidityMin.trim() || null,
        target_humidity_max: humidityMax.trim() || null,
        water_dish: waterDish,
        misting_schedule: mistingSchedule.trim() || null,
        last_enclosure_cleaning: lastCleaning.trim() || null,
        enclosure_notes: enclosureNotes.trim() || null,
        notes: notes.trim() || null,
      });
      router.replace(`/invert/${created.id}` as any);
    } catch (err: any) {
      if (err?.response?.status === 402) {
        Alert.alert('Collection limit reached', "You've reached the free tier limit of 20 animals. Upgrade to premium for unlimited tracking.");
      } else {
        Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong saving.');
      }
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.flex}>
      <AppHeader
        title={`Add ${meta.label.toLowerCase()}`}
        leftAction={<TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} /></TouchableOpacity>}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {!meta.freeform && (
            <Field label="Species">
              <InvertSpeciesPicker
                taxon={taxon}
                valueId={speciesId}
                valueScientific={scientificName}
                onChange={(picked) => {
                  setSpeciesId(picked?.id ?? null);
                  if (picked) {
                    setScientificName(picked.scientific_name);
                    setCommonName(picked.common_names?.[0] ?? '');
                  }
                }}
              />
            </Field>
          )}

          <Field label="Nickname">
            <TextInput style={styles.input} placeholder="Optional" placeholderTextColor={colors.textTertiary} value={name} onChangeText={setName} autoCapitalize="words" />
          </Field>
          <Field label="Common name">
            <TextInput style={styles.input} placeholderTextColor={colors.textTertiary} value={commonName} onChangeText={setCommonName} />
          </Field>
          <Field label="Scientific name">
            <TextInput style={styles.input} placeholderTextColor={colors.textTertiary} value={scientificName} onChangeText={setScientificName} autoCapitalize="none" autoCorrect={false} />
          </Field>

          <Field label="Sex">
            <ChipGroup options={SEX_OPTIONS} value={sex} onChange={setSex} colors={colors} />
          </Field>

          <Field label="Molts">
            <TextInput style={styles.input} placeholder="e.g. 4" placeholderTextColor={colors.textTertiary} value={molts} onChangeText={setMolts} keyboardType="number-pad" />
          </Field>
          <Field label={meta.sizeLabel}>
            <TextInput style={styles.input} placeholder="e.g. 120" placeholderTextColor={colors.textTertiary} value={sizeMm} onChangeText={setSizeMm} keyboardType="decimal-pad" />
          </Field>

          <Text style={styles.sectionHeading}>Acquisition</Text>
          <Field label="Date acquired">
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} value={dateAcquired} onChangeText={setDateAcquired} autoCapitalize="none" />
          </Field>
          <Field label="Source">
            <ChipGroup options={SOURCE_OPTIONS} value={source} onChange={setSource} colors={colors} />
          </Field>
          <Field label="Price paid">
            <TextInput style={styles.input} placeholder="e.g. 45" placeholderTextColor={colors.textTertiary} value={pricePaid} onChangeText={setPricePaid} keyboardType="decimal-pad" />
          </Field>

          <Text style={styles.sectionHeading}>Husbandry</Text>
          <Field label="Enclosure type">
            <ChipGroup options={ENCLOSURE_OPTIONS} value={enclosureType} onChange={setEnclosureType} colors={colors} />
          </Field>
          <Field label="Enclosure size">
            <TextInput style={styles.input} placeholder='e.g. 6x6x6"' placeholderTextColor={colors.textTertiary} value={enclosureSize} onChangeText={setEnclosureSize} />
          </Field>
          <Field label="Substrate type">
            <TextInput style={styles.input} placeholder="e.g. coco fiber" placeholderTextColor={colors.textTertiary} value={substrateType} onChangeText={setSubstrateType} />
          </Field>
          <Field label="Substrate depth">
            <TextInput style={styles.input} placeholder='e.g. 3"' placeholderTextColor={colors.textTertiary} value={substrateDepth} onChangeText={setSubstrateDepth} />
          </Field>
          <View style={styles.row}>
            <View style={styles.rowCol}>
              <Field label="Temp min (°F)">
                <TextInput style={styles.input} placeholder="72" placeholderTextColor={colors.textTertiary} value={tempMin} onChangeText={setTempMin} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={styles.rowCol}>
              <Field label="Temp max (°F)">
                <TextInput style={styles.input} placeholder="82" placeholderTextColor={colors.textTertiary} value={tempMax} onChangeText={setTempMax} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowCol}>
              <Field label="Humidity min (%)">
                <TextInput style={styles.input} placeholder="60" placeholderTextColor={colors.textTertiary} value={humidityMin} onChangeText={setHumidityMin} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={styles.rowCol}>
              <Field label="Humidity max (%)">
                <TextInput style={styles.input} placeholder="75" placeholderTextColor={colors.textTertiary} value={humidityMax} onChangeText={setHumidityMax} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
          <Field label="Water dish">
            <ChipGroup options={WATER_DISH_OPTIONS} value={waterDish ? 'yes' : 'no'} onChange={(v) => setWaterDish(v === 'yes')} colors={colors} />
          </Field>
          <Field label="Misting schedule">
            <TextInput style={styles.input} placeholder="e.g. 2x per week" placeholderTextColor={colors.textTertiary} value={mistingSchedule} onChangeText={setMistingSchedule} />
          </Field>
          <Field label="Last enclosure cleaning">
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} value={lastCleaning} onChangeText={setLastCleaning} autoCapitalize="none" />
          </Field>
          <Field label="Enclosure notes">
            <TextInput style={[styles.input, styles.textArea]} placeholder="Decor, modifications, etc." placeholderTextColor={colors.textTertiary} value={enclosureNotes} onChangeText={setEnclosureNotes} multiline />
          </Field>

          <Field label="Notes">
            <TextInput style={[styles.input, styles.textArea]} placeholder="Optional" placeholderTextColor={colors.textTertiary} value={notes} onChangeText={setNotes} multiline />
          </Field>

          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : `Save ${meta.label.toLowerCase()}`}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}

function ChipGroup<V extends string>({ options, value, onChange, colors }: { options: { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity key={opt.value} onPress={() => onChange(opt.value)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }} accessibilityRole="button" accessibilityState={{ selected }}>
            <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 16, paddingBottom: 48 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
    textArea: { minHeight: 96, textAlignVertical: 'top' },
    sectionHeading: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 12 },
    rowCol: { flex: 1 },
    saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
