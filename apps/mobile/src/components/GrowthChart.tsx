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
      <View style={styles.container}>
        <Text style={styles.title}>Growth Tracking</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyText}>
            No molt data recorded yet.{'\n'}Add molt logs to track growth over time.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Growth Tracking</Text>
      </View>

      {/* Metric Selector */}
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Metric:</Text>
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, metric === 'both' && styles.buttonActive]}
            onPress={() => setMetric('both')}
          >
            <Text style={[styles.buttonText, metric === 'both' && styles.buttonTextActive]}>
              Both
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, metric === 'weight' && styles.buttonActive, !hasWeightData && styles.buttonDisabled]}
            onPress={() => hasWeightData && setMetric('weight')}
            disabled={!hasWeightData}
          >
            <Text style={[styles.buttonText, metric === 'weight' && styles.buttonTextActive, !hasWeightData && styles.buttonTextDisabled]}>
              Weight
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, metric === 'leg_span' && styles.buttonActive, !hasLegSpanData && styles.buttonDisabled]}
            onPress={() => hasLegSpanData && setMetric('leg_span')}
            disabled={!hasLegSpanData}
          >
            <Text style={[styles.buttonText, metric === 'leg_span' && styles.buttonTextActive, !hasLegSpanData && styles.buttonTextDisabled]}>
              Leg Span
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Range Selector */}
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Range:</Text>
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.button, dateRange === '3m' && styles.buttonActive]}
            onPress={() => setDateRange('3m')}
          >
            <Text style={[styles.buttonText, dateRange === '3m' && styles.buttonTextActive]}>
              3M
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, dateRange === '6m' && styles.buttonActive]}
            onPress={() => setDateRange('6m')}
          >
            <Text style={[styles.buttonText, dateRange === '6m' && styles.buttonTextActive]}>
              6M
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, dateRange === '1y' && styles.buttonActive]}
            onPress={() => setDateRange('1y')}
          >
            <Text style={[styles.buttonText, dateRange === '1y' && styles.buttonTextActive]}>
              1Y
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, dateRange === 'all' && styles.buttonActive]}
            onPress={() => setDateRange('all')}
          >
            <Text style={[styles.buttonText, dateRange === 'all' && styles.buttonTextActive]}>
              All
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Molts</Text>
          <Text style={styles.statValue}>{data.total_molts}</Text>
        </View>
        {data.average_days_between_molts && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Days Between</Text>
            <Text style={styles.statValue}>
              {Math.round(data.average_days_between_molts)}
            </Text>
          </View>
        )}
        {data.total_weight_gain && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Weight Gain</Text>
            <Text style={[styles.statValue, styles.statGreen]}>
              +{parseFloat(data.total_weight_gain.toString()).toFixed(1)}g
            </Text>
          </View>
        )}
        {data.total_leg_span_gain && (
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Size Gain</Text>
            <Text style={[styles.statValue, styles.statBlue]}>
              +{parseFloat(data.total_leg_span_gain.toString()).toFixed(1)} cm
            </Text>
          </View>
        )}
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {(metric === 'both' || metric === 'weight') && hasWeightData && (
          <View style={styles.chartWrapper}>
            <Text style={styles.chartTitle}>Weight (g)</Text>
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
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                style: {
                  borderRadius: 16,
                },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: '#10b981',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '', // solid lines
                  stroke: '#e5e7eb',
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
            <Text style={styles.chartTitle}>Leg Span (cm)</Text>
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
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                style: {
                  borderRadius: 16,
                },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: '#3b82f6',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: '#e5e7eb',
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
              <Text style={styles.infoLabel}>Weight Growth Rate: </Text>
              <Text style={styles.infoValueGreen}>
                {parseFloat(data.growth_rate_weight.toString()).toFixed(2)}g/mo
              </Text>
            </Text>
          )}
          {data.growth_rate_leg_span && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Size Growth Rate: </Text>
              <Text style={styles.infoValueBlue}>
                {parseFloat(data.growth_rate_leg_span.toString()).toFixed(2)} cm/mo
              </Text>
            </Text>
          )}
          {data.days_since_last_molt !== undefined && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Days Since Last Molt: </Text>
              <Text style={styles.infoValue}>{data.days_since_last_molt}</Text>
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
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
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
    color: '#6b7280',
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
    color: '#374151',
    marginRight: 12,
    width: 60,
  },
  buttonGroup: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
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
    backgroundColor: '#fff',
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
    color: '#6b7280',
  },
  buttonTextActive: {
    color: '#9333ea',
  },
  buttonTextDisabled: {
    color: '#d1d5db',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    minWidth: '47%',
    flexGrow: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statGreen: {
    color: '#10b981',
  },
  statBlue: {
    color: '#3b82f6',
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
    color: '#374151',
    marginBottom: 8,
    marginLeft: 16,
  },
  chart: {
    borderRadius: 16,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#374151',
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
  infoLabel: {
    color: '#6b7280',
  },
  infoValue: {
    fontWeight: '600',
    color: '#111827',
  },
  infoValueGreen: {
    fontWeight: '600',
    color: '#10b981',
  },
  infoValueBlue: {
    fontWeight: '600',
    color: '#3b82f6',
  },
});

export default GrowthChart;
