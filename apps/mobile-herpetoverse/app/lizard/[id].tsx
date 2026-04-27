/**
 * Lizard detail — Bundle 3 stub. Mirror of reptile/[id] for lizards.
 * Bundle 3 will adapt LizardDetailClient.tsx from web-herpetoverse.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function LizardDetailStub() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Lizard', headerBackTitle: 'Back' }} />
      <View style={styles.content}>
        <Text style={{ fontSize: 56, marginBottom: 16 }}>🦎</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Lizard detail — coming soon
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Bundle 3 builds the full detail screen (info, photos, weigh-ins,
          feedings, sheds). Tap-through routing already works.
        </Text>
        {id && (
          <Text
            style={[styles.idText, { color: colors.textTertiary }]}
            selectable
          >
            ID: {id}
          </Text>
        )}
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
    marginBottom: 16,
    maxWidth: 320,
  },
  idText: { fontSize: 11, fontFamily: 'monospace', marginBottom: 24 },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
