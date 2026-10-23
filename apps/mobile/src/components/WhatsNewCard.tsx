/**
 * WhatsNewCard — the Home-tab card (spec 2026-10-23, section 2).
 *
 * Renders only while the shared feed has unseen entries (up to 3). The dismiss
 * cross and any entry button call `markSeen()` (the API records it and the
 * cache empties, which hides this card and the Profile dot together); entry
 * buttons then navigate. "See all" opens the history page and marks nothing.
 *
 * Reads the shared `useWhatsNew` cache only — mounting this on every Home visit
 * adds no request after the session's first.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { AppText, Card } from './ui';
import { WhatsNewEntryView } from './WhatsNewList';
import { useWhatsNew } from '../lib/whats-new';

const MAX_ENTRIES = 3;

export default function WhatsNewCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { feed, markSeen } = useWhatsNew();
  const [dismissed, setDismissed] = useState(false);

  const entries = feed?.unseen.slice(0, MAX_ENTRIES) ?? [];
  if (dismissed || entries.length === 0) return null;

  // Hide at once, then record it in the background (markSeen never throws; on failure the card
  // returns on the next visit). Hiding first also stops repeat taps from resending the POST.
  const dismiss = () => {
    setDismissed(true);
    void markSeen();
  };

  const act = (route: string) => {
    setDismissed(true);
    void markSeen();
    router.push(route as never);
  };

  // Same layout as Herpetoverse's card: title row with only the close button,
  // entries separated by dividers, and "See all" as its own full-width row at
  // the bottom so it can't get lost next to the close button.
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="creation"
          size={20}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <AppText variant="heading" accessibilityRole="header" style={styles.heading}>What's new</AppText>
        <TouchableOpacity
          onPress={dismiss}
          style={styles.hit}
          accessibilityRole="button"
          accessibilityLabel="Dismiss what's new"
        >
          <MaterialCommunityIcons name="close" size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
      {entries.map((entry, i) => (
        <View key={entry.id}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <WhatsNewEntryView entry={entry} onAction={act} />
        </View>
      ))}
      <TouchableOpacity
        onPress={() => router.push('/whats-new' as never)}
        style={[styles.seeAll, { borderTopColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel="See all what's new"
      >
        <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>See all</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, gap: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  heading: { flex: 1 },
  hit: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
