import React from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { stepModel } from '../../lib/analytics-view';
import { useMeasuredWidth } from './useMeasuredWidth';

/** Chart height from README §6. */
const STEP_HEIGHT = 70;
/** The first-value label sits just right of the line's first vertical rise (x = 6). */
const FIRST_LABEL_X = 10;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface StepLineProps {
  /** Animals ADDED per month ("YYYY-MM"), sparse; the model accumulates it. */
  series: { month: string; count: number }[];
  /** Animals already owned before the first month (`growthBaseline`). Default 0. */
  baseline?: number;
  /** Measured through onLayout when omitted. */
  width?: number;
  height?: number;
  /** Preview / sample state: 40% opacity. */
  muted?: boolean;
}

/** A running count as a stepped line (README §6 `StepLine`). 0 points: the sentence only. */
export function StepLine({ series, baseline = 0, width: widthProp, height = STEP_HEIGHT, muted = false }: StepLineProps) {
  const { colors } = useTheme();
  const { width, onLayout } = useMeasuredWidth(widthProp);

  if (width <= 0) return <View onLayout={onLayout} />;

  const model = stepModel(series, width, height, baseline);
  const end = model.end;
  const single = model.points.length === 1;
  const dim = muted ? 0.4 : 1;

  // Where the first value is printed: just above the line's start (`model.startY`:
  // the baseline when the line starts at the animals already owned, else the first
  // point). When the first rise is too short to clear the label, sit above the
  // first horizontal run instead so the text never crosses the line.
  const firstPoint = model.points[0];
  const firstBase = firstPoint
    ? (model.startY - firstPoint.y > 16 ? model.startY : Math.min(model.startY, firstPoint.y))
    : 0;
  const firstY = firstPoint ? Math.max(9, firstBase - 7) : 0;
  // The last point is the highest, so there is rarely room above it: with less than
  // 15pt above the dot, the label goes to its left (vertically centred) instead of on it.
  const endLeft = end != null && end.y < 15;
  const endLabelX = end ? (endLeft ? end.x - 10 : end.x) : 0;
  const endLabelY = end ? (endLeft ? end.y + 3 : end.y - 9) : 0;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={model.a11y}
    >
      {end && (
        <Svg width={width} height={single ? height + 16 : height}>
          <React.Fragment>
            {single ? (
              <Path
                d={`M6 ${end.y} H${Math.max(6, width - 6)}`}
                stroke={colors.border}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
              />
            ) : (
              <React.Fragment>
                <Path d={model.area} fill={colors.primary} fillOpacity={0.14 * dim} />
                <Path
                  d={model.line}
                  stroke={colors.primary}
                  strokeOpacity={dim}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
                <SvgText x={FIRST_LABEL_X} y={firstY} fontSize={9} fontWeight="400" fill={colors.textTertiary}>
                  {String(model.first)}
                </SvgText>
                <SvgText
                  x={endLabelX}
                  y={Math.max(9, endLabelY)}
                  fontSize={9}
                  fontWeight="600"
                  fill={colors.textPrimary}
                  textAnchor="end"
                >
                  {String(model.last)}
                </SvgText>
              </React.Fragment>
            )}
            <Circle cx={end.x} cy={end.y} r={6} fill={colors.surface} />
            <Circle cx={end.x} cy={end.y} r={4} fill={colors.primary} fillOpacity={dim} />
            {single && (
              <SvgText
                x={end.x}
                y={end.y + 16}
                fontSize={10}
                fontWeight="400"
                fill={colors.textTertiary}
                textAnchor="middle"
              >
                {MONTH_ABBR[Number(model.points[0].month.slice(5, 7)) - 1] ?? ''}
              </SvgText>
            )}
          </React.Fragment>
        </Svg>
      )}
      <RNText
        style={{
          ...TYPE.label,
          fontWeight: '400',
          color: colors.textSecondary,
          marginTop: end ? SPACING.sm : 0,
        }}
      >
        {model.sentence}
      </RNText>
    </View>
  );
}
