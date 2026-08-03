/**
 * Log an event — ADR-015 D5 / design handoff 1d.
 *
 * The untyped log: injuries, illnesses, escapes, recoveries, rehousings, vet
 * visits, and free observations. Everything that isn't a feeding or a molt and
 * previously had nowhere to go but the animal's single overwritable notes blob.
 *
 * Severity is revealed only for injury and illness. Offering it on an
 * observation would invite a judgment the keeper never made, and a conditional
 * field that appears and disappears is less janky than one that's always there
 * and usually meaningless.
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

import { AppHeader } from '../../src/components/AppHeader';
import DateInput from '../../src/components/DateInput';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getErrorMessage } from '../../src/utils/errors';
import { parseLocalDate, toISODateLocal } from '../../src/utils/date';
import {
  ANIMAL_EVENT_LABELS,
  ANIMAL_EVENT_ORDER,
  createInvertEvent,
  eventHasSeverity,
  listInvertEvents,
  updateAnimalEvent,
  type AnimalEventSeverity,
  type AnimalEventType,
} from '../../src/lib/inverts';

const SEVERITIES: AnimalEventSeverity[] = ['minor', 'moderate', 'severe'];

/** Placeholder per type — a prompt for the keeper's own words, which are the
 *  point of this log. "Injury" is a label; "lost most of leg III right in a
 *  fall from the lid" is the record. */
const NOTE_HINT: Partial<Record<AnimalEventType, string>> = {
  injury: 'e.g. lost most of leg III right in a fall from the lid',
  illness: 'What you noticed, and what you changed',
  bad_molt: 'What went wrong, and how they are now',
  escape: 'How they got out, and where you found them',
  recovered: 'Which problem this answers',
  rehoused: 'What they moved into, and why',
  vet_visit: 'What was found, and what was advised',
  observation: 'Anything worth remembering',
  death: 'Marking them as died is on the animal’s own page — this is just a note',
};

export default function AddInvertEventScreen() {
  const router = useRouter();
  const { id, logId } = useLocalSearchParams<{ id?: string; logId?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const isEdit = !!logId;

  const [type, setType] = useState<AnimalEventType>('observation');
  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [severity, setSeverity] = useState<AnimalEventSeverity | ''>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit mode: there's no GET-one route for events, so pull the animal's list
  // and pick this row out. Cheap — an animal has a handful of events, not
  // hundreds, which is the whole reason this log is separate from feedings.
  useEffect(() => {
    if (!id || !logId) return;
    listInvertEvents(id)
      .then((all) => {
        const e = all.find((x) => x.id === logId);
        if (!e) return;
        setType(e.event_type);
        setDate(e.occurred_at.slice(0, 10));
        setSeverity(e.severity ?? '');
        setNotes(e.notes ?? '');
      })
      .catch(() => {
        // Non-fatal: the form still works as a fresh entry. Better than
        // bouncing someone out of a screen they deliberately opened.
      });
  }, [id, logId]);

  const styles = makeStyles(colors);
  const showSeverity = eventHasSeverity(type);

  const handleSave = async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      const payload = {
        event_type: type,
        occurred_at: date,
        // Severity is meaningless off injury/illness — don't smuggle a stale
        // value through if the keeper switched type after picking one.
        severity: showSeverity ? severity || null : null,
        notes: notes.trim() || null,
      };
      if (isEdit && logId) {
        await updateAnimalEvent(logId, payload);
      } else {
        await createInvertEvent(id, payload);
      }
      router.back();
    } catch (err) {
      Alert.alert('Could not save', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <AppHeader
        title={isEdit ? 'Edit event' : 'Log event'}
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="What happened?" colors={colors}>
            <View style={styles.chipWrap}>
              {ANIMAL_EVENT_ORDER.map((t) => {
                const sel = t === type;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setType(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    style={[
                      styles.chip,
                      {
                        borderColor: sel ? colors.primary : colors.border,
                        backgroundColor: sel ? colors.primary : colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                      {ANIMAL_EVENT_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          <Field label="When" colors={colors}>
            <DateInput
              value={parseLocalDate(date) ?? new Date()}
              onChange={(d) => setDate(toISODateLocal(d))}
              maximumDate={new Date()}
              label="Date"
            />
            <Text style={styles.helper}>
              Most events get noticed after the fact — backdating is normal.
            </Text>
          </Field>

          {showSeverity && (
            <Field label="How bad? (optional)" colors={colors}>
              <View style={styles.chipWrap}>
                {SEVERITIES.map((sv) => {
                  const sel = sv === severity;
                  return (
                    <TouchableOpacity
                      key={sv}
                      onPress={() => setSeverity(sel ? '' : sv)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={[
                        styles.chip,
                        {
                          borderColor: sel ? colors.warning ?? colors.primary : colors.border,
                          backgroundColor: sel ? colors.warning ?? colors.primary : colors.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: sel ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                        {sv[0].toUpperCase() + sv.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
          )}

          <Field label="Notes" colors={colors}>
            <TextInput
              style={styles.textarea}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder={NOTE_HINT[type]}
              placeholderTextColor={colors.textTertiary}
              textAlignVertical="top"
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save event'}</Text>
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
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: colors.textTertiary,
          marginBottom: 8,
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
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    helper: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
    textarea: {
      minHeight: 88,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
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
