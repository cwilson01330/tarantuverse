import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../contexts/ThemeContext';
import { useUnits } from '../hooks/useUnits';
import { SPACING, TYPE } from '../theme/tokens';
import { formatLength, formatLengthRate, lengthValue } from '../lib/units';

interface GrowthDataPoint {
  date: string;
  weight?: number;
  leg_span?: number;
  days_since_previous?: number;
  weight_change?: number;
  leg_span_change?: number;
}

interface GrowthAnalytics {
  tarantula_id: string;
  data_points: GrowthDataPoint[];
  total_molts: number;
  average_days_between_molts?: number;
  total_weight_gain?: number;
  total_leg_span_gain?: number;
  growth_rate_weight?: number;
  growth_rate_leg_span?: number;
  last_molt_date?: string;
  days_since_last_molt?: number;
}

interface GrowthChartProps {
  data: GrowthAnalytics;
  /** Label for the linear measurement — "Leg Span" for spiders (default),
   *  "Body Length" for scorpions/centipedes etc. (ADR-008 growth module). */
  lengthLabel?: string;
}

type DateRange = 'all' | '1y' | '6m' | '3m';
type Metric = 'weight' | 'leg_span' | 'both';

// ───────────────────────────── chart grammar (README §6) ─────────────────────────────
// One stepped line per measurement: a spider's size and weight only change at a
// molt, so the line holds its value until the next one. No y-axis, no gridlines,
// no legend; first value left and last value right under the line; one sentence
// underneath; one spoken label. Weight (g) and length (in / cm) are different
// units, so they are two charts, never two lines on a shared axis.

/** Chart height from README §6. */
const LINE_HEIGHT = 70;
/** Room for the end dot (r4) and its 2pt ring. */
const PAD_X = 6;
const PAD_Y = 8;
/** Touch target (Global Constraints). */
const MIN_TOUCH = 44;

interface SeriesPoint {
  /** Timestamp (ms). */
  t: number;
  /** The number drawn: grams, or the length in the keeper's units. */
  v: number;
  /** What the keeper reads: "8.4 g", "3.5 in". */
  text: string;
}

const RANGE_LABEL: Record<DateRange, string> = { '3m': '3M', '6m': '6M', '1y': '1Y', all: 'All' };

function shortDate(t: number): string {
  return format(new Date(t), 'MMM d, yyyy');
}

function monthYear(t: number): string {
  return format(new Date(t), 'MMM yyyy');
}

/** "Leg Span" / "BODY LENGTH" -> "Leg span", for the middle of a sentence. */
function sentenceCase(label: string): string {
  const s = (label ?? '').trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Points sharing one timestamp (or a single point) draw as one dot. */
function collapseSamePoint(points: SeriesPoint[]): SeriesPoint[] {
  if (points.length < 2) return points;
  return points[0].t === points[points.length - 1].t ? [points[points.length - 1]] : points;
}

/** The one sentence under a chart, and the spoken label (0 / 1 / flat / many). */
function describeSeries(name: string, points: SeriesPoint[]): { sentence: string; a11y: string } {
  const subject = sentenceCase(name);
  if (points.length === 0) {
    const sentence = `No ${subject.toLowerCase()} measurements in this range.`;
    return { sentence, a11y: sentence };
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) {
    const sentence = `${subject} was ${last.text} on ${shortDate(last.t)}.`;
    return { sentence, a11y: sentence };
  }
  if (first.v === last.v && points.every((p) => p.v === first.v)) {
    const sentence = `No change in ${subject.toLowerCase()} since ${shortDate(first.t)}: still ${last.text}.`;
    return { sentence, a11y: `${subject} over ${points.length} measurements: ${sentence}` };
  }
  const span = `${monthYear(first.t)} to ${monthYear(last.t)}`;
  return {
    sentence: `${subject} went from ${first.text} to ${last.text} across ${points.length} measurements (${span}).`,
    a11y: `${subject} over ${points.length} measurements, ${span}, from ${first.text} to ${last.text}`,
  };
}

/** Stepped-line geometry: `line` is the polyline, `area` the same closed to the baseline. */
function stepGeometry(points: SeriesPoint[], width: number, height: number) {
  const t0 = points[0].t;
  const span = points[points.length - 1].t - t0;
  const innerW = Math.max(0, width - 2 * PAD_X);
  const top = PAD_Y;
  const bottom = Math.max(top, height - PAD_Y);
  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const xFor = (t: number) => (span === 0 ? width / 2 : PAD_X + ((t - t0) / span) * innerW);
  const yFor = (v: number) => (hi === lo ? (top + bottom) / 2 : bottom - ((v - lo) / (hi - lo)) * (bottom - top));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const xy = points.map((p) => ({ x: r2(xFor(p.t)), y: r2(yFor(p.v)) }));
  let line = `M${xy[0].x} ${xy[0].y}`;
  for (let i = 1; i < xy.length; i++) line += ` H${xy[i].x} V${xy[i].y}`;
  const area = `${line} V${height} H${xy[0].x} Z`;
  return { line, area, end: xy[xy.length - 1] };
}

/** One measurement as a stepped line with its title, end labels and sentence. */
function GrowthLine({ title, points }: { title: string; points: SeriesPoint[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  const drawn = collapseSamePoint(points);
  const { sentence, a11y } = describeSeries(title, points);
  const single = drawn.length === 1;
  const hasChart = drawn.length > 0 && width > 0;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}
      style={{ marginBottom: SPACING.lg }}
    >
      <Text style={{ ...TYPE.bodyStrong, color: colors.textPrimary, marginBottom: SPACING.sm }}>{title}</Text>

      {hasChart && single && (
        // 1 point: a flat track with a dot and the date under it.
        <Svg width={width} height={44}>
          <Path d={`M${PAD_X} 16 H${Math.max(PAD_X, width - PAD_X)}`} stroke={colors.border} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <Circle cx={width / 2} cy={16} r={6} fill={colors.surface} />
          <Circle cx={width / 2} cy={16} r={4} fill={colors.primary} />
        </Svg>
      )}

      {hasChart && !single && (() => {
        const g = stepGeometry(drawn, width, LINE_HEIGHT);
        return (
          <Svg width={width} height={LINE_HEIGHT}>
            <Path d={g.area} fill={colors.primary} fillOpacity={0.14} />
            <Path
              d={g.line}
              stroke={colors.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx={g.end.x} cy={g.end.y} r={6} fill={colors.surface} />
            <Circle cx={g.end.x} cy={g.end.y} r={4} fill={colors.primary} />
          </Svg>
        );
      })()}

      {hasChart && single && (
        <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: SPACING.xs }}>
          {monthYear(drawn[0].t)}
        </Text>
      )}

      {hasChart && !single && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.xs }}>
          <Text style={{ fontSize: 9, fontWeight: '400', color: colors.textTertiary }}>{drawn[0].text}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textPrimary }}>{drawn[drawn.length - 1].text}</Text>
        </View>
      )}

      <Text
        style={{
          ...TYPE.label,
          fontWeight: '400',
          color: colors.textSecondary,
          marginTop: hasChart ? SPACING.sm : 0,
        }}
      >
        {sentence}
      </Text>
    </View>
  );
}

