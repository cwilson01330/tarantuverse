/**
 * Species tab — Bundle 4 will wire the actual catalog (GET
 * /reptile-species with search). For Bundle 1 it's a stub.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function SpeciesScreen() {
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="book-open-variant"
          size={72}
          color={colors.primary}
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Species</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Browse reptile care sheets — snakes and lizards.
        </Text>
        <View
          style={[
            styles.placeholder,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
            },
          ]}
        >
          <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>
            Bundle 4 wires up species browsing + care sheets.
          </Text>
        </View>
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
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, marginTop: 8, textAlign: 'center' },
  placeholder: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  placeholderText: { fontSize: 13, textAlign: 'center' },
});
