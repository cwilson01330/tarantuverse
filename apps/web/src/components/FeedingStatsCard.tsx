"use client";

import { useThemeStore } from '@/stores/themeStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

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

export default function FeedingStatsCard({ data }: FeedingStatsCardProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const tooltipStyle = {
    backgroundColor: isDark ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
    border: isDark ? 'none' : '1px solid rgb(229, 231, 235)',
    borderRadius: '0.5rem',
    color: isDark ? 'white' : 'rgb(17, 24, 39)',
  };
  const gridStroke = isDark ? '#374151' : '#e5e7eb';
  const tickFill = isDark ? '#9ca3af' : '#6b7280';

  // Determine feeding status color
  const getFeedingStatusColor = (days?: number) => {
    if (!days) return "gray";
    if (days < 7) return "green";
    if (days < 14) return "yellow";
    if (days < 21) return "orange";
    return "red";
  };

  const statusColor = getFeedingStatusColor(data.days_since_last_feeding);
  const colorClasses = {
    green: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700",
    yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700",
    orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700",
    red: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700",
    gray: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600",
  };

  const getAcceptanceColor = (rate: number) => {
    if (rate >= 80) return "text-green-600 dark:text-green-400";
    if (rate >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-orange-600 dark:text-orange-400";
  };

  // Prepare chart data
  const acceptanceData = [
    { name: 'Accepted', value: data.total_accepted, color: '#10b981' },
    { name: 'Refused', value: data.total_refused, color: '#ef4444' },
  ];

  const preyTypeData = data.prey_type_distribution.map((item) => ({
    name: item.food_type,
    count: item.count,
    percentage: item.percentage,
  }));

  if (data.total_feedings === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
          🍽️ Feeding Stats
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No feeding data recorded yet. Add feeding logs to track patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
        🍽️ Feeding Stats
      </h3>

      {/* Status Banner */}
      {data.days_since_last_feeding !== undefined && (
        <div
          className={`rounded-lg p-4 border-2 ${colorClasses[statusColor]}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold uppercase mb-1">
                Last Fed
              </div>
              <div className="text-2xl font-bold">
                {data.days_since_last_feeding} days ago
              </div>
            </div>
            {data.next_feeding_prediction && (
              <div className="text-right">
                <div className="text-sm font-semibold uppercase mb-1">
                  Next Feeding
                </div>
                <div className="text-lg font-semibold">
                  {new Date(data.next_feeding_prediction).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
            ACCEPTANCE RATE
          </div>
          <div
            className={`text-2xl font-bold ${getAcceptanceColor(
              data.acceptance_rate
            )}`}
          >
            {data.acceptance_rate}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {data.total_accepted}/{data.total_feedings} accepted
          </div>
        </div>

        {data.average_days_between_feedings && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
              AVG INTERVAL
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round(data.average_days_between_feedings)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">days between</div>
          </div>
        )}

        {data.current_streak_accepted > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
              CURRENT STREAK
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {data.current_streak_accepted}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">accepted in a row</div>
          </div>
        )}

        {data.longest_gap_days && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">
              LONGEST GAP
            </div>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {data.longest_gap_days}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">days</div>
          </div>
        )}
      </div>

      {/* Charts Section */}
      {data.total_feedings > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Acceptance Rate Pie Chart */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center">
              Acceptance Rate Breakdown
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={acceptanceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {acceptanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Prey Type Bar Chart */}
          {preyTypeData.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center">
                Prey Type Distribution
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={preyTypeData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: tickFill, fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis tick={{ fill: tickFill, fontSize: 12 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => {
                      const item = preyTypeData.find(d => d.count === value);
                      return [`${value} feedings (${item?.percentage}%)`, 'Count'];
                    }}
                  />
                  <Bar dataKey="count" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Prey Type Distribution List (keep for smaller screens or as fallback) */}
      {data.prey_type_distribution.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Prey Type Details
          </h4>
          <div className="space-y-2">
            {data.prey_type_distribution.map((prey, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium capitalize text-gray-900 dark:text-white">
                      {prey.food_type}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {prey.count} ({prey.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 dark:bg-orange-400 transition-all"
                      style={{ width: `${prey.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
