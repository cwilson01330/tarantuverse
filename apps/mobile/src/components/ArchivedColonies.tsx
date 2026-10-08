/**
 * The "Archived colonies" / "Past colonies" view of the collection.
 *
 * Reached from an "Archived colonies N" chip in the collection filter row
 * (labelled "Past colonies" once any colony has ENDED), which only exists while
 * at least one colony is archived or ended. Ended colonies (ended_at set, with a
 * reason) never reach the main list or the plan count either; their rows read
 * "Ended {date} · {reason}" instead of "Archived". An archived colony
 * (is_active = false) is hidden from the main list and the plan's animal count
 * with its history intact — and before this, nothing in the app could get back
 * to one, so "archive" read as "delete".
 *
 * Same quiet pattern as DeceasedArchive: a plain list, a neutral dot, no alarm
 * colours. Tapping a row opens the colony, where the keeper can turn Active
 * back on in Edit.
 */
import React, { useMemo } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { INVERT_TAXA, taxonMdiIcon } from '../lib/inverts';
import { colonyEndReasonLabel, type ColonyListItem } from '../lib/colonies';
import { formatLocalDate } from '../utils/date';
import { getImageUrl } from '../utils/image-url';

const DOT = 7;

/** "Archived", or "Ended Oct 7, 2026 · Sold or rehomed" for an ended colony. */
function statusLine(c: ColonyListItem): string {
  if (!c.ended_at) return 'Archived';
  return [`Ended ${formatLocalDate(c.ended_at)}`, colonyEndReasonLabel(c.end_reason)].filter(Boolean).join(' · ');
}
const THUMB = 44;

export default function ArchivedColonies({
  items,
  search,
  header,
  refreshing,
  onRefresh,
  onOpen,
}: {
  items: ColonyListItem[];
  search: string;
  /** The filter chips — rendered above, so the keeper can get back out. */
  header: React.ReactElement;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (c: ColonyListItem) => void;
}) {
  const { colors, layout } = useTheme();

  const hasEnded = items.some((c) => !!c.ended_at);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((c) =>
          [c.name, c.species_display_name, c.species_scientific_name].some((v) => (v ?? '').toLowerCase().includes(q)),
        )
      : items;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <>
          {header}
          <View style={styles.sub}>
            <Text style={[TYPE.caption, styles.flex, { color: colors.textSecondary }]}>
              {`${items.length} ${hasEnded ? 'past' : 'archived'} colon${items.length === 1 ? 'y' : 'ies'} · not counted on your plan`}
            </Text>
          </View>
        </>
      }
      renderItem={({ item: c }) => {
        const species = c.species_missing
          ? 'Species removed'
          : c.species_display_name || c.species_scientific_name || null;
        const count =
          c.total_count == null ? null : `${c.count_is_estimated ? '≈' : ''}${c.total_count.toLocaleString()} in colony`;
        const line = [species, count].filter(Boolean).join(' · ');
        const photo = c.photo_url ? getImageUrl(c.photo_url) : null;
        return (
          <TouchableOpacity
            onPress={() => onOpen(c)}
            activeOpacity={0.75}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
            accessibilityLabel={[c.name, statusLine(c), line].filter(Boolean).join('. ')}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={[styles.thumb, styles.muted, { borderRadius: layout.radius.sm }]} />
            ) : (
              <View style={[styles.thumb, { borderRadius: layout.radius.sm, backgroundColor: colors.surfaceElevated }]}>
                <MaterialCommunityIcons
                  name={taxonMdiIcon(c.taxon) as any}
                  size={22}
                  color={colors.textTertiary}
                  accessibilityLabel={INVERT_TAXA[c.taxon]?.label}
                />
              </View>
            )}
            <View style={styles.flex}>
              <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
              {line ? (
                <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{line}</Text>
              ) : null}
              <View style={styles.lineRow}>
                <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
                <Text style={[TYPE.caption, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>{statusLine(c)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <Text style={[TYPE.body, styles.empty, { color: colors.textSecondary }]}>
          {search ? `Nothing matches “${search}”` : 'No past colonies.'}
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
  sub: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 10 },
  thumb: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center' },
  muted: { opacity: 0.7 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  empty: { textAlign: 'center', marginTop: 32 },
});
