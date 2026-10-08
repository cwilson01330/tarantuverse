/**
 * Weight card — the Weight section of the animal detail screen, matching the
 * HV web "Weight" section: the 30-day loss notice, a trend chart, and the
 * latest weight with its change.
 *
 * The chart reads the server's trend series when we have it and falls back to
 * the weigh-in list the screen already holds, so a failed trend request still
 * leaves a chart. The loss notice comes only from the server (`trend.alert`):
 * it already stays quiet during brumation and when the species has no
 * threshold, and the client must not second-guess that.
 *
 * Wording is deliberately flat — "check", not "danger". Weight can dip for
 * ordinary reasons (a big meal's worth of waste, pre-shed, brumation).
 */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import type { WeightLog, WeightTrendResponse } from '../../lib/animals';
import { relativeDays } from '../../utils/relative-days';
import { Section } from './ReptileDetailShared';
import { WeightChart, fmtGramsValue } from '../WeightChart';

function pct1(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

export function WeightCard({
  weights,
  trend,
  trendFailed,
  canLog,
}: {
  weights: WeightLog[];
  /** null while not loaded, or deliberately not fetched (died animals). */
  trend: WeightTrendResponse | null;
  /** The trend request errored — say so rather than implying "no alert". */
  trendFailed: boolean;
  canLog: boolean;
}) {
  const { colors, layout } = useTheme();

  const points = (trend?.series?.length ? trend.series : weights).filter((p) =>
    Number.isFinite(Number(p.weight_g)),
  );
  const sorted = [...points].sort(
    (a, b) => new Date(a.weighed_at).getTime() - new Date(b.weighed_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <Section title="Weight">
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>
          {canLog
            ? 'No weigh-ins yet. Log one with the Weight button below to start the chart.'
            : 'No weigh-ins yet.'}
        </Text>
      </Section>
    );
  }

  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const latestG = Number(latest.weight_g);
  const diff = previous ? latestG - Number(previous.weight_g) : null;

  const changeText =
    diff == null
      ? 'First weigh-in'
      : diff === 0
        ? 'No change since the previous weigh-in'
        : `${diff > 0 ? '+' : '−'}${fmtGramsValue(Math.abs(diff))} g since the previous weigh-in`;
  const when = relativeDays(latest.weighed_at);

  const showBanner = !!trend?.alert;
  const lossPct = pct1(trend?.loss_pct_30d);
  const thresholdPct = pct1(trend?.alert_threshold_pct);

  return (
    <Section title="Weight">
      {showBanner && lossPct != null ? (
        <View
          style={[
            styles.banner,
            {
              borderColor: colors.warning + '66',
              backgroundColor: colors.warning + '1A',
              borderRadius: layout.radius.md,
            },
          ]}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`Weight loss over 30 days: ${lossPct} percent${
            thresholdPct ? `, above the species threshold of ${thresholdPct} percent` : ''
          }`}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>
            Weight loss over 30 days: {lossPct}%
          </Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
            {thresholdPct ? `Above the species-level threshold of ${thresholdPct}%. ` : ''}
            Check body condition, feeding refusals, and husbandry before assuming normal variation.
          </Text>
        </View>
      ) : null}

      <View accessible accessibilityLabel={`Latest weight ${fmtGramsValue(latestG)} grams. ${changeText}.`}>
        <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{fmtGramsValue(latestG)} g</Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
          {changeText}
          {when ? ` · weighed ${when.toLowerCase()}` : ''}
        </Text>
      </View>

      {sorted.length >= 2 ? <WeightChart points={sorted} /> : null}

      {trendFailed ? (
        <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
          Couldn&apos;t check the 30-day weight trend. Pull down to refresh.
        </Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, padding: 12, gap: 4 },
});
