/**
 * Settings — account, support, and legal for Herpetoverse mobile.
 *
 * v1 (Bundle 1) scope: sign out, account deletion, support + legal
 * links, app version. Profile editing, notification preferences, and a
 * reptile-aware data export are tracked for later bundles.
 *
 * Account deletion is an App Store requirement (Guideline 5.1.1(v)) —
 * any app offering account creation must offer in-app deletion. It
 * calls `DELETE /auth/me`; the backend CASCADE-deletes every record
 * tied to the keeper. The typed-"DELETE" confirmation mirrors the
 * Tarantuverse mobile delete flow.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme, type ThemeColors } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';
import { captureEvent } from '../src/services/posthog';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';

// Legal pages currently live on the Tarantuverse web app under the
// /herpetoverse/ path — herpetoverse.com has no legal routes of its own
// yet. Revisit relocating these to herpetoverse.com before launch.
const PRIVACY_URL = 'https://www.tarantuverse.com/herpetoverse/privacy-policy';
const TERMS_URL = 'https://www.tarantuverse.com/herpetoverse/terms';
const SUPPORT_EMAIL = 'support@tarantuverse.com';
const DELETE_CONFIRM_WORD = 'DELETE';

function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { colors, layout } = useTheme();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const canConfirmDelete =
    confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD && !deleting;

  function handleSignOut() {
    Alert.alert('Sign out', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          captureEvent('logout');
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', 'Please try again later.');
    }
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteOpen(false);
    setConfirmText('');
  }

  async function handleDeleteAccount() {
    if (!canConfirmDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete('/auth/me');
      captureEvent('account_deleted');
      // The account no longer exists server-side — clear local auth and
      // drop back to the login screen.
      await logout();
      setDeleteOpen(false);
      setConfirmText('');
      router.replace('/login');
    } catch {
      Alert.alert(
        'Could not delete account',
        'Something went wrong. Please try again, or contact support if it keeps happening.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Settings" leftAction={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel text="Account" colors={colors} />
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
          <ActionRow
            icon="account-edit-outline"
            label="Edit profile"
            onPress={() => router.push('/edit-profile' as never)}
            colors={colors}
          />
          <Divider color={colors.border} />
          <ActionRow
            icon="logout"
            label="Sign out"
            onPress={handleSignOut}
            colors={colors}
          />
          <Divider color={colors.border} />
          <ActionRow
            icon="trash-can-outline"
            label="Delete account"
            danger
            onPress={() => setDeleteOpen(true)}
            colors={colors}
          />
        </View>

        <SectionLabel text="Reminders" colors={colors} />
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
          <ActionRow
            icon="bell-outline"
            label="Notifications"
            onPress={() => router.push('/notification-preferences' as never)}
            colors={colors}
          />
        </View>

        <SectionLabel text="Support & legal" colors={colors} />
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
          <ActionRow
            icon="lifebuoy"
            label="Contact support"
            external
            onPress={() =>
              openLink(`mailto:${SUPPORT_EMAIL}?subject=Herpetoverse%20support`)
            }
            colors={colors}
          />
          <Divider color={colors.border} />
          <ActionRow
            icon="shield-account-outline"
            label="Privacy policy"
            external
            onPress={() => openLink(PRIVACY_URL)}
            colors={colors}
          />
          <Divider color={colors.border} />
          <ActionRow
            icon="file-document-outline"
            label="Terms of service"
            external
            onPress={() => openLink(TERMS_URL)}
            colors={colors}
          />
        </View>

        <SectionLabel text="About" colors={colors} />
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
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons
                name="information-outline"
                size={20}
                color={colors.textSecondary}
              />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Version
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {appVersion}
            </Text>
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.textTertiary }]}>
          Herpetoverse · Appalachian Tarantulas, LLC
        </Text>
      </ScrollView>

      {/* Delete-account confirmation. Typed-"DELETE" gate so it can't be
          triggered by a stray tap. */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalFill}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeDeleteModal}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            {/* Inner Pressable swallows taps so they don't dismiss. */}
            <Pressable
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.surface,
                  borderRadius: layout.radius.lg,
                },
              ]}
              onPress={() => {}}
            >
              <View
                style={[
                  styles.modalIcon,
                  { backgroundColor: colors.surfaceRaised },
                ]}
              >
                <MaterialCommunityIcons
                  name="alert-outline"
                  size={26}
                  color={colors.danger}
                />
              </View>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Delete your account?
              </Text>
              <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
                This permanently deletes your account and every animal, log,
                photo, and breeding record tied to it — across Herpetoverse
                and Tarantuverse. This cannot be undone.
              </Text>
              <Text
                style={[styles.modalPrompt, { color: colors.textSecondary }]}
              >
                Type {DELETE_CONFIRM_WORD} to confirm.
              </Text>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
                placeholder={DELETE_CONFIRM_WORD}
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.modalInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityLabel="Type DELETE to confirm account deletion"
              />
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={!canConfirmDelete}
                style={[
                  styles.modalDeleteBtn,
                  {
                    backgroundColor: colors.danger,
                    opacity: canConfirmDelete ? 1 : 0.4,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete account"
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete account</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={closeDeleteModal}
                disabled={deleting}
                style={styles.modalCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text
                  style={[styles.modalCancelText, { color: colors.textSecondary }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SectionLabel({ text, colors }: { text: string; colors: ThemeColors }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
      {text.toUpperCase()}
    </Text>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  colors,
  danger = false,
  external = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  danger?: boolean;
  external?: boolean;
}) {
  const tint = danger ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowLeft}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={danger ? colors.danger : colors.textSecondary}
        />
        <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      </View>
      <MaterialCommunityIcons
        name={external ? 'open-in-new' : 'chevron-right'}
        size={external ? 16 : 20}
        color={colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowValue: { fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 28,
  },

  // Delete-account modal
  modalFill: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    padding: 20,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  modalPrompt: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  modalDeleteBtn: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modalDeleteText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCancelBtn: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default withErrorBoundary(SettingsScreen, 'settings');
