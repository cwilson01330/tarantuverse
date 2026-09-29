/**
 * The population card — design handoff, screen 8, "Colony detail" item 2.
 *
 * Replaces the 200px hero photo as the first thing on the screen, because
 * nobody opens a colony to look at it — they open it to see how many there
 * are and which way it's going:
 *
 *   660 est.                      ↑ +106
 *   population today              last 30 days
 *   ▁▂▂▃▃▄▄▅▅▆▇█   12 weekly bars
 *   Nymphs   ████████████░░  560
 *   Adults   ███░░░░░░░░░░░  100
 *
 * Everything comes from data the screen already fetches: the replayed
 * population history (points = the total after each logged change) and the
 * stored stage_counts. Nothing is projected forward (see
 * colony_history_service: observed, never forecast). The full line chart
 * with its growth-rate caveats stays one tap away.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/tokens';
import { formatColonyCount, sumStageCounts, type PopulationHistory, type StageCounts } from '../../lib/colonies';
import { parseLocalDate } from '../../utils/date';
import { stageEntries, useStageColors } from '../StageBar';
import { ColonyPopulationChart } from '../ColonyPopulationChart';

const WEEKS = 12;
// Shape radii derived from bar/track size (hairline rounding and a pill),
// not surface radii — the theme's layout.radius scale starts at 8.
const BAR_ROUND = 2;
const TRACK_H = 7;
const TREND_DAYS = 30;
const DAY = 86_400_000;

/** Population as of the end of `day`: the last replayed point on or before it. */
function totalAsOf(points: PopulationHistory['points'], day: Date): number | null {
  let last: number | null = null;
  for (const p of points) {
    const d = parseLocalDate(p.date);
    if (!d || d.getTime() > day.getTime()) break;
    last = p.total;
  }
  return last;
}

export default function ColonyPopulationCard({
  stageCounts,
  estimated,
  history,
  taxon,
}: {
  stageCounts: StageCounts | null | undefined;
  estimated: boolean;
  history: PopulationHistory | null;
  taxon: string;
}) {
  const { colors, layout } = useTheme();
  const palette = useStageColors();
  const [showChart, setShowChart] = useState(false);
  const total = sumStageCounts(stageCounts);
  const entries = stageEntries(stageCounts);
  const stageTotal = entries.reduce((a, e) => a + e.count, 0);

  const { trend, bars } = useMemo(() => {
    const points = (history?.points ?? []).filter((p) => parseLocalDate(p.date));
    if (points.length === 0) return { trend: null as number | null, bars: [] as (number | null)[] };
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // Trend: only claim one when something was actually counted in the window.
    const windowStart = new Date(today.getTime() - TREND_DAYS * DAY);
    const countedInWindow = points.some((p) => (parseLocalDate(p.date)?.getTime() ?? 0) > windowStart.getTime());
    const now = totalAsOf(points, today) ?? 0;
    const then = totalAsOf(points, windowStart) ?? 0;
    const t = countedInWindow ? now - then : null;
    // Weekly series ending this week; weeks before the first record are empty.
    const b: (number | null)[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      b.push(totalAsOf(points, new Date(today.getTime() - i * 7 * DAY)));
    }
    return { trend: t, bars: b };
  }, [history]);

  const maxBar = Math.max(1, ...bars.map((v) => v ?? 0));
  const hasBars = bars.filter((v) => v != null).length >= 2;
  const trendColor = trend == null || trend === 0 ? colors.textSecondary : trend > 0 ? colors.success : colors.error;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
      <View style={styles.head}>
        <View
          style={styles.flex}
          accessible
          accessibilityLabel={`Population ${estimated ? 'about ' : ''}${total.toLocaleString()}${estimated ? ', estimated' : ''}`}
        >
          <View style={styles.countRow}>
            <Text style={[TYPE.display, { color: colors.textPrimary }]}>{formatColonyCount(total, false)}</Text>
            {estimated ? <Text style={[TYPE.label, { color: colors.textSecondary }]}>est.</Text> : null}
          </View>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>population today</Text>
        </View>
        {trend != null ? (
          <View
            style={styles.trend}
            accessible
            accessibilityLabel={`${trend === 0 ? 'No change' : `${trend > 0 ? 'Up' : 'Down'} ${Math.abs(trend)}`} over the last 30 days`}
          >
            <View style={styles.trendRow}>
              <MaterialCommunityIcons
                name={trend > 0 ? 'trending-up' : trend < 0 ? 'trending-down' : 'trending-neutral'}
                size={18}
                color={trendColor}
              />
              <Text style={[TYPE.subheading, { color: trendColor }]}>
                {trend > 0 ? '+' : trend < 0 ? '−' : '±'}{Math.abs(trend).toLocaleString()}
              </Text>
            </View>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>last 30 days</Text>
          </View>
        ) : null}
      </View>

      {hasBars ? (
        <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {bars.map((v, i) => (
            <View key={i} style={styles.barSlot}>
              <View
                style={{
                  height: v == null ? 2 : Math.max(2, Math.round((v / maxBar) * 44)),
                  borderRadius: BAR_ROUND,
                  // Most recent weeks in full colour, fading back in time.
                  backgroundColor: v == null ? colors.border : colors.primary,
                  opacity: v == null ? 1 : 0.35 + 0.65 * (i / (WEEKS - 1)),
                }}
              />
            </View>
          ))}
        </View>
      ) : null}

      {entries.length > 0 ? (
        <View style={styles.stages}>
          {entries.map((e, i) => (
            <View
              key={e.label}
              style={styles.stageRow}
              accessible
              accessibilityLabel={`${e.label}: ${e.count.toLocaleString()}`}
            >
              <Text style={[TYPE.label, styles.stageLabel, { color: colors.textSecondary }]} numberOfLines={1}>{e.label}</Text>
              <View style={[styles.track, { backgroundColor: colors.border }]}>
                <View style={{ width: `${(e.count / stageTotal) * 100}%`, height: '100%', borderRadius: TRACK_H / 2, backgroundColor: palette[i % palette.length] }} />
              </View>
              <Text style={[TYPE.bodyStrong, styles.stageValue, { color: colors.textPrimary }]}>{e.count.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>No headcount yet — log a recount to set one.</Text>
      )}

      <TouchableOpacity
        onPress={() => setShowChart((v) => !v)}
        style={[styles.chartToggle, { borderTopColor: colors.border }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: showChart }}
      >
        <MaterialCommunityIcons name="history" size={16} color={colors.accent} />
        <Text style={[TYPE.bodyStrong, styles.flex, { color: colors.accent }]}>
          {showChart ? 'Hide population history' : 'Population history'}
        </Text>
        <MaterialCommunityIcons name={showChart ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {showChart ? <ColonyPopulationChart history={history} taxon={taxon} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, padding: 16, gap: 13 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  trend: { alignItems: 'flex-end' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 3 },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  stages: { gap: 8 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageLabel: { width: 84 },
  track: { flex: 1, height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden' },
  stageValue: { minWidth: 44, textAlign: 'right' },
  chartToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingTop: 8, borderTopWidth: 1 },
});
