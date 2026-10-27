import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { feedingFigures, feedingSentence, type CollectionAnalytics } from '../../lib/analytics-view';
import { AnalyticsCard, CardHeading, Figure } from './parts';

/** Feedings, average gap and per-animal rate, plus the one honest sentence. */
export function FeedingCard({ data }: { data: CollectionAnalytics }) {
  const { colors } = useTheme();
  const figs = feedingFigures(data, false);
  const sentence = feedingSentence(data);
  return (
    <AnalyticsCard>
      <CardHeading icon="silverware-fork-knife" title="Feeding" />
      <View style={styles.figures}>
        <Figure value={figs.feedings} caption="feedings" />
        <Figure value={figs.between} caption="between, avg" />
        <Figure value={figs.perAnimal} caption="per animal" />
      </View>
      {sentence ? <Text style={[styles.sentence, { color: colors.textSecondary }]}>{sentence}</Text> : null}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING.xl, rowGap: SPACING.md },
  sentence: { ...TYPE.small },
});
