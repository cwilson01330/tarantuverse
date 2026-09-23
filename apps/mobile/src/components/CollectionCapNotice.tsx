/**
 * Free-tier cap notice for the Collection tab.
 *
 * WHY MOBILE NEEDED THIS AT ALL
 * -----------------------------
 * The cap was mentioned in exactly two places on mobile: the dedicated
 * subscription screen, and the 402 raised when adding an animal. A keeper
 * whose subscription lapsed and who ISN'T adding animals — because they
 * can't — therefore saw nothing, anywhere, ever. At the time of writing that
 * described the two most active lapsed keepers on the platform, one of them
 * logging over a hundred feedings a month.
 *
 * Mirrors apps/web/src/components/CollectionCapNotice.tsx. Keep the copy in
 * lockstep: a keeper who reads one message on the phone and a different one
 * on the web learns not to trust either.
 *
 * THE COPY IS THE POINT
 * ---------------------
 * An over-cap message must never lead with "you have 33 of 15". To someone
 * holding 33 animals that reads as an instruction to delete 18 of them, and
 * deleting husbandry history is not a trade worth making for a subscription.
 * A lapsed keeper gets "renew", not "upgrade" — they already know what
 * premium is, and selling it to them from scratch reads as the app not
 * knowing who they are.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { apiClient } from '../services/api';

const DISMISS_KEY = 'collection_cap_notice_dismissed_v1';

interface Limits {
  is_premium: boolean;
  max_animals?: number;
  max_tarantulas?: number;
  subscription_lapsed?: boolean;
}

export function CollectionCapNotice({ count }: { count: number }) {
  const { colors, layout } = useTheme();
  const router = useRouter();
  const [limits, setLimits] = useState<Limits | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Refetched on focus so renewing elsewhere clears the banner on return,
  // rather than leaving a paid-up keeper looking at an upsell.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [{ data }, stored] = await Promise.all([
            apiClient.get<Limits>('/promo-codes/me/limits'),
            AsyncStorage.getItem(DISMISS_KEY),
          ]);
          if (!alive) return;
          setLimits(data);
          setDismissed(stored);
        } catch {
          // Silent: a missing banner is a far better failure than a wrong
          // one. Never guess a cap from a failed request.
          if (alive) setLimits(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!limits || limits.is_premium) return null;

  const cap = limits.max_animals ?? limits.max_tarantulas ?? 15;
  if (cap === -1) return null;

  const state = count >= cap ? 'over' : count >= cap - 5 ? 'approaching' : null;
  if (!state) return null;

  const lapsed = !!limits.subscription_lapsed;
  // Keyed by state, so crossing the cap surfaces the harder message once
  // even if the softer one was dismissed.
  const key = `${state}:${lapsed ? 'lapsed' : 'new'}`;
  if (dismissed === key) return null;

  const dismiss = async () => {
    setDismissed(key);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, key);
    } catch {
      // Non-fatal — it reappears next launch.
    }
  };

  const over = state === 'over';
  const title = lapsed
    ? 'Your subscription has ended'
    : over
      ? "You're at the free plan limit"
      : 'Approaching the free plan limit';

  const body = lapsed
    ? `You're back on the free plan's ${cap}-animal limit. Nothing has been deleted or hidden — every animal stays exactly as it is, and you can keep logging feedings and molts as normal. You just can't add a new one until you renew.`
    : over
      ? `You're tracking ${count} animals, and the free plan covers ${cap}. Everything you've logged stays as it is — you just can't add another without premium.`
      : `You have ${count} of ${cap} animals on the free plan. Upgrade for unlimited tracking.`;

  // colors.warning, not a literal amber: the semantic colors are immutable
  // across theme presets by design (ADR-001), so this stays legible on every
  // preset and in dark mode without a per-theme override.
  const accent = over ? colors.primary : colors.warning;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: accent,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.row}>
        {/* `crown`, not `diamond-stone`: both read fine, but only this one
            is used elsewhere in the app, so only this one is confirmed
            present in the bundled glyph map. An unverified MDI name renders
            as a blank box in production. */}
        <MaterialCommunityIcons
          name={over ? 'crown' : 'alert'}
          size={20}
          color={accent}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
        </View>
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <MaterialCommunityIcons name="close" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => router.push('/subscription' as never)}
        accessibilityRole="button"
        accessibilityLabel={lapsed ? 'Renew premium' : 'See premium plans'}
        style={[
          styles.cta,
          { backgroundColor: accent, borderRadius: layout.radius.md },
        ]}
      >
        <Text style={styles.ctaText}>
          {lapsed ? 'Renew Premium' : 'See Premium'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  // Type comes from the shared scale rather than raw sizes, so this card
  // tracks the design system instead of drifting from it.
  title: { ...TYPE.bodyStrong, fontWeight: '700' },
  body: { ...TYPE.caption, lineHeight: 18, marginTop: 3 },
  cta: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  ctaText: { ...TYPE.bodyStrong, color: '#fff', fontWeight: '700' },
});

export default CollectionCapNotice;
