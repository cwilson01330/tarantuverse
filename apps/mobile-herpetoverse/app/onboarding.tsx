/**
 * Welcome (HV day one, 2026-11-18). One screen, three ways in — mirrors
 * Tarantuverse app/onboarding.tsx with Herpetoverse wording. Goal: first
 * animal in under a minute.
 *
 * Reached once after sign-up (src/lib/onboarding.ts: a pending marker parked
 * by register.tsx, read on the next sign-in or cold start). A force-quit
 * before choosing resumes here on the next cold start.
 *
 * Every button clears the pending marker first. completeOnboarding swallows
 * storage errors, so the navigation always runs - never trap someone on this
 * screen because AsyncStorage hiccuped.
 */
import { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { FIRST_FEEDING_COPY } from '../src/lib/first-feeding';
import { completeOnboarding } from '../src/lib/onboarding';
import { TYPE } from '../src/theme/type';

const ICON_CIRCLE = 120;
const DASHBOARD = '/(tabs)/dashboard';

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const leaving = useRef(false);

  const go = async (href: '/reptile/add' | '/import' | typeof DASHBOARD) => {
    if (leaving.current) return;
    leaving.current = true;
    await completeOnboarding();
    if (href === DASHBOARD) {
      router.replace(DASHBOARD as never);
    } else {
      // Land on the dashboard first so the form's back button and Android back
      // have somewhere to go; replace alone would leave a one-screen stack.
      router.replace(DASHBOARD as never);
      router.push(href as never);
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
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              borderRadius: ICON_CIRCLE / 2,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <MaterialCommunityIcons name="snake" size={64} color={colors.primary} />
        </View>
        <Text style={[TYPE.display, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {FIRST_FEEDING_COPY.welcomeTitle}
        </Text>
        <Text style={[TYPE.subheading, styles.line, { color: colors.textSecondary }]}>
          {FIRST_FEEDING_COPY.welcomeLine}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => go('/reptile/add')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeAdd}
          style={[styles.button, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
        >
          <Text style={[TYPE.subheading, styles.onPrimary]}>{FIRST_FEEDING_COPY.welcomeAdd}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => go('/import')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeImport}
          style={[
            styles.button,
            styles.secondary,
            { borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: layout.radius.md },
          ]}
        >
          <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{FIRST_FEEDING_COPY.welcomeImport}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => go(DASHBOARD)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.welcomeLookAround}
          style={styles.button}
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
    paddingHorizontal: 32,
  },
  logo: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  line: {
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
    gap: 12,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onPrimary: {
    color: '#0B0B0B',
  },
  secondary: {
    borderWidth: 1,
  },
});
