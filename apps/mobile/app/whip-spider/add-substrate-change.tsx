/**
 * Log substrate change for a whip spider — ADR-006 taxon #1.
 *
 * Mirror of the centipede substrate flow. The backend auto-denormalizes
 * the change date + type + depth onto the parent Invert, so the detail
 * screen shows "last refreshed: X days ago" without a second fetch.
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
import { createWhipSpiderSubstrateChange } from '../../src/lib/whip-spiders';
import { toISODateLocal } from '../../src/utils/date';

const REASON_OPTIONS = [
  'Routine maintenance',
  'Mold or mites',
  'Rehouse',
  'Other',
];

export default function AddWhipSpiderSubstrateChangeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [substrateType, setSubstrateType] = useState('');
  const [substrateDepth, setSubstrateDepth] = useState('');
  const [reason, setReason] = useState(REASON_OPTIONS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      await createWhipSpiderSubstrateChange(id, {
        // Substrate changes use a date column (not datetime), so the
        // wire value is YYYY-MM-DD directly.
        changed_at: date,
        substrate_type: substrateType.trim() || null,
        substrate_depth: substrateDepth.trim() || null,
        reason,
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
        title="Log substrate change"
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

          <Field label="Substrate type" colors={colors}>
            <TextInput
              style={styles.input}
              value={substrateType}
              onChangeText={setSubstrateType}
              placeholder="Coco fiber / topsoil"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <Field label="Substrate depth" colors={colors}>
            <TextInput
              style={styles.input}
              value={substrateDepth}
              onChangeText={setSubstrateDepth}
              placeholder="2-3 inches"
              placeholderTextColor={colors.textTertiary}
            />
          </Field>

          <Field label="Reason" colors={colors}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REASON_OPTIONS.map((r) => {
                const selected = r === reason;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setReason(r)}
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
                      {r}
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
              {saving ? 'Saving…' : 'Save substrate change'}
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