// ───────────────────────────── the component ─────────────────────────────

const GrowthChart: React.FC<GrowthChartProps> = ({ data, lengthLabel = 'Leg Span' }) => {
  const { colors, layout } = useTheme();
  // Leg span / body length is stored in inches; shown in the keeper's units.
  const { units } = useUnits();
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [metric, setMetric] = useState<Metric>('both');

  // Filter data based on selected date range
  const filterDataByRange = (points: GrowthDataPoint[]) => {
    if (dateRange === 'all') return points;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case '1y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case '6m':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '3m':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }

    return points.filter((point) => new Date(point.date) >= cutoffDate);
  };

  const filteredData = filterDataByRange(data.data_points);

  // One list per measurement, oldest first. Lengths are stored in inches and go
  // through the units helpers; weights are grams for everyone.
  const weightPoints: SeriesPoint[] = [];
  const lengthPoints: SeriesPoint[] = [];
  for (const point of filteredData) {
    const t = new Date(point.date).getTime();
    if (!Number.isFinite(t)) continue;
    if (point.weight) {
      const grams = parseFloat(point.weight.toString());
      if (Number.isFinite(grams)) weightPoints.push({ t, v: grams, text: `${Number(grams.toFixed(1))} g` });
    }
    if (point.leg_span) {
      const shown = Number(lengthValue(point.leg_span, units));
      const text = formatLength(point.leg_span, units);
      if (Number.isFinite(shown) && text) lengthPoints.push({ t, v: shown, text });
    }
  }
  weightPoints.sort((a, b) => a.t - b.t);
  lengthPoints.sort((a, b) => a.t - b.t);

  // Whether the animal has any weight / length at all (the selector's enabled state
  // does not depend on the chosen range).
  const hasWeightData = data.data_points.some((p) => !!p.weight);
  const hasLegSpanData = data.data_points.some((p) => !!p.leg_span);

  if (data.total_molts === 0) {
    return (
      <View style={{ backgroundColor: colors.surface, padding: layout.density.cardPadding }}>
        <Text style={{ ...TYPE.subheading, color: colors.textPrimary }}>Growth Tracking</Text>
        <View style={{ alignItems: 'center', paddingVertical: SPACING.xxl, gap: SPACING.md }}>
          <MaterialCommunityIcons name="chart-line" size={30} color={colors.primary} />
          <Text style={{ ...TYPE.body, color: colors.textSecondary, textAlign: 'center' }}>
            No molt data recorded yet. Add molt logs to track growth over time.
          </Text>
        </View>
      </View>
    );
  }

  const showWeight = (metric === 'both' || metric === 'weight') && hasWeightData;
  const showLength = (metric === 'both' || metric === 'leg_span') && hasLegSpanData;

  const segment = (
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
    disabled = false,
  ) => (
    <TouchableOpacity
      key={key}
      style={{
        flex: 1,
        minHeight: MIN_TOUCH,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.sm,
        borderRadius: layout.radius.sm,
        backgroundColor: active ? colors.surface : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
    >
      <Text
        numberOfLines={1}
        style={{
          ...TYPE.caption,
          fontWeight: '600',
          color: disabled ? colors.textTertiary : active ? colors.primary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const group = (children: React.ReactNode) => (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        padding: 2,
        gap: 2,
        borderRadius: layout.radius.md,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      {children}
    </View>
  );

  const tile = (label: string, value: string, color: string) => (
    <View
      style={{
        minWidth: '47%',
        flexGrow: 1,
        borderRadius: layout.radius.md,
        padding: SPACING.md,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Text style={{ ...TYPE.caption, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
        {label}
      </Text>
      <Text style={{ ...TYPE.title, color }}>{value}</Text>
    </View>
  );

  const lengthGain = data.total_leg_span_gain ? formatLength(data.total_leg_span_gain, units) : null;
  const lengthRate = data.growth_rate_leg_span ? formatLengthRate(data.growth_rate_leg_span, units) : null;

  return (
    <View style={{ backgroundColor: colors.surface }}>
      <View
        style={{
          padding: layout.density.cardPadding,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ ...TYPE.subheading, color: colors.textPrimary }}>Growth Tracking</Text>
      </View>

      {/* Metric selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.density.cardPadding, paddingTop: SPACING.sm }}>
        <Text style={{ ...TYPE.bodyStrong, color: colors.textPrimary, width: 64 }}>Metric</Text>
        {group(
          <>
            {segment('both', 'Both', metric === 'both', () => setMetric('both'))}
            {segment('weight', 'Weight', metric === 'weight', () => hasWeightData && setMetric('weight'), !hasWeightData)}
            {segment('leg_span', lengthLabel, metric === 'leg_span', () => hasLegSpanData && setMetric('leg_span'), !hasLegSpanData)}
          </>,
        )}
      </View>

      {/* Date range selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.density.cardPadding, paddingVertical: SPACING.sm }}>
        <Text style={{ ...TYPE.bodyStrong, color: colors.textPrimary, width: 64 }}>Range</Text>
        {group(
          (['3m', '6m', '1y', 'all'] as DateRange[]).map((range) =>
            segment(range, RANGE_LABEL[range], dateRange === range, () => setDateRange(range)),
          ),
        )}
      </View>

      {/* Summary Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: layout.density.cardPadding, gap: SPACING.md }}>
        {tile('Total Molts', String(data.total_molts), colors.textPrimary)}
        {data.average_days_between_molts
          ? tile('Avg Days Between', String(Math.round(data.average_days_between_molts)), colors.textPrimary)
          : null}
        {data.total_weight_gain
          ? tile('Weight Gain', `+${parseFloat(data.total_weight_gain.toString()).toFixed(1)}g`, colors.success)
          : null}
        {lengthGain ? tile('Size Gain', `+${lengthGain}`, colors.info) : null}
      </View>

      {/* Charts: one stepped line per measurement */}
      <View style={{ paddingHorizontal: layout.density.cardPadding, paddingTop: SPACING.sm }}>
        {showWeight && <GrowthLine title="Weight" points={weightPoints} />}
        {showLength && <GrowthLine title={lengthLabel} points={lengthPoints} />}
        {!showWeight && !showLength && (
          <Text style={{ ...TYPE.label, fontWeight: '400', color: colors.textSecondary, marginBottom: SPACING.lg }}>
            No weight or size logged with these molts yet. Add one to a molt and the chart appears.
          </Text>
        )}
      </View>

      {/* Growth Rate Info */}
      {(data.growth_rate_weight || lengthRate || data.days_since_last_molt !== undefined) && (
        <View style={{ padding: layout.density.cardPadding, paddingTop: 0, gap: SPACING.sm }}>
          {data.growth_rate_weight ? (
            <Text style={{ ...TYPE.label, fontWeight: '400', lineHeight: 20 }}>
              <Text style={{ color: colors.textSecondary }}>Weight Growth Rate: </Text>
              <Text style={{ fontWeight: '600', color: colors.success }}>
                {parseFloat(data.growth_rate_weight.toString()).toFixed(2)}g/mo
              </Text>
            </Text>
          ) : null}
          {lengthRate ? (
            <Text style={{ ...TYPE.label, fontWeight: '400', lineHeight: 20 }}>
              <Text style={{ color: colors.textSecondary }}>Size Growth Rate: </Text>
              <Text style={{ fontWeight: '600', color: colors.info }}>{lengthRate}</Text>
            </Text>
          ) : null}
          {data.days_since_last_molt !== undefined && (
            <Text style={{ ...TYPE.label, fontWeight: '400', lineHeight: 20 }}>
              <Text style={{ color: colors.textSecondary }}>Days Since Last Molt: </Text>
              <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{data.days_since_last_molt}</Text>
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default GrowthChart;
