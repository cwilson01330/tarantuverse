/**
 * What's new — shared building blocks (spec 2026-10-23, section 2).
 *
 * `WhatsNewEntryView` is one entry: title, body, a "Premium" badge when the
 * feature is premium, and an action button ONLY when this app has a screen for
 * the entry's target (`routeForTarget` is null for "no screen here" — never a
 * dead button). `WhatsNewList` is the full history: weeks newest first under a
 * "Week of Oct 19" heading. Neither marks anything seen; the caller decides
 * what an action does (the card marks seen, the page does not).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { AppText, Badge } from './ui';
import { routeForTarget, type WhatsNewEntry, type WhatsNewWeek } from '../lib/whats-new';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Week of Oct 19" from a YYYY-MM-DD Monday. Built from the parts on purpose:
 * `new Date('2026-10-19')` is UTC midnight and shows the previous day west of
 * Greenwich. Falls back to the raw string if it is not a date.
 */
export function weekHeading(weekOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekOf);
  if (!m) return `Week of ${weekOf}`;
  const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(local.getTime())) return `Week of ${weekOf}`;
  return `Week of ${MONTHS[local.getMonth()]} ${local.getDate()}`;
}

export function WhatsNewEntryView({
  entry,
  onAction,
}: {
  entry: WhatsNewEntry;
  /** Called with the in-app route when the entry's button is pressed. */
  onAction: (route: string) => void;
}) {
  const { colors, layout } = useTheme();
  const route = entry.action ? routeForTarget(entry.action.target) : null;

  return (
    <View style={styles.entry}>
      <View style={styles.titleRow}>
        <AppText variant="subheading" style={styles.title}>{entry.title}</AppText>
        {entry.premium ? <Badge label="Premium" bg={colors.surfaceElevated} fg={colors.accent} /> : null}
      </View>
      <AppText variant="body" color="textSecondary">{entry.body}</AppText>
      {entry.action && route ? (
        <TouchableOpacity
          onPress={() => onAction(route)}
          style={[styles.action, { borderColor: colors.primary, borderRadius: layout.radius.md }]}
          accessibilityRole="button"
          accessibilityLabel={entry.action.label}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>{entry.action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function WhatsNewList({
  weeks,
  onAction,
}: {
  weeks: WhatsNewWeek[];
  onAction: (route: string) => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <View style={styles.list}>
      {weeks.map((week) => (
        <View key={week.week_of} style={styles.week}>
          <AppText variant="label" color="textTertiary" accessibilityRole="header">
            {weekHeading(week.week_of).toUpperCase()}
          </AppText>
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
            ]}
          >
            {week.entries.map((entry, i) => (
              <View key={entry.id}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                <WhatsNewEntryView entry={entry} onAction={onAction} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { gap: SPACING.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { flexShrink: 1 },
  action: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    borderWidth: 1,
  },
  list: { gap: SPACING.lg },
  week: { gap: SPACING.sm },
  panel: { borderWidth: 1, padding: SPACING.lg, gap: SPACING.md },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
});
