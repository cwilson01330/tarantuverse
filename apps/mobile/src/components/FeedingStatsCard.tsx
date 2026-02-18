import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface PreyTypeCount {
  food_type: string;
  count: number;
  percentage: number;
}

interface FeedingStats {
  tarantula_id: string;
  total_feedings: number;
  total_accepted: number;
  total_refused: number;
  acceptance_rate: number;
  average_days_between_feedings?: number;
  last_feeding_date?: string;
  days_since_last_feeding?: number;
  next_feeding_prediction?: string;
  longest_gap_days?: number;
  current_streak_accepted: number;
  prey_type_distribution: PreyTypeCount[];
}

interface FeedingStatsCardProps {
  data: FeedingStats;
}

const FeedingStatsCard: React.FC<FeedingStatsCardProps> = ({ data }) => {
  const { colors } = useTheme();
  
  // Determine feeding status color
  const getFeedingStatusColor = (days?: number) => {
    if (!days) return styles.statusGray;
    if (days < 7) return styles.statusGreen;
    if (days < 14) return styles.statusYellow;
    if (days < 21) return styles.statusOrange;
    return styles.statusRed;
  };

  const getAcceptanceColor = (rate: number) => {
    if (rate >= 80) return styles.acceptanceGreen;
    if (rate >= 60) return styles.acceptanceYellow;
    return styles.acceptanceOrange;
  };

  if (data.total_feedings === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>🍽️ Feeding Stats</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🍴</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No feeding data yet.{'\n'}Add feeding logs to track patterns.
          </Text>
        </View>
      </View>
    );
  }

  const statusColorStyle = getFeedingStatusColor(data.days_since_last_feeding);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>🍽️ Feeding Stats</Text>

      {/* Status Banner */}
      {data.days_since_last_feeding !== undefined && (
        <View style={[styles.statusBanner, statusColorStyle]}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Text style={styles.statusLabel}>LAST FED</Text>
              <Text style={styles.statusValue}>
                {data.days_since_last_feeding} days ago
              </Text>
            </View>
            {data.next_feeding_prediction && (
              <View style={styles.statusRight}>
                <Text style={styles.statusLabel}>NEXT FEEDING</Text>
                <Text style={styles.statusSmallValue}>
                  {new Date(data.next_feeding_prediction).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Key Metrics */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ACCEPTANCE RATE</Text>
          <Text style={[styles.metricValue, getAcceptanceColor(data.acceptance_rate)]}>
            {data.acceptance_rate}%
          </Text>
          <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>
            {data.total_accepted}/{data.total_feedings} accepted
          </Text>
        </View>

        {data.average_days_between_feedings != null && data.average_days_between_feedings > 0 && (
          <View style={[styles.metricCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>AVG INTERVAL</Text>
            <Text style={[styles.metricValue, styles.metricBlue]}>
              {Math.round(data.average_days_between_feedings)}
            </Text>
            <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>days between</Text>
          </View>
        )}

        {data.current_streak_accepted != null && data.current_streak_accepted > 0 && (
          <View style={[styles.metricCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>CURRENT STREAK</Text>
            <Text style={[styles.metricValue, styles.metricPurple]}>
              {data.current_streak_accepted}
            </Text>
            <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>accepted</Text>
          </View>
        )}

        {data.longest_gap_days != null && data.longest_gap_days > 0 && (
          <View style={[styles.metricCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>LONGEST GAP</Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
              {data.longest_gap_days}
            </Text>
            <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>days</Text>
          </View>
        )}
      </View>

      {/* Prey Type Distribution */}
      {data.prey_type_distribution.length > 0 && (
        <View style={styles.preySection}>
          <Text style={[styles.preySectionTitle, { color: colors.textPrimary }]}>Prey Type Distribution</Text>
          {data.prey_type_distribution.map((prey, index) => (
            <View key={index} style={styles.preyItem}>
              <View style={styles.preyHeader}>
                <Text style={[styles.preyName, { color: colors.textPrimary }]}>{prey.food_type}</Text>
                <Text style={[styles.preyCount, { color: colors.textSecondary }]}>
                  {prey.count} ({prey.percentage}%)
                </Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(prey.percentage)}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  statusBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  statusGreen: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  statusYellow: {
    backgroundColor: '#fef9c3',
    borderColor: '#fde047',
  },
  statusOrange: {
    backgroundColor: '#fed7aa',
    borderColor: '#fdba74',
  },
  statusRed: {
    backgroundColor: '#fecaca',
    borderColor: '#fca5a5',
  },
  statusGray: {
    backgroundColor: '#e5e7eb',
    borderColor: '#9ca3af',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flex: 1,
  },
  statusRight: {
    alignItems: 'flex-end',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statusSmallValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    borderRadius: 12,
    padding: 12,
    minWidth: '47%',
    flexGrow: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  metricSubtext: {
    fontSize: 11,
  },
  acceptanceGreen: {
    color: '#10b981',
  },
  acceptanceYellow: {
    color: '#eab308',
  },
  acceptanceOrange: {
    color: '#f97316',
  },
  metricBlue: {
    color: '#3b82f6',
  },
  metricPurple: {
    color: '#9333ea',
  },
  preySection: {
    marginTop: 8,
  },
  preySectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  preyItem: {
    marginBottom: 12,
  },
  preyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  preyName: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  preyCount: {
    fontSize: 13,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f97316', // Intentional brand orange for prey distribution
  },
});

export default FeedingStatsCard;
