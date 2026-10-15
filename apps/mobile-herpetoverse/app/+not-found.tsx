/**
 * Unmatched-route screen.
 *
 * Replaces expo-router's default, which shows a "Sitemap" link listing every
 * route in the app. A stale link, a web URL that slipped through the app-link
 * filters, or an old notification lands here instead: a plain message and a
 * way home. ThemeContext colors only.
 */
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <MaterialCommunityIcons name="map-marker-question-outline" size={48} color={colors.textTertiary} />
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        This page isn&apos;t in the app
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        The link may be old, or it points at something that only lives on the website.
      </Text>
      <TouchableOpacity
        onPress={() => router.replace('/' as never)}
        style={[styles.button, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
        accessibilityRole="button"
        accessibilityLabel="Go to home"
      >
        <Text style={styles.buttonText}>Go home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  button: { marginTop: 12, minHeight: 48, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },
});
