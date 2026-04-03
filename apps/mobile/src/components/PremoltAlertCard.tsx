import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';

interface PremoltPrediction {
  tarantula_id: string;
  tarantula_name: string;
  is_premolt_likely: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  days_since_last_molt: number | null;
  average_molt_interval: number | null;
  molt_interval_progress: number | null;
  recent_refusal_streak: number;
  refusal_rate_last_30_days: number | null;
  estimated_molt_window_days: number | null;
  data_quality: 'good' | 'fair' | 'insufficient';
  last_molt_date: string | null;
  last_feeding_date: string | null;
}

interface DashboardResponse {
  total_tarantulas: number;
  premolt_likely_count: number;
  predictions: PremoltPrediction[];
}

export default function PremoltAlertCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchPremoltDashboard();
  }, []);

  const fetchPremoltDashboard = async () => {
    try {
      const response = await apiClient.get('/premolt/dashboard');
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch premolt dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      margin: 8,
      marginBottom: 16,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    emoji: {
      fontSize: 24,
    },
    titleText: {
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 4,
    },
    alertText: {
      fontSize: 12,
      marginTop: 2,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginTop: 8,
      borderWidth: 1,
    },
    itemContent: {
      flex: 1,
    },
    itemName: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    itemDetails: {
      fontSize: 11,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      marginLeft: 8,
    },
    badgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
    },
    expandButton: {
      padding: 8,
    },
    iconColor: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!data || data.total_tarantulas === 0) {
    return null;
  }

  const likelyPredictions = data.predictions.filter(p => p.is_premolt_likely);

  // All clear state
  if (likelyPredictions.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: '#dcfce7',
            borderColor: '#bbf7d0',
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.emoji}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.titleText, { color: '#15803d' }]}>All Clear</Text>
              <Text style={[styles.alertText, { color: '#166534' }]}>
                No tarantulas showing premolt signs
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Alert state with premolt tarantulas
  const bgColor = '#fef3c7';
  const borderColor = '#fcd34d';
  const textColor = '#b45309';
  const lightTextColor = '#a16207';

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.emoji}>🕷️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.titleText, { color: textColor }]}>Premolt Alerts</Text>
            <Text style={[styles.alertText, { color: lightTextColor }]}>
              {likelyPredictions.length} tarantula{likelyPredictions.length !== 1 ? 's' : ''} may be in premolt
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.expandButton} onPress={() => setExpanded(!expanded)}>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={textColor}
          />
        </TouchableOpacity>
      </TouchableOpacity>

      {expanded && (
        <FlatList
          data={likelyPredictions}
          keyExtractor={item => item.tarantula_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.listItem,
                {
                  backgroundColor: '#ffffff',
                  borderColor: '#fde047',
                },
              ]}
              onPress={() => router.push(`/tarantula/${item.tarantula_id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.itemContent}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                  {item.tarantula_name}
                </Text>
                <Text style={[styles.itemDetails, { color: colors.textSecondary }]}>
                  {item.recent_refusal_streak > 0
                    ? `${item.recent_refusal_streak} feeding refusals`
                    : 'Multiple indicators'}
                  {item.days_since_last_molt !== null && ` · ${item.days_since_last_molt} days`}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor:
                      item.confidence === 'high'
                        ? '#ef4444'
                        : item.confidence === 'medium'
                        ? '#f97316'
                        : '#6b7280',
                  },
                ]}
              >
                <Text style={styles.badgeText}>{item.confidence}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
