/**
 * "You" tab — the account hub.
 *
 * Same sections, order, labels and icons as Herpetoverse's "You" tab (see
 * src/components/YouMenu.tsx for the shared structure). Rows differ only where
 * the feature does: sign-in methods, collection privacy, appearance,
 * achievements, referrals and the tutorial exist here and not (yet) in HV.
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { MenuRow, MenuSection } from '../../src/components/YouMenu';
import { TYPE } from '../../src/theme/tokens';

const PRIVACY_POLICY_URL = 'https://www.tarantuverse.com/privacy-policy';
const DELETE_CONFIRM_WORD = 'DELETE';

function ProfileScreen() {
  const { user, logout, refreshUser, units, setMeasurementUnits } = useAuth();
  const { theme, toggleTheme, colors, layout } = useTheme();
  const router = useRouter();
  const { isUpdatePending } = Updates.useUpdates();

  // Refresh user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      refreshUser();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', 'Please try again later.');
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
    // A bundle may already be downloaded (expo-updates fetches on launch), in
    // which case checkForUpdateAsync reports "not available" — offer restart.
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

  const handleAvatarPress = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Tarantuverse needs photo library access to set your profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0]);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setUploading(true);
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
    } catch (error: any) {
      Alert.alert('Could not update photo', error.response?.data?.detail || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setShowDeleteModal(false);
    setDeleteConfirmation('');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation.trim().toUpperCase() !== DELETE_CONFIRM_WORD) {
      Alert.alert('Type DELETE to confirm', 'Type DELETE in the box to permanently delete your account.');
      return;
    }
    setDeleting(true);
    try {
      await apiClient.delete('/auth/me');
      setShowDeleteModal(false);
      await logout();
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Could not delete account', error.response?.data?.detail || 'Please try again, or contact support.');
    } finally {
      setDeleting(false);
    }
  };

  const canConfirmDelete = deleteConfirmation.trim().toUpperCase() === DELETE_CONFIRM_WORD && !deleting;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      {/* ── Profile header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handleAvatarPress}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={uploading ? 'Uploading profile picture' : 'Change profile picture'}
          accessibilityHint={uploading ? undefined : 'Opens your photo library to pick a new picture'}
          accessibilityState={{ disabled: uploading, busy: uploading }}
        >
          {uploading ? (
            <View style={[styles.avatar, styles.avatarPlaceholder, { borderRadius: layout.radius.full, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={[styles.avatar, { borderRadius: layout.radius.full }]} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { borderRadius: layout.radius.full, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="camera-plus-outline" size={28} color={colors.primary} />
            </View>
          )}
          {!uploading && (
            <View
              style={[styles.avatarBadge, { borderRadius: layout.radius.full, backgroundColor: colors.primary, borderColor: colors.background }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <MaterialCommunityIcons name="pencil" size={12} color="#fff" />
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
        <MenuRow icon="account-edit-outline" label="Edit profile" onPress={() => router.push('/settings')} />
        <MenuRow icon="key-variant" label="Sign-in methods" onPress={() => router.push('/linked-accounts')}
          accessibilityHint="Manage which accounts you can sign in with" />
        <MenuRow icon="shield-account-outline" label="Collection privacy" onPress={() => router.push('/privacy')}
          accessibilityHint="Choose whether your collection is public" />
      </MenuSection>

      <MenuSection title="Notifications">
        <MenuRow icon="bell-outline" label="Inbox" onPress={() => router.push('/notification-center')}
          accessibilityHint="Opens your notifications" />
        <MenuRow icon="bell-cog-outline" label="Notification settings" onPress={() => router.push('/settings/notifications')} />
      </MenuSection>

      <MenuSection title="Your collection">
        <MenuRow icon="link" label="Sitter links" onPress={() => router.push('/sitter' as never)}
          accessibilityHint="Make a feeding-list link for someone looking after your animals" />
        <MenuRow icon="account-multiple-outline" label="Sharing" onPress={() => router.push('/sharing' as never)}
          accessibilityHint="Co-keepers: collections shared with you, and people who help keep yours" />
        <MenuRow icon="tray-arrow-down" label="Import collection" onPress={() => router.push('/import')} />
        <MenuRow icon="download-outline" label="Export your data" onPress={() => router.push('/settings/data-export')} />
      </MenuSection>

      <MenuSection title="Premium">
        <MenuRow icon="star-four-points-outline" label="Premium" onPress={() => router.push('/subscription')}
          accessibilityHint="See your plan, or upgrade" />
        <MenuRow icon="trophy-outline" label="Achievements" onPress={() => router.push('/achievements')} />
        <MenuRow icon="gift-outline" label="Refer friends" onPress={() => router.push('/settings/referrals')} />
      </MenuSection>

      <MenuSection title="Appearance">
        <MenuRow
          icon={theme === 'dark' ? 'weather-night' : 'weather-sunny'}
          label="Dark mode"
          accessory={
            <Switch
              value={theme === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel="Dark mode"
              accessibilityState={{ checked: theme === 'dark' }}
            />
          }
        />
        <MenuRow icon="palette-outline" label="Customize theme" onPress={() => router.push('/settings/appearance')} />
        {/* Display only: lengths and temperatures. Weights stay in grams and
            nothing stored changes. Syncs with the website. */}
        <MenuRow
          icon="ruler"
          label="Units"
          detail={units === 'metric' ? 'Metric (cm, °C)' : 'Imperial (in, °F)'}
          accessibilityHint="Choose inches and °F, or centimetres and °C"
          onPress={() => {
            const choose = (u: 'imperial' | 'metric') => {
              if (u === units) return;
              setMeasurementUnits(u).then((ok) => {
                if (!ok) Alert.alert('Could not save', 'Check your connection and try again.');
              });
            };
            Alert.alert('Units', 'Lengths and temperatures. Weights stay in grams.', [
              { text: 'Imperial (in, °F)', onPress: () => choose('imperial') },
              { text: 'Metric (cm, °C)', onPress: () => choose('metric') },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        />
      </MenuSection>

      <MenuSection title="Help & legal">
        <MenuRow icon="lifebuoy" label="Contact support" onPress={() => router.push('/support')} />
        <MenuRow icon="refresh" label="Check for updates" busy={checkingUpdate} onPress={handleCheckForUpdate} />
        <MenuRow
          icon="school-outline"
          label="Replay tutorial"
          onPress={async () => {
            await AsyncStorage.removeItem('dashboard_tour_completed');
            router.push('/(tabs)');
            Alert.alert('Tutorial reset', 'The dashboard tutorial will play on your next visit.');
          }}
        />
        <MenuRow icon="shield-lock-outline" label="Privacy policy" external onPress={() => openLink(PRIVACY_POLICY_URL)} />
        <MenuRow icon="file-document-outline" label="Terms of service" onPress={() => router.push('/terms')} />
        {user?.is_superuser ? (
          <MenuRow icon="shield-crown-outline" label="Admin panel" onPress={() => router.push('/admin')} />
        ) : null}
      </MenuSection>

      <MenuSection title="About">
        <MenuRow icon="information-outline" label="Version" accessory={
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>{appVersion}</Text>
        } />
      </MenuSection>

      <MenuSection>
        <MenuRow icon="logout" label="Sign out" onPress={handleSignOut} />
        <MenuRow icon="trash-can-outline" label="Delete account" danger onPress={() => setShowDeleteModal(true)}
          accessibilityHint="Opens a confirmation to permanently delete your account" />
      </MenuSection>

      {/* Delete-account confirmation — typed DELETE so a stray tap can't do it. */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderRadius: layout.radius.lg }]}>
            <Text style={[TYPE.heading, styles.center, { color: colors.error }]}>Delete your account?</Text>
            <Text style={[TYPE.body, styles.center, styles.gap, { color: colors.textSecondary }]}>
              This permanently deletes your account and every animal, log, photo and message tied to it — across
              Tarantuverse and Herpetoverse. This cannot be undone.
            </Text>
            <Text style={[TYPE.bodyStrong, styles.center, styles.gap, { color: colors.error }]}>
              Type {DELETE_CONFIRM_WORD} to confirm
            </Text>
            <TextInput
              style={[TYPE.subheading, styles.modalInput, {
                backgroundColor: colors.background, borderColor: colors.border,
                borderRadius: layout.radius.md, color: colors.textPrimary,
              }]}
              placeholder={DELETE_CONFIRM_WORD}
              placeholderTextColor={colors.textTertiary}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              accessibilityLabel="Type DELETE to confirm account deletion"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { borderWidth: 1, borderColor: colors.border, borderRadius: layout.radius.md }]}
                onPress={closeDeleteModal}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, {
                  backgroundColor: colors.error, borderRadius: layout.radius.md,
                  opacity: canConfirmDelete ? 1 : 0.4,
                }]}
                onPress={handleDeleteAccount}
                disabled={!canConfirmDelete}
                accessibilityRole="button"
                accessibilityLabel={deleting ? 'Deleting account' : 'Permanently delete account'}
                accessibilityState={{ disabled: !canConfirmDelete, busy: deleting }}
              >
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={[TYPE.subheading, { color: '#fff' }]}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 40 },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 4, gap: 2 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 96, height: 96 },
  avatarPlaceholder: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 26, height: 26,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  gap: { marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { padding: 24, width: '100%', maxWidth: 400 },
  modalInput: { borderWidth: 1, padding: 14, marginTop: 12, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalButton: { flex: 1, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
});

export default withErrorBoundary(ProfileScreen, 'profile');
