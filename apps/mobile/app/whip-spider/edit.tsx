/**
 * Edit whip spider form — ADR-006 taxon #1.
 *
 * Reads `?id=` from the route query. Prefills from getWhipSpider, PUTs on
 * save. Husbandry fields live here (added incrementally as the enclosure
 * comes together). Whip-spider differences vs centipede: molt count + leg
 * span (no segment/leg-pair counts), and the enclosure type defaults to
 * arboreal since whip spiders are vertical-surface dwellers.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { WhipSpiderSpeciesPicker } from '../../src/components/WhipSpiderSpeciesPicker';
import {
  getWhipSpider,
  updateWhipSpider,
  type WhipSpider,
  type WhipSpiderEnclosureType,
  type WhipSpiderUpdate,
  type Sex,
} from '../../src/lib/whip-spiders';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const ENCLOSURE_OPTIONS: { value: WhipSpiderEnclosureType; label: string }[] = [
  { value: 'arboreal', label: 'Arboreal' },
  { value: 'terrestrial', label: 'Terrestrial' },
  { value: 'fossorial', label: 'Fossorial' },
];

export default function EditWhipSpiderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WhipSpider | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await getWhipSpider(id);
        setForm(s);
      } catch (err) {
        Alert.alert(
          'Could not load',
          err instanceof Error
            ? err.message
            : 'Failed to load this whip spider.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const update = <K extends keyof WhipSpider>(key: K, value: WhipSpider[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form || !id) return;
    const payload: WhipSpiderUpdate = {
      name: form.name,
      common_name: form.common_name,
      scientific_name: form.scientific_name,
      species_id: form.species_id,
      sex: form.sex,
      current_instar: form.current_instar,
      current_length_mm: form.current_length_mm,
      enclosure_type: form.enclosure_type,
      enclosure_size: form.enclosure_size,
      substrate_type: form.substrate_type,
      substrate_depth: form.substrate_depth,
      target_temp_min: form.target_temp_min,
      target_temp_max: form.target_temp_max,
      target_humidity_min: form.target_humidity_min,
      target_humidity_max: form.target_humidity_max,
      water_dish: form.water_dish,
      misting_schedule: form.misting_schedule,
      notes: form.notes,
    };
    try {
      setSaving(true);
      await updateWhipSpider(id, payload);
      router.back();
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Something went wrong saving.',
      );
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(colors);

  if (loading || !form) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Edit whip spider"
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={iconColor}
            />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={'padding'}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="Species">
            <WhipSpiderSpeciesPicker
              valueId={form.species_id}
              valueScientific={form.scientific_name ?? ''}
              onChange={(picked) => {
                update('species_id', picked?.id ?? null);
                if (picked) {
                  update('scientific_name', picked.scientific_name);
                  if (!form.common_name && picked.common_names?.[0]) {
                    update('common_name', picked.common_names[0]);
                  }
                }
              }}
            />
          </Field>

          <Field label="Nickname">
            <TextInput
              style={styles.input}
              value={form.name ?? ''}
              onChangeText={(t) => update('name', t)}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Sex">
            <ChipGroup
              options={SEX_OPTIONS}
              value={form.sex ?? 'unknown'}
              onChange={(v) => update('sex', v)}
              colors={colors}
            />
          </Field>

          <Field label="Molt count">
            <TextInput
              style={styles.input}
              value={form.current_instar?.toString() ?? ''}
              onChangeText={(t) =>
                update('current_instar', t ? Number(t) : null)
              }
              keyboardType="number-pad"
              placeholder="e.g. 4"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <Field label="Leg span (mm)">
            <TextInput
              style={styles.input}
              value={form.current_length_mm ?? ''}
              onChangeText={(t) => update('current_length_mm', t)}
              keyboardType="decimal-pad"
              placeholder="e.g. 180"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <SectionHeader title="Enclosure" colors={colors} />

          <Field label="Type">
            <ChipGroup
              options={ENCLOSURE_OPTIONS}
              value={form.enclosure_type ?? 'arboreal'}
              onChange={(v) => update('enclosure_type', v)}
              colors={colors}
            />
          </Field>

          <Field label="Size">
            <TextInput
              style={styles.input}
              value={form.enclosure_size ?? ''}
              onChangeText={(t) => update('enclosure_size', t)}
              placeholder='e.g. 12x12x18" (vertical)'
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <Field label="Substrate type">
            <TextInput
              style={styles.input}
              value={form.substrate_type ?? ''}
              onChangeText={(t) => update('substrate_type', t)}
              placeholder="Coco fiber / topsoil"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <Field label="Substrate depth">
            <TextInput
              style={styles.input}
              value={form.substrate_depth ?? ''}
              onChangeText={(t) => update('substrate_depth', t)}
              placeholder="2-3 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <View style={styles.row}>
            <Field label="Temp min (°F)" flex>
              <TextInput
                style={styles.input}
                value={form.target_temp_min ?? ''}
                onChangeText={(t) => update('target_temp_min', t)}
                keyboardType="decimal-pad"
              />
            </Field>
            <Field label="Temp max (°F)" flex>
              <TextInput
                style={styles.input}
                value={form.target_temp_max ?? ''}
                onChangeText={(t) => update('target_temp_max', t)}
                keyboardType="decimal-pad"
              />
            </Field>
          </View>

          <View style={styles.row}>
            <Field label="Humidity min %" flex>
              <TextInput
                style={styles.input}
                value={form.target_humidity_min ?? ''}
                onChangeText={(t) => update('target_humidity_min', t)}
                keyboardType="decimal-pad"
              />
            </Field>
            <Field label="Humidity max %" flex>
              <TextInput
                style={styles.input}
                value={form.target_humidity_max ?? ''}
                onChangeText={(t) => update('target_humidity_max', t)}
                keyboardType="decimal-pad"
              />
            </Field>
          </View>

          <View style={styles.switchRow}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              Water dish
            </Text>
            <Switch
              value={form.water_dish}
              onValueChange={(v) => update('water_dish', v)}
            />
          </View>

          <Field label="Notes">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.notes ?? ''}
              onChangeText={(t) => update('notes', t)}
              multiline
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save changes'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  flex,
  children,
}: {
  label: string;
  flex?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16, flex: flex ? 1 : undefined }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: colors.textTertiary,
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function SectionHeader({
  title,
  colors,
}: {
  title: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        marginBottom: 14,
        paddingBottom: 6,
        marginTop: 4,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: colors.textTertiary,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function ChipGroup<V extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : colors.surface,
            }}
          >
            <Text
              style={{
                color: selected ? '#fff' : colors.textPrimary,
                fontWeight: '600',
                fontSize: 13,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, paddingBottom: 48 },
    row: { flexDirection: 'row', gap: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    fieldLabel: { fontSize: 14, fontWeight: '500' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      marginBottom: 12,
    },
    saveButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
