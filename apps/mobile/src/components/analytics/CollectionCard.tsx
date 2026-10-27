import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import {
  SEMANTIC_COLORS,
  collectionFigures,
  paidFooter,
  speciesRows,
  type CollectionAnalytics,
} from '../../lib/analytics-view';
import { RankedRows, SplitBar, type SplitBarPart } from '../charts';
import { AnalyticsCard, CardHeading, Figure, Hairline, LinkRow } from './parts';

/** Counts, time with you, sex split, species list and what was paid in total. */
export function CollectionCard({ data }: { data: CollectionAnalytics }) {
  const { colors } = useTheme();
  const figs = collectionFigures(data, false);
  const species = speciesRows(data);
  const paid = paidFooter(data);
  const sex = data.sex_distribution ?? {};

  // Sex colours are fixed (README §5); "unsexed" is a quiet theme grey.
  const parts: SplitBarPart[] = [
    {
      key: 'male',
      count: sex.male ?? 0,
      color: SEMANTIC_COLORS.male,
      label: 'male',
      glyph: <MaterialCommunityIcons name="gender-male" size={14} color={SEMANTIC_COLORS.male} />,
    },
    {
      key: 'female',
      count: sex.female ?? 0,
      color: SEMANTIC_COLORS.female,
      label: 'female',
      glyph: <MaterialCommunityIcons name="gender-female" size={14} color={SEMANTIC_COLORS.female} />,
    },
    {
      key: 'unknown',
      count: sex.unknown ?? 0,
      color: colors.textTertiary,
      label: 'unsexed',
      glyph: <MaterialCommunityIcons name="help-circle-outline" size={14} color={colors.textTertiary} />,
    },
  ];

  return (
    <AnalyticsCard>
      <CardHeading icon="spider" title="Collection" />

      <View style={styles.figures}>
        <Figure value={figs.animals} caption="animals" />
        <Figure value={figs.species} caption="species" />
        <Figure value={figs.withYou} caption={figs.withYouCaption} />
      </View>

      <SplitBar parts={parts} />

      {species.rows.length > 0 && (
        <>
          <Hairline />
          {species.moreCount === 0 ? (
            <View style={{ gap: SPACING.sm }}>
              {species.rows.map((r) => (
                <View key={r.key} accessible accessibilityLabel={r.a11y} style={styles.speciesRow}>
                  <Text numberOfLines={1} style={[styles.speciesName, { color: colors.textSecondary }]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.speciesCount, { color: colors.textPrimary }]}>{r.value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <RankedRows rows={species.rows} labelWidth={128} italicLabels />
          )}
          {species.moreLabel ? (
            <LinkRow label={species.moreLabel} onPress={() => router.push('/analytics/species' as never)} />
          ) : null}
        </>
      )}

      <Hairline />
      <View style={styles.paidRow} accessible accessibilityLabel={`Paid in total, ${paid.value}${paid.caption ? `, ${paid.caption}` : ''}`}>
        <Text style={[styles.paidLabel, { color: colors.textSecondary }]}>Paid in total</Text>
        <View style={styles.paidRight}>
          <Text style={[styles.paidValue, { color: colors.textPrimary }]}>{paid.value}</Text>
          {paid.caption ? <Text style={[styles.paidCaption, { color: colors.textTertiary }]}>{paid.caption}</Text> : null}
        </View>
      </View>
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING.xl, rowGap: SPACING.md },
  speciesRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.md },
  speciesName: { flex: 1, ...TYPE.small, fontStyle: 'italic' },
  speciesCount: { ...TYPE.smallStrong },
  paidRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.md },
  paidLabel: { ...TYPE.small },
  paidRight: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  paidValue: { ...TYPE.smallBold },
  paidCaption: { ...TYPE.micro, flexShrink: 1 },
});
