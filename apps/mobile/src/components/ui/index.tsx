/**
 * Shared invert UI primitives (ADR-007, step 4).
 *
 * The converged "lean style" building blocks. Every primitive pulls
 * colors from `useTheme().colors`, preset dimensions (radius, padding,
 * gap, elevation) from `useTheme().layout`, and spacing/typography from
 * the token scales — so a screen built from these is automatically
 * theme-correct, preset-responsive (Keeper vs Hobbyist), and visually
 * consistent with every other invert screen.
 *
 * Screens should compose these instead of hand-rolling StyleSheet blocks
 * with hardcoded radii / font sizes / hex.
 */
import React from 'react';
import {
  StyleProp, Text, TextStyle, TouchableOpacity, View, ViewStyle,
} from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE, type TypeKey } from '../../theme/tokens';

type ColorRole =
  | 'textPrimary' | 'textSecondary' | 'textTertiary'
  | 'primary' | 'success' | 'warning' | 'error' | 'info';

// ─── AppText ──────────────────────────────────────────────────────────────
// Typed text. `variant` selects a typography role; `color` selects a
// semantic color role (defaults to primary text). Keeps screens off raw
// fontSize / hex.
export function AppText({
  variant = 'body', color = 'textPrimary', italic, style, children, numberOfLines, accessibilityRole,
}: {
  variant?: TypeKey;
  color?: ColorRole;
  italic?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'text';
}) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole}
      style={[TYPE[variant], { color: colors[color] }, italic && { fontStyle: 'italic' }, style]}
    >
      {children}
    </Text>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────
// Base surface. Elevation style follows the active preset: bordered &
// flat for Keeper, shadowed for Hobbyist.
export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const { colors, layout } = useTheme();
  const elevation: ViewStyle =
    layout.elevation === 'shadow'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 }
      : layout.elevation === 'border'
        ? { borderWidth: 1, borderColor: colors.border }
        : {};
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: layout.radius.md,
          padding: layout.density.cardPadding,
          gap: layout.density.stackGap,
        },
        elevation,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────
// A Card with a header row (title + optional right-aligned text action).
export function SectionCard({
  title, actionLabel, onAction, style, children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={[{ marginHorizontal: SPACING.lg, marginVertical: SPACING.xs }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="subheading" accessibilityRole="header">{title}</AppText>
        {actionLabel && onAction && (
          <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </Card>
  );
}

// ─── InfoRow ────────────────────────────────────────────────────────────
// Label/value pair. Used in identity + husbandry blocks.
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xs }}>
      <AppText variant="label" color="textTertiary">{label}</AppText>
      <AppText variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right', marginLeft: SPACING.md }}>{value}</AppText>
    </View>
  );
}

// ─── Chip ───────────────────────────────────────────────────────────────
// Small neutral pill (e.g. type/size quick-info on cards).
export function Chip({ children }: { children: React.ReactNode }) {
  const { colors, layout } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: layout.radius.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs }}>
      <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────
// Colored pill with explicit bg/fg — for venom tiers, care levels, status.
export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  const { layout } = useTheme();
  return (
    <View style={{ backgroundColor: bg, borderRadius: layout.radius.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs }}>
      <Text style={[TYPE.caption, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}
