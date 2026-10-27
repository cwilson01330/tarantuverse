import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { SEMANTIC_COLORS, recentRows, type CollectionAnalytics, type RecentRow } from '../../lib/analytics-view';
import { withAlpha } from '../../lib/chart-helpers';
import { AnalyticsCard, CardHeading, MIN_TOUCH, type IconName } from './parts';

/** The three latest things logged. */
export function RecentCard({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const { colors, layout } = useTheme();
  const rows = recentRows(data, now);

  const look = (kind: RecentRow['kind']): { icon: IconName; color: string } =>
    kind === 'molt'
      ? { icon: 'butterfly-outline', color: SEMANTIC_COLORS.molt }
      : kind === 'feeding'
        ? { icon: 'silverware-fork-knife', color: SEMANTIC_COLORS.success }
        : { icon: 'layers', color: colors.primary };

  return (
    <AnalyticsCard>
      <CardHeading icon="history" title="Recent" />
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>Nothing logged yet.</Text>
      ) : (
        <View>
          {rows.map((r, i) => {
            const { icon, color } = look(r.kind);
            return (
              <Pressable
                key={`${r.id}-${r.kind}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={r.a11y}
                onPress={() => router.push(`/invert/${r.id}` as never)}
                style={styles.row}
              >
                <View
                  style={[
                    styles.well,
                    {
                      borderRadius: layout.radius.sm,
                      backgroundColor: withAlpha(color, 0.16, colors.surfaceElevated),
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={icon} size={16} color={color} />
                </View>
                <Text numberOfLines={1} style={[styles.sentence, { color: colors.textPrimary }]}>
                  <Text style={styles.name}>{r.name}</Text> {r.verb}
                </Text>
                <Text style={[styles.rel, { color: colors.textTertiary }]}>{r.rel}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  empty: { ...TYPE.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: MIN_TOUCH },
  // README: a 28pt well; radius `sm` is set inline from the preset.
  well: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  sentence: { flex: 1, ...TYPE.small },
  name: { fontWeight: '600' },
  rel: { ...TYPE.note },
});
