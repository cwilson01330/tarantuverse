import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/contexts/ThemeContext';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { FIRST_FEEDING_COPY } from '../src/lib/first-feeding';
import { completeOnboarding } from '../src/lib/onboarding';
import { SPACING, TYPE } from '../src/theme/tokens';

const EMOJI_SIZE = 64;
const EMOJI_CIRCLE = 120;

/**
 * Welcome (Day-one, 2026-10-27). One screen, three ways in. It replaces the
 * four-screen carousel, which a new keeper had to tap through before they could
 * do anything; the goal now is "first animal in under a minute".
 *
 * The route name, the pending/completed flags and `resolveColdStartRoute` are
 * unchanged (src/lib/onboarding.ts): a new account is still routed here once,
 * and a force-quit before choosing resumes here on the next cold start.
 *
 * Every button clears the pending marker first. completeOnboarding swallows
 * storage errors, so the navigation always runs - never trap someone on this
 * screen because AsyncStorage hiccuped.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const leaving = useRef(false);

  const go = async (href: '/add' | '/import' | '/(tabs)') => {
    if (leaving.current) return;
    leaving.current = true;
    await completeOnboarding();
    if (href === '/(tabs)') {
      router.replace(href);
    } else {
      // Land on the tabs first so the form's back/close button and Android back
      // have somewhere to go; replace alone would leave a one-screen stack.
      router.replace('/(tabs)');
      router.push(href);
    }
    // Re-arm for the (unlikely) case the screen is still mounted afterwards.
    leaving.current = false;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View
          style={[
            styles.logo,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: layout.radius.full,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.emoji}>🐾</Text>
        </View>
        <Text style={[TYPE.display, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {FIRST_FEEDING_COPY.welcomeTitle}
        </Text>
        <Text style={[TYPE.subheading, styles.line, { color: colors.textSecondary }]}>
          {FIRST_FEEDING_COPY.welcomeLine}
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          onPress={() => go('/add')}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeAdd}
          style={[styles.buttonInner, { borderRadius: layout.radius.md }]}
        >
          <Text style={[TYPE.subheadingBold, styles.primaryText]}>{FIRST_FEEDING_COPY.welcomeAdd}</Text>
        </PrimaryButton>

        <TouchableOpacity
          onPress={() => go('/import')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeImport}
          style={[
            styles.buttonInner,
            styles.secondary,
            { borderColor: colors.border, backgroundColor: colors.surfaceElevated, borderRadius: layout.radius.md },
          ]}
        >
          <Text style={[TYPE.subheadingBold, { color: colors.textPrimary }]}>{FIRST_FEEDING_COPY.welcomeImport}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => go('/(tabs)')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeLookAround}
          style={styles.buttonInner}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>{FIRST_FEEDING_COPY.welcomeLookAround}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  logo: {
    width: EMOJI_CIRCLE,
    height: EMOJI_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    borderWidth: 2,
  },
  emoji: {
    fontSize: EMOJI_SIZE,
  },
  title: {
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  line: {
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  buttonInner: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
  },
  secondary: {
    borderWidth: 1,
  },
});
