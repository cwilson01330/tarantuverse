import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';

interface AdminUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  is_premium: boolean;
  created_at: string;
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!currentUser?.is_superuser) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      router.back();
      return;
    }
    fetchUsers();
  }, []);

  const fetchUsers = async (search?: string) => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await apiClient.get(`/admin/users${params}`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const handleSearch = () => {
    setSearching(true);
    fetchUsers(searchQuery.trim() || undefined);
  };

  const handleVerify = (user: AdminUser) => {
    if (user.is_verified) return;
    Alert.alert(
      'Verify User',
      `Manually verify ${user.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            try {
              await apiClient.post(`/admin/users/${user.id}/verify`);
              fetchUsers(searchQuery.trim() || undefined);
            } catch (error) {
              Alert.alert('Error', 'Failed to verify user');
            }
          },
        },
      ]
    );
  };

  const handleResendVerification = (user: AdminUser) => {
    Alert.alert(
      'Resend Verification',
      `Resend verification email to ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await apiClient.post(`/admin/users/${user.id}/resend-verification`);
              Alert.alert('Sent', `Verification email sent to ${user.email}`);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to resend verification');
            }
          },
        },
      ]
    );
  };

  const handleResetPassword = (user: AdminUser) => {
    Alert.alert(
      'Reset Password',
      `Send password reset email to ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await apiClient.post(`/admin/users/${user.id}/reset-password`);
              Alert.alert('Sent', `Password reset email sent to ${user.email}`);
            } catch (error) {
              Alert.alert('Error', 'Failed to send reset email');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (user: AdminUser) => {
    if (user.id === currentUser?.id) {
      Alert.alert('Error', 'You cannot delete your own account from here.');
      return;
    }
    Alert.alert(
      'Delete User',
      `Permanently delete ${user.username} (${user.email})? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/admin/users/${user.id}`);
              fetchUsers(searchQuery.trim() || undefined);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>User Management</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by email, username, or name..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); fetchUsers(); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.primary }]} onPress={handleSearch}>
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.resultCount, { color: colors.textTertiary }]}>
        {users.length} user{users.length !== 1 ? 's' : ''}
      </Text>

      {/* User List */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {users.map(user => (
          <View key={user.id} style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* User Info */}
            <View style={styles.userInfo}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + '30' }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {(user.display_name || user.username)?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                  {user.display_name || user.username}
                  {user.id === currentUser?.id && (
                    <Text style={{ color: colors.textTertiary }}> (you)</Text>
                  )}
                </Text>
                <Text style={[styles.username, { color: colors.textSecondary }]}>@{user.username}</Text>
                <Text style={[styles.email, { color: colors.textTertiary }]}>{user.email}</Text>
                <Text style={[styles.joinDate, { color: colors.textTertiary }]}>
                  Joined {formatDate(user.created_at)}
                </Text>
              </View>
            </View>

            {/* Badges */}
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: user.is_verified ? '#dcfce7' : '#fef9c3' }]}>
                <MaterialCommunityIcons
                  name={user.is_verified ? 'check-circle' : 'clock-outline'}
                  size={12}
                  color={user.is_verified ? '#166534' : '#854d0e'}
                />
                <Text style={[styles.badgeText, { color: user.is_verified ? '#166534' : '#854d0e' }]}>
                  {user.is_verified ? 'Verified' : 'Unverified'}
                </Text>
              </View>

              {user.is_superuser && (
                <View style={[styles.badge, { backgroundColor: '#f3e8ff' }]}>
                  <MaterialCommunityIcons name="shield-crown" size={12} color="#7c3aed" />
                  <Text style={[styles.badgeText, { color: '#7c3aed' }]}>Admin</Text>
                </View>
              )}

              {user.is_premium && (
                <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                  <MaterialCommunityIcons name="crown" size={12} color="#b45309" />
                  <Text style={[styles.badgeText, { color: '#b45309' }]}>Premium</Text>
                </View>
              )}

              {!user.is_active && (
                <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
                  <MaterialCommunityIcons name="close-circle" size={12} color="#991b1b" />
                  <Text style={[styles.badgeText, { color: '#991b1b' }]}>Inactive</Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              {!user.is_verified && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#dcfce7' }]}
                  onPress={() => handleVerify(user)}
                >
                  <MaterialCommunityIcons name="check-circle" size={14} color="#166534" />
                  <Text style={[styles.actionBtnText, { color: '#166534' }]}>Verify</Text>
                </TouchableOpacity>
              )}

              {!user.is_verified && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]}
                  onPress={() => handleResendVerification(user)}
                >
                  <MaterialCommunityIcons name="email-outline" size={14} color={colors.primary} />
                  <Text style={[styles.actionBtnText, { color: colors.primary }]}>Resend</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#dbeafe' }]}
                onPress={() => handleResetPassword(user)}
              >
                <MaterialCommunityIcons name="lock-reset" size={14} color="#1e40af" />
                <Text style={[styles.actionBtnText, { color: '#1e40af' }]}>Reset PW</Text>
              </TouchableOpacity>

              {user.id !== currentUser?.id && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#fee2e2' }]}
                  onPress={() => handleDelete(user)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#991b1b" />
                  <Text style={[styles.actionBtnText, { color: '#991b1b' }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {users.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-search" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No users found</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, marginLeft: 8, padding: 0 },
  searchBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultCount: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
  list: { flex: 1, paddingHorizontal: 16 },
  userCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  userInfo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700' },
  displayName: { fontSize: 15, fontWeight: '600' },
  username: { fontSize: 13, marginTop: 1 },
  email: { fontSize: 12, marginTop: 1 },
  joinDate: { fontSize: 11, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: { fontSize: 12, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, marginTop: 12 },
});
