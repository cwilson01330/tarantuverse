import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { UpdateBanner } from '../src/components/UpdateBanner';
import {
  identifyUser,
  initPostHog,
  resetPostHog,
} from '../src/services/posthog';
import {
  cleanupQuickActions,
  setupQuickActions,
} from '../src/services/quick-actions';

/**
 * Bridges auth state into PostHog. Initializes the SDK once, then
 * identifies or resets the distinct_id whenever the user changes so a
 * single keeper resolves to the same identity across sessions and
 * across surfaces (web Tarantuverse, web Herpetoverse, mobile
 * Herpetoverse, mobile Tarantuverse — all share one PostHog project).
 */
function PostHogBridge() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Fire-and-forget. Subsequent calls are no-ops.
    initPostHog();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (user?.id) {
      identifyUser(user.id, {
        email: user.email,
        username: user.username,
        display_name: user.display_name ?? undefined,
        is_admin: user.is_admin || false,
        is_superuser: user.is_superuser || false,
      });
    } else {
      resetPostHog();
    }
  }, [
    isLoading,
    user?.id,
    user?.email,
    user?.username,
    user?.display_name,
    user?.is_admin,
    user?.is_superuser,
  ]);

  return null;
}

/**
 * Registers launcher app shortcuts (long-press the icon → Add Tarantula
 * / My Collection / Feeders) and routes taps via `router.push`. The
 * service is resilient — if a build doesn't have the native module
 * linked, setup is a no-op rather than a crash.
 */
function QuickActionsBridge() {
  const router = useRouter();

  useEffect(() => {
    setupQuickActions((href) => {
      try {
        router.push(href as never);
      } catch (error) {
        console.warn('[QuickActions] push failed for', href, error);
      }
    });
    return cleanupQuickActions;
  }, [router]);

  return null;
}

function RootLayoutContent() {
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  // Hold on a themed loading view (not a blank screen) until the auth check
  // finishes. AuthContext caps the wait. (Who sees the welcome screen is decided
  // at sign-in and on cold start by src/lib/onboarding.ts - this layout used to
  // run its own check whose result routed nothing.)
  if (isLoading) {
    return (
      <View
        style={[launchStyles.loading, { backgroundColor: colors.background }]}
        accessibilityLabel="Loading"
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <PostHogBridge />
      <QuickActionsBridge />
      <UpdateBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Top-level ErrorBoundary — last line of defense. Any render crash
  // that escapes the per-tab boundaries surfaces here with a "Try again"
  // button so the app isn't permanently wedged on a blank screen.
  return (
    <ErrorBoundary scope="app-root">
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const launchStyles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
