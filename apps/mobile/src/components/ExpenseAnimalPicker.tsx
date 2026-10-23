/**
 * "Pick animals" for an expense split: the keeper's living inverts grouped by
 * taxon, plus open colonies as their own "Colonies" group, as a checklist in a
 * full-height modal. Each group has a Select all / Clear toggle.
 *
 * The list comes from `useLivingAnimals` (the form calls it) — ONE `/inverts/`
 * call partitioned by taxon, and `listColonies` — scoped to the chosen
 * collection when a co-keeper logs into someone else's. Mirrors the web
 * ExpenseAnimalPicker.
 *
 * The picked ids live in the parent (so the form's preview can count them); this
 * component only edits them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { INVERT_TAXA, INVERT_TAXON_ORDER, invertDisplayName, isInvertTaxon, listInverts } from '../lib/inverts';
import { listColonies } from '../lib/colonies';
import SitterButton from './SitterButton';

export interface PickedAnimals {
  inverts: string[];
  colonies: string[];
}

interface Group {
  key: string;
  label: string;
  kind: 'invert' | 'colony';
  items: { id: string; label: string }[];
}

/** The keeper's living animals and open colonies for one collection. */
export interface LivingAnimals {
  key: string;
  inverts: { id: string; taxon: string; label: string }[];
  colonies: { id: string; label: string }[];
}

export interface LivingState {
  /** Null until the list for THIS collection has loaded. */
  data: LivingAnimals | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Loads the living list once `enabled` turns true, and again when the
 * collection changes (the old ids belong to another collection). A response
 * for a collection the keeper has since left is ignored. Lives in the form,
 * not the picker, so the form can tell which saved split targets are still
 * living even before the picker is opened.
 */
export function useLivingAnimals(collection: string | null, enabled: boolean): LivingState {
  const collectionKey = collection ?? 'own';
  const [loaded, setLoaded] = useState<LivingAnimals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (loaded && loaded.key === collectionKey) return;
    let alive = true;
    setError(null);
    Promise.all([
      listInverts(collection),
      // No fallback: a colonies failure fails the whole list. A partial list would
      // make saved colony shares look like "no longer in your collection".
      listColonies(false, collection),
    ])
      .then(([animals, colonies]) => {
        if (!alive) return;
        setLoaded({
          key: collectionKey,
          inverts: animals.map((a) => ({ id: a.id, taxon: a.taxon, label: invertDisplayName(a) })),
          colonies: colonies.filter((c) => !c.ended_at).map((c) => ({ id: c.id, label: c.name })),
        });
      })
      .catch(() => {
        if (alive) setError('Could not load your animals.');
      });
    return () => {
      alive = false;
    };
  }, [enabled, collection, collectionKey, loaded, attempt]);

  const data = loaded && loaded.key === collectionKey ? loaded : null;
  return {
    data,
    loading: enabled && !data && !error,
    error: data ? null : error,
    retry: () => setAttempt((n) => n + 1),
  };
}

interface Props {
  visible: boolean;
  /** The living list, loaded by the form (`useLivingAnimals`). */
  living: LivingState;
  value: PickedAnimals;
  onChange: (next: PickedAnimals) => void;
  onClose: () => void;
}

export default function ExpenseAnimalPicker({ visible, living, value, onChange, onClose }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const { loading, error } = living;
  const current = living.data;

  const groups = useMemo<Group[]>(() => {
    if (!current) return [];
    const byTaxon = new Map<string, Group>();
    for (const a of current.inverts) {
      const key = isInvertTaxon(a.taxon) ? a.taxon : 'other';
      let g = byTaxon.get(key);
      if (!g) {
        g = { key, label: INVERT_TAXA[key].label, kind: 'invert', items: [] };
        byTaxon.set(key, g);
      }
      g.items.push({ id: a.id, label: a.label });
    }
    const out: Group[] = INVERT_TAXON_ORDER.filter((t) => byTaxon.has(t)).map((t) => byTaxon.get(t) as Group);
    for (const g of out) g.items.sort((x, y) => x.label.localeCompare(y.label));
    if (current.colonies.length) {
      out.push({
        key: '__colonies__',
        label: 'Colonies',
        kind: 'colony',
        items: [...current.colonies].sort((x, y) => x.label.localeCompare(y.label)),
      });
    }
    return out;
  }, [current]);

  const pickedSet = (g: Group) => new Set(g.kind === 'invert' ? value.inverts : value.colonies);

  const setGroupIds = (g: Group, ids: string[]) => {
    onChange(g.kind === 'invert' ? { ...value, inverts: ids } : { ...value, colonies: ids });
  };

  const toggleOne = (g: Group, id: string) => {
    const set = pickedSet(g);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setGroupIds(g, Array.from(set));
  };

  const toggleGroup = (g: Group) => {
    const set = pickedSet(g);
    const all = g.items.every((i) => set.has(i.id));
    if (all) {
      // Clear only this group's rows; ids from elsewhere stay.
      const ours = new Set(g.items.map((i) => i.id));
      setGroupIds(g, Array.from(set).filter((id) => !ours.has(id)));
    } else {
      for (const i of g.items) set.add(i.id);
      setGroupIds(g, Array.from(set));
    }
  };

  const pickedCount = value.inverts.length + value.colonies.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.flex,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === 'ios' ? SPACING.lg : insets.top + SPACING.sm,
          },
        ]}
      >
        <View style={[styles.header, { borderColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[TYPE.heading, { color: colors.textPrimary }]} accessibilityRole="header">
              Pick animals
            </Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              {pickedCount} {pickedCount === 1 ? 'animal' : 'animals'} picked
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Done picking animals" style={styles.hit}>
            <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading && !current ? <ActivityIndicator color={colors.primary} /> : null}

          {error && !current ? (
            <View style={styles.gap}>
              <Text style={[TYPE.body, { color: colors.error }]} accessibilityLiveRegion="polite">
                {error}
              </Text>
              <SitterButton label="Try again" variant="secondary" onPress={living.retry} />
            </View>
          ) : null}

          {current && groups.length === 0 ? (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>
              No living animals or open colonies to pick from.
            </Text>
          ) : null}

          {groups.map((g) => {
            const set = pickedSet(g);
            const n = g.items.filter((i) => set.has(i.id)).length;
            const all = n === g.items.length;
            return (
              <View
                key={g.key}
                style={[
                  styles.group,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
                ]}
              >
                <View style={styles.groupHead}>
                  <Text style={[TYPE.subheading, styles.flex, { color: colors.textPrimary }]} numberOfLines={1}>
                    {g.label} <Text style={[TYPE.label, { color: colors.textTertiary }]}>({n}/{g.items.length})</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => toggleGroup(g)}
                    accessibilityRole="button"
                    accessibilityLabel={all ? `Clear ${g.label}` : `Select all ${g.label}`}
                    style={styles.hit}
                  >
                    <Text style={[TYPE.label, { color: colors.primary }]}>{all ? 'Clear' : 'Select all'}</Text>
                  </TouchableOpacity>
                </View>
                {g.items.map((i) => {
                  const on = set.has(i.id);
                  return (
                    <TouchableOpacity
                      key={i.id}
                      onPress={() => toggleOne(g, i.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={i.label}
                      style={[styles.row, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={24}
                        color={on ? colors.primary : colors.textTertiary}
                      />
                      <Text style={[TYPE.body, styles.flex, { color: colors.textPrimary }]} numberOfLines={1}>
                        {i.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.footer, { borderColor: colors.border, paddingBottom: insets.bottom + SPACING.md }]}>
          <SitterButton label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: SPACING.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xs },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  group: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
});
