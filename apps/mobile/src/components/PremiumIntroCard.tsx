/**
 * PremiumIntroCard — the one-time "here's what you get" moment.
 *
 * Shown ONCE, right after a keeper's first completed Feeding Day batch. Not at
 * signup, not on a wall: most free keepers never hit a wall, but nearly all of
 * them feed something. It is informational and gates nothing — it says
 * plainly what stays free and what premium adds, with every plan on it
 * including lifetime. "Not now" is the primary-weight action.
 *
 * Whether to show it is the SERVER's call (`GET /auth/me/premium-intro`), and
 * every dismissal marks it seen server-side, so it can't reappear on another
 * device. Honesty-first: nothing on this card describes a feature that isn't
 * shipped, and "free" here is what the free plan actually includes.
 */
import React, { useEffect, useRef } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { apiClient } from '../services/api';
import { trackUpgrade, UPGRADE_EVENTS } from '../lib/upgrade-tracking';

const SOURCE = 'feeding_day_intro' as const;

/** Ask the server whether to show the card. Never throws — a failed call
 *  means "don't show", which is the safe default for a one-time card. */
export async function shouldShowPremiumIntro(): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ show: boolean }>('/auth/me/premium-intro');
    return !!data?.show;
  } catch {
    return false;
  }
}

async function markSeen(): Promise<void> {
  try {
    await apiClient.post('/auth/me/premium-intro/seen');
  } catch {
    // Best effort. Worst case it's shown once more on another device.
  }
}

// The free plan, as it actually is (utils/limits.py, plan row `free`).
const FREE = [
  'Tracking for every taxon — feedings, molts, substrate, photos',
  'Feeding Day and reminders',
  'Care sheets and keeper signals',
  'Forums, messages and keeper profiles',
  'Up to 15 animals, 5 photos each',
  'Full data export, any time',
];

// Premium, as gated today (can_use_breeding / can_use_analytics / caps).
const PREMIUM = [
  'Unlimited animals and photos',
  'Breeding: pairings, egg sacs, offspring',
  'Advanced analytics',
  'Co-keepers and sitter logging',
];

const PLANS = 'Monthly $4.99 · Yearly $44.99 · Lifetime $149.99, once';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PremiumIntroCard({ visible, onClose }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const acted = useRef(false);

  useEffect(() => {
    if (visible) {
      acted.current = false;
      trackUpgrade(UPGRADE_EVENTS.shown, SOURCE);
    }
  }, [visible]);

  const dismiss = () => {
    if (!acted.current) trackUpgrade(UPGRADE_EVENTS.dismissed, SOURCE);
    markSeen();
    onClose();
  };

  const seePlans = () => {
    acted.current = true;
    trackUpgrade(UPGRADE_EVENTS.clicked, SOURCE);
    markSeen();
    onClose();
    router.push({ pathname: '/subscription', params: { source: SOURCE } } as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.kicker, { color: colors.textTertiary }]}>First Feeding Day logged</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Here’s what you get</Text>
            <Text style={[styles.lede, { color: colors.textSecondary }]}>
              Everything you just used stays free. This is the whole picture, once, so you never have to wonder.
            </Text>

            <Text style={[styles.section, { color: colors.textTertiary }]}>Free, always</Text>
            {FREE.map((line) => (
              <View key={line} style={styles.row}>
                <MaterialCommunityIcons name="check" size={18} color={colors.success} />
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>{line}</Text>
              </View>
            ))}

            <Text style={[styles.section, { color: colors.textTertiary }]}>Premium adds</Text>
            {PREMIUM.map((line) => (
              <View key={line} style={styles.row}>
                <MaterialCommunityIcons name="star-outline" size={18} color={colors.accent} />
                <Text style={[styles.rowText, { color: colors.textPrimary }]}>{line}</Text>
              </View>
            ))}
            <Text style={[styles.plans, { color: colors.textSecondary }]}>{PLANS}</Text>

            <TouchableOpacity
              onPress={dismiss}
              style={[styles.primary, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent, borderRadius: layout.radius.md }]}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryText, { color: colors.accent }]}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={seePlans} style={styles.secondary} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>See plans</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderWidth: 1, paddingHorizontal: 20, paddingTop: 20, maxHeight: '88%' },
  kicker: { ...TYPE.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { ...TYPE.title, marginTop: 4 },
  lede: { ...TYPE.body, marginTop: 8 },
  section: { ...TYPE.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  rowText: { ...TYPE.body, flex: 1 },
  plans: { ...TYPE.label, marginTop: 6 },
  primary: { marginTop: 20, paddingVertical: 14, alignItems: 'center', borderWidth: 2 },
  primaryText: { ...TYPE.subheading },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { ...TYPE.bodyStrong },
});
