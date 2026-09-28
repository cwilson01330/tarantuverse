/**
 * New sitter link — pick animals, when it starts, how long it lasts; then show
 * the link + QR exactly once (PRD-shared-keeping).
 *
 * Dates are day chips, not a date picker: no date-picker module ships in this
 * app, and adding one would need a native build. Chips keep this OTA-able.
 *
 * Also opened with ?reveal=1 after "New link" on the list screen, to show a
 * rotated link (handed over in memory — see stashReveal).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import UpgradeModal from '../../src/components/UpgradeModal';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/type';
import {
  PASS_MAX_DAYS,
  fmtDay,
  passErrorMessage,
  shareUrl,
  sitterApi,
  takeReveal,
  type Candidate,
  type PassCreated,
} from '../../src/lib/sitter-passes';

const START_OPTIONS = [
  { days: 0, label: 'Today' },
  { days: 1, label: 'Tomorrow' },
  { days: 2, label: 'In 2 days' },
  { days: 7, label: 'In a week' },
];
const LENGTH_OPTIONS = [3, 7, 14, PASS_MAX_DAYS];

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function NewSitterLinkScreen() {
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const params = useLocalSearchParams<{ reveal?: string }>();
  const [created, setCreated] = useState<PassCreated | null>(() => (params.reveal ? takeReveal() : null));

  const [label, setLabel] = useState('');
  const [startIn, setStartIn] = useState(0);
  const [lengthDays, setLengthDays] = useState(7);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [upgrade, setUpgrade] = useState<string | null>(null);

  useEffect(() => {
    if (created) return;
    sitterApi
      .candidates()
      .then((c) => {
        setCandidates(c);
        setSelected(new Set(c.map((x) => `${x.kind}:${x.id}`)));
      })
      .catch((e) => {
        setCandidates([]);
        Alert.alert('Could not load your animals', passErrorMessage(e));
      });
  }, [created]);

  const key = (c: Candidate) => `${c.kind}:${c.id}`;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (candidates ?? []).filter(
      (c) => !q || [c.name, c.common_name, c.scientific_name, c.taxon].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [candidates, filter]);

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const saveNote = async (c: Candidate) => {
    try {
      const r = await sitterApi.setNote(c.kind, c.id, noteDraft.trim() || null);
      setCandidates((cs) => (cs ?? []).map((x) => (key(x) === key(c) ? { ...x, sitter_note: r.sitter_note } : x)));
      setEditing(null);
    } catch (e) {
      Alert.alert('Could not save that note', passErrorMessage(e));
    }
  };

  const submit = async () => {
    const animals = (candidates ?? []).filter((c) => selected.has(key(c))).map((c) => ({ kind: c.kind, id: c.id }));
    if (animals.length === 0) {
      Alert.alert('Pick at least one animal');
      return;
    }
    const now = Date.now();
    const start = startIn === 0 ? new Date(now) : startOfDay(startIn);
    // End of the last day, clamped to the 30-day ceiling the server enforces.
    const lastDay = startOfDay(startIn + lengthDays - 1);
    lastDay.setHours(23, 59, 0, 0);
    const end = new Date(Math.min(lastDay.getTime(), start.getTime() + PASS_MAX_DAYS * 86400000 - 60000));
    setSaving(true);
    try {
      setCreated(
        await sitterApi.create({
          animals,
          label: label.trim() || undefined,
          starts_at: startIn === 0 ? undefined : start.toISOString(),
          expires_at: end.toISOString(),
        }),
      );
    } catch (e: any) {
      if (e?.response?.status === 402) setUpgrade(passErrorMessage(e));
      else Alert.alert('Could not make the link', passErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const input = [TYPE.body, styles.input, { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md, backgroundColor: colors.background }];

  const header = (
    <AppHeader
      title={created ? 'Sitter link' : 'New sitter link'}
      leftAction={
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
        </TouchableOpacity>
      }
    />
  );

  if (created) {
    const url = shareUrl(created);
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]}>Your sitter link is ready</Text>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>
            Send this to {created.label || 'your sitter'}. It works until {fmtDay(created.expires_at)}.
          </Text>
          <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>
            This is the only time it&apos;s shown. If you lose it, make a new one.
          </Text>
          <View style={[styles.qr, { borderRadius: layout.radius.lg }]}>
            <QRCode value={url} size={200} />
          </View>
          <Text selectable style={[TYPE.caption, { color: colors.textSecondary }]}>{url}</Text>
          <SitterButton label="Share link" onPress={() => { Share.share({ message: url }).catch(() => {}); }} />
          <SitterButton
            label="Copy link"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(url);
              Alert.alert('Copied');
            }}
          />
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            Anyone with this link can see the feeding list until it ends. You can end it early from Sitter &amp; sharing.
          </Text>
          <SitterButton label="Done" variant="secondary" onPress={() => router.replace('/sitter' as never)} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <Text style={[TYPE.label, { color: colors.textSecondary }]}>Sitter&apos;s name (optional)</Text>
          <TextInput style={input} value={label} onChangeText={setLabel} maxLength={80} placeholder="e.g. Sam"
            placeholderTextColor={colors.textTertiary} accessibilityLabel="Sitter's name" />

          <Text style={[TYPE.label, styles.gap, { color: colors.textSecondary }]}>Starts</Text>
          <ChipRow options={START_OPTIONS.map((o) => ({ value: o.days, label: o.label }))} value={startIn} onChange={setStartIn} />

          <Text style={[TYPE.label, styles.gap, { color: colors.textSecondary }]}>How long</Text>
          <ChipRow
            options={LENGTH_OPTIONS.map((d) => ({ value: d, label: d === PASS_MAX_DAYS ? `${d} days (max)` : d === 7 ? '1 week' : d === 14 ? '2 weeks' : `${d} days` }))}
            value={lengthDays}
            onChange={setLengthDays}
          />
        </View>

        <View style={card}>
          <View style={styles.between}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Animals ({selected.size})</Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setSelected(new Set((candidates ?? []).map(key)))} accessibilityRole="button">
                <Text style={[TYPE.label, { color: colors.primary }]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelected(new Set())} accessibilityRole="button">
                <Text style={[TYPE.label, { color: colors.primary }]}>None</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput style={input} value={filter} onChangeText={setFilter} placeholder="Filter"
            placeholderTextColor={colors.textTertiary} accessibilityLabel="Filter animals" />
          {candidates === null && <ActivityIndicator color={colors.primary} />}
          {shown.map((c) => {
            const k = key(c);
            const name = c.name || c.common_name || c.scientific_name || 'Unnamed';
            return (
              <View key={k} style={[styles.animal, { borderColor: colors.border }]}>
                <View style={styles.between}>
                  <Text style={[TYPE.body, styles.flex, { color: colors.textPrimary }]}>
                    {name}{c.kind === 'colony' ? '  · colony' : ''}
                  </Text>
                  <Switch value={selected.has(k)} onValueChange={() => toggle(k)} accessibilityLabel={`Include ${name}`} />
                </View>
                {editing === k ? (
                  <View style={styles.gap}>
                    <TextInput style={[input, styles.multiline]} multiline maxLength={1000} value={noteDraft} onChangeText={setNoteDraft}
                      placeholder="e.g. She's shy — leave food at the burrow entrance and step back."
                      placeholderTextColor={colors.textTertiary} accessibilityLabel={`Note for the sitter about ${name}`} />
                    <View style={styles.row}>
                      <View style={styles.flex}><SitterButton label="Save note" onPress={() => saveNote(c)} /></View>
                      <View style={styles.flex}><SitterButton label="Cancel" variant="secondary" onPress={() => setEditing(null)} /></View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setEditing(k); setNoteDraft(c.sitter_note ?? ''); }} accessibilityRole="button">
                    <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                      {c.sitter_note ? `Note for sitter: ${c.sitter_note}` : '+ Add a note for the sitter'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            Notes are saved on the animal and reused next trip. Your private notes, prices and sources are never shown to a sitter.
          </Text>
        </View>

        <SitterButton label="Make link" busy={saving} onPress={submit} />
      </ScrollView>

      <UpgradeModal
        visible={upgrade !== null}
        onClose={() => setUpgrade(null)}
        source="shared_keeping"
        title="More sitter links"
        message={upgrade ?? ''}
      />
    </View>
  );
}

function ChipRow<T extends number>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[
              styles.chip,
              { borderRadius: 999, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : 'transparent' },
            ]}
          >
            <Text style={[TYPE.label, { color: on ? colors.primary : colors.textPrimary }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  gap: { marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  animal: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  qr: { backgroundColor: '#fff', padding: 16, alignSelf: 'center' },
});

export default withErrorBoundary(NewSitterLinkScreen, 'sitter-new');
