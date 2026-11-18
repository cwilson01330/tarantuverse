/**
 * Root layout — wires the provider stack:
 *   ThemeProvider → AuthProvider → (stack)
 *
 * PostHog initializes once on first mount. We identify the current user
 * whenever auth state changes and reset on sign-out, so a single keeper
 * resolves to the same distinct_id across sessions.
 */
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import UpdateBanner from '../src/components/UpdateBanner';
import {
  identifyUser,
  initPostHog,
  resetPostHog,
} from '../src/services/posthog';
import { initializeIAP, endIAP } from '../src/services/iap';
import { apiClient } from '../src/services/api';
import { cancelAllFeedingReminders } from '../src/services/notifications';
import { ReminderToast, showReminderToast } from '../src/components/ReminderToast';
import {
  handleNotificationResponse,
  registerReminderCategories,
  type ResponseLike,
} from '../src/services/reminder-notifications';

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

/**
 * Notification taps (smart reminders). Registers the Fed / Refused / Tomorrow
 * button sets once, turns a button tap into one API call plus a toast, and
 * routes a body tap to its deeplink. Mirrors Tarantuverse's ReminderBridge.
 * The cold-start response is handled once; handled response ids are remembered
 * so a response never runs twice. Everything native is guarded - a build
 * without the module just does nothing. Only pushes that carry `animal_id` are
 * acted on (see handleNotificationResponse).
 */
function ReminderBridge() {
  const router = useRouter();
  const { token } = useAuth();
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    const run = (response: ResponseLike | null | undefined) => {
      if (!response) return;
      const key = `${response.notification?.request?.identifier ?? ''}|${response.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      void handleNotificationResponse(response, {
        post: async (animalId, body) => {
          const res = await apiClient.post(`/animals/${animalId}/reminder-action`, body);
          return res.data;
        },
        navigate: (href) => {
          try {
            router.push(href as never);
          } catch (error) {
            console.warn('[Reminders] navigate failed for', href, error);
          }
        },
        showToast: showReminderToast,
        isSignedIn: () => !!tokenRef.current,
        dismiss: async (notificationId) => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Notifications = require('expo-notifications');
          await Notifications.dismissNotificationAsync(notificationId);
        },
      });
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');
      void registerReminderCategories();
      sub = Notifications.addNotificationResponseReceivedListener(run);
      Promise.resolve(Notifications.getLastNotificationResponseAsync?.())
        .then((last: ResponseLike | null) => {
          if (!cancelled) run(last);
        })
        .catch(() => {});
    } catch (error) {
      console.warn('[Reminders] notification responses unavailable', error);
    }

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  return null;
}

function RootLayoutContent() {
  const { isLoading } = useAuth();
  const { colors } = useTheme();

  // Once per launch: drop per-meal local reminders an older build scheduled.
  const cleanedFeedingReminders = useRef(false);
  useEffect(() => {
    if (cleanedFeedingReminders.current) return;
    cleanedFeedingReminders.current = true;
    cancelAllFeedingReminders().catch(() => {});
  }, []);

  // Open the store connection + purchase listeners once at launch (no-op in
  // Expo Go). Tear down on unmount. Products are fetched lazily by the paywall.
  useEffect(() => {
    // Never let store setup reject into the void: an unhandled rejection during
    // startup is what expo-updates' ErrorRecovery interprets as a failed bundle
    // load, and it aborts the process. Purchases are optional; launching isn't.
    initializeIAP().catch((e) => {
      console.warn('[HV] IAP init skipped:', e);
    });
    return () => {
      try {
        endIAP();
      } catch {
        /* teardown must never break unmount */
      }
    };
  }, []);

  // Don't render screens until we've read the cached session — prevents a
  // flash of the login screen for keepers who are already signed in. This is
  // a local storage read only (AuthContext never waits on the network here,
  // and caps the wait), and it shows a themed loader rather than a blank
  // screen.
  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <PostHogBridge />
      <ReminderBridge />
      <UpdateBanner />
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
      <ReminderToast />
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

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
