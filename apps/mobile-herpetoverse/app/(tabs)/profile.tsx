/**
 * Profile tab — shows who you are, links to the morph calculator, and
 * opens the Settings screen. Sign out and account deletion live in
 * Settings.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';

function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarWrap}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
              },
            ]}
          >
            <MaterialCommunityIcons name="account" size={48} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.name, { color: colors.textPrimary }]}>
          {user?.display_name || user?.username || 'Keeper'}
        </Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email}</Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
            },
          ]}
        >
          <Row
            label="Username"
            value={user?.username || '—'}
            colors={colors}
          />
          <Divider color={colors.border} />
          <Row
            label="Account type"
            value={user?.is_admin ? 'Admin' : 'Keeper'}
            colors={colors}
          />
        </View>

        <TouchableOpacity
          onPress={() => router.push('/morph-calculator' as never)}
          style={[
            styles.toolButton,
            {
              borderColor: colors.border,
              borderRadius: layout.radius.md,
              backgroundColor: colors.surface,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open the morph calculator"
        >
          <MaterialCommunityIcons
            name="calculator-variant"
            size={20}
            color={colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.toolButtonTitle, { color: colors.textPrimary }]}>
              Morph calculator
            </Text>
            <Text
              style={[styles.toolButtonSubtitle, { color: colors.textSecondary }]}
            >
              Predict offspring from any pairing.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/settings' as never)}
          style={[
            styles.toolButton,
            {
              borderColor: colors.border,
              borderRadius: layout.radius.md,
              backgroundColor: colors.surface,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={20}
            color={colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.toolButtonTitle, { color: colors.textPrimary }]}>
              Settings
            </Text>
            <Text
              style={[styles.toolButtonSubtitle, { color: colors.textSecondary }]}
            >
              Account, support, and legal.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.textTertiary}
          />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  avatarWrap: { marginBottom: 16 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 22, fontWeight: '700' },
  email: { fontSize: 14, marginTop: 4 },
  card: {
    marginTop: 24,
    alignSelf: 'stretch',
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500' },
  divider: { height: 1 },
  toolButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toolButtonTitle: { fontSize: 15, fontWeight: '600' },
  toolButtonSubtitle: { fontSize: 12, marginTop: 2 },
});

export default withErrorBoundary(ProfileScreen, 'profile');
