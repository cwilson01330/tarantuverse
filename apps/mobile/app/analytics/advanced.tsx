import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';

interface MoltHeatmapEntry {
  month: string;
  count: number;
}

interface CollectionGrowthEntry {
  month: string;
  count: number;
}

interface SpeciesDistEntry {
  species_name: string;
  count: number;
}

interface AdvancedAnalytics {
  collection_value_total: number;
  collection_value_average: number;
  most_expensive_name: string | null;
  most_expensive_price: number | null;
  molt_heatmap: MoltHeatmapEntry[];
  collection_growth: CollectionGrowthEntry[];
  species_distribution: SpeciesDistEntry[];
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
  enclosure_type_distribution: {
    [key: string]: number;
  };
  total_feedings_logged: number;
  total_molts_logged: number;
  estimated_monthly_feeding_cost: number;
}

const SEX_COLORS: { [key: string]: string } = {
  male: '#3B82F6',
  female: '#EC4899',
  unknown: '#9CA3AF',
};

const ENCLOSURE_COLORS: { [key: string]: string } = {
  terrestrial: '#92400E',
  arboreal: '#059669',
  fossorial: '#7C3AED',
  unknown: '#6B7280',
};

export default function AdvancedAnalyticsScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );
  const [analytics, setAnalytics] = useState<AdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdvancedAnalytics();
  }, []);

  const fetchAdvancedAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/analytics/advanced/');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch advanced analytics:', error);
    } finally {
      setLoading(false);
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
      justifyContent: 'space-between',
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
      flex: 1,
    },
    premiumBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.primary,
      borderRadius: 12,
    },
    premiumBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFFFFF',
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
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    card: {
      backgroundColor: colors.surface,
      margin: 8,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    chartContainer: {
      height: 280,
      marginBottom: 8,
    },
    barChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-around',
      height: 240,
      marginBottom: 8,
    },
    barColumn: {
      alignItems: 'center',
      flex: 1,
      marginHorizontal: 2,
    },
    bar: {
      width: '80%',
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      minHeight: 2,
      marginBottom: 4,
    },
    barLabel: {
      fontSize: 10,
      color: colors.textTertiary,
      marginTop: 4,
    },
    lineChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-around',
      height: 240,
      paddingHorizontal: 4,
    },
    linePoint: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginBottom: 4,
    },
    sexBar: {
      flexDirection: 'row',
      height: 40,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    },
    sexSegment: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    sexSegmentText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 12,
    },
    legendContainer: {
      marginTop: 12,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    legendColor: {
      width: 12,
      height: 12,
      borderRadius: 2,
      marginRight: 8,
    },
    legendLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    speciesItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    speciesName: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginRight: 8,
    },
    speciesBar: {
      flex: 1.5,
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      marginRight: 8,
      overflow: 'hidden',
    },
    speciesBarFill: {
      height: '100%',
      backgroundColor: colors.success,
    },
    speciesCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
      width: 25,
      textAlign: 'right',
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
    scrollContent: {
      flex: 1,
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Advanced Analytics" leftAction={backButton} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!analytics) {
    return (
      <View style={styles.container}>
        <AppHeader title="Advanced Analytics" leftAction={backButton} />
        <ScrollView style={styles.container}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="chart-box-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Data Available</Text>
            <Text style={styles.emptyText}>
              Not enough tracking data to show advanced analytics yet.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const allDataEmpty =
    analytics.molt_heatmap.length === 0 &&
    analytics.collection_growth.length === 0 &&
    analytics.species_distribution.length === 0;

  if (allDataEmpty) {
    return (
      <View style={styles.container}>
        <AppHeader title="Advanced Analytics" leftAction={backButton} />
        <ScrollView style={styles.container}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="sparkles" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>More Data Needed</Text>
            <Text style={styles.emptyText}>
              Keep tracking your tarantulas to unlock advanced insights!
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const sexDistribution = [
    { name: 'Male', value: analytics.sex_distribution.male, color: SEX_COLORS.male },
    { name: 'Female', value: analytics.sex_distribution.female, color: SEX_COLORS.female },
    { name: 'Unknown', value: analytics.sex_distribution.unknown, color: SEX_COLORS.unknown },
  ].filter((d) => d.value > 0);

  const totalSexed = sexDistribution.reduce((sum, d) => sum + d.value, 0);

  const enclosureData = Object.entries(analytics.enclosure_type_distribution).map(
    ([type, count]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: count,
      color:
        ENCLOSURE_COLORS[type as keyof typeof ENCLOSURE_COLORS] ||
        ENCLOSURE_COLORS.unknown,
    })
  );

  // Find max values for scaling
  const maxMolt =
    analytics.molt_heatmap.length > 0
      ? Math.max(...analytics.molt_heatmap.map((m) => m.count))
      : 0;

  const maxGrowth =
    analytics.collection_growth.length > 0
      ? Math.max(...analytics.collection_growth.map((g) => g.count))
      : 0;

  const maxSpecies =
    analytics.species_distribution.length > 0
      ? Math.max(...analytics.species_distribution.map((s) => s.count))
      : 0;

  const premiumBadge = (
    <View style={styles.premiumBadge}>
      <Text style={styles.premiumBadgeText}>Premium</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="✨ Advanced Analytics" leftAction={backButton} rightAction={premiumBadge} />

      <ScrollView style={styles.scrollContent}>
        {/* Collection Value Cards */}
        <View style={styles.section}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                ${analytics.collection_value_total.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Total Value</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                ${analytics.collection_value_average.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Avg Price</Text>
            </View>
          </View>
        </View>

        {/* Most Expensive */}
        {analytics.most_expensive_name && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>💎 Most Expensive</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
              {analytics.most_expensive_name}
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: colors.primary,
                marginTop: 4,
              }}
            >
              ${analytics.most_expensive_price?.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Molt Heatmap */}
        {analytics.molt_heatmap.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🦋 Molt Activity (Last 12 Months)</Text>
            <View style={styles.barChart}>
              {analytics.molt_heatmap.map((entry, index) => {
                const height = maxMolt > 0 ? (entry.count / maxMolt) * 200 : 2;
                return (
                  <View key={index} style={styles.barColumn}>
                    <View
                      style={[styles.bar, { height, backgroundColor: '#8B5CF6' }]}
                    />
                    <Text style={styles.barLabel}>{entry.month}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Collection Growth */}
        {analytics.collection_growth.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📈 Collection Growth (Last 12 Months)</Text>
            <View style={styles.lineChart}>
              {analytics.collection_growth.map((entry, index) => {
                const height = maxGrowth > 0 ? (entry.count / maxGrowth) * 200 : 2;
                return (
                  <View key={index} style={styles.barColumn}>
                    <View
                      style={[
                        styles.bar,
                        { height, backgroundColor: '#10B981', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
                      ]}
                    />
                    <Text style={styles.barLabel}>{entry.month}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Sex Distribution */}
        {sexDistribution.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👥 Sex Distribution</Text>
            <View style={styles.sexBar}>
              {sexDistribution.map((item, index) => {
                const width =
                  (item.value / totalSexed) * 100;
                return (
                  <View
                    key={index}
                    style={[
                      styles.sexSegment,
                      { width: `${width}%` as any, backgroundColor: item.color },
                    ]}
                  >
                    {width > 15 && (
                      <Text style={styles.sexSegmentText}>
                        {item.name === 'Male' ? '♂' : item.name === 'Female' ? '♀' : '?'}{' '}
                        {item.value}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.legendContainer}>
              {sexDistribution.map((item, index) => (
                <View key={index} style={styles.legendItem}>
                  <View
                    style={[styles.legendColor, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.legendLabel}>
                    {item.name}: {item.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Enclosure Type Distribution */}
        {enclosureData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏠 Enclosure Types</Text>
            {enclosureData.map((item, index) => {
              const percentage = item.value;
              return (
                <View key={index} style={styles.speciesItem}>
                  <Text style={styles.speciesName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.speciesBar}>
                    <View
                      style={[
                        styles.speciesBarFill,
                        {
                          width: `${(percentage / Math.max(...enclosureData.map((d) => d.value))) * 100}%` as any,
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.speciesCount}>{percentage}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top Species */}
        {analytics.species_distribution.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🕷️ Top Species</Text>
            {analytics.species_distribution.slice(0, 10).map((species, index) => {
              const percentage =
                maxSpecies > 0 ? (species.count / maxSpecies) * 100 : 0;
              return (
                <View key={index} style={styles.speciesItem}>
                  <Text style={styles.speciesName} numberOfLines={1}>
                    {species.species_name}
                  </Text>
                  <View style={styles.speciesBar}>
                    <View
                      style={[
                        styles.speciesBarFill,
                        { width: `${percentage}%` as any },
                      ]}
                    />
                  </View>
                  <Text style={styles.speciesCount}>{species.count}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Activity Stats */}
        <View style={styles.section}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {analytics.total_feedings_logged}
              </Text>
              <Text style={styles.statLabel}>Feedings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {analytics.total_molts_logged}
              </Text>
              <Text style={styles.statLabel}>Molts</Text>
            </View>
          </View>
        </View>

        {/* Feeding Cost Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Estimated Monthly Feeding Cost</Text>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: colors.primary,
              marginBottom: 4,
            }}
          >
            ${analytics.estimated_monthly_feeding_cost.toFixed(2)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary }}>
            At $0.50 per feeding
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
