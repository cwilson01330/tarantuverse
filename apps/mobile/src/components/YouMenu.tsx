/**
 * Building blocks for the "You" tab — the account hub.
 *
 * SHARED STRUCTURE WITH HERPETOVERSE. A keeper who uses both apps should find
 * everything in the same place. Both "You" tabs use these same blocks in the
 * same section order, with the same labels and icons; a row only differs where
 * the feature itself differs (e.g. Morph calculator is HV-only).
 *
 *   1. Profile header — avatar (tap to change), name, @username
 *   2. Account        — Edit profile · Sign-in methods · Collection privacy
 *   3. Notifications  — Inbox · Notification settings
 *   4. Your collection— Sitter links · Import collection · Export your data · (tools)
 *   5. Premium        — plan · (achievements, referrals)
 *   6. Appearance     — (where the app has theme options)
 *   7. Help & legal   — Contact support · Check for updates · Privacy policy · Terms
 *   8. About          — Version
 *   9. Sign out · Delete account
 *
 * Mirror: apps/mobile-herpetoverse/src/components/YouMenu.tsx. Keep the two
 * files identical apart from the theme import path and the danger colour key.
 *
 * Icons: both apps pin @expo/vector-icons 15.0.3, and every icon used on the
 * You tabs was checked against that version's MaterialCommunityIcons glyph map
 * (an unknown name renders as an empty box, silently).
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function MenuSection({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors, layout } = useTheme();
  // Drop falsy children (feature-gated rows) so dividers only sit BETWEEN rows.
  const rows = React.Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[TYPE.caption, styles.sectionLabel, { color: colors.textTertiary }]} accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export function MenuRow({
  icon,
  label,
  detail,
  onPress,
  danger = false,
  external = false,
  busy = false,
  accessory,
  accessibilityHint,
}: {
  icon: IconName;
  label: string;
  /** Secondary line under the label (e.g. plan status). */
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  /** Opens outside the app (browser/mail) — shows an open-in-new mark. */
  external?: boolean;
  busy?: boolean;
  /** Replaces the chevron, e.g. a Switch. The row is then not a button. */
  accessory?: React.ReactNode;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.error : colors.textPrimary;
  const content = (
    <>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={danger ? colors.error : colors.primary}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.text}>
        <Text style={[TYPE.subheading, { color: tint }]}>{label}</Text>
        {detail ? <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{detail}</Text> : null}
      </View>
      {accessory ?? (busy ? (
        <ActivityIndicator color={colors.textTertiary} />
      ) : (
        <MaterialCommunityIcons
          name={external ? 'open-in-new' : 'chevron-right'}
          size={external ? 18 : 22}
          color={colors.textTertiary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ))}
    </>
  );
  if (accessory || !onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityHint={external ? accessibilityHint ?? 'Opens outside the app' : accessibilityHint}
      accessibilityState={{ disabled: busy, busy }}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionLabel: { letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52 },
  text: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
});
