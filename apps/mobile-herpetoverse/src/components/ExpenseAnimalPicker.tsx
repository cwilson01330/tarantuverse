/**
 * "Pick animals" for an expense split: the keeper's living animals grouped by
 * taxon (registry order) as a checklist in a full-height modal. Each group has a
 * Select all / Clear toggle. Herpetoverse copy of apps/mobile's
 * ExpenseAnimalPicker, animals only (no colonies).
 *
 * The list comes from `useLivingAnimals` (the form calls it): GET /animals/ —
 * the same call the collection screen makes, whose default view leaves out died
 * and transferred animals (filtered again here so a closed animal can never be
 * offered) — scoped to the chosen collection when a co-keeper logs into someone
 * else's.
 *
 * The picked ids live in the parent (so the form's preview can count them); this
 * component only edits them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { ANIMAL_TAXA, ANIMAL_TAXON_ORDER, animalTitle, isAnimalTaxon, listAnimals, type Animal, type AnimalTaxon } from '../lib/animals';
import SitterButton from './SitterButton';

interface Group {
  key: AnimalTaxon;
  label: string;
  glyph: string;
  items: { id: string; label: string }[];
}

/** The keeper's living animals for one collection. */
export interface LivingAnimals {
  key: string;
  animals: { id: string; taxon: string; label: string }[];
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
    listAnimals(undefined, collection)
      .then((rows: Animal[]) => {
        if (!alive) return;
        setLoaded({
          key: collectionKey,
          animals: (Array.isArray(rows) ? rows : [])
            .filter((a) => !a.died_at && !a.transferred_out_at)
            .map((a) => ({ id: a.id, taxon: a.taxon, label: animalTitle(a) })),
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
  value: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

export default function ExpenseAnimalPicker({ visible, living, value, onChange, onClose }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(layout.spacing), [layout.spacing]);
  const { loading, error } = living;
  const current = living.data;

  const groups = useMemo<Group[]>(() => {
    if (!current) return [];
    const byTaxon = new Map<AnimalTaxon, Group>();
    for (const a of current.animals) {
      const key: AnimalTaxon = isAnimalTaxon(a.taxon) ? a.taxon : 'other';
      let g = byTaxon.get(key);
      if (!g) {
        g = { key, label: ANIMAL_TAXA[key].plural, glyph: ANIMAL_TAXA[key].glyph, items: [] };
        byTaxon.set(key, g);
      }
      g.items.push({ id: a.id, label: a.label });
    }
    const out = ANIMAL_TAXON_ORDER.filter((t) => byTaxon.has(t)).map((t) => byTaxon.get(t) as Group);
    for (const g of out) g.items.sort((x, y) => x.label.localeCompare(y.label));
    return out;
  }, [current]);

  const toggleOne = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const toggleGroup = (g: Group) => {
    const ours = new Set(g.items.map((i) => i.id));
    const allOn = g.items.every((i) => value.includes(i.id));
    if (allOn) {
      // Clear only this group's rows; ids from elsewhere stay.
      onChange(value.filter((id) => !ours.has(id)));
    } else {
      onChange([...value, ...g.items.filter((i) => !value.includes(i.id)).map((i) => i.id)]);
    }
  };

  const pickedCount = value.length;

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
            paddingTop: Platform.OS === 'ios' ? layout.spacing.lg : insets.top + layout.spacing.sm,
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
              <Text style={[TYPE.body, { color: colors.danger }]} accessibilityLiveRegion="polite">
                {error}
              </Text>
              <SitterButton label="Try again" variant="secondary" onPress={living.retry} />
            </View>
          ) : null}

          {current && groups.length === 0 ? (
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>No living animals to pick from.</Text>
          ) : null}

          {groups.map((g) => {
            const n = g.items.filter((i) => value.includes(i.id)).length;
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
                    {g.glyph} {g.label}{' '}
                    <Text style={[TYPE.label, { color: colors.textTertiary }]}>
                      ({n}/{g.items.length})
                    </Text>
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
                  const on = value.includes(i.id);
                  return (
                    <TouchableOpacity
                      key={i.id}
                      onPress={() => toggleOne(i.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={i.label}
                      style={[styles.row, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={layout.spacing.xl}
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

        <View style={[styles.footer, { borderColor: colors.border, paddingBottom: insets.bottom + layout.spacing.md }]}>
          <SitterButton label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

type Spacing = { xs: number; sm: number; md: number; lg: number; xl: number };

function makeStyles(sp: Spacing) {
  return StyleSheet.create({
    flex: { flex: 1 },
    gap: { gap: sp.md },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp.md,
      paddingHorizontal: sp.lg,
      paddingBottom: sp.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: sp.xs },
    content: { padding: sp.lg, gap: sp.md, paddingBottom: sp.xl * 2 },
    group: { borderWidth: 1, paddingHorizontal: sp.md, paddingTop: sp.xs },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sp.md,
      minHeight: 48,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footer: { paddingHorizontal: sp.lg, paddingTop: sp.md, borderTopWidth: StyleSheet.hairlineWidth },
  });
}
