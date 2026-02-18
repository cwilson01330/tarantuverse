import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';
import { useTheme } from '../contexts/ThemeContext';

interface GrowthDataPoint {
  date: string;
  weight?: number;
  leg_span?: number;
  days_since_previous?: number;
  weight_change?: number;
  leg_span_change?: number;
}

interface GrowthAnalytics {
  tarantula_id: string;
  data_points: GrowthDataPoint[];
  total_molts: number;
  average_days_between_molts?: number;
  total_weight_gain?: number;
  total_leg_span_gain?: number;
  growth_rate_weight?: number;
  growth_rate_leg_span?: number;
  last_molt_date?: string;
  days_since_last_molt?: number;
}

interface GrowthChartProps {
  data: GrowthAnalytics;
}

type DateRange = 'all' | '1y' | '6m' | '3m';
type Metric = 'weight' | 'leg_span' | 'both';

const GrowthChart: React.FC<GrowthChartProps> = ({ data }) => {
  const { colors } = useTheme();
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [metric, setMetric] = useState<Metric>('both');
  const screenWidth = Dimensions.get('window').width;

  // Filter data based on selected date range
  const filterDataByRange = (points: GrowthDataPoint[]) => {
    if (dateRange === 'all') return points;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case '1y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case '6m':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '3m':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }

    return points.filter((point) => new Date(point.date) >= cutoffDate);
  };

  const filteredData = filterDataByRange(data.data_points);

  // Format data for chart
  const chartData = filteredData.map((point, index) => ({
    x: index,
    date: format(new Date(point.date), 'MMM d'),
    weight: point.weight ? parseFloat(point.weight.toString()) : null,
    legSpan: point.leg_span ? parseFloat(point.leg_span.toString()) : null,
  }));

  // Check if we have data
  const hasWeightData = chartData.some((d) => d.weight !== null);
  const hasLegSpanData = chartData.some((d) => d.legSpan !== null);

  if (data.total_molts === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Growth Tracking</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No molt data recorded yet.{'\n'}Add molt logs to track growth over time.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Growth Tracking</Text>
      </View>

      {/* Metric Selector */}
      <View style={styles.selectorContainer}>
        <Text style={[styles.selectorLabel, { color: colors.textPrimary }]}>Metric:</Text>
        <View style={[styles.buttonGroup, { backgroundColor: colors.surfaceElevated }]}>
          <TouchableOpacity
            style={[styles.button, metric === 'both' && [styles.buttonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setMetric('both')}
          >
            <Text style={[styles.buttonText, { color: colors.textSecondary }, metric === 'both' && { color: colors.primary }]}>
              Both
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, metric === 'weight' && [styles.buttonActive, { backgroundColor: colors.surface }], !hasWeightData && styles.buttonDisabled]}
            onPress={() => hasWeightData && setMetric('weight')}
            disabled={!hasWeightData}
          >
            <Text style={[styles.buttonText, { color: colors.textSecondary }, metric === 'weight' && { color: colors.primary }, !hasWeightData && { color: colors.textTertiary }]}>
              Weight
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, metric === 'leg_span' && [styles.buttonActive, { backgroundColor: colors.surface }], !hasLegSpanData && styles.buttonDisabled]}
            onPress={() => hasLegSpanData && setMetric('leg_span')}
            disabled={!hasLegSpanData}
          >
            <Text style={[styles.buttonText, { color: colors.textSecondary }, metric === 'leg_span' && { color: colors.primary }, !hasLegSpanData && { color: colors.textTertiary }]}>
              Leg Span
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Range Selector */}
      <View style={styles.selectorContainer}>
        <Text style={[styles.selectorLabel, { color: colors.textPrimary }]}>Range:</Text>
        <View style={[styles.buttonGroup, { backgroundColor: colors.surfaceElevated }]}>
          {(['3m', '6m', '1y', 'all'] as DateRange[]).map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.button, dateRange === range && [styles.buttonActive, { backgroundColor: colors.surface }]]}
              onPress={() => setDateRange(range)}
            >
              <Text style={[styles.buttonText, { color: colors.textSecondary }, dateRange === range && { color: colors.primary }]}>
                {range === 'all' ? 'All' : range.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Molts</Text>
          <Text style={[styles.statValue, { color: colors.textPrimary }]}>{data.total_molts}</Text>
        </View>
        {data.average_days_between_molts && (
          <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Days Between</Text>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {Math.round(data.average_days_between_molts)}
            </Text>
          </View>
        )}
        {data.total_weight_gain && (
          <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Weight Gain</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              +{parseFloat(data.total_weight_gain.toString()).toFixed(1)}g
            </Text>
          </View>
        )}
        {data.total_leg_span_gain && (
          <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Size Gain</Text>
            <Text style={[styles.statValue, { color: colors.info }]}>
              +{parseFloat(data.total_leg_span_gain.toString()).toFixed(1)} cm
            </Text>
          </View>
        )}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {(metric === 'both' || metric === 'weight') && hasWeightData && (
          <View style={styles.chartWrapper}>
            <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Weight (g)</Text>
            <LineChart
              data={{
                labels: chartData.map((d) => d.date),
                datasets: [
                  {
                    data: chartData.map((d) => d.weight || 0),
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                    strokeWidth: 2,
                  },
                ],
              }}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                labelColor: () => colors.textSecondary,
                style: {
                  borderRadius: 16,
                },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: colors.success,
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: colors.border,
                  strokeWidth: 1,
                },
              }}
              bezier
              style={styles.chart}
              withInnerLines={true}
              withOuterLines={true}
              withVerticalLines={false}
              withHorizontalLines={true}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              fromZero={false}
            />
          </View>
        )}
        {(metric === 'both' || metric === 'leg_span') && hasLegSpanData && (
          <View style={styles.chartWrapper}>
            <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Leg Span (cm)</Text>
            <LineChart
              data={{
                labels: chartData.map((d) => d.date),
                datasets: [
                  {
                    data: chartData.map((d) => d.legSpan || 0),
                    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    strokeWidth: 2,
                  },
                ],
              }}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                labelColor: () => colors.textSecondary,
                style: {
                  borderRadius: 16,
                },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: colors.info,
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: colors.border,
                  strokeWidth: 1,
                },
              }}
              bezier
              style={styles.chart}
              withInnerLines={true}
              withOuterLines={true}
              withVerticalLines={false}
              withHorizontalLines={true}
              withVerticalLabels={true}
              withHorizontalLabels={true}
              fromZero={false}
            />
          </View>
        )}
      </View>

      {/* Growth Rate Info */}
      {(data.growth_rate_weight || data.growth_rate_leg_span || data.days_since_last_molt !== undefined) && (
        <View style={styles.infoContainer}>
          {data.growth_rate_weight && (
            <Text style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Weight Growth Rate: </Text>
              <Text style={[styles.infoValueGreen, { color: colors.success }]}>
                {parseFloat(data.growth_rate_weight.toString()).toFixed(2)}g/mo
              </Text>
            </Text>
          )}
          {data.growth_rate_leg_span && (
            <Text style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Size Growth Rate: </Text>
              <Text style={[styles.infoValueBlue, { color: colors.info }]}>
                {parseFloat(data.growth_rate_leg_span.toString()).toFixed(2)} cm/mo
              </Text>
            </Text>
          )}
          {data.days_since_last_molt !== undefined && (
            <Text style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Days Since Last Molt: </Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{data.days_since_last_molt}</Text>
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  selectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
    width: 60,
  },
  buttonGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    flex: 1,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    borderRadius: 12,
    padding: 12,
    minWidth: '47%',
    flexGrow: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  chartContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  chartWrapper: {
    marginBottom: 24,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 16,
  },
  chart: {
    borderRadius: 16,
  },
  infoContainer: {
    padding: 16,
    paddingTop: 0,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  infoLabel: {},
  infoValue: {
    fontWeight: '600',
  },
  infoValueGreen: {
    fontWeight: '600',
  },
  infoValueBlue: {
    fontWeight: '600',
  },
});

export default GrowthChart;
