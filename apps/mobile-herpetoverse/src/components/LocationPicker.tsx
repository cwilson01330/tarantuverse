/**
 * LocationPicker — pick-first, type-second (HV port of the Tarantuverse
 * picker; colours from useTheme only).
 *
 * Opens a sheet listing the keeper's EXISTING locations (with counts) so
 * choosing one is the primary path; typing a new one is possible but
 * secondary, and the moment the typed text matches an existing location
 * case-insensitively the sheet says "Use existing: …" and returns that
 * spelling. Everything is still canonicalised server-side; this is about
 * making the near-duplicate hard to create in the first place.
 *
 * Renders as a field-shaped button (`LocationPicker`) for forms, and as a
 * bare sheet (`LocationSheet`) for bulk actions.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { LocationItem, listLocations, locationKey } from '../lib/locations';

const MAX_LEN = 40;
const HANDLE_H = 4;

interface SheetProps {
  visible: boolean;
  title?: string;
  /** Current value (form) — highlighted in the list. */
  value?: string | null;
  /** Pre-fetched list; when omitted the sheet fetches on open. */
  locations?: LocationItem[];
  /** Owner's user id when working inside a shared collection. */
  collection?: string | null;
  /** Show a "No location" row that resolves to null. Default true. */
  allowClear?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onPick: (location: string | null) => void;
}

export function LocationSheet({
  visible,
  title = 'Location',
  value,
  locations: given,
  collection,
  allowClear = true,
  confirmLabel,
  onClose,
  onPick,
}: SheetProps) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const [fetched, setFetched] = useState<LocationItem[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!visible) return;
    setText('');
    if (given) return;
    listLocations(collection).then(setFetched).catch(() => setFetched([]));
  }, [visible, given, collection]);

  const locations = given ?? fetched;
  const typedKey = locationKey(text);
  const existingMatch = useMemo(
    () => (typedKey ? locations.find((l) => locationKey(l.name) === typedKey) ?? null : null),
    [locations, typedKey],
  );
  const currentKey = locationKey(value);

  const commitTyped = () => {
    if (!typedKey) return;
    onPick(existingMatch ? existingMatch.name : text.replace(/\s+/g, ' ').trim());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            {locations.map((l) => {
              const active = currentKey != null && locationKey(l.name) === currentKey;
              return (
                <TouchableOpacity
                  key={l.name}
                  style={[styles.row, { borderColor: colors.border }]}
                  onPress={() => {
                    onPick(l.name);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <MaterialCommunityIcons
                    name={active ? 'map-marker-check' : 'map-marker-outline'}
                    size={20}
                    color={active ? colors.accent : colors.textSecondary}
                  />
                  <Text style={[styles.rowText, { color: active ? colors.accent : colors.textPrimary }]}>{l.name}</Text>
                  <Text style={[styles.count, { color: colors.textTertiary }]}>{l.count}</Text>
                </TouchableOpacity>
              );
            })}
            {allowClear && (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.border }]}
                onPress={() => {
                  onPick(null);
                  onClose();
                }}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="map-marker-off-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.rowText, { color: colors.textSecondary }]}>No location</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <Text style={[styles.newLabel, { color: colors.textTertiary }]}>
            {locations.length ? 'Or add a new one' : 'Name a place — a room, rack or shelf'}
          </Text>
          <View style={styles.newRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.sm,
                },
              ]}
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
              placeholder="e.g. Reptile room, Rack 2"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={commitTyped}
              maxLength={MAX_LEN}
            />
            <TouchableOpacity
              style={[
                styles.addBtn,
                { backgroundColor: typedKey ? colors.accent : colors.border, borderRadius: layout.radius.sm },
              ]}
              disabled={!typedKey}
              onPress={commitTyped}
              accessibilityRole="button"
              accessibilityLabel={existingMatch ? `Use existing ${existingMatch.name}` : confirmLabel ?? 'Add location'}
            >
              <Text style={[styles.addText, { color: colors.background }]}>{existingMatch ? 'Use' : confirmLabel ?? 'Add'}</Text>
            </TouchableOpacity>
          </View>
          {existingMatch ? (
            <Text style={[styles.hint, { color: colors.accent }]}>Use existing: {existingMatch.name}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FieldProps {
  value: string | null | undefined;
  onChange: (location: string | null) => void;
  placeholder?: string;
  /** Owner's user id when adding/editing inside a shared collection. */
  collection?: string | null;
}

/** Field-shaped trigger for add/edit forms. */
export function LocationPicker({ value, onChange, placeholder = 'Room, rack or shelf (optional)', collection }: FieldProps) {
  const { colors, layout } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[
          styles.field,
          { backgroundColor: colors.background, borderColor: colors.border, borderRadius: layout.radius.sm },
        ]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Location, ${value}` : 'Location, not set'}
      >
        <MaterialCommunityIcons name="map-marker-outline" size={18} color={value ? colors.textPrimary : colors.textTertiary} />
        <Text style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {value ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear location"
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : (
          <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textTertiary} />
        )}
      </TouchableOpacity>
      <LocationSheet visible={open} value={value} collection={collection} onClose={() => setOpen(false)} onPick={onChange} />
    </>
  );
}

interface RenameProps {
  visible: boolean;
  current: string;
  onClose: () => void;
  onSubmit: (next: string) => void;
}

/** Rename a location from its group header. Renaming onto a name that
 *  already exists is a merge — the caller confirms that with the count
 *  before submitting. Alert.prompt is iOS-only, hence a real sheet. */
export function LocationRenameSheet({ visible, current, onClose, onSubmit }: RenameProps) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(current);
  useEffect(() => {
    if (visible) setText(current);
  }, [visible, current]);
  const key = locationKey(text);
  const unchanged = key === locationKey(current);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Rename location</Text>
          <Text style={[styles.newLabel, { color: colors.textTertiary }]}>Everything at “{current}” moves with it</Text>
          <View style={styles.newRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.sm,
                },
              ]}
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => key && !unchanged && onSubmit(text)}
              maxLength={MAX_LEN}
              accessibilityLabel="New location name"
            />
            <TouchableOpacity
              style={[
                styles.addBtn,
                { backgroundColor: key && !unchanged ? colors.accent : colors.border, borderRadius: layout.radius.sm },
              ]}
              disabled={!key || unchanged}
              onPress={() => onSubmit(text)}
              accessibilityRole="button"
              accessibilityLabel="Save new name"
            >
              <Text style={[styles.addText, { color: colors.background }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderWidth: 1, padding: 20, paddingBottom: 28 },
  handle: { width: 40, height: HANDLE_H, borderRadius: HANDLE_H / 2, alignSelf: 'center', marginBottom: 12 },
  title: { ...TYPE.heading, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, ...TYPE.subheading, fontWeight: '500' },
  count: { ...TYPE.label, fontVariant: ['tabular-nums'] },
  newLabel: { ...TYPE.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  newRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, ...TYPE.body, fontSize: TYPE.subheading.fontSize },
  addBtn: { paddingHorizontal: 16, justifyContent: 'center' },
  addText: { ...TYPE.bodyStrong, fontWeight: '700' },
  hint: { marginTop: 6, ...TYPE.label, fontWeight: '600' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  fieldText: { flex: 1, ...TYPE.body, fontSize: TYPE.subheading.fontSize },
});
