import React from 'react';
import { Linking, ScrollView, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card } from './ui';
import { FORUMS_PAUSED_BODY, FORUMS_PAUSED_TITLE, OUTSIDE_COMMUNITIES } from '../lib/features';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';

/** Shown instead of any forum screen while the forums switch is off. */
export function ForumsPaused() {
  const { colors, layout } = useTheme();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: SPACING.lg }}>
      <Card>
        <AppText variant="heading" accessibilityRole="header">{FORUMS_PAUSED_TITLE}</AppText>
        <AppText color="textSecondary">{FORUMS_PAUSED_BODY}</AppText>
        {OUTSIDE_COMMUNITIES.map((c) => (
          <TouchableOpacity
            key={c.url}
            onPress={() => Linking.openURL(c.url).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={`${c.label}, opens in your browser`}
            style={{ paddingVertical: SPACING.xs }}
          >
            <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            alignSelf: 'flex-start',
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.lg,
            borderRadius: layout.radius.sm,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Back</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
    </SafeAreaView>
  );
}

export default ForumsPaused;
