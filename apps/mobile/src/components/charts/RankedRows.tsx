import React from 'react';
import { PixelRatio, Pressable, Text as RNText, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { MUTED_SAMPLE } from '../../utils/status-colors';
import type { RankedRow } from '../../lib/analytics-view';
import { rankedValueWidth } from '../../lib/chart-helpers';

const TRACK_HEIGHT = 8;
const ROW_GAP = SPACING.sm;
/** Touch target (Global Constraints). */
const MIN_TOUCH = 44;
const MUTED_FILL = MUTED_SAMPLE;

export interface RankedRowsProps {
  rows: RankedRow[];
  /** Name column width: 64 on mobile (README §6). */
  labelWidth?: number;
  /** Tapping a row with an `id` (animals) calls this; rows without one (species) aren't tappable. */
  onPressRow?: (row: RankedRow) => void;
  /** Species names are scientific names: set italics. */
  italicLabels?: boolean;
  /** Preview / sample state: grey fills. */
  muted?: boolean;
  /**
   * Width of the figure column. Computed from `rows` when omitted. A virtualised
   * list that renders one row at a time passes the width of the WHOLE list
   * (`rankedValueWidth`), so every track in it stays the same length.
   */
  valueWidth?: number;
}

/** Label, 8pt track with a fill scaled to the largest, then the figure (README §6 `RankedRows`). */
export function RankedRows({
  rows,
  labelWidth = 64,
  onPressRow,
  italicLabels = false,
  muted = false,
  valueWidth: valueWidthProp,
}: RankedRowsProps) {
  const { colors } = useTheme();
  // One width for the whole card (so every track is the same length and the fills
  // compare), sized to its longest figure and the system font scale.
  const valueWidth =
    typeof valueWidthProp === 'number' && valueWidthProp > 0
      ? valueWidthProp
      : rankedValueWidth(rows, PixelRatio.getFontScale());

  const renderRow = (row: RankedRow) => {
    const pct = Math.max(0, Math.min(1, Number.isFinite(row.fraction) ? row.fraction : 0)) * 100;
    const body = (
      <>
        <RNText
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            ...TYPE.label,
            fontWeight: '400',
            fontStyle: italicLabels ? 'italic' : 'normal',
            color: colors.textSecondary,
            width: labelWidth,
          }}
        >
          {row.label}
        </RNText>
        <View
          style={{
            flex: 1,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.surfaceElevated,
            overflow: 'hidden',
          }}
        >
          {!row.none && pct > 0 && (
            <View
              style={{
                width: `${pct}%`,
                height: TRACK_HEIGHT,
                borderRadius: TRACK_HEIGHT / 2,
                backgroundColor: muted ? MUTED_FILL : colors.primary,
              }}
            />
          )}
        </View>
        <View style={{ width: valueWidth, alignItems: 'flex-end' }}>
          {row.none ? (
            <RNText numberOfLines={1} style={{ ...TYPE.label, fontWeight: '400', color: colors.textTertiary }}>
              {row.value}
            </RNText>
          ) : (
            <RNText numberOfLines={1} style={{ ...TYPE.label, fontWeight: '600', color: colors.textPrimary }}>
              {row.value}
              {row.detail ? (
                <RNText style={{ fontWeight: '400', color: colors.textTertiary }}>{` · ${row.detail}`}</RNText>
              ) : null}
            </RNText>
          )}
        </View>
      </>
    );

    const rowStyle = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: ROW_GAP,
      minHeight: 28,
    };

    if (onPressRow && row.id != null) {
      return (
        <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={row.a11y}
          onPress={() => onPressRow(row)}
          style={{ ...rowStyle, minHeight: MIN_TOUCH }}
        >
          {body}
        </Pressable>
      );
    }
    return (
      <View key={row.key} accessible accessibilityLabel={row.a11y} style={rowStyle}>
        {body}
      </View>
    );
  };

  return <View>{rows.map(renderRow)}</View>;
}
