/**
 * New-pairing route stub — placeholder for Sprint 5b.
 *
 * Wired into the breeding tab's "+ New pairing" CTA from Sprint 5a so
 * the navigation works today. 5b replaces this entire file with the
 * actual create form (taxon picker → parent autocomplete → date +
 * type + notes → submit).
 *
 * Honesty-first: the placeholder copy is upfront about what's coming
 * rather than pretending the form is broken.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { useTheme } from '../../../src/contexts/ThemeContext';

function NewPairingPlaceholder() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="New pairing" leftAction={<HeaderBackButton />} />
      <View style={styles.center}>
        <Text style={[styles.emoji]}>🚧</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Coming next
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          The create flow lands in the next sprint. For now you can
          record pairings on the web app — they&apos;ll show up in this
          tab as soon as you do.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.button,
            { borderColor: colors.border, borderRadius: layout.radius.sm },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.textPrimary }]}>
            Back to breeding
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 18, fontWeight: '700' },
  body: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
  },
  buttonText: { fontSize: 13, fontWeight: '600' },
});

export default withErrorBoundary(NewPairingPlaceholder, 'pairings-new-placeholder');
