import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="account" size={48} color="#7c3aed" />
            </View>
          )}
        </View>
        <Text style={styles.displayName}>{user?.display_name}</Text>
        <Text style={styles.username}>@{user?.username}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem}>
          <MaterialCommunityIcons name="cog" size={24} color="#6b7280" />
          <Text style={styles.menuText}>Settings</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#d1d5db" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <MaterialCommunityIcons name="shield-account" size={24} color="#6b7280" />
          <Text style={styles.menuText}>Privacy</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#d1d5db" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={24} color="#ef4444" />
          <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#d1d5db" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  logoutText: {
    color: '#ef4444',
  },
});
