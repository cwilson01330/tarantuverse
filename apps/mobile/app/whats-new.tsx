/**
 * What's new — the full history (spec 2026-10-23, section 2).
 *
 * Every live entry, grouped by week, newest first. Opening this page does NOT
 * mark anything seen (only the Home card's dismiss / action buttons do), and it
 * reads the shared `useWhatsNew` cache, so it adds no request of its own.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppHeader } from '../src/components/AppHeader';
import { AppText } from '../src/components/ui';
import { WhatsNewList } from '../src/components/WhatsNewList';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { useTheme } from '../src/contexts/ThemeContext';
import { SPACING } from '../src/theme/tokens';
import { useWhatsNew } from '../src/lib/whats-new';

function WhatsNewScreen() {
  const { colors, layout } = useTheme();
  const router = useRouter();
  const { feed, loading } = useWhatsNew();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const weeks = feed?.weeks ?? [];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="What's new"
        leftAction={
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : feed === null ? (
        <View style={styles.center}>
          <AppText variant="body" color="textSecondary">Couldn't load what's new right now.</AppText>
        </View>
      ) : weeks.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="body" color="textSecondary">Nothing new yet.</AppText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <WhatsNewList weeks={weeks} onAction={(route) => router.push(route as never)} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
});

export default withErrorBoundary(WhatsNewScreen, 'whats-new');
