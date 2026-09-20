import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';
import { resolveColdStartRoute } from '../src/lib/onboarding';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Resume an unfinished carousel rather than skipping it forever. There's
    // no auth event here to read `is_new_user` from, so only the pending
    // marker can route to onboarding — an existing keeper has none and goes
    // straight to the tabs, which is the behaviour that must not regress.
    let cancelled = false;
    (async () => {
      const route = await resolveColdStartRoute();
      if (!cancelled) router.replace(route);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    logo: {
      fontSize: 80,
      marginBottom: 20,
    },
    text: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textTertiary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🕷️</Text>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}
