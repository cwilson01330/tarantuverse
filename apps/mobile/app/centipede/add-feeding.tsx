/**
 * Log feeding for a centipede — Phase 3b.
 *
 * Slim version of the tarantula log-feeding screen. No pause flow, no
 * notification scheduling, no edit-existing-feeding mode. Those land
 * when the centipede analytics + reminder surfaces ship.
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { createCentipedeFeeding } from '../../src/lib/centipedes';
import { toISODateLocal } from '../../src/utils/date';

const FOOD_TYPES = [
  'Cricket',
  'Dubia Roach',
  'Red Runner',
  'Mealworm',
  'Superworm',
  'Other',
];

export default function AddCentipedeFeedingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [foodType, setFoodType] = useState('Cricket');
  const [accepted, setAccepted] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      // The API expects an ISO datetime; convert the YYYY-MM-DD picker
      // value into a midnight-local ISO so the keeper sees the same date
      // they typed on review screens (the calendar-day memory).
      const fedAt = new Date(date + 'T12:00:00').toISOString();
      await createCentipedeFeeding(id, {
        fed_at: fedAt,
        food_type: foodType,
        accepted,
        notes: notes.trim() || null,
      });
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

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Log feeding"
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
          <Field label="Date" colors={colors}>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </Field>

          <Field label="Food type" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FOOD_TYPES.map((f) => {
                const selected = f === foodType;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFoodType(f)}
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
                      {f}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <Field label="Outcome" colors={colors}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(
                [
                  { value: true, label: 'Accepted', icon: 'check-circle' as const },
                  { value: false, label: 'Refused', icon: 'close-circle' as const },
                ]
              ).map((opt) => {
                const selected = opt.value === accepted;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => setAccepted(opt.value)}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={opt.icon}
                      size={18}
                      color={selected ? '#fff' : colors.textTertiary}
                    />
                    <Text
                      style={{
                        color: selected ? '#fff' : colors.textPrimary,
                        fontWeight: '600',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <Field label="Notes (optional)" colors={colors}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save feeding'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  children: React.ReactNode;
}) {
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
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    saveButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
