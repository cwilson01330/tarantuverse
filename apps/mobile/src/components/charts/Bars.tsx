import React from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { MUTED_SAMPLE } from '../../utils/status-colors';
import { barsModel } from '../../lib/analytics-view';
import { pickContrasting } from '../../lib/chart-helpers';
import { useMeasuredWidth } from './useMeasuredWidth';

/** README §6: bars are drawn with radius 3. */
const BAR_RADIUS = 3;
/** README §6: grey sample bars. The one fixed non-theme colour the brief allows besides the semantic set. */
const MUTED_BAR = MUTED_SAMPLE;

export interface BarsProps {
  /** Sparse monthly counts ("YYYY-MM"); months with none may be absent. */
  series: { month: string; count: number }[];
  /** The 12-month window ends at this date's month. Required: a chart must never guess "now". */
  now: Date;
  /** Measured through onLayout when omitted. */
  width?: number;
  /** Preview / sample state: grey bars, quiet value. */
  muted?: boolean;
  /** Replaces the sentence under the chart (the zero-animal sample's own line). The spoken label is unchanged. */
  sentence?: string;
}

/** Monthly counts as twelve bars (README §6 `Bars`). 0 total: the sentence only. */
export function Bars({ series, now, width: widthProp, muted = false, sentence }: BarsProps) {
  const { colors } = useTheme();
  const { width, onLayout } = useMeasuredWidth(widthProp);

  if (width <= 0) return <View onLayout={onLayout} />;

  const model = barsModel(series, width, now);
  const chartH = model.height + model.labelHeight;
  // `secondary` is user-chosen and some presets are near-black: on a dark card the
  // tallest bar would vanish. Fall back to a tint that reads (>= 3:1) against the card.
  const maxFill = pickContrasting(colors.surface, [colors.secondary, colors.primaryLight, colors.primaryDark]);

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={model.a11y}
    >
      {model.bars.length > 0 && (
        <Svg width={width} height={chartH}>
          {model.bars.map((bar) => {
            const fill = bar.value === 0
              ? colors.border
              : muted
                ? MUTED_BAR
                : bar.isMax
                  ? maxFill
                  : colors.primary;
            const cx = bar.x + bar.w / 2;
            return (
              <React.Fragment key={bar.month}>
                <Rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={bar.h}
                  rx={Math.min(BAR_RADIUS, bar.h / 2)}
                  fill={fill}
                />
                {bar.isMax && (
                  <SvgText
                    x={cx}
                    y={bar.y - 3}
                    fontSize={11}
                    fontWeight="600"
                    fill={muted ? colors.textTertiary : colors.textPrimary}
                    textAnchor="middle"
                  >
                    {String(bar.value)}
                  </SvgText>
                )}
                <SvgText
                  x={cx}
                  y={model.height + 12}
                  fontSize={10}
                  fontWeight="400"
                  fill={colors.textTertiary}
                  textAnchor="middle"
                >
                  {bar.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      <RNText
        style={{
          ...TYPE.label,
          fontWeight: '400',
          color: colors.textSecondary,
          marginTop: model.bars.length > 0 ? SPACING.sm : 0,
        }}
      >
        {sentence ?? model.sentence}
      </RNText>
    </View>
  );
}
