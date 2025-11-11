import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface SpeciesCount {
  species_name: string;
  count: number;
}

interface ActivityItem {
  type: string;
  date: string;
  tarantula_id: string;
  tarantula_name: string;
  description: string;
}

interface CollectionAnalytics {
  total_tarantulas: number;
  unique_species: number;
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
  species_counts: SpeciesCount[];
  total_value: number;
  average_age_months: number;
  total_feedings: number;
  total_molts: number;
  total_substrate_changes: number;
  average_days_between_feedings: number;
  most_active_molter: {
    tarantula_id: string;
    name: string;
    molt_count: number;
  } | null;
  newest_acquisition: {
    tarantula_id: string;
    name: string;
    date: string;
  } | null;
  oldest_acquisition: {
    tarantula_id: string;
    name: string;
    date: string;
  } | null;
  recent_activity: ActivityItem[];
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [analytics, setAnalytics] = useState<CollectionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/analytics/collection');
      setAnalytics(response.data);
    } catch (error) {
      // Show empty state
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'feeding':
        return '🍴';
      case 'molt':
        return '🦋';
      case 'substrate_change':
        return '🏠';
      default:
        return '📝';
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      marginTop: 100,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    section: {
      padding: 8,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    card: {
      backgroundColor: colors.surface,
      margin: 8,
      padding: 16,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    sexBar: {
      flexDirection: 'row',
      height: 40,
      borderRadius: 8,
      overflow: 'hidden',
    },
    sexSegment: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    maleSegment: {
      backgroundColor: '#3b82f6',
    },
    femaleSegment: {
      backgroundColor: '#ec4899',
    },
    sexSegmentText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    unknownText: {
      marginTop: 8,
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    activityGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
    },
    activityItem: {
      alignItems: 'center',
    },
    activityValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 4,
    },
    activityLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    avgStat: {
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      alignItems: 'center',
    },
    avgLabel: {
      fontSize: 13,
      color: colors.textTertiary,
      marginBottom: 4,
    },
    avgValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    notableItem: {
      padding: 12,
      borderRadius: 8,
      marginBottom: 8,
    },
    purpleBg: {
      backgroundColor: '#f3e8ff',
    },
    greenBg: {
      backgroundColor: '#dcfce7',
    },
    blueBg: {
      backgroundColor: '#dbeafe',
    },
    notableLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 4,
    },
    notableName: {
      fontSize: 16,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 2,
    },
    notableDetail: {
      fontSize: 13,
      color: '#6b7280',
    },
    speciesItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    speciesName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginRight: 8,
    },
    speciesBar: {
      flex: 2,
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      marginRight: 8,
      overflow: 'hidden',
    },
    speciesBarFill: {
      height: '100%',
      backgroundColor: '#10b981',
    },
    speciesCount: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      width: 30,
      textAlign: 'right',
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    activityIcon: {
      fontSize: 24,
      marginRight: 12,
    },
    activityContent: {
      flex: 1,
    },
    activityName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    activityDesc: {
      fontSize: 13,
      color: colors.textTertiary,
      marginBottom: 2,
    },
    activityDate: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    scrollContent: {
      flex: 1,
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!analytics || analytics.total_tarantulas === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Collection Analytics</Text>
        </View>
        <ScrollView style={styles.container}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="chart-bar" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Analytics Available</Text>
            <Text style={styles.emptyText}>
              Add tarantulas to your collection to see analytics
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const totalSexed = analytics.sex_distribution.male + analytics.sex_distribution.female;
  const malePercent = totalSexed > 0 ? (analytics.sex_distribution.male / totalSexed * 100) : 0;
  const femalePercent = totalSexed > 0 ? (analytics.sex_distribution.female / totalSexed * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Analytics</Text>
      </View>

      <ScrollView style={styles.scrollContent}>

      {/* Overview Stats */}
      <View style={styles.section}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics.total_tarantulas}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics.unique_species}</Text>
            <Text style={styles.statLabel}>Species</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>${analytics.total_value.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Value</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics.average_age_months}</Text>
            <Text style={styles.statLabel}>Avg Age (mo)</Text>
          </View>
        </View>
      </View>

      {/* Sex Distribution */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sex Distribution</Text>
        <View style={styles.sexBar}>
          {malePercent > 0 && (
            <View style={[styles.sexSegment, styles.maleSegment, { width: `${malePercent}%` as any }]}>
              <Text style={styles.sexSegmentText}>♂ {analytics.sex_distribution.male}</Text>
            </View>
          )}
          {femalePercent > 0 && (
            <View style={[styles.sexSegment, styles.femaleSegment, { width: `${femalePercent}%` as any }]}>
              <Text style={styles.sexSegmentText}>♀ {analytics.sex_distribution.female}</Text>
            </View>
          )}
        </View>
        {analytics.sex_distribution.unknown > 0 && (
          <Text style={styles.unknownText}>
            {analytics.sex_distribution.unknown} unknown
          </Text>
        )}
      </View>

      {/* Activity Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity Stats</Text>
        <View style={styles.activityGrid}>
          <View style={styles.activityItem}>
            <Text style={styles.activityValue}>{analytics.total_feedings}</Text>
            <Text style={styles.activityLabel}>Feedings</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityValue}>{analytics.total_molts}</Text>
            <Text style={styles.activityLabel}>Molts</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityValue}>{analytics.total_substrate_changes}</Text>
            <Text style={styles.activityLabel}>Substrate</Text>
          </View>
        </View>
        <View style={styles.avgStat}>
          <Text style={styles.avgLabel}>Avg Days Between Feedings</Text>
          <Text style={styles.avgValue}>{analytics.average_days_between_feedings}</Text>
        </View>
      </View>

      {/* Notable Tarantulas */}
      {(analytics.most_active_molter || analytics.newest_acquisition || analytics.oldest_acquisition) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notable Tarantulas</Text>

          {analytics.most_active_molter && (
            <View style={[styles.notableItem, styles.purpleBg]}>
              <Text style={styles.notableLabel}>🦋 Most Active Molter</Text>
              <Text style={styles.notableName}>{analytics.most_active_molter.name}</Text>
              <Text style={styles.notableDetail}>{analytics.most_active_molter.molt_count} molts</Text>
            </View>
          )}

          {analytics.newest_acquisition && (
            <View style={[styles.notableItem, styles.greenBg]}>
              <Text style={styles.notableLabel}>🆕 Newest Addition</Text>
              <Text style={styles.notableName}>{analytics.newest_acquisition.name}</Text>
              <Text style={styles.notableDetail}>Added {formatDate(analytics.newest_acquisition.date)}</Text>
            </View>
          )}

          {analytics.oldest_acquisition && (
            <View style={[styles.notableItem, styles.blueBg]}>
              <Text style={styles.notableLabel}>👴 Oldest in Collection</Text>
              <Text style={styles.notableName}>{analytics.oldest_acquisition.name}</Text>
              <Text style={styles.notableDetail}>Since {formatDate(analytics.oldest_acquisition.date)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Top Species */}
      {analytics.species_counts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Species</Text>
          {analytics.species_counts.slice(0, 5).map((species, index) => {
            const percentage = (species.count / analytics.total_tarantulas * 100).toFixed(0);
            return (
              <View key={index} style={styles.speciesItem}>
                <Text style={styles.speciesName} numberOfLines={1}>{species.species_name}</Text>
                <View style={styles.speciesBar}>
                  <View style={[styles.speciesBarFill, { width: `${percentage}%` as any }]} />
                </View>
                <Text style={styles.speciesCount}>{species.count}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Recent Activity */}
      {analytics.recent_activity.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Activity</Text>
          {analytics.recent_activity.slice(0, 5).map((activity, index) => (
            <TouchableOpacity
              key={index}
              style={styles.activityRow}
              onPress={() => router.push(`/tarantula/${activity.tarantula_id}`)}
            >
              <Text style={styles.activityIcon}>{getActivityIcon(activity.type)}</Text>
              <View style={styles.activityContent}>
                <Text style={styles.activityName}>{activity.tarantula_name}</Text>
                <Text style={styles.activityDesc}>{activity.description}</Text>
                <Text style={styles.activityDate}>{formatDate(activity.date)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
