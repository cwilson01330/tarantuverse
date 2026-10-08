/**
 * Weight chart — a small line chart of an animal's weigh-ins, drawn with
 * react-native-svg (no chart dependency).
 *
 * Parity with the HV web chart: grams on the y axis, one dot per weigh-in,
 * a teal line. Because a phone is narrow it labels only the extremes — the
 * lowest and highest weight on the y axis and the first and last dates on
 * the x axis — instead of a tick per point.
 *
 * Behaviour at the edges:
 *   - 0 points: renders nothing (the caller owns the empty state).
 *   - 1 point: just the value and its date; a line through one point says
 *     nothing, so none is drawn.
 *   - all weights equal: a flat line through the middle with one y label.
 *
 * Points are placed on a real time axis, so two weigh-ins a day apart sit
 * close together and two a month apart don't. Every colour comes from
 * useTheme(); text uses the shared TYPE scale.
 */
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';

export interface WeightChartPoint {
  weighed_at: string;
  weight_g: string | number;
}

const CHART_HEIGHT = 168;
const PAD = { left: 48, right: 10, top: 10, bottom: 24 };
const DOT_R = 3;
const LINE_W = 2;

/** 5 → "5", 12.34 → "12.3", 1234.5 → "1,235" (matches the stat strip). */
export function fmtGramsValue(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : String(Number(n.toFixed(1)));
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Parsed {
  ts: number;
  grams: number;
  iso: string;
}

function parsePoints(points: WeightChartPoint[]): Parsed[] {
  return points
    .map((p) => ({ ts: new Date(p.weighed_at).getTime(), grams: Number(p.weight_g), iso: p.weighed_at }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.grams))
    .sort((a, b) => a.ts - b.ts);
}

export function WeightChart({ points }: { points: WeightChartPoint[] }) {
  const { colors, layout } = useTheme();
  const [width, setWidth] = useState(0);
  const data = useMemo(() => parsePoints(points), [points]);

  if (data.length === 0) return null;

  const first = data[0];
  const last = data[data.length - 1];

  if (data.length === 1) {
    return (
      <View
        style={[
          styles.single,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
        ]}
        accessible
        accessibilityLabel={`One weigh-in: ${fmtGramsValue(first.grams)} g on ${shortDate(first.iso)}`}
      >
        <Text style={[TYPE.heading, { color: colors.textPrimary }]}>{fmtGramsValue(first.grams)} g</Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{shortDate(first.iso)}</Text>
      </View>
    );
  }

  const summary = `Weight from ${fmtGramsValue(first.grams)} g to ${fmtGramsValue(last.grams)} g over ${data.length} weigh-ins`;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.frame,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
    >
      {width > 0 ? <Plot data={data} width={width} /> : <View style={{ height: CHART_HEIGHT }} />}
    </View>
  );
}

function Plot({ data, width }: { data: Parsed[]; width: number }) {
  const { colors } = useTheme();
  const fontSize = TYPE.caption.fontSize;

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  // Keep dots fully inside the plot so the extremes aren't clipped.
  const innerTop = PAD.top + DOT_R + 1;
  const innerBottom = PAD.top + plotH - DOT_R - 1;

  const minG = Math.min(...data.map((d) => d.grams));
  const maxG = Math.max(...data.map((d) => d.grams));
  const flat = maxG === minG;
  const minTs = data[0].ts;
  const maxTs = data[data.length - 1].ts;
  const sameInstant = maxTs === minTs;

  const xOf = (ts: number) =>
    PAD.left + (sameInstant ? plotW / 2 : ((ts - minTs) / (maxTs - minTs)) * plotW);
  const yOf = (g: number) =>
    flat ? (innerTop + innerBottom) / 2 : innerBottom - ((g - minG) / (maxG - minG)) * (innerBottom - innerTop);

  const coords = data.map((d) => ({ x: xOf(d.ts), y: yOf(d.grams) }));
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const gridYs = flat
    ? [(innerTop + innerBottom) / 2]
    : [innerTop, (innerTop + innerBottom) / 2, innerBottom];
  const textDy = fontSize * 0.35;
  const baseY = CHART_HEIGHT - 6;

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {gridYs.map((y) => (
        <Line
          key={y}
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={y}
          y2={y}
          stroke={colors.border}
          strokeWidth={1}
        />
      ))}

      {/* y labels: the highest and lowest weight (one label when flat) */}
      {flat ? (
        <SvgText
          x={PAD.left - 6}
          y={gridYs[0]}
          dy={textDy}
          fontSize={fontSize}
          fill={colors.textTertiary}
          textAnchor="end"
        >
          {`${fmtGramsValue(maxG)} g`}
        </SvgText>
      ) : (
        <>
          <SvgText
            x={PAD.left - 6}
            y={innerTop}
            dy={textDy}
            fontSize={fontSize}
            fill={colors.textTertiary}
            textAnchor="end"
          >
            {`${fmtGramsValue(maxG)} g`}
          </SvgText>
          <SvgText
            x={PAD.left - 6}
            y={innerBottom}
            dy={textDy}
            fontSize={fontSize}
            fill={colors.textTertiary}
            textAnchor="end"
          >
            {`${fmtGramsValue(minG)} g`}
          </SvgText>
        </>
      )}

      <Polyline
        points={polyline}
        fill="none"
        stroke={colors.accent}
        strokeWidth={LINE_W}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((c, i) => (
        <Circle key={`${data[i].ts}-${i}`} cx={c.x} cy={c.y} r={DOT_R} fill={colors.accent} />
      ))}

      {/* x labels: first and last weigh-in dates */}
      <SvgText
        x={PAD.left}
        y={baseY}
        fontSize={fontSize}
        fill={colors.textTertiary}
        textAnchor="start"
      >
        {shortDate(data[0].iso)}
      </SvgText>
      <SvgText
        x={PAD.left + plotW}
        y={baseY}
        fontSize={fontSize}
        fill={colors.textTertiary}
        textAnchor="end"
      >
        {shortDate(data[data.length - 1].iso)}
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
  single: { borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
});
