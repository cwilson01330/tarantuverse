/**
 * "What's new" entry rendering shared by the Home card and the full page.
 *
 * `WhatsNewEntryBlock` is one entry: title, "Premium" label when the entry is
 * a premium feature, body, and an action button ONLY when this app has a
 * screen for the entry's target (`routeForTarget` non-null) — an entry whose
 * target this app can't open is shown without a button, never a dead link.
 * `WhatsNewList` is the page body: weeks newest first under a "Week of Oct 19"
 * heading, every entry with its label and button, or "Nothing new yet.".
 *
 * Presentational only: the caller decides what a button press does (the card
 * marks the feed seen first; the page just navigates, and never marks seen).
 * Herpetoverse twin of apps/mobile/src/components/WhatsNewList.tsx. Theme
 * colours only.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { routeForTarget, type WhatsNewEntry, type WhatsNewWeek } from '../lib/whats-new';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Week of Oct 19" from a `YYYY-MM-DD` Monday. Built from the date's parts as
 * a LOCAL calendar day — `new Date('YYYY-MM-DD')` parses as UTC midnight and
 * shows the previous day west of Greenwich. Falls back to the raw string for
 * anything that isn't a real calendar date.
 */
export function weekHeading(weekOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekOf);
  if (!m) return `Week of ${weekOf}`;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return `Week of ${weekOf}`;
  }
  return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function WhatsNewEntryBlock({
  entry,
  onAction,
}: {
  entry: WhatsNewEntry;
  /** Called with the in-app route when the entry's button is pressed. */
  onAction: (route: string) => void;
}) {
  const { colors, layout } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const route = entry.action ? routeForTarget(entry.action.target) : null;

  return (
    <View style={styles.entry}>
      <View style={styles.titleRow}>
        <Text style={[TYPE.subheading, styles.title, { color: colors.textPrimary }]}>{entry.title}</Text>
        {entry.premium ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.primary + '24', borderColor: colors.primary + '55', borderRadius: layout.radius.sm },
            ]}
          >
            <Text style={[TYPE.caption, { color: colors.primary }]}>Premium</Text>
          </View>
        ) : null}
      </View>
      <Text style={[TYPE.body, { color: colors.textSecondary }]}>{entry.body}</Text>
      {entry.action && route ? (
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.primary, borderRadius: layout.radius.md }]}
          onPress={() => onAction(route)}
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
  const styles = useMemo(() => makeStyles(), []);
  const filled = weeks.filter((w) => w.entries.length > 0);

  if (filled.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>Nothing new yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.weeks}>
      {filled.map((week) => (
        <View key={week.week_of}>
          <Text style={[TYPE.label, styles.weekLabel, { color: colors.textSecondary }]} accessibilityRole="header">
            {weekHeading(week.week_of)}
          </Text>
          <View
            style={[
              styles.weekCard,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
            ]}
          >
            {week.entries.map((entry, i) => (
              <View key={entry.id}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                <WhatsNewEntryBlock entry={entry} onAction={onAction} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    entry: { gap: 6, paddingHorizontal: 16, paddingVertical: 14 },
    titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    title: { flexShrink: 1 },
    badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    actionBtn: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
      borderWidth: 1,
      paddingHorizontal: 16,
      marginTop: 4,
    },
    weeks: { gap: 20 },
    weekLabel: { marginBottom: 8, marginLeft: 4 },
    weekCard: { borderWidth: 1, overflow: 'hidden' },
    divider: { height: StyleSheet.hairlineWidth },
    empty: { alignItems: 'center', paddingVertical: 48 },
  });
}
