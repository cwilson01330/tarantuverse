/**
 * A colony's population over time — the keeper's own logged counts.
 *
 * WHAT THIS DELIBERATELY DOESN'T DO
 * ---------------------------------
 * It does not project. There is no "your colony will reach N by December",
 * because for the animals this matters most to — isopods — that number can't
 * be earned. Reproduction depends on species, temperature, humidity, calcium,
 * protein, substrate depth and founding sex ratio, and nobody can sex an
 * isopod at a glance or count a colony that lives inside substrate. The
 * INPUT is already an estimate; a forecast on top would be a guess stacked on
 * a guess wearing a confident number.
 *
 * What it shows instead is the shape of where the colony has been, which is
 * the honest version of the same question — and gets more useful the longer
 * someone logs, which is the behaviour worth encouraging anyway.
 *
 * THREE STATES, ALL OF WHICH MUST READ WELL
 * -----------------------------------------
 *   nothing logged  — invite the first count, don't show an empty axis
 *   too sparse      — show the points, and the server's REASON for withholding
 *                     a trend. Never blank space where a number should be.
 *   enough data     — chart + observed net change
 *
 * Module-level StyleSheet (the StyleSheet-in-component note). Colours come
 * from the theme; the error token is `error`, not `danger`.
 */
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { useTheme } from '../contexts/ThemeContext';
import { offspringNoun } from '../lib/taxon-modules';
import type { PopulationHistory } from '../lib/colonies';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Props {
  history: PopulationHistory | null;
  taxon: string;
  /** Rendered when the colony has no logged counts yet. */
  onLogFirstCount?: () => void;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${m}/${d}`;
}

export function ColonyPopulationChart({ history, taxon }: Props) {
  const { colors } = useTheme();

  if (!history) return null;

  const { points, growth, history_complete, count_is_estimated } = history;
  const young = offspringNoun(taxon);

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          No counts logged yet
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
          Log a count and this becomes a picture of how your colony is doing.
          Every birth, loss and {young} you record draws another point.
        </Text>
      </View>
    );
  }

  // Chart-kit needs at least one label and dataset value. With a single point
  // a line has nothing to connect, so show the number rather than a dot
  // floating on an empty axis.
  const dated = points.filter((p) => p.date);
  const canChart = dated.length >= 2;

  return (
    <View>
      {canChart ? (
        <LineChart
          data={{
            // Chart-kit renders every label it's given, so thin them out —
            // a keeper with 40 counts would otherwise get unreadable mush.
            labels: dated.map((p, i) =>
              i === 0 || i === dated.length - 1 || i % Math.ceil(dated.length / 4) === 0
                ? shortDate(p.date)
                : '',
            ),
            datasets: [{ data: dated.map((p) => p.total) }],
          }}
          width={SCREEN_WIDTH - 64}
          height={200}
          withDots={dated.length <= 20}
          withInnerLines={false}
          chartConfig={{
            backgroundColor: colors.surface,
            backgroundGradientFrom: colors.surface,
            backgroundGradientTo: colors.surface,
            // Whole animals. A population of "42.5" is nonsense.
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
            labelColor: () => colors.textTertiary,
            propsForDots: { r: '3', strokeWidth: '2', stroke: colors.success },
            propsForBackgroundLines: { strokeDasharray: '' },
          }}
          bezier
          style={styles.chart}
        />
      ) : (
        <View style={styles.singleWrap}>
          <Text style={[styles.singleValue, { color: colors.textPrimary }]}>
            {points[points.length - 1].total.toLocaleString()}
          </Text>
          <Text style={[styles.singleLabel, { color: colors.textTertiary }]}>
            from one logged count
          </Text>
        </View>
      )}

      {growth.has_rate ? (
        <View style={styles.trendRow}>
          <Text
            style={[
              styles.trendValue,
              { color: (growth.net_change ?? 0) >= 0 ? colors.success : colors.error },
            ]}
          >
            {(growth.net_change ?? 0) >= 0 ? '+' : ''}
            {growth.net_change?.toLocaleString()}
          </Text>
          <Text style={[styles.trendBody, { color: colors.textSecondary }]}>
            over {growth.days_observed} days — about{' '}
            {(growth.per_30_days ?? 0) >= 0 ? '+' : ''}
            {growth.per_30_days} a month, going by what you&apos;ve logged
          </Text>
        </View>
      ) : (
        // The server states WHY it's withholding a trend. Showing its reason
        // beats inventing one, and beats a blank space the keeper reads as a
        // bug.
        <Text style={[styles.reason, { color: colors.textTertiary }]}>
          {growth.reason}
        </Text>
      )}

      {!history_complete && (
        <Text style={[styles.caveat, { color: colors.textTertiary }]}>
          This chart covers counts logged as events. Some of this colony&apos;s
          population was set directly, so the line may not reach today&apos;s
          total.
        </Text>
      )}

      {count_is_estimated && (
        <Text style={[styles.caveat, { color: colors.textTertiary }]}>
          Counts are marked as estimates — which is honest for a colony you
          can&apos;t fully see.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { marginLeft: -16, borderRadius: 12 },
  empty: { paddingVertical: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptyBody: { fontSize: 13, lineHeight: 19 },
  singleWrap: { paddingVertical: 12, alignItems: 'center' },
  singleValue: { fontSize: 34, fontWeight: '700' },
  singleLabel: { fontSize: 12, marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  trendValue: { fontSize: 20, fontWeight: '700' },
  trendBody: { flex: 1, fontSize: 13, lineHeight: 18 },
  reason: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  caveat: { fontSize: 12, lineHeight: 17, marginTop: 8 },
});
