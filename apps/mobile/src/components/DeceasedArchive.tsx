/**
 * The "Died" view of the collection — design handoff §14.5.
 *
 * Reached from a "Died N" chip in the collection filter row, because a status
 * filter belongs with the other filters, not buried in settings. Before this,
 * `GET /inverts/?status=deceased` was unreachable from the app: marking an
 * animal as died removed it from every list, and the records we promised were
 * "kept" had no way back to them.
 *
 * Tone rules (ADR-015, §14.10): flat and factual. A neutral dot, never red and
 * never a skull. Tenure shows as plainly as the date. "Longest in your care"
 * is a sort, not the default — it must not read as a leaderboard.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import type { Invert } from '../lib/inverts';
import { INVERT_TAXA, taxonMdiIcon } from '../lib/inverts';
import { COPY, tenureLabel } from '../lib/lifecycle-copy';
import { formatLocalDate } from '../utils/date';
import { getImageUrl } from '../utils/image-url';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Sort = 'recent' | 'tenure';

const DOT = 7;
const THUMB = 44;

function tenureDays(a: Invert): number {
  if (!a.date_acquired || !a.died_at) return -1;
  const from = new Date(`${a.date_acquired.slice(0, 10)}T12:00:00`).getTime();
  const to = new Date(`${a.died_at.slice(0, 10)}T12:00:00`).getTime();
  return Number.isFinite(from) && Number.isFinite(to) ? to - from : -1;
}

export default function DeceasedArchive({
  items,
  search,
  header,
  refreshing,
  onRefresh,
  onOpen,
}: {
  items: Invert[];
  search: string;
  /** The filter chips — rendered above, so the keeper can get back out. */
  header: React.ReactElement;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (a: Invert) => void;
}) {
  const { colors, layout } = useTheme();
  const [sort, setSort] = useState<Sort>('recent');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((a) =>
          [a.name, a.common_name, a.scientific_name].some((v) => (v ?? '').toLowerCase().includes(q)),
        )
      : items;
    return [...filtered].sort((a, b) =>
      sort === 'tenure'
        ? tenureDays(b) - tenureDays(a)
        : (b.died_at ?? '').localeCompare(a.died_at ?? ''),
    );
  }, [items, search, sort]);

  const sortChip = (value: Sort, label: string) => {
    const on = sort === value;
    return (
      <TouchableOpacity
        onPress={() => setSort(value)}
        style={[styles.sortChip, { borderRadius: layout.radius.full, borderColor: on ? colors.textSecondary : colors.border }]}
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
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {header}
          <View style={styles.sub}>
            <Text style={[TYPE.caption, styles.flex, { color: colors.textSecondary }]}>
              {COPY.archiveSub(items.length)}
            </Text>
          </View>
          <View style={styles.sortRow} accessibilityRole="radiogroup" accessibilityLabel="Sort">
            {sortChip('recent', 'Most recent')}
            {sortChip('tenure', 'Longest in your care')}
          </View>
        </>
      }
      renderItem={({ item: a }) => {
        const name = a.name || a.common_name || a.scientific_name || 'Unnamed';
        const species = a.scientific_name && a.scientific_name !== name ? a.scientific_name : null;
        const tenure = tenureLabel(a.date_acquired, a.died_at);
        const died = formatLocalDate(a.died_at, { month: 'short', day: 'numeric', year: 'numeric' });
        const photo = a.photo_url ? getImageUrl(a.photo_url) : null;
        const line = [died ? `Died ${died}` : 'Died', tenure ? `in your care ${tenure}` : null].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity
            onPress={() => onOpen(a)}
            activeOpacity={0.75}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
            accessibilityLabel={[name, species, line].filter(Boolean).join('. ')}
          >
            {photo ? (
              // Muted, not greyed out: the animal is still the animal.
              <Image source={{ uri: photo }} style={[styles.thumb, styles.muted, { borderRadius: layout.radius.sm }]} />
            ) : (
              <View style={[styles.thumb, { borderRadius: layout.radius.sm, backgroundColor: colors.surfaceElevated }]}>
                <MaterialCommunityIcons
                  name={taxonMdiIcon(a.taxon) as any}
                  size={22}
                  color={colors.textTertiary}
                  accessibilityLabel={INVERT_TAXA[a.taxon]?.label}
                />
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
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <Text style={[TYPE.body, styles.empty, { color: colors.textSecondary }]}>
          {search ? `Nothing matches “${search}”` : 'No records here.'}
        </Text>
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Matches the collection list's padding so switching chips doesn't jump.
  list: { padding: 8, paddingBottom: 88, gap: 8 },
  sub: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 8 },
  sortRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4, paddingHorizontal: 8 },
  sortChip: { borderWidth: 1, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 10 },
  thumb: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.7 },
  italic: { fontStyle: 'italic' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  empty: { textAlign: 'center', marginTop: 32 },
});
