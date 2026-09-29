/**
 * Colony row for the Collection tab — design handoff, screen 8.
 *
 * A colony is a population, not an animal, so it no longer borrows the
 * animal photo card (150px image, a "Colony" tag, the count and a taxon
 * glyph all stacked on top of each other). It's a full-width row:
 *
 *   [taxon tile]  Name                       660
 *                 Species                    ↑ +106 · 30d
 *   ███████████████████░░░░░░░  stage proportion bar
 *   660 nymphs · 180 adult females · 40 adult males
 *
 * No photo and no overlays. The 30-day change comes from the colony list
 * (`change_30d`) and is simply absent when nothing was counted in the window.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { INVERT_TAXA, taxonMdiIcon } from '../lib/inverts';
import { formatColonyCount, type ColonyListItem } from '../lib/colonies';
import StageBar, { stageEntries } from './StageBar';

export default function ColonyRow({ item, onPress }: { item: ColonyListItem; onPress: () => void }) {
  const { colors, layout } = useTheme();
  const meta = INVERT_TAXA[item.taxon as keyof typeof INVERT_TAXA];
  const count = formatColonyCount(item.total_count, item.count_is_estimated);
  const species = item.species_missing
    ? 'Species removed'
    : item.species_display_name || item.species_scientific_name || `${meta?.label ?? 'Colony'} colony`;
  const entries = stageEntries(item.stage_counts);
  const legend = entries.map((e) => `${e.count.toLocaleString()} ${e.label.toLowerCase()}`).join(' · ');
  const change = item.change_30d;
  const changeColor = change == null || change === 0 ? colors.textSecondary : change > 0 ? colors.success : colors.error;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}
      accessibilityRole="button"
      accessibilityLabel={[
        `${item.name}, colony of ${count}`,
        species,
        change != null ? `${change >= 0 ? 'up' : 'down'} ${Math.abs(change)} in the last 30 days` : null,
        legend || null,
      ].filter(Boolean).join('. ')}
      accessibilityHint="Opens this colony."
    >
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: colors.primary + '1F', borderRadius: layout.radius.sm }]}>
          <MaterialCommunityIcons name={taxonMdiIcon(item.taxon) as any} size={22} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[TYPE.subheading, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[TYPE.caption, styles.italic, { color: colors.textSecondary }]} numberOfLines={1}>{species}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{count}</Text>
          {change != null ? (
            <View style={styles.change}>
              <MaterialCommunityIcons
                name={change > 0 ? 'trending-up' : change < 0 ? 'trending-down' : 'trending-neutral'}
                size={14}
                color={changeColor}
              />
              <Text style={[TYPE.caption, { color: changeColor }]}>
                {change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toLocaleString()} · 30d
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {entries.length > 0 ? (
        <>
          <StageBar counts={item.stage_counts} />
          <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{legend}</Text>
        </>
      ) : (
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>No headcount yet</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { borderWidth: 1, paddingVertical: 13, paddingHorizontal: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  italic: { fontStyle: 'italic' },
  right: { alignItems: 'flex-end' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
