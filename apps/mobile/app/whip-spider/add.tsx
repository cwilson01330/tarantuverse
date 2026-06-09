/**
 * Add whip spider form — ADR-006 taxon #1.
 *
 * Mirrors the centipede add form: identity, sex, molt count + leg span,
 * notes. Husbandry is left blank by default and filled in via the edit
 * screen once the enclosure is set up. The species picker reuses the
 * whip spider catalog.
 *
 * Whip spiders are measured by LEG SPAN (not body length) and have no
 * segment/leg-pair counts (those are centipede fields), so this form
 * drops them.
 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import {
  createWhipSpider,
  type WhipSpider,
  type WhipSpiderCreate,
  type Sex,
} from '../../src/lib/whip-spiders';
import { WhipSpiderSpeciesPicker } from '../../src/components/WhipSpiderSpeciesPicker';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export default function AddWhipSpiderScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  // Identity
  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [commonName, setCommonName] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');

  // Growth
  const [instar, setInstar] = useState('');
  const [legSpanMm, setLegSpanMm] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name && !commonName && !scientificName) {
      Alert.alert(
        'Add an identifier',
        'Pick a species or give your whip spider a name before saving.',
      );
      return;
    }

    const payload: WhipSpiderCreate = {
      name: name.trim() || null,
      common_name: commonName.trim() || null,
      scientific_name: scientificName.trim() || null,
      species_id: speciesId,
      sex,
      current_instar: instar ? Number(instar) : null,
      current_length_mm: legSpanMm.trim() || null,
      notes: notes.trim() || null,
    };

    if (payload.current_instar != null) {
      if (!Number.isFinite(payload.current_instar) || payload.current_instar < 1) {
        Alert.alert('Check molt count', 'Molt number should be a positive number.');
        return;
      }
    }

    try {
      setSaving(true);
      const created: WhipSpider = await createWhipSpider(payload);
      // Replace so back goes to the collection list, not a blank form.
      router.replace(`/whip-spider/${created.id}` as any);
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

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Add whip spider"
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Species picker first — picking auto-fills common + scientific name. */}
          <Field label="Species">
            <WhipSpiderSpeciesPicker
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

          <Field label="Nickname">
            <TextInput
              style={styles.input}
              placeholder="Optional — e.g. Whippy"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Common name (override)">
            <TextInput
              style={styles.input}
              placeholder="Tanzanian Giant Whip Spider"
              placeholderTextColor={colors.textTertiary}
              value={commonName}
              onChangeText={setCommonName}
            />
          </Field>

          <Field label="Scientific name (override)">
            <TextInput
              style={styles.input}
              placeholder="Damon diadema"
              placeholderTextColor={colors.textTertiary}
              value={scientificName}
              onChangeText={setScientificName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>

          <Field label="Sex">
            <ChipGroup
              options={SEX_OPTIONS}
              value={sex}
              onChange={setSex}
              colors={colors}
            />
          </Field>

          <Field label="Molt count">
            <TextInput
              style={styles.input}
              placeholder="e.g. 4"
              placeholderTextColor={colors.textTertiary}
              value={instar}
              onChangeText={setInstar}
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Leg span (mm)">
            <TextInput
              style={styles.input}
              placeholder="e.g. 180"
              placeholderTextColor={colors.textTertiary}
              value={legSpanMm}
              onChangeText={setLegSpanMm}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Notes">
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Optional"
              placeholderTextColor={colors.textTertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save whip spider'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
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
            accessibilityRole="button"
            accessibilityState={{ selected }}
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
    scroll: { padding: 16, paddingBottom: 48 },
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
    textArea: { minHeight: 96, textAlignVertical: 'top' },
    saveButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
