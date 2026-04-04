import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
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

interface Props {
  tarantulaId: string;
}

export default function PremoltPredictionCard({ tarantulaId }: Props) {
  const { colors } = useTheme();
  const [prediction, setPrediction] = useState<PremoltPrediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchPrediction = async () => {
      try {
        const response = await apiClient.get(
          `/premolt/tarantulas/${tarantulaId}/prediction`
        );
        if (!cancelled) setPrediction(response.data);
      } catch (error) {
        console.error('Failed to fetch premolt prediction:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPrediction();
    return () => { cancelled = true; };
  }, [tarantulaId]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!prediction) {
    return null;
  }

  // Insufficient data state
  if (prediction.data_quality === 'insufficient') {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.primary + '20', borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.title, { color: colors.primary }]}>💡 Premolt Prediction</Text>
        <View style={[styles.insufficientBox, { backgroundColor: colors.primary + '10' }]}>
          <Text style={[styles.insufficientText, { color: colors.textPrimary }]}>
            Need more data — log feedings and molts to enable predictions
          </Text>
        </View>
      </View>
    );
  }

  const getBgColor = () => {
    if (!prediction.is_premolt_likely) return '#dcfce7';
    if (prediction.confidence === 'high') return '#fee2e2';
    if (prediction.confidence === 'medium') return '#fef3c7';
    return '#f3f4f6';
  };

  const getBorderColor = () => {
    if (!prediction.is_premolt_likely) return '#bbf7d0';
    if (prediction.confidence === 'high') return '#fecaca';
    if (prediction.confidence === 'medium') return '#fcd34d';
    return '#e5e7eb';
  };

  const getTextColor = () => {
    if (!prediction.is_premolt_likely) return '#15803d';
    if (prediction.confidence === 'high') return '#991b1b';
    if (prediction.confidence === 'medium') return '#b45309';
    return '#374151';
  };

  const getStatusBgColor = () => {
    if (!prediction.is_premolt_likely) return '#dcfce7';
    if (prediction.confidence === 'high') return '#fee2e2';
    if (prediction.confidence === 'medium') return '#fef3c7';
    return '#f3f4f6';
  };

  const getProgressBarColor = () => {
    if (!prediction.is_premolt_likely) return '#22c55e';
    if (prediction.confidence === 'high') return '#ef4444';
    if (prediction.confidence === 'medium') return '#f59e0b';
    return '#6b7280';
  };

  const getBadgeBgColor = () => {
    if (prediction.confidence === 'high') return '#ef4444';
    if (prediction.confidence === 'medium') return '#f59e0b';
    if (prediction.confidence === 'low') return '#9ca3af';
    return '#22c55e';
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: getBgColor(), borderColor: getBorderColor() },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: getTextColor() }]}>🔮 Premolt Prediction</Text>
        {prediction.confidence !== 'none' && (
          <View style={[styles.badge, { backgroundColor: getBadgeBgColor() }]}>
            <Text style={styles.badgeText}>{prediction.confidence}</Text>
          </View>
        )}
      </View>

      {/* Status Message */}
      <View style={[styles.statusBox, { backgroundColor: getStatusBgColor() }]}>
        <Text style={{ fontSize: 18 }}>
          {prediction.is_premolt_likely ? '🦋' : '✅'}
        </Text>
        <Text style={[styles.statusText, { color: getTextColor() }]}>
          {prediction.is_premolt_likely ? 'Likely in premolt' : 'No premolt signs'}
        </Text>
      </View>

      {/* Metrics */}
      <View style={styles.metricsContainer}>
        {prediction.recent_refusal_streak > 0 && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Feeding refusals
            </Text>
            <Text style={[styles.metricValue, { color: '#dc2626' }]}>
              {prediction.recent_refusal_streak}
            </Text>
          </View>
        )}

        {prediction.days_since_last_molt !== null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Days since molt
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              {prediction.days_since_last_molt}
            </Text>
          </View>
        )}

        {prediction.molt_interval_progress !== null && prediction.average_molt_interval && (
          <View style={[styles.progressContainer, { backgroundColor: colors.surface }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                Molt interval progress
              </Text>
              <Text style={[styles.progressPercentage, { color: colors.textPrimary }]}>
                {Math.round(prediction.molt_interval_progress)}%
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(prediction.molt_interval_progress, 100)}%`,
                    backgroundColor: getProgressBarColor(),
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressNote, { color: colors.textTertiary }]}>
              Avg interval: {prediction.average_molt_interval.toFixed(0)} days
            </Text>
          </View>
        )}

        {prediction.refusal_rate_last_30_days !== null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Refusal rate (30d)
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              {(prediction.refusal_rate_last_30_days * 100).toFixed(0)}%
            </Text>
          </View>
        )}

        {prediction.estimated_molt_window_days !== null && (
          <View style={[styles.metricItem, { backgroundColor: colors.surface }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
              Estimated window
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              ~{prediction.estimated_molt_window_days} days
            </Text>
          </View>
        )}
      </View>

      {prediction.data_quality === 'fair' && (
        <Text
          style={[
            styles.dataQualityNote,
            { color: colors.textTertiary, borderTopColor: colors.border },
          ]}
        >
          💡 Log more feedings and molts to improve prediction accuracy
        </Text>
      )}
    </View>
  );
}

// StyleSheet defined at module level — avoids temporal dead zone issues
// that occur when StyleSheet.create is placed after early returns inside the component.
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
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  statusBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  metricsContainer: {
    gap: 10,
  },
  metricItem: {
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressContainer: {
    padding: 12,
    borderRadius: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressNote: {
    fontSize: 11,
    marginTop: 4,
  },
  insufficientBox: {
    padding: 12,
    borderRadius: 10,
  },
  insufficientText: {
    fontSize: 14,
  },
  dataQualityNote: {
    fontSize: 11,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
