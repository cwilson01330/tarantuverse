"use client";

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

const preyBarColors = [
  'bg-purple-500 dark:bg-purple-400',
  'bg-blue-500 dark:bg-blue-400',
  'bg-emerald-500 dark:bg-emerald-400',
  'bg-amber-500 dark:bg-amber-400',
  'bg-rose-500 dark:bg-rose-400',
  'bg-cyan-500 dark:bg-cyan-400',
];

export default function FeedingStatsCard({ data }: FeedingStatsCardProps) {
  // Determine feeding status color
  const getFeedingStatusColor = (days?: number) => {
    if (!days) return "gray";
    if (days < 7) return "green";
    if (days < 14) return "yellow";
    if (days < 21) return "orange";
    return "red";
  };

  const statusColor = getFeedingStatusColor(data.days_since_last_feeding);
  const colorClasses: Record<string, string> = {
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

  // SVG donut calculations
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const acceptedLength = circumference * (data.acceptance_rate / 100);

  // Sort prey types by count descending
  const sortedPrey = [...data.prey_type_distribution].sort((a, b) => b.count - a.count);

  if (data.total_feedings === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
          Feeding Stats
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No feeding data recorded yet. Add feeding logs to track patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-6 border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Feeding Stats
        </h3>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
          {data.total_feedings} total
        </span>
      </div>

      {/* Status Banner */}
      {data.days_since_last_feeding !== undefined && (
        <div className={`rounded-xl p-4 border-2 ${colorClasses[statusColor]}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                Last Fed
              </div>
              <div className="text-2xl font-bold">
                {data.days_since_last_feeding} days ago
              </div>
            </div>
            {data.next_feeding_prediction && (
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border-l-4 border-green-500">
          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-1">
            Acceptance Rate
          </div>
          <div className={`text-2xl font-bold ${getAcceptanceColor(data.acceptance_rate)}`}>
            {data.acceptance_rate}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {data.total_accepted}/{data.total_feedings} accepted
          </div>
        </div>

        {data.average_days_between_feedings != null && data.average_days_between_feedings > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border-l-4 border-blue-500">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-1">
              Avg Interval
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round(data.average_days_between_feedings)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">days between</div>
          </div>
        )}

        {data.current_streak_accepted > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border-l-4 border-purple-500">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-1">
              Current Streak
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {data.current_streak_accepted}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">accepted in a row</div>
          </div>
        )}

        {data.longest_gap_days != null && data.longest_gap_days > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border-l-4 border-gray-400 dark:border-gray-500">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-1">
              Longest Gap
            </div>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {data.longest_gap_days}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">days</div>
          </div>
        )}
      </div>

      {/* Acceptance Breakdown — SVG Donut + Legend */}
      {data.total_feedings > 1 && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Acceptance Breakdown
          </h4>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* SVG Donut */}
            <div className="relative flex-shrink-0">
              <svg viewBox="0 0 140 140" className="w-32 h-32">
                {/* Track */}
                <circle
                  cx="70" cy="70" r={radius}
                  fill="none"
                  stroke="currentColor"
                  className="text-gray-200 dark:text-gray-600"
                  strokeWidth="12"
                />
                {/* Refused arc (full circle, rendered behind accepted) */}
                <circle
                  cx="70" cy="70" r={radius}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={0}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                />
                {/* Accepted arc (on top) */}
                <circle
                  cx="70" cy="70" r={radius}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - acceptedLength}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.acceptance_rate}%
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Accepted: <span className="font-semibold">{data.total_accepted}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Refused: <span className="font-semibold">{data.total_refused}</span>
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {data.total_feedings} feedings recorded
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prey Type Distribution */}
      {sortedPrey.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Prey Type Distribution
          </h4>
          <div className="space-y-3">
            {sortedPrey.map((prey, index) => (
              <div key={prey.food_type}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium capitalize text-gray-900 dark:text-white">
                    {prey.food_type}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                    {prey.count} ({prey.percentage}%)
                  </span>
                </div>
                <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${preyBarColors[index % preyBarColors.length]}`}
                    style={{ width: `${Math.max(prey.percentage, 3)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
