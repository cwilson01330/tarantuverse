/**
 * Care sheet for a sitter — pick animals (all, a whole location, or one by
 * one), add an optional note, and open a print-ready page in the browser.
 * The PDF comes from the browser's own print / share sheet, so nothing here
 * needs a native module (ships by OTA). API: routers/care_sheets.py.
 *
 * Opened from the Collection header and Feeding Day.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppHeader } from '../src/components/AppHeader';
import SitterButton from '../src/components/SitterButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { TYPE } from '../src/theme/tokens';
import { useUnits } from '../src/hooks/useUnits';
import { INVERT_TAXA, isInvertTaxon } from '../src/lib/inverts';
import { groupByLocation } from '../src/lib/locations';
import { passErrorMessage, sitterApi, type Candidate } from '../src/lib/sitter-passes';
import {
  CARE_SHEET_MAX_ANIMALS,
  CARE_SHEET_NOTE_MAX,
  careSheetError,
  createCareSheet,
  type CareSheetCreated,
} from '../src/lib/care-sheets';

const keyOf = (c: Candidate) => `${c.kind}:${c.id}`;

function title(c: Candidate): string {
  return (
    c.name ||
    c.common_name ||
    c.scientific_name ||
    (isInvertTaxon(c.taxon) ? INVERT_TAXA[c.taxon].label : 'Unnamed')
  );
}

function glyph(c: Candidate): string {
  if (c.kind === 'colony') return '👥';
  return isInvertTaxon(c.taxon) ? INVERT_TAXA[c.taxon].glyph : '🐛';
}

function CareSheetScreen() {
  const { colors, layout } = useTheme();
  const { units } = useUnits();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<CareSheetCreated | null>(null);

  useEffect(() => {
    sitterApi
      .candidates()
      .then(setCandidates)
      .catch((e) => {
        setCandidates([]);
        Alert.alert('Could not load your animals', passErrorMessage(e));
      });
  }, []);

  const all = candidates ?? [];
  const groups = useMemo(() => groupByLocation(all, (c) => c.location), [all]);
  const hasLocations = all.some((c) => !!c.location);
  const allSelected = all.length > 0 && all.every((c) => selected.has(keyOf(c)));
  const tooMany = selected.size > CARE_SHEET_MAX_ANIMALS;

  const toggle = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open the browser', 'Copy the link and open it in your browser to print.');
    }
  };

  const submit = async () => {
    if (selected.size === 0) {
      Alert.alert('Pick at least one animal');
      return;
    }
    if (tooMany) {
      Alert.alert(`Up to ${CARE_SHEET_MAX_ANIMALS} animals per sheet`, 'Make two sheets for a bigger collection.');
      return;
    }
    setSaving(true);
    try {
      const picked = all.filter((c) => selected.has(keyOf(c)));
      const out = await createCareSheet({
        animal_ids: picked.filter((c) => c.kind === 'invert').map((c) => c.id),
        colony_ids: picked.filter((c) => c.kind === 'colony').map((c) => c.id),
        note: note.trim() || null,
        units,
      });
      setMade(out);
      await open(out.url);
    } catch (e) {
      Alert.alert('Could not make the care sheet', careSheetError(e));
    } finally {
      setSaving(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const input = [
    TYPE.body,
    styles.input,
    { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md, backgroundColor: colors.background },
  ];

  const header = (
    <AppHeader
      title="Care sheet"
      subtitle="Printable, for a sitter"
      leftAction={
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
        </TouchableOpacity>
      }
    />
  );

  if (made) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]}>Your care sheet is ready</Text>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>
            It opened in your browser. Use the browser&apos;s Print or Share menu to print it or save a PDF. The link
            works for 24 hours.
          </Text>
          <SitterButton label="Open in browser" onPress={() => open(made.url)} />
          <SitterButton
            label="Share link"
            variant="secondary"
            onPress={() => {
              Share.share({ message: made.url }).catch(() => {});
            }}
          />
          <SitterButton
            label="Copy link"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(made.url);
              Alert.alert('Copied');
            }}
          />
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            Anyone with the link can see this sheet until it expires. It never shows prices, sources or your private
            notes.
          </Text>
          <SitterButton label="Done" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>
          Pick the animals your sitter looks after. You&apos;ll get a page with feeding, safety and enclosure details,
          ready to print.
        </Text>

        <View style={card}>
          <View style={styles.between}>
            <Text style={[TYPE.subheading, { color: tooMany ? colors.error : colors.textPrimary }]}>
              Animals ({selected.size}
              {tooMany ? ` — max ${CARE_SHEET_MAX_ANIMALS}` : ''})
            </Text>
            {all.length > 0 && (
              <TouchableOpacity
                onPress={() => toggle(all.map(keyOf), !allSelected)}
                accessibilityRole="button"
                style={styles.hit}
              >
                <Text style={[TYPE.label, { color: colors.primary }]}>{allSelected ? 'None' : 'All'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {candidates === null && <ActivityIndicator color={colors.primary} />}
          {candidates !== null && all.length === 0 && (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>No active animals to put on a sheet.</Text>
          )}
          {groups.map((g) => {
            const keys = g.rows.map(keyOf);
            const groupAll = keys.every((k) => selected.has(k));
            return (
              <View key={g.key}>
                {hasLocations && (
                  <View style={[styles.between, styles.groupHeader, { borderColor: colors.border }]}>
                    <Text style={[TYPE.label, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>
                      📍 {g.label} ({g.rows.length})
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggle(keys, !groupAll)}
                      accessibilityRole="button"
                      accessibilityLabel={groupAll ? `Clear ${g.label}` : `Select all in ${g.label}`}
                      style={styles.hit}
                    >
                      <Text style={[TYPE.label, { color: colors.primary }]}>{groupAll ? 'Clear' : 'Select all'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {g.rows.map((c) => {
                  const k = keyOf(c);
                  const on = selected.has(k);
                  const name = title(c);
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => toggle([k], !on)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={name}
                      style={[styles.row, styles.animal, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={on ? colors.primary : colors.textTertiary}
                      />
                      <Text style={TYPE.body}>{glyph(c)}</Text>
                      <View style={styles.flex}>
                        <Text style={[TYPE.body, { color: colors.textPrimary }]} numberOfLines={1}>
                          {name}
                        </Text>
                        {c.scientific_name && c.scientific_name !== name ? (
                          <Text style={[TYPE.caption, styles.italic, { color: colors.textSecondary }]} numberOfLines={1}>
                            {c.scientific_name}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        <View style={card}>
          <Text style={[TYPE.label, { color: colors.textSecondary }]}>Note for your sitter (optional)</Text>
          <TextInput
            style={[...input, styles.multiline]}
            multiline
            maxLength={CARE_SHEET_NOTE_MAX}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Back Sunday evening. Feeders are in the garage."
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Note for your sitter"
          />
          <Text style={[TYPE.caption, styles.right, { color: colors.textTertiary }]}>
            {note.length}/{CARE_SHEET_NOTE_MAX}
          </Text>
        </View>

        <SitterButton label="Make care sheet" busy={saving} disabled={selected.size === 0 || tooMany} onPress={submit} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  groupHeader: { borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  animal: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 48 },
  hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  italic: { fontStyle: 'italic' },
  right: { textAlign: 'right' },
});

export default withErrorBoundary(CareSheetScreen, 'care-sheet');
