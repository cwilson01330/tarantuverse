import React from 'react';
import { Text as RNText, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { splitModel, type SplitPart } from '../../lib/analytics-view';

const BAR_HEIGHT = 8;
const BAR_GAP = 2;
const BAR_RADIUS = 4;
const SWATCH = 8;
const MUTED_OPACITY = 0.4;

export interface SplitBarPart extends SplitPart {
  /** Optional legend glyph (e.g. a gender icon) shown instead of the 8pt swatch. */
  glyph?: React.ReactNode;
}

export interface SplitBarProps {
  parts: SplitBarPart[];
  /** Preview / sample state: 40% opacity. */
  muted?: boolean;
}

/**
 * A split as one 8pt bar plus a legend that always lists every category
 * (README §6 `SplitBar`). Only one filled category: the model's sentence takes
 * the bar's place. Segments are flexed Views, so no width is needed.
 */
export function SplitBar({ parts, muted = false }: SplitBarProps) {
  const { colors } = useTheme();
  const model = splitModel(parts);
  const dim = muted ? MUTED_OPACITY : 1;
  const hasBar = model.segments.length >= 2;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={model.a11y}>
      {hasBar ? (
        <View style={{ flexDirection: 'row', height: BAR_HEIGHT, opacity: dim }}>
          {model.segments.map((seg, i) => (
            <View
              key={i}
              style={{
                flex: seg.flex,
                backgroundColor: seg.color,
                borderRadius: BAR_RADIUS,
                marginLeft: i === 0 ? 0 : BAR_GAP,
              }}
            />
          ))}
        </View>
      ) : model.sentence ? (
        <RNText style={{ ...TYPE.label, fontWeight: '400', color: colors.textSecondary }}>
          {model.sentence}
        </RNText>
      ) : (
        // Nothing in any category: an empty track, so the card still has its shape.
        <View style={{ height: BAR_HEIGHT, borderRadius: BAR_RADIUS, backgroundColor: colors.surfaceElevated }} />
      )}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: SPACING.md,
          rowGap: SPACING.xs,
          marginTop: SPACING.sm,
        }}
      >
        {model.legend.map((item, i) => {
          const glyph = parts[i]?.glyph;
          return (
            <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {glyph ?? (
                <View
                  style={{
                    width: SWATCH,
                    height: SWATCH,
                    borderRadius: SWATCH / 2,
                    backgroundColor: item.color,
                    opacity: dim,
                  }}
                />
              )}
              <RNText style={{ ...TYPE.caption, fontWeight: '400', color: colors.textSecondary }}>
                {item.label}
              </RNText>
            </View>
          );
        })}
      </View>
    </View>
  );
}
