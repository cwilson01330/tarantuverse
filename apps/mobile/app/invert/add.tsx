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
import DateInput from '../../src/components/DateInput';
import { InvertSpeciesPicker } from '../../src/components/InvertSpeciesPicker';
import UpgradeModal from '../../src/components/UpgradeModal';
import { INVERT_TAXA, createInvert, createInvertFeeding, isInvertTaxon, type Sex, type Source, type InvertTaxon } from '../../src/lib/inverts';
import { getErrorMessage, isPaymentRequired } from '../../src/utils/errors';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

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

  // `speciesId` / `scientificName` / `commonName` arrive prefilled when the
  // keeper taps "Add to collection" on a care sheet. Without them the flow was:
  // back out of the sheet → Collection → FAB → pick the taxon → retype the
  // name they were just reading.
  const {
    taxon: taxonParam,
    speciesId: speciesIdParam,
    scientificName: scientificNameParam,
    commonName: commonNameParam,
  } = useLocalSearchParams<{
    taxon?: string;
    speciesId?: string;
    scientificName?: string;
    commonName?: string;
  }>();
  const taxon: InvertTaxon = isInvertTaxon(taxonParam) ? taxonParam : 'scorpion';
  const meta = INVERT_TAXA[taxon];

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(speciesIdParam ?? null);
  const [commonName, setCommonName] = useState(commonNameParam ?? '');
  const [scientificName, setScientificName] = useState(scientificNameParam ?? '');
  const [sex, setSex] = useState<Sex>('unknown');
  /** sling | juvenile | adult, or '' for unrecorded.
   *
   *  Not cosmetic: life_stage is what makes the feeding cadence species- AND
   *  stage-aware, and it's one of two requirements for market-signal
   *  eligibility. The tarantula form has always had it; this one didn't, so
   *  every non-tarantula animal — and, after the ADR-013 detail merge, any
   *  tarantula edited from the detail screen — had no way to set it. */
  const [lifeStage, setLifeStage] = useState('');
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
  /** Last substrate change. Distinct from last_enclosure_cleaning — a spot
   *  clean isn't a substrate change — and the tarantula form tracked both. */
  const [lastSubstrateChange, setLastSubstrateChange] = useState('');
  const [enclosureNotes, setEnclosureNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // First-feeding capture.
  //
  // WHY: of every keeper who has ever logged a feeding, 29 of 33 did it within
  // a day of adding their first animal — and NOBODY has ever started logging
  // after day 7. The habit forms in the first session or not at all, so we ask
  // for the last feeding date here, while the keeper is already thinking about
  // this animal, instead of hoping they find the log form later.
  //
  // Entirely optional. A keeper who genuinely doesn't know leaves it alone.
  const [lastFed, setLastFed] = useState('');

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
        life_stage: lifeStage || null,
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
        last_substrate_change: lastSubstrateChange.trim() || null,
        enclosure_notes: enclosureNotes.trim() || null,
        notes: notes.trim() || null,
      });

      // Seed the first feeding if the keeper told us when they last fed.
      // Deliberately non-fatal: the animal is already saved, and losing the
      // whole add because a log failed would be a much worse trade.
      if (lastFed.trim()) {
        try {
          await createInvertFeeding(taxon, created.id, {
            fed_at: new Date(lastFed.trim()).toISOString(),
            accepted: true,
          });
        } catch {
          // Swallow — they can log from the detail screen.
        }
      }

      router.replace(`/invert/${created.id}` as any);
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        setShowUpgradeModal(true);
      } else {
        Alert.alert('Could not save', getErrorMessage(err, 'Something went wrong saving.'));
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
      <KeyboardAvoidingView style={styles.flex} behavior={'padding'}>
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

          {/* Not ChipGroup — that can't deselect, and life stage has to be
              clearable. "Unknown" is a real answer for a freshly acquired
              animal, and guessing one skews its feeding cadence. */}
          <Field label="Life stage">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: 'sling', label: 'Sling' },
                { value: 'juvenile', label: 'Juvenile' },
                { value: 'adult', label: 'Adult' },
              ].map((o) => {
                const selected = lifeStage === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    onPress={() => setLifeStage(selected ? '' : o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }}
                  >
                    <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 6 }}>
              Sets the feeding cadence for this animal.
            </Text>
          </Field>

          <Field label="Molts">
            <TextInput style={styles.input} placeholder="e.g. 4" placeholderTextColor={colors.textTertiary} value={molts} onChangeText={setMolts} keyboardType="number-pad" />
          </Field>
          <Field label={meta.sizeLabel}>
            <TextInput style={styles.input} placeholder="e.g. 120" placeholderTextColor={colors.textTertiary} value={sizeMm} onChangeText={setSizeMm} keyboardType="decimal-pad" />
          </Field>

          <Text style={styles.sectionHeading}>Acquisition</Text>
          <Field label="Date acquired">
            <DateInput
              value={parseLocalDate(dateAcquired) ?? new Date()}
              onChange={(d) => setDateAcquired(toISODateLocal(d))}
              label="Date acquired"
            />
          </Field>
          <Field label="Source">
            <ChipGroup options={SOURCE_OPTIONS} value={source} onChange={setSource} colors={colors} />
          </Field>
          <Field label="Price paid">
            <TextInput style={styles.input} placeholder="e.g. 45" placeholderTextColor={colors.textTertiary} value={pricePaid} onChangeText={setPricePaid} keyboardType="decimal-pad" />
          </Field>

          {/* Optional first feeding — placed right after acquisition because
              "when did you get them / when did they last eat" is one thought.
              Leaving it blank is fine; we never guess a date. */}
          <Field label="Last fed (optional)">
            <DateInput
              value={parseLocalDate(lastFed) ?? new Date()}
              onChange={(d) => setLastFed(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Last fed"
            />
            <Text style={styles.helperText}>
              Know when they last ate? We&apos;ll log it, so feeding reminders
              start from a real date instead of nothing.
            </Text>
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
            <DateInput
              value={parseLocalDate(lastCleaning) ?? new Date()}
              onChange={(d) => setLastCleaning(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Last enclosure cleaning"
            />
          </Field>
          <Field label="Last substrate change">
            <DateInput
              value={parseLocalDate(lastSubstrateChange) ?? new Date()}
              onChange={(d) => setLastSubstrateChange(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Last substrate change"
            />
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

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade to Premium"
        message="Track unlimited animals"
        feature="Unlimited animals"
      />
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
    helperText: { fontSize: 12, lineHeight: 17, color: colors.textTertiary, marginTop: 6 },
  });
