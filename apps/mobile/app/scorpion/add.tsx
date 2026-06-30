/**
 * Add scorpion form — Phase 3b.
 *
 * Mirrors the slim subset of fields a keeper actually fills out when
 * adding a new arrival: identity, sex, instar/length, acquisition.
 * Husbandry is left blank by default and can be added via the edit
 * screen once the enclosure is set up. The species picker reuses the
 * scorpion catalog from 3a.
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
  createScorpion,
  type Scorpion,
  type ScorpionCreate,
  type Sex,
} from '../../src/lib/scorpions';
import { ScorpionSpeciesPicker } from '../../src/components/ScorpionSpeciesPicker';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export default function AddScorpionScreen() {
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
  const [lengthMm, setLengthMm] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name && !commonName && !scientificName) {
      Alert.alert(
        'Add an identifier',
        'Pick a species or give your scorpion a name before saving.',
      );
      return;
    }

    const payload: ScorpionCreate = {
      name: name.trim() || null,
      common_name: commonName.trim() || null,
      scientific_name: scientificName.trim() || null,
      species_id: speciesId,
      sex,
      current_instar: instar ? Number(instar) : null,
      current_length_mm: lengthMm.trim() || null,
      notes: notes.trim() || null,
    };

    // Light client-side validation. Server will reject out-of-range
    // instars via the Pydantic schema's ge=1 le=10 anyway.
    if (payload.current_instar != null) {
      if (
        !Number.isFinite(payload.current_instar)
        || payload.current_instar < 1
        || payload.current_instar > 10
      ) {
        Alert.alert('Check instar', 'Instar should be a number between 1 and 10.');
        return;
      }
    }

    try {
      setSaving(true);
      const created: Scorpion = await createScorpion(payload);
      // Replace current route with detail screen so back goes to
      // the collection list, not back to a blank add form.
      router.replace(`/scorpion/${created.id}` as any);
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
        title="Add scorpion"
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Species picker — comes first because picking a species
              auto-fills common + scientific name. */}
          <Field label="Species">
            <ScorpionSpeciesPicker
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
              placeholder="Optional — e.g. Reaper"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Common name (override)">
            <TextInput
              style={styles.input}
              placeholder="Emperor Scorpion"
              placeholderTextColor={colors.textTertiary}
              value={commonName}
              onChangeText={setCommonName}
            />
          </Field>

          <Field label="Scientific name (override)">
            <TextInput
              style={styles.input}
              placeholder="Pandinus imperator"
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

          <Field label="Current instar">
            <TextInput
              style={styles.input}
              placeholder="1–10"
              placeholderTextColor={colors.textTertiary}
              value={instar}
              onChangeText={setInstar}
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Current length (mm)">
            <TextInput
              style={styles.input}
              placeholder="e.g. 120"
              placeholderTextColor={colors.textTertiary}
              value={lengthMm}
              onChangeText={setLengthMm}
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
              {saving ? 'Saving…' : 'Save scorpion'}
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
              backgroundColor: selected
                ? colors.primary
                : colors.surface,
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
