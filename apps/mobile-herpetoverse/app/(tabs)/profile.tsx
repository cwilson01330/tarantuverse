/**
 * "You" tab — the account hub.
 *
 * Same sections, order, labels and icons as Tarantuverse's "You" tab (see
 * src/components/YouMenu.tsx for the shared structure), so a keeper who uses
 * both apps finds everything in the same place. Rows differ only where the
 * feature does: Morph calculator is Herpetoverse-only; sign-in methods,
 * collection privacy, appearance, achievements and referrals don't exist here
 * yet, so their rows are absent rather than dead.
 *
 * This used to be a thin card in front of a separate Settings screen, which
 * put everything one tap deeper than in Tarantuverse. Settings' content now
 * lives here; /settings redirects to this tab so old links still land.
 *
 * Account deletion is an App Store requirement (Guideline 5.1.1(v)). It calls
 * DELETE /auth/me; the backend CASCADE-deletes every record tied to the keeper.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';
import { restorePurchases, isIAPAvailable } from '../../src/services/iap';
import UpgradeModal from '../../src/components/UpgradeModal';
import { captureEvent } from '../../src/services/posthog';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { MenuRow, MenuSection } from '../../src/components/YouMenu';
import { TYPE } from '../../src/theme/type';

// HV-owned legal pages, served from herpetoverse.com.
const PRIVACY_URL = 'https://herpetoverse.com/privacy-policy';
const TERMS_URL = 'https://herpetoverse.com/terms';
const SUPPORT_EMAIL = 'support@tarantuverse.com';
const DELETE_CONFIRM_WORD = 'DELETE';
// Data export runs on the web for now: an in-app download needs
// expo-file-system + expo-sharing, which need a native rebuild (not OTA).
// The web settings page exports the same reptile-aware bundle.
const EXPORT_URL = 'https://herpetoverse.com/app/settings';

type SubStatus = {
  is_premium: boolean;
  tier: string;
  plan_display_name: string;
  expires_at: string | null;
  source: string | null;
};

function YouScreen() {
  const router = useRouter();
  const { user, logout, token, refreshUser } = useAuth();
  const { colors, layout } = useTheme();
  const { isUpdatePending } = Updates.useUpdates();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '';
  const canConfirmDelete = confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD && !deleting;

  const loadSub = () =>
    apiClient
      .get('/subscriptions/app-status', { params: { app: 'herpetoverse' } })
      .then((r) => setSub(r.data))
      .catch(() => setSub(null));

  useEffect(() => {
    void loadSub();
  }, [token]);

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleAvatarPress = async () => {
    if (uploadingAvatar) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Herpetoverse needs photo library access to set your profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);
      await apiClient.post('/auth/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
    } catch (e: any) {
      Alert.alert('Could not update photo', e?.response?.data?.detail || e?.message || 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRestore = async () => {
    if (!token || restoring) return;
    setRestoring(true);
    try {
      const ok = await restorePurchases(token);
      await refreshUser();
      await loadSub();
      Alert.alert(
        ok ? 'Restored' : 'Nothing to restore',
        ok ? 'Your previous purchases have been restored.' : 'No previous purchases were found for this account.',
      );
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message || 'Could not restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  const handleCheckForUpdate = async () => {
    if (__DEV__ || !Updates.isEnabled) {
      Alert.alert('Updates unavailable', 'Update checks only work in a released build of the app.');
      return;
    }
    const offerRestart = () =>
      Alert.alert('Update ready', 'A new version has been downloaded. Restart now to apply it?', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => { Updates.reloadAsync(); } },
      ]);
    // A bundle may already be downloaded on launch, in which case
    // checkForUpdateAsync reports "not available" — offer the restart.
    if (isUpdatePending) {
      offerRestart();
      return;
    }
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        offerRestart();
      } else {
        Alert.alert("You're up to date", 'You already have the latest version.');
      }
    } catch {
      Alert.alert('Check failed', 'Could not check for updates. Try again on a stable connection.');
    } finally {
      setCheckingUpdate(false);
    }
  };

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

  const sourceLabel =
    sub?.source === 'apple' ? 'the App Store'
      : sub?.source === 'google' ? 'Google Play'
        : sub?.source === 'stripe' ? 'the web'
          : null;

  const planDetail = sub?.is_premium
    ? [
        sub.tier === 'all_access' ? 'Covers Herpetoverse and Tarantuverse.' : null,
        sub.expires_at ? `Renews or expires ${new Date(sub.expires_at).toLocaleDateString()}.` : null,
        sourceLabel ? `Managed through ${sourceLabel}.` : null,
      ].filter(Boolean).join(' ')
    : 'Free plan · up to 5 animals.';

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader title="You" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Profile header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleAvatarPress}
            disabled={uploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel={uploadingAvatar ? 'Uploading profile picture' : 'Change profile picture'}
            accessibilityHint={uploadingAvatar ? undefined : 'Opens your photo library to pick a new picture'}
            accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
            style={styles.avatarWrap}
          >
            {uploadingAvatar ? (
              <View style={[styles.avatar, styles.avatarPlaceholder, { borderRadius: 999, backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={[styles.avatar, { borderRadius: 999 }]} accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { borderRadius: 999, backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.primary} />
              </View>
            )}
            {!uploadingAvatar && (
              <View
                style={[styles.avatarBadge, { borderRadius: 999, backgroundColor: colors.primary, borderColor: colors.background }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                <MaterialCommunityIcons name="pencil" size={12} color="#0B0B0B" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={[TYPE.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {user?.display_name || user?.username || 'Keeper'}
          </Text>
          {!!user?.username && (
            <Text style={[TYPE.body, { color: colors.textTertiary }]}>@{user.username}</Text>
          )}
        </View>

        <MenuSection title="Account">
          <MenuRow icon="account-edit-outline" label="Edit profile" onPress={() => router.push('/edit-profile' as never)} />
        </MenuSection>

        <MenuSection title="Notifications">
          <MenuRow icon="bell-outline" label="Inbox" onPress={() => router.push('/notification-center' as never)}
            accessibilityHint="Opens your notifications" />
          <MenuRow icon="bell-cog-outline" label="Notification settings"
            onPress={() => router.push('/notification-preferences' as never)} />
        </MenuSection>

        <MenuSection title="Your collection">
          <MenuRow icon="link" label="Sitter links" onPress={() => router.push('/sitter' as never)}
            accessibilityHint="Make a feeding-list link for someone looking after your animals" />
          <MenuRow icon="tray-arrow-down" label="Import collection" onPress={() => router.push('/import' as never)} />
          <MenuRow icon="download-outline" label="Export your data" external onPress={() => openLink(EXPORT_URL)} />
          <MenuRow icon="calculator-variant" label="Morph calculator" detail="Predict offspring from any pairing."
            onPress={() => router.push('/morph-calculator' as never)} />
        </MenuSection>

        <MenuSection title="Premium">
          <MenuRow
            icon="star-four-points-outline"
            label={sub?.is_premium ? `${sub.plan_display_name} — active` : 'Premium'}
            detail={planDetail}
            onPress={sub?.is_premium ? undefined : () => setUpgradeOpen(true)}
            accessibilityHint={sub?.is_premium ? undefined : 'See plans and upgrade'}
          />
          {isIAPAvailable() ? (
            <MenuRow icon="restore" label="Restore purchases" busy={restoring} onPress={handleRestore} />
          ) : null}
        </MenuSection>

        <MenuSection title="Help & legal">
          <MenuRow icon="lifebuoy" label="Contact support" external
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}?subject=Herpetoverse%20support`)} />
          <MenuRow icon="refresh" label="Check for updates" busy={checkingUpdate} onPress={handleCheckForUpdate} />
          <MenuRow icon="shield-lock-outline" label="Privacy policy" external onPress={() => openLink(PRIVACY_URL)} />
          <MenuRow icon="file-document-outline" label="Terms of service" external onPress={() => openLink(TERMS_URL)} />
        </MenuSection>

        <MenuSection title="About">
          <MenuRow icon="information-outline" label="Version" accessory={
            <Text style={[TYPE.body, { color: colors.textSecondary }]}>{appVersion}</Text>
          } />
        </MenuSection>

        <MenuSection>
          <MenuRow icon="logout" label="Sign out" onPress={handleSignOut} />
          <MenuRow icon="trash-can-outline" label="Delete account" danger onPress={() => setDeleteOpen(true)}
            accessibilityHint="Opens a confirmation to permanently delete your account" />
        </MenuSection>

        <Text style={[TYPE.caption, styles.footer, { color: colors.textTertiary }]}>
          Herpetoverse · Appalachian Tarantulas, LLC
        </Text>
      </ScrollView>

      {/* Plans / purchase sheet (reused from the cap gate). */}
      <UpgradeModal
        source="settings"
        visible={upgradeOpen}
        onClose={() => {
          setUpgradeOpen(false);
          void loadSub(); // a purchase may have just completed in the sheet
        }}
        title="Herpetoverse Premium"
        message="Unlimited animals, breeding, feeder tracking, and detailed analytics."
      />

      {/* Delete-account confirmation — typed DELETE so a stray tap can't do it. */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={closeDeleteModal} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <Pressable style={styles.modalBackdrop} onPress={closeDeleteModal} accessibilityRole="button" accessibilityLabel="Dismiss">
            {/* Inner Pressable swallows taps so they don't dismiss. */}
            <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: layout.radius.lg }]} onPress={() => {}}>
              <View style={[styles.modalIcon, { borderRadius: 999, backgroundColor: colors.surfaceRaised }]}>
                <MaterialCommunityIcons name="alert-outline" size={26} color={colors.danger} />
              </View>
              <Text style={[TYPE.heading, styles.center, { color: colors.textPrimary }]}>Delete your account?</Text>
              <Text style={[TYPE.body, styles.center, styles.gap, { color: colors.textSecondary }]}>
                This permanently deletes your account and every animal, log, photo, and breeding record tied to it —
                across Herpetoverse and Tarantuverse. This cannot be undone.
              </Text>
              <Text style={[TYPE.bodyStrong, styles.center, styles.gapLg, { color: colors.textSecondary }]}>
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
                style={[TYPE.subheading, styles.modalInput, {
                  color: colors.textPrimary, borderColor: colors.border,
                  backgroundColor: colors.surfaceRaised, borderRadius: layout.radius.md,
                }]}
                accessibilityLabel="Type DELETE to confirm account deletion"
              />
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={!canConfirmDelete}
                style={[styles.modalDeleteBtn, {
                  backgroundColor: colors.danger, opacity: canConfirmDelete ? 1 : 0.4, borderRadius: layout.radius.md,
                }]}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete account"
                accessibilityState={{ disabled: !canConfirmDelete, busy: deleting }}
              >
                {deleting ? <ActivityIndicator color="#fff" /> : (
                  <Text style={[TYPE.subheading, { color: '#fff' }]}>Delete account</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={closeDeleteModal} disabled={deleting} style={styles.modalCancelBtn}
                accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={[TYPE.subheading, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 40 },
  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 4, gap: 2 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 96, height: 96 },
  avatarPlaceholder: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 26, height: 26,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  footer: { textAlign: 'center', marginTop: 28 },
  center: { textAlign: 'center' },
  gap: { marginTop: 8 },
  gapLg: { marginTop: 16, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { padding: 20 },
  modalIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  modalInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, letterSpacing: 2, textAlign: 'center' },
  modalDeleteBtn: { marginTop: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  modalCancelBtn: { marginTop: 6, paddingVertical: 12, alignItems: 'center' },
});

export default withErrorBoundary(YouScreen, 'you');
