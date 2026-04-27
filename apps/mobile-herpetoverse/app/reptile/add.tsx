/**
 * Add reptile — Bundle 4 stub.
 *
 * Bundle 2 collection screen routes here from the empty-state CTA and
 * the FAB. Bundle 4 will replace this with the actual form (taxon
 * picker + species autocomplete + name + sex + acquisition info, etc.,
 * adapted from /app/reptiles/add on web-herpetoverse).
 */
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function AddReptileStub() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Add reptile', headerBackTitle: 'Back' }} />
      <View style={styles.content}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>🐍</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Add a reptile — coming soon
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Bundle 4 wires the add-reptile flow (taxon picker + species
          autocomplete + intake details). For now, add reptiles via the
          web app at herpetoverse.com — they'll show up here on next
          refresh.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.button,
            { borderColor: colors.border, borderRadius: layout.radius.md },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.textPrimary }]}>
            Back to collection
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
