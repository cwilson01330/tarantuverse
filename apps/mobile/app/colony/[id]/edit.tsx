/**
 * Edit colony — ADR-010 (Colony mode).
 *
 * Prefilled form, partial PUT. Buckets, estimated flag, acquisition,
 * husbandry, and an active/archive toggle. Taxon is fixed after creation
 * (species links + population semantics are taxon-scoped), so it's shown
 * read-only. Mirrors feeders/[id]/edit.tsx.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../../src/contexts/ThemeContext';
import { AppHeader } from '../../../src/components/AppHeader';
import DateInput from '../../../src/components/DateInput';
import { InvertSpeciesPicker } from '../../../src/components/InvertSpeciesPicker';
import {
  INVERT_TAXA,
  type InvertTaxon,
  type Source,
} from '../../../src/lib/inverts';
import {
  getColony,
  updateColony,
  type StageCounts,
} from '../../../src/lib/colonies';
import { getErrorMessage } from '../../../src/utils/errors';
import { parseLocalDate, toISODateLocal } from '../../../src/utils/date';

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'bred', label: 'Captive bred' },
  { value: 'bought', label: 'Bought' },
  { value: 'wild_caught', label: 'Wild caught' },
];

function parseCount(s: string): number {
  if (s.trim() === '') return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function EditColonyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const colonyId = params.id;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const [taxon, setTaxon] = useState<InvertTaxon>('roach');
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [scientificName, setScientificName] = useState('');
  const [speciesCleared, setSpeciesCleared] = useState(false);

  const [stageCounts, setStageCounts] = useState<Record<string, string>>({});
  const [newStageName, setNewStageName] = useState('');
  const [countIsEstimated, setCountIsEstimated] = useState(false);

  const [dateAcquired, setDateAcquired] = useState('');
  const [foundedDate, setFoundedDate] = useState('');
  const [source, setSource] = useState<Source | null>(null);

  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [tempMin, setTempMin] = useState('');
  const [tempMax, setTempMax] = useState('');
  const [humidityMin, setHumidityMin] = useState('');
  const [humidityMax, setHumidityMax] = useState('');
  const [waterDish, setWaterDish] = useState(false);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadColony = useCallback(async () => {
    if (!colonyId) return;
    try {
      const c = await getColony(colonyId);
      setTaxon(c.taxon);
      setName(c.name);
      setSpeciesId(c.species_id);
      setScientificName(c.species_scientific_name ?? '');
      const asStrings: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.stage_counts ?? {})) asStrings[k] = String(v);
      setStageCounts(asStrings);
      setCountIsEstimated(c.count_is_estimated);
      setDateAcquired(c.date_acquired ?? '');
      setFoundedDate(c.founded_date ?? '');
      setSource(c.source ?? null);
      setSubstrateType(c.substrate_type ?? '');
      setSubstrateDepth(c.substrate_depth ?? '');
      setTempMin(c.target_temp_min ?? '');
      setTempMax(c.target_temp_max ?? '');
      setHumidityMin(c.target_humidity_min ?? '');
      setHumidityMax(c.target_humidity_max ?? '');
      setWaterDish(c.water_dish);
      setNotes(c.notes ?? '');
      setIsActive(c.is_active);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      const msg =
        e?.response?.status === 404
          ? 'Colony not found'
          : e?.response?.data?.detail || e?.message || 'Failed to load colony';
      setLoadError(typeof msg === 'string' ? msg : 'Failed to load colony');
    } finally {
      setLoading(false);
    }
  }, [colonyId]);

  useEffect(() => {
    loadColony();
  }, [loadColony]);

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

  const addBucket = () => {
    const k = newStageName.trim().toLowerCase();
    if (!k) return;
    if (stageCounts[k] !== undefined) {
      Alert.alert('Duplicate bucket', `A "${k}" bucket already exists.`);
      return;
    }
    setStageCounts((prev) => ({ ...prev, [k]: '' }));
    setNewStageName('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Colony name is required.');
      return;
    }
    const buckets: StageCounts = {};
    for (const [k, v] of Object.entries(stageCounts)) buckets[k] = parseCount(v);

    const payload: Record<string, unknown> = {
      name: name.trim(),
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
      is_active: isActive,
    };
    // Species — write only if changed to a new pick or explicitly cleared.
    if (speciesId) payload.species_id = speciesId;
    else if (speciesCleared) payload.species_id = null;

    setSaving(true);
    try {
      await updateColony(colonyId, payload as any);
      router.replace(`/colony/${colonyId}` as any);
    } catch (e: any) {
      Alert.alert('Could not save', getErrorMessage(e, 'Failed to save changes.'));
    } finally {
      setSaving(false);
    }
  };

  const meta = INVERT_TAXA[taxon];
  const styles = makeStyles(colors);

  const closeAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="close" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const saveAction = (
    <TouchableOpacity onPress={handleSave} disabled={saving || loading} style={{ opacity: saving || loading ? 0.5 : 1, paddingHorizontal: 6 }}>
      <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>{saving ? 'Saving…' : 'Save'}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.flex}>
        <AppHeader title="Edit colony" leftAction={closeAction} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.flex}>
        <AppHeader title="Edit colony" leftAction={closeAction} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>{loadError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              setLoadError('');
              loadColony();
            }}
            style={[styles.retryBtn, { borderRadius: layout.radius.md }]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Edit colony"
        subtitle={`${meta?.label ?? 'Colony'} colony`}
        leftAction={closeAction}
        rightAction={saveAction}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={'padding'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Colony name">
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Colony name" placeholderTextColor={colors.textTertiary} maxLength={100} />
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
                  setSpeciesCleared(!picked);
                }}
              />
              <Text style={styles.hint}>Clear and leave blank to unlink the species.</Text>
            </Field>
          )}

          {/* Population */}
          <Text style={styles.sectionHeading}>Population</Text>
          <Field label="Per-life-stage counts">
            {Object.keys(stageCounts).length === 0 && (
              <Text style={[styles.hint, { marginBottom: 10 }]}>No buckets yet. Add one below.</Text>
            )}
            {Object.entries(stageCounts).map(([stage, value]) => (
              <View key={stage} style={styles.bucketRow}>
                <Text style={styles.bucketLabel}>{stage}</Text>
                <TextInput style={[styles.input, { flex: 1 }]} value={value} onChangeText={(v) => setBucket(stage, v)} placeholder="0" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
                <TouchableOpacity onPress={() => removeBucket(stage)} accessibilityLabel={`Remove ${stage} bucket`} style={styles.removeBucketBtn}>
                  <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addBucketRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={newStageName} onChangeText={setNewStageName} placeholder="Add a bucket (e.g. mixed)" placeholderTextColor={colors.textTertiary} maxLength={30} autoCapitalize="none" />
              <TouchableOpacity onPress={addBucket} disabled={!newStageName.trim()} style={[styles.addBucketBtn, { borderColor: colors.border, opacity: newStageName.trim() ? 1 : 0.5 }]}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </Field>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Count is an estimate</Text>
            </View>
            <Switch value={countIsEstimated} onValueChange={setCountIsEstimated} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" accessibilityLabel="Toggle estimated count" />
          </View>

          {/* Acquisition */}
          <Text style={styles.sectionHeading}>Acquisition</Text>
          <Field label="Date acquired">
            <DateInput value={parseLocalDate(dateAcquired) ?? new Date()} onChange={(d) => setDateAcquired(toISODateLocal(d))} maximumDate={new Date()} label="Date acquired" />
          </Field>
          <Field label="Founded date">
            <DateInput value={parseLocalDate(foundedDate) ?? new Date()} onChange={(d) => setFoundedDate(toISODateLocal(d))} maximumDate={new Date()} label="Founded date" />
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
            <Switch value={waterDish} onValueChange={setWaterDish} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" accessibilityLabel="Toggle water dish" />
          </View>

          <Field label="Notes">
            <TextInput style={[styles.input, styles.textArea]} placeholder="Anything worth remembering about this colony" placeholderTextColor={colors.textTertiary} value={notes} onChangeText={setNotes} multiline />
          </Field>

          {/* Active toggle */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Active colony</Text>
              <Text style={styles.hint}>Turn off to archive. Archived colonies are hidden from the main list but history is preserved.</Text>
            </View>
            <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" accessibilityLabel="Toggle colony active" />
          </View>

          <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} accessibilityRole="button">
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
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
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, textAlign: 'center', color: colors.textPrimary },
    retryBtn: { borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 18 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
    textArea: { minHeight: 96, textAlignVertical: 'top' },
    hint: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
    sectionHeading: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 12 },
    rowCol: { flex: 1 },
    bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    bucketLabel: { width: 96, fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
    removeBucketBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
    addBucketRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    addBucketBtn: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
    switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    switchLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    saveButton: { marginTop: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
