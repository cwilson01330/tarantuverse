import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, ActivityIndicator } from 'react-native';
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

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
  });

  return (
    <View style={styles.container}>
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
      </View>
    </View>
  );
}

