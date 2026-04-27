/**
 * Collection tab — Bundle 2 will replace this with the actual reptile
 * list (GET /snakes and /lizards merged). For Bundle 1 it's a welcome
 * stub so the auth + navigation flow is testable end-to-end.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';

function CollectionScreen() {
  const { user } = useAuth();
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="snake"
          size={72}
          color={colors.primary}
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Welcome{user?.display_name ? `, ${user.display_name}` : ''}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your reptile collection will appear here.
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
            Bundle 2 wires up snake + lizard CRUD.
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

export default withErrorBoundary(CollectionScreen, 'collection');
