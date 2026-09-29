/**
 * The "Died" view of the collection — HV mirror of TV's archive (§14.5).
 *
 * Flat and factual: a neutral dot, the date, and how long the animal was in
 * the keeper's care. "Longest in your care" is a sort, never the default —
 * it must not read as a leaderboard.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactElement } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { ANIMAL_TAXA, animalTitle, type Animal } from '../lib/animals';
import { COPY, fmtDay, tenureLabel } from '../lib/lifecycle';

type Sort = 'recent' | 'tenure';
const DOT = 7;
const THUMB = 44;

function tenureMs(a: Animal): number {
  if (!a.date_acquired || !a.died_at) return -1;
  const from = new Date(`${a.date_acquired.slice(0, 10)}T12:00:00`).getTime();
  const to = new Date(`${a.died_at.slice(0, 10)}T12:00:00`).getTime();
  return Number.isFinite(from) && Number.isFinite(to) ? to - from : -1;
}

export function DeceasedArchive({
  items,
  query,
  header,
  refreshing,
  onRefresh,
  onOpen,
  contentStyle,
}: {
  items: Animal[];
  query: string;
  header: ReactElement;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (a: Animal) => void;
  contentStyle?: object;
}) {
  const { colors, layout } = useTheme();
  const [sort, setSort] = useState<Sort>('recent');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((a) => [a.name, a.common_name, a.scientific_name].some((v) => (v ?? '').toLowerCase().includes(q)))
      : items;
    return [...filtered].sort((a, b) =>
      sort === 'tenure' ? tenureMs(b) - tenureMs(a) : (b.died_at ?? '').localeCompare(a.died_at ?? ''),
    );
  }, [items, query, sort]);

  const sortChip = (value: Sort, label: string) => {
    const on = sort === value;
    return (
      <TouchableOpacity
        onPress={() => setSort(value)}
        style={[styles.sortChip, { borderRadius: layout.radius.xl, borderColor: on ? colors.textSecondary : colors.border }]}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
      >
        <Text style={[TYPE.caption, { color: on ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(a) => a.id}
      contentContainerStyle={[styles.list, contentStyle]}
      ListHeaderComponent={
        <View>
          {header}
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{COPY.archiveSub(items.length)}</Text>
          <View style={styles.sortRow} accessibilityRole="radiogroup" accessibilityLabel="Sort">
            {sortChip('recent', 'Most recent')}
            {sortChip('tenure', 'Longest in your care')}
          </View>
        </View>
      }
      renderItem={({ item: a }) => {
        const name = animalTitle(a);
        const species = a.scientific_name && a.scientific_name !== name ? a.scientific_name : null;
        const tenure = tenureLabel(a.date_acquired, a.died_at);
        const line = [`Died ${fmtDay(a.died_at)}`, tenure ? `in your care ${tenure}` : null].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity
            onPress={() => onOpen(a)}
            activeOpacity={0.75}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
            accessibilityLabel={[name, species, line].filter(Boolean).join('. ')}
          >
            {a.photo_url ? (
              // Muted, not greyed: the animal is still the animal.
              <Image source={{ uri: a.photo_url }} style={[styles.thumb, styles.muted, { borderRadius: layout.radius.sm }]} />
            ) : (
              <View style={[styles.thumb, { borderRadius: layout.radius.sm, backgroundColor: colors.surfaceRaised }]}>
                <Text style={TYPE.heading}>{ANIMAL_TAXA[a.taxon]?.glyph ?? '🦎'}</Text>
              </View>
            )}
            <View style={styles.flex}>
              <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
              {species ? (
                <Text style={[TYPE.caption, styles.italic, { color: colors.textSecondary }]} numberOfLines={1}>{species}</Text>
              ) : null}
              <View style={styles.lineRow}>
                <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
                <Text style={[TYPE.caption, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>{line}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <Text style={[TYPE.body, styles.empty, { color: colors.textSecondary }]}>
          {query ? `Nothing matches “${query}”` : 'No records here.'}
        </Text>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 8 },
  sortRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  sortChip: { borderWidth: 1, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 10 },
  thumb: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.7 },
  italic: { fontStyle: 'italic' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  empty: { textAlign: 'center', marginTop: 32 },
});
