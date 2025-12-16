import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, ActivityIndicator, TextInput, Modal, ScrollView } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../src/services/api';

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme, colors } = useTheme();
  const router = useRouter();

  // Refresh user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [])
  );

  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleAvatarPress = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need camera roll permissions to upload an avatar.');
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
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      setUploading(true);
      const formData = new FormData();

      const fileData = {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any;

      formData.append('file', fileData);

      await apiClient.post('/auth/me/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      await refreshUser();
      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm account deletion');
      return;
    }

    setDeleting(true);
    try {
      await apiClient.delete('/auth/me');
      setShowDeleteModal(false);
      await logout();
      router.replace('/login');
    } catch (error: any) {
      console.error('Delete account error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    header: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatarContainer: {
      marginBottom: 16,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
    },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary + '33',
      justifyContent: 'center',
      alignItems: 'center',
    },
    displayName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    username: {
      fontSize: 16,
      color: colors.textTertiary,
    },
    section: {
      marginTop: 16,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuText: {
      flex: 1,
      fontSize: 16,
      color: colors.textSecondary,
      marginLeft: 12,
    },
    logoutText: {
      color: colors.error,
    },
    editBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    deleteText: {
      color: colors.error,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.error,
      marginBottom: 12,
      textAlign: 'center',
    },
    modalText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
      textAlign: 'center',
    },
    modalWarning: {
      fontSize: 13,
      color: colors.error,
      marginBottom: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    modalInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 16,
      textAlign: 'center',
      fontWeight: '600',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    modalButton: {
      flex: 1,
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    modalCancelButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalDeleteButton: {
      backgroundColor: colors.error,
    },
    modalCancelButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    modalDeleteButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handleAvatarPress} disabled={uploading}>
          {uploading ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="camera" size={32} color={colors.primary} />
            </View>
          )}
          {!uploading && (
            <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="pencil" size={12} color="white" />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.displayName}>{user?.display_name}</Text>
        <Text style={styles.username}>@{user?.username}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.menuItem}>
          <MaterialCommunityIcons
            name={theme === 'dark' ? 'weather-night' : 'weather-sunny'}
            size={24}
            color={colors.primary}
          />
          <Text style={styles.menuText}>
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </Text>
          <Switch
            value={theme === 'dark'}
            onValueChange={toggleTheme}
            trackColor={{ false: '#767577', true: colors.primary }}
            thumbColor="#ffffff"
          />
        </View>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/appearance')}>
          <MaterialCommunityIcons name="palette" size={24} color={colors.secondary} />
          <Text style={styles.menuText}>Customize Theme</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings')}>
          <MaterialCommunityIcons name="cog" size={24} color={colors.textTertiary} />
          <Text style={styles.menuText}>Edit Profile</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/notifications')}>
          <MaterialCommunityIcons name="bell" size={24} color={colors.primary} />
          <Text style={styles.menuText}>Notifications</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/referrals')}>
          <MaterialCommunityIcons name="gift" size={24} color={colors.secondary} />
          <Text style={styles.menuText}>Refer Friends</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/subscription')}>
          <MaterialCommunityIcons name="crown" size={24} color="#fbbf24" />
          <Text style={styles.menuText}>Subscription & Premium</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy')}>
          <MaterialCommunityIcons name="shield-account" size={24} color={colors.textTertiary} />
          <Text style={styles.menuText}>Privacy Settings</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={24} color={colors.error} />
          <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => setShowDeleteModal(true)}>
          <MaterialCommunityIcons name="delete-forever" size={24} color={colors.error} />
          <Text style={[styles.menuText, styles.deleteText]}>Delete Account</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalText}>
              This action is permanent and cannot be undone. All your data including tarantulas, photos, logs, and messages will be permanently deleted.
            </Text>
            <Text style={styles.modalWarning}>
              Type DELETE to confirm
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Type DELETE"
              placeholderTextColor={colors.textTertiary}
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
              editable={!deleting}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                disabled={deleting}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDeleteButton, { opacity: deleting ? 0.6 : 1 }]}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalDeleteButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

