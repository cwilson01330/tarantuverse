/**
 * Building blocks every Analytics card shares, so each card spells its look once:
 * card shell, heading row, big figure, hairline, buttons, link colour.
 * Colours come from `useTheme().colors`, radii/elevation from `layout`, spacing
 * and type from the tokens. The only literals are the README's fixed semantic
 * colours (via the lib) and white text on a primary fill.
 */
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Card } from '../ui';
import { pickContrasting } from '../../lib/chart-helpers';
import { SPACING, TYPE } from '../../theme/tokens';
import { ON_PRIMARY } from '../../utils/status-colors';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Text on a primary/gradient fill (README: white 13/700). Defined in status-colors. */
export { ON_PRIMARY };

/** Touch target floor (Global Constraints). */
export const MIN_TOUCH = 44;

/** Card: radius `lg`, elevation from the preset (Hobbyist shadow, Keeper 1px border). `sample` = the grey dashed look. */
export function AnalyticsCard({
  children,
  sample = false,
  style,
}: {
  children: React.ReactNode;
  sample?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, layout } = useTheme();
  return (
    <Card
      style={[
        { borderRadius: layout.radius.lg, gap: SPACING.md },
        sample && {
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          shadowOpacity: 0,
          elevation: 0,
        },
        style,
      ]}
    >
      {children}
    </Card>
  );
}

/** Icon + 15/700 title, optional quiet trailing text. */
export function CardHeading({
  icon,
  title,
  trailing,
  iconColor,
}: {
  icon: IconName;
  title: string;
  trailing?: string;
  iconColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.headingRow}>
      <MaterialCommunityIcons name={icon} size={18} color={iconColor ?? colors.accent} />
      <Text accessibilityRole="header" style={[styles.headingTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {trailing ? <Text style={[styles.headingTrailing, { color: colors.textTertiary }]}>{trailing}</Text> : null}
    </View>
  );
}

/** A big 24/700 figure with its 11/400 caption (and an optional quieter line). */
export function Figure({
  value,
  caption,
  sub,
  muted = false,
}: {
  value: string;
  caption: string;
  sub?: string | null;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.figure}>
      <Text numberOfLines={1} style={[styles.figureValue, { color: muted ? colors.textTertiary : colors.textPrimary }]}>
        {value}
      </Text>
      <Text style={[styles.figureCaption, { color: colors.textTertiary }]}>{caption}</Text>
      {sub ? (
        <Text numberOfLines={1} style={[styles.figureCaption, { color: colors.textTertiary }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function Hairline() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

/**
 * The link colour: README asks for `accent`, which a custom theme can make too
 * pale to read as text. The first of accent / primary / their tints / body text
 * that clears 4.5:1 on the card wins.
 */
export function useLinkColor(): string {
  const { colors } = useTheme();
  return pickContrasting(
    colors.surface,
    [colors.accent, colors.primary, colors.primaryLight, colors.primaryDark, colors.textPrimary],
    4.5,
  );
}

/** "n more species →" / "All 12 →": 13/600 link text on a 44pt row. */
export function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const color = useLinkColor();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label.replace('→', '').trim()}
      style={styles.linkRow}
    >
      <Text style={[styles.linkText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Outlined 44pt button (Try again, Change, Cancel). */
export function OutlineButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, layout } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[
        styles.outlineButton,
        { borderColor: colors.border, borderRadius: layout.radius.sm, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headingTitle: { flex: 1, ...TYPE.cardTitle },
  headingTrailing: { ...TYPE.note },
  figure: { flexShrink: 1 },
  figureValue: { ...TYPE.figure },
  figureCaption: { ...TYPE.micro },
  linkRow: { minHeight: MIN_TOUCH, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...TYPE.smallStrong },
  outlineButton: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...TYPE.smallStrong },
});
