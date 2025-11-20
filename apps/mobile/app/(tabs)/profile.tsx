import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

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
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="account" size={48} color={colors.primary} />
            </View>
          )}
        </View>
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

