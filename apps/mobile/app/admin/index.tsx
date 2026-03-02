import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
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

interface AdminStats {
  total_users: number;
  total_species: number;
  premium_users: number;
  pending_reports: number;
}

export default function AdminIndexScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is_superuser) {
      Alert.alert('Access Denied', 'You do not have admin privileges.');
      router.back();
      return;
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/admin/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = stats ? [
    { label: 'Total Users', value: stats.total_users, icon: 'account-group', color: '#6366f1' },
    { label: 'Total Species', value: stats.total_species, icon: 'spider', color: '#8b5cf6' },
    { label: 'Premium Users', value: stats.premium_users, icon: 'crown', color: '#f59e0b' },
    { label: 'Pending Reports', value: stats.pending_reports, icon: 'flag', color: '#ef4444' },
  ] : [];

  const navCards = [
    {
      title: 'User Management',
      description: 'View, verify, and manage user accounts',
      icon: 'account-group' as const,
      color: '#6366f1',
      route: '/admin/users',
    },
    {
      title: 'Species Database',
      description: 'Edit, verify, and remove species entries',
      icon: 'spider' as const,
      color: '#8b5cf6',
      route: '/admin/species',
    },
  ];

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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Admin Panel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Grid */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PLATFORM STATS</Text>
        <View style={styles.statsGrid}>
          {statCards.map(card => (
            <View key={card.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: card.color + '20' }]}>
                <MaterialCommunityIcons name={card.icon as any} size={22} color={card.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{card.value.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Navigation Cards */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MANAGEMENT</Text>
        {navCards.map(card => (
          <TouchableOpacity
            key={card.title}
            style={[styles.navCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(card.route as any)}
          >
            <View style={[styles.navCardIcon, { backgroundColor: card.color + '20' }]}>
              <MaterialCommunityIcons name={card.icon} size={28} color={card.color} />
            </View>
            <View style={styles.navCardText}>
              <Text style={[styles.navCardTitle, { color: colors.textPrimary }]}>{card.title}</Text>
              <Text style={[styles.navCardDesc, { color: colors.textSecondary }]}>{card.description}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Refresh */}
        <TouchableOpacity
          style={[styles.refreshBtn, { borderColor: colors.border }]}
          onPress={() => { setLoading(true); fetchStats(); }}
        >
          <MaterialCommunityIcons name="refresh" size={18} color={colors.textSecondary} />
          <Text style={[styles.refreshText, { color: colors.textSecondary }]}>Refresh Stats</Text>
        </TouchableOpacity>

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
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '47.5%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: { fontSize: 26, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 12, textAlign: 'center' },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  navCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  navCardText: { flex: 1 },
  navCardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  navCardDesc: { fontSize: 13 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 8,
  },
  refreshText: { fontSize: 14 },
});
