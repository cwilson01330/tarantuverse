import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { SEMANTIC_COLORS, rightNowTiles, type CollectionAnalytics, type RightNowTile } from '../../lib/analytics-view';
import { Card } from '../ui';
import type { IconName } from './parts';

/** README §3: icons and colours are semantic and fixed across presets. */
const TILE_LOOK: Record<RightNowTile['key'], { icon: IconName; color: string }> = {
  due: { icon: 'silverware-fork-knife', color: SEMANTIC_COLORS.error },
  molt: { icon: 'butterfly-outline', color: SEMANTIC_COLORS.molt },
  gap: { icon: 'clock-alert-outline', color: SEMANTIC_COLORS.warning },
};

function openTarget(tile: RightNowTile) {
  const t = tile.target;
  if (!t) return;
  router.push((t.kind === 'feeding_day' ? '/feeding-day' : `/invert/${t.id}`) as never);
}

/** The three "Right now" tiles. Zero animals: nothing is rendered. */
export function RightNow({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const { colors, layout } = useTheme();
  const tiles = rightNowTiles(data, now, false);
  if (tiles.length === 0) return null;

  return (
    <View style={styles.row} accessibilityRole="summary" accessibilityLabel="Right now">
      {tiles.map((tile) => {
        const look = TILE_LOOK[tile.key];
        const body = (
          <>
            <View style={styles.labelRow}>
              <MaterialCommunityIcons name={look.icon} size={14} color={look.color} />
              <Text numberOfLines={1} style={[styles.label, { color: colors.textSecondary }]}>
                {tile.label}
              </Text>
            </View>
            <Text numberOfLines={1} style={[styles.value, { color: colors.textPrimary }]}>
              {tile.value}
            </Text>
            <Text numberOfLines={2} style={[styles.caption, { color: colors.textTertiary }]}>
              {tile.caption}
            </Text>
          </>
        );
        // README: tiles are one radius step below cards, padding 10 12.
        const cardStyle = {
          flex: 1,
          minHeight: 74,
          borderRadius: layout.radius.md,
          paddingVertical: 10,
          paddingHorizontal: 12,
          gap: 2,
        };
        return tile.target ? (
          <Pressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={tile.a11y}
            onPress={() => openTarget(tile)}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}
          >
            <Card style={cardStyle}>{body}</Card>
          </Pressable>
        ) : (
          <View key={tile.key} accessible accessibilityLabel={tile.a11y} style={styles.tile}>
            <Card style={cardStyle}>{body}</Card>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm },
  tile: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { flexShrink: 1, ...TYPE.microStrong },
  value: { ...TYPE.tileValue },
  caption: { ...TYPE.micro },
});
