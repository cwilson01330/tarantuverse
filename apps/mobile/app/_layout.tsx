import React, { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import {
  identifyUser,
  initPostHog,
  resetPostHog,
} from '../src/services/posthog';

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

function RootLayoutContent() {
  const { user, isLoading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      if (user) {
        const completed = await AsyncStorage.getItem('onboarding_completed');
        setOnboardingComplete(completed === 'true');
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setOnboardingComplete(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  // Don't render until both auth and onboarding check are complete
  if (isLoading || checkingOnboarding) {
    return null;
  }

  return (
    <>
      <PostHogBridge />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        {/* Show onboarding if user is authenticated but hasn't completed it */}
        {user && !onboardingComplete && (
          <Stack.Screen name="onboarding" options={{ animationEnabled: false }} />
        )}
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
