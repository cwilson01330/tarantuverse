/**
 * Root layout — wires the provider stack:
 *   ThemeProvider → AuthProvider → (stack)
 *
 * PostHog initializes once on first mount. We identify the current user
 * whenever auth state changes and reset on sign-out, so a single keeper
 * resolves to the same distinct_id across sessions.
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import {
  identifyUser,
  initPostHog,
  resetPostHog,
} from '../src/services/posthog';

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
      });
    } else {
      resetPostHog();
    }
  }, [isLoading, user?.id, user?.email, user?.username, user?.display_name]);

  return null;
}

function RootLayoutContent() {
  const { isLoading } = useAuth();
  const { colors } = useTheme();

  // Don't render screens until we've resolved cached auth — prevents a
  // flash of the login screen for keepers who are already signed in.
  if (isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" />
      <PostHogBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
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
