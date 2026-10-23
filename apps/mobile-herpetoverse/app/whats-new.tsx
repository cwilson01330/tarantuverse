/**
 * What's new — the full history page (spec 2026-10-23 §2): every week of
 * entries, newest first, each with its Premium label and (where this app has
 * the screen) its button. Opening it does NOT mark anything seen; only the
 * Home card's close/action buttons do. Reads the shared session feed
 * (src/lib/whats-new.ts), so the Home card, the You-tab dot and this page
 * cost one request together.
 *
 * States: loading -> spinner; request failed (feed null) -> a plain message;
 * no entries -> "Nothing new yet."; otherwise the weeks.
 * Herpetoverse twin of apps/mobile/app/whats-new.tsx.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { WhatsNewList } from '../src/components/WhatsNewList';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { TYPE } from '../src/theme/type';
import { useWhatsNew } from '../src/lib/whats-new';

function WhatsNewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { feed, loading } = useWhatsNew();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader title="What's new" leftAction={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : feed ? (
          <WhatsNewList weeks={feed.weeks} onAction={(route) => router.push(route as never)} />
        ) : (
          <View style={styles.center}>
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>
              Couldn&apos;t load what&apos;s new right now.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default withErrorBoundary(WhatsNewScreen, 'whats-new');

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  center: { alignItems: 'center', paddingVertical: 48 },
});
