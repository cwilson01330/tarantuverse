/**
 * Catch-all for links the app can't open (a web-only page reached through a
 * Universal / App Link, a stale share link, a mistyped deep link). Replaces
 * expo-router's default "Unmatched Route" screen, which shows a developer
 * sitemap of every route.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { AppText } from '../src/components/ui';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { SPACING } from '../src/theme/tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  const goHome = () => {
    // "/" routes signed-in keepers to their tabs and everyone else to login.
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        <MaterialCommunityIcons name="link-variant-off" size={48} color={colors.textTertiary} />
        <AppText variant="heading" accessibilityRole="header" style={styles.title}>
          This link isn’t available in the app
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.text}>
          It may only open on the website, or the page may have moved.
        </AppText>
        <PrimaryButton
          onPress={goHome}
          style={[styles.button, { borderRadius: layout.radius.md }]}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          {/* White on the brand fill, as every PrimaryButton label does. */}
          <AppText variant="bodyStrong" style={styles.buttonLabel}>
            Go home
          </AppText>
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  title: { textAlign: 'center', marginTop: SPACING.sm },
  text: { textAlign: 'center', marginBottom: SPACING.sm },
  buttonLabel: { color: '#fff' },
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
});
