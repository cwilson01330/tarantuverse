/**
 * Home "What's new" card (spec 2026-10-23 §2).
 *
 * Self-contained: reads the shared feed through `useWhatsNew` (one GET per app
 * session, cached in src/lib/whats-new.ts) and renders nothing until
 * `feed.unseen` has entries — loading, a failed request and "all caught up"
 * all look like no card, so a broken feed never gets in Home's way.
 *
 * Up to 3 entries; "See all" opens the history page (which does not mark
 * anything seen). The close button and any entry button mark the feed seen
 * (fire and forget — the card hides at once; if the request fails it simply
 * comes back next session), and entry buttons then navigate.
 * Herpetoverse twin of apps/mobile/src/components/WhatsNewCard.tsx.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/type';
import { useWhatsNew } from '../lib/whats-new';
import { WhatsNewEntryBlock } from './WhatsNewList';

const MAX_ENTRIES = 3;

export function WhatsNewCard() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const { feed, markSeen } = useWhatsNew();
  const [dismissed, setDismissed] = useState(false);
  const styles = useMemo(() => makeStyles(), []);

  const unseen = feed?.unseen ?? [];
  if (dismissed || unseen.length === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    void markSeen();
  };

  const openAction = (route: string) => {
    setDismissed(true);
    void markSeen();
    router.push(route as never);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.primary + '55', borderRadius: layout.radius.lg },
      ]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons
          name="star-four-points-outline"
          size={20}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={[TYPE.heading, styles.headTitle, { color: colors.textPrimary }]} accessibilityRole="header">
          What&apos;s new
        </Text>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss what's new"
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {unseen.slice(0, MAX_ENTRIES).map((entry, i) => (
        <View key={entry.id}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <WhatsNewEntryBlock entry={entry} onAction={openAction} />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.seeAll, { borderTopColor: colors.border }]}
        onPress={() => router.push('/whats-new' as never)}
        accessibilityRole="button"
        accessibilityLabel="See all what's new"
      >
        <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>See all</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    card: { borderWidth: 1, overflow: 'hidden' },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4 },
    headTitle: { flex: 1 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    divider: { height: StyleSheet.hairlineWidth },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 44,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
