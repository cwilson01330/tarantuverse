/**
 * Add colony — ADR-010 (Colony mode).
 *
 * Population-level entry: taxon picker (from the shared invert registry),
 * optional species link, name, per-life-stage bucket editor, estimated
 * toggle, acquisition, and husbandry. Counts as ONE toward the free cap
 * regardless of headcount — a 402 surfaces the shared UpgradeModal.
 *
 * Mirrors app/invert/add.tsx (Field/ChipGroup helpers, DateInput, KAV) and
 * feeders/add.tsx (bucket editor). Module-level styles via makeStyles.
 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import { InvertSpeciesPicker } from '../../src/components/InvertSpeciesPicker';
import UpgradeModal from '../../src/components/UpgradeModal';
import {
  INVERT_TAXA,
  INVERT_TAXON_ORDER,
  type InvertTaxon,
  type Source,
} from '../../src/lib/inverts';
import { createColony, type StageCounts } from '../../src/lib/colonies';
import { getErrorMessage, isPaymentRequired } from '../../src/utils/errors';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'bred', label: 'Captive bred' },
  { value: 'bought', label: 'Bought' },
  { value: 'wild_caught', label: 'Wild caught' },
];

// Suggested starting buckets for a fresh colony. Keepers can rename/remove
// and add their own; "mixed" is always the casual catch-all.
const SUGGESTED_STAGES = ['adults', 'juveniles', 'nymphs', 'mixed'];

function parseCount(s: string): number {
  if (s.trim() === '') return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function AddColonyScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [taxon, setTaxon] = useState<InvertTaxon>('roach');
  const meta = INVERT_TAXA[taxon];

  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [scientificName, setScientificName] = useState('');

  // Stage buckets — seed with adults + nymphs; keeper can adjust.
  const [stageCounts, setStageCounts] = useState<Record<string, string>>({
    adults: '',
    nymphs: '',
  });
  const [newStageName, setNewStageName] = useState('');
  const [countIsEstimated, setCountIsEstimated] = useState(false);

  // Acquisition
  const [dateAcquired, setDateAcquired] = useState('');
  const [foundedDate, setFoundedDate] = useState('');
  const [source, setSource] = useState<Source | null>(null);

  // Husbandry
  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [humidityMin, setHumidityMin] = useState('');
  const [humidityMax, setHumidityMax] = useState('');
  const [waterDish, setWaterDish] = useState(false);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const setBucket = (stage: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setStageCounts((prev) => ({ ...prev, [stage]: value }));
  };

  const removeBucket = (key: string) => {
    setStageCounts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const addBucket = (rawKey?: string) => {
    const k = (rawKey ?? newStageName).trim().toLowerCase();
    if (!k) return;
    if (stageCounts[k] !== undefined) {
      if (!rawKey) Alert.alert('Duplicate bucket', `A "${k}" bucket already exists.`);
      return;
    }
    setStageCounts((prev) => ({ ...prev, [k]: '' }));
    if (!rawKey) setNewStageName('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Give the colony a name.');
      return;
    }

    const buckets: StageCounts = {};
    for (const [k, v] of Object.entries(stageCounts)) {
      buckets[k] = parseCount(v);
    }

    try {
      setSaving(true);
      const created = await createColony({
        name: name.trim(),
        taxon,
        species_id: speciesId,
        stage_counts: buckets,
        count_is_estimated: countIsEstimated,
        date_acquired: dateAcquired.trim() || null,
        founded_date: foundedDate.trim() || null,
        source: source ?? null,
        substrate_type: substrateType.trim() || null,
        substrate_depth: substrateDepth.trim() || null,
        target_temp_min: tempMin.trim() || null,
        target_temp_max: tempMax.trim() || null,
        target_humidity_min: humidityMin.trim() || null,
        target_humidity_max: humidityMax.trim() || null,
        water_dish: waterDish,
        notes: notes.trim() || null,
      });
      router.replace(`/colony/${created.id}` as any);
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

  const unusedSuggestions = SUGGESTED_STAGES.filter((s) => stageCounts[s] === undefined);

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Add colony"
        subtitle="Population-level tracking"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior={'padding'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Taxon">
            <View style={styles.chipWrap}>
              {INVERT_TAXON_ORDER.map((t) => {
                const m = INVERT_TAXA[t];
                const selected = t === taxon;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => {
                      setTaxon(t);
                      // Reset the species link — it's scoped to the taxon.
                      setSpeciesId(null);
                      setScientificName('');
                    }}
                    style={[
                      styles.taxonChip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={{ fontSize: 15 }}>{m.glyph}</Text>
                    <Text style={{ color: selected ? '#fff' : colors.textPrimary, fontWeight: '600', fontSize: 13 }}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <Field label="Colony name">
            <TextInput
              style={styles.input}
              placeholder="e.g. Dubia breeding bin"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              maxLength={100}
            />
          </Field>

          {!meta.freeform && (
            <Field label="Species">
              <InvertSpeciesPicker
                taxon={taxon}
                valueId={speciesId}
                valueScientific={scientificName}
                onChange={(picked) => {
                  setSpeciesId(picked?.id ?? null);
                  setScientificName(picked ? picked.scientific_name : '');
                }}
              />
              <Text style={styles.hint}>Optional — links to the care sheet.</Text>
            </Field>
          )}

          {/* Population buckets */}
          <Text style={styles.sectionHeading}>Population</Text>
          <Field label="Per-life-stage counts">
            {Object.keys(stageCounts).length === 0 && (
              <Text style={[styles.hint, { marginBottom: 10 }]}>
                No buckets yet. Add one below (use "mixed" if you don't track stages).
              </Text>
            )}
            {Object.entries(stageCounts).map(([stage, value]) => (
              <View key={stage} style={styles.bucketRow}>
                <Text style={styles.bucketLabel}>{stage}</Text>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={value}
                  onChangeText={(v) => setBucket(stage, v)}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  onPress={() => removeBucket(stage)}
                  accessibilityLabel={`Remove ${stage} bucket`}
                  style={styles.removeBucketBtn}
                >
                  <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Suggested-bucket quick adds */}
            {unusedSuggestions.length > 0 && (
              <View style={styles.suggestWrap}>
                {unusedSuggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => addBucket(s)}
                    style={[styles.suggestChip, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${s} bucket`}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Custom bucket */}
            <View style={styles.addBucketRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newStageName}
                onChangeText={setNewStageName}
                placeholder="Add a custom bucket"
                placeholderTextColor={colors.textTertiary}
                maxLength={30}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => addBucket()}
                disabled={!newStageName.trim()}
                style={[styles.addBucketBtn, { borderColor: colors.border, opacity: newStageName.trim() ? 1 : 0.5 }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </Field>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Count is an estimate</Text>
              <Text style={styles.hint}>"~50" is a perfectly honest answer for a colony.</Text>
            </View>
            <Switch
              value={countIsEstimated}
              onValueChange={setCountIsEstimated}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Toggle estimated count"
            />
          </View>

          {/* Acquisition */}
          <Text style={styles.sectionHeading}>Acquisition</Text>
          <Field label="Date acquired">
            <DateInput
              value={parseLocalDate(dateAcquired) ?? new Date()}
              onChange={(d) => setDateAcquired(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Date acquired"
            />
          </Field>
          <Field label="Founded date">
            <DateInput
              value={parseLocalDate(foundedDate) ?? new Date()}
              onChange={(d) => setFoundedDate(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Founded date"
            />
          </Field>
          <Field label="Source">
            <ChipGroup options={SOURCE_OPTIONS} value={source} onChange={setSource} colors={colors} />
          </Field>

          {/* Husbandry */}
          <Text style={styles.sectionHeading}>Husbandry</Text>
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
                <TextInput style={styles.input} placeholder="50" placeholderTextColor={colors.textTertiary} value={humidityMin} onChangeText={setHumidityMin} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={styles.rowCol}>
              <Field label="Humidity max (%)">
                <TextInput style={styles.input} placeholder="70" placeholderTextColor={colors.textTertiary} value={humidityMax} onChangeText={setHumidityMax} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Water dish</Text>
            </View>
            <Switch
              value={waterDish}
              onValueChange={setWaterDish}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              accessibilityLabel="Toggle water dish"
            />
          </View>

          <Field label="Notes">
            <TextInput style={[styles.input, styles.textArea]} placeholder="Anything worth remembering about this colony" placeholderTextColor={colors.textTertiary} value={notes} onChangeText={setNotes} multiline />
          </Field>

          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save colony'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade to Premium"
        message="Track unlimited animals and colonies"
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
    hint: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
    sectionHeading: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 12 },
    rowCol: { flex: 1 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    taxonChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    bucketLabel: { width: 96, fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
    removeBucketBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
    suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 10 },
    suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
    addBucketRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    addBucketBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    switchLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
