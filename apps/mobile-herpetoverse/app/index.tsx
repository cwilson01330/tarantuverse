/**
 * Entry redirect: route the keeper into tabs if signed in (or to the
 * welcome screen while a sign-up still owes it), login otherwise.
 * Held behind the auth gate in `_layout.tsx` so we never flash this screen
 * before we know who the user is.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { resolveColdStartRoute } from '../src/lib/onboarding';

export default function Index() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    // Land on the dashboard hub, not the Collection list (`/(tabs)` alone
    // resolves to the group's `index` route, Collection) — unless a sign-up
    // still owes the welcome screen (force-quit before choosing): only the
    // pending marker can send someone there, so an existing keeper always
    // goes straight to the dashboard (src/lib/onboarding.ts).
    let cancelled = false;
    (async () => {
      const route = await resolveColdStartRoute();
      if (!cancelled) router.replace(route as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
