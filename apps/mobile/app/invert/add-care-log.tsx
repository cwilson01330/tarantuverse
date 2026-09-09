/**
 * Generic invert: log a hydration event (car_20260909).
 *
 * Requested by a keeper: track giving water alongside tracking food.
 *
 * NO SCHEDULE HERE, AND NONE COMING. This screen records an act. It does not
 * ask when the next one is due, and nothing downstream derives a due date from
 * it — see the care_log model docstring. If a future change adds a "next
 * watering" field, that is a product decision to reopen, not a gap to fill.
 */
import React, { useEffect, useState } from 'react';
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
import DateInput from '../../src/components/DateInput';
import {
  createInvertCareLog,
  updateInvertCareLog,
  CARE_LOG_LABELS,
  type CareLogType,
} from '../../src/lib/inverts';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';

const TYPES: { key: CareLogType; icon: keyof typeof MaterialCommunityIcons.glyphMap; hint: string }[] = [
  {
    key: 'water_dish',
    icon: 'cup-water',
    hint: 'Topped up or replaced the water in the dish.',
  },
  {
    key: 'overflow',
    icon: 'waves',
    hint: 'Deliberately overfilled the dish to damp the substrate — how moisture-dependent species get their humidity.',
  },
  {
    key: 'misted',
    icon: 'spray',
    hint: 'Misted the enclosure, substrate or webbing. Slings and mantids drink from the droplets.',
  },
];

export default function AddInvertCareLogScreen() {
  const router = useRouter();
  // logId present ⇒ edit mode (PUT) with the row's values prefilled.
  const { id, logId, log_type, logged_at, notes: notesParam } = useLocalSearchParams<{
    id?: string;
    logId?: string;
    log_type?: string;
    logged_at?: string;
    notes?: string;
  }>();
  const isEdit = !!logId;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const initialType = TYPES.some((t) => t.key === log_type)
    ? (log_type as CareLogType)
    : 'water_dish';
  const [type, setType] = useState<CareLogType>(initialType);
  const [date, setDate] = useState(
    logged_at ? toISODateLocal(new Date(logged_at)) : toISODateLocal(new Date()),
  );
  const [notes, setNotes] = useState(notesParam || '');
  const [saving, setSaving] = useState(false);

  // No getInvert() round-trip on mount, unlike the substrate form — that one
  // needs the taxon to pick a create endpoint. Care logs have exactly one
  // endpoint, so the screen is usable the moment it opens.

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      // The column is a timestamp but the keeper only picks a date. Rather than
      // stamping a fabricated 00:00, the chosen day is combined with the
      // current time of day — roughly when they're logging it — and the
      // timeline never displays a time for these entries. The stored clock
      // time is an implementation detail, so it is never shown as fact.
      const chosen = parseLocalDate(date) ?? new Date();
      const now = new Date();
      chosen.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
      // Guard the backend's future check: picking today late in the day is
      // fine, but a clock a few seconds ahead shouldn't 422 a valid log.
      const stamp = chosen > now ? now : chosen;

      const payload = {
        log_type: type,
        logged_at: stamp.toISOString(),
        notes: notes.trim() || null,
      };
      if (isEdit && logId) {
        await updateInvertCareLog(logId, payload);
      } else {
        await createInvertCareLog(id, payload);
      }
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const styles = makeStyles(colors);
  const active = TYPES.find((t) => t.key === type);

  return (
    <View style={styles.flex}>
      <AppHeader
        title={isEdit ? 'Edit water log' : 'Log water'}
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      {/* Android needs an explicit 'height' behavior under SDK 54 edge-to-edge;
          'padding' leaves the keyboard covering the notes field. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Field label="What did you do?" colors={colors}>
            <View style={styles.typeCol}>
              {TYPES.map((t) => {
                const sel = t.key === type;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setType(t.key)}
                    style={[
                      styles.typeRow,
                      { borderColor: sel ? colors.primary : colors.border },
                      sel && { backgroundColor: colors.surfaceElevated },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={CARE_LOG_LABELS[t.key]}
                  >
                    <MaterialCommunityIcons
                      name={t.icon}
                      size={22}
                      color={sel ? colors.primary : colors.textTertiary}
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        { color: sel ? colors.textPrimary : colors.textSecondary },
                      ]}
                    >
                      {CARE_LOG_LABELS[t.key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          {/* The distinction between a top-up and an overflow isn't obvious
              unless you already keep a species that needs one, so say it. */}
          {active ? <Text style={styles.hint}>{active.hint}</Text> : null}

          <Field label="Date" colors={colors}>
            <DateInput
              value={parseLocalDate(date) ?? new Date()}
              onChange={(d) => setDate(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Date watered"
            />
          </Field>

          <Field label="Notes (optional)" colors={colors}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Anything worth remembering"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : isEdit ? 'Update water log' : 'Save water log'}
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
    typeCol: { gap: 8 },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    typeLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
    hint: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textTertiary,
      marginTop: -8,
      marginBottom: 18,
    },
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
