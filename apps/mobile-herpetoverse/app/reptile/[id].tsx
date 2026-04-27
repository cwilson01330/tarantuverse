/**
 * Snake detail — Bundle 3 stub.
 *
 * Bundle 2 wires the collection screen, which routes here when a snake
 * card is tapped. Bundle 3 will replace this stub with the actual
 * detail screen (info, photos, weigh-ins, feedings, sheds — adapt
 * SnakeDetailClient.tsx from web-herpetoverse).
 *
 * Until then we render a friendly placeholder that surfaces the route
 * params so it's obvious which spider/snake the keeper meant to open.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function SnakeDetailStub() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Snake', headerBackTitle: 'Back' }} />
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="snake"
          size={56}
          color={colors.textTertiary}
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Snake detail — coming soon
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
