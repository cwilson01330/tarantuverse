import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/tokens';
import { moltsCard, type CollectionAnalytics } from '../../lib/analytics-view';
import { RankedRows } from '../charts';
import { AnalyticsCard, CardHeading, LinkRow } from './parts';

/** Per-animal ranked molt rows: all up to five animals, else the top three and "All n". */
export function MoltsCard({ data, now }: { data: CollectionAnalytics; now: Date }) {
  const { colors } = useTheme();
  const m = moltsCard(data, now, false);
  return (
    <AnalyticsCard>
      <CardHeading icon="butterfly-outline" title="Molts" trailing={m.trailing} />
      {m.emptyLine ? <Text style={[styles.empty, { color: colors.textTertiary }]}>{m.emptyLine}</Text> : null}
      {m.rows.length > 0 && (
        <RankedRows rows={m.rows} onPressRow={(r) => r.id && router.push(`/invert/${r.id}` as never)} />
      )}
      {m.allLabel ? <LinkRow label={m.allLabel} onPress={() => router.push('/analytics/molts' as never)} /> : null}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  empty: { ...TYPE.small },
});
