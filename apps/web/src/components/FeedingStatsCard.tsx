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
  const colorClasses = {
    green: "bg-green-100 text-green-800 border-green-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
    orange: "bg-orange-100 text-orange-800 border-orange-200",
    red: "bg-red-100 text-red-800 border-red-200",
    gray: "bg-gray-100 text-gray-800 border-gray-200",
  };

  const getAcceptanceColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 60) return "text-yellow-600";
    return "text-orange-600";
  };

  if (data.total_feedings === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          🍽️ Feeding Stats
        </h3>
        <p className="text-gray-500 text-center py-8">
          No feeding data recorded yet. Add feeding logs to track patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
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
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-600 mb-1 font-semibold">
            ACCEPTANCE RATE
          </div>
          <div
            className={`text-2xl font-bold ${getAcceptanceColor(
              data.acceptance_rate
            )}`}
          >
            {data.acceptance_rate}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.total_accepted}/{data.total_feedings} accepted
          </div>
        </div>

        {data.average_days_between_feedings && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1 font-semibold">
              AVG INTERVAL
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {Math.round(data.average_days_between_feedings)}
            </div>
            <div className="text-xs text-gray-500 mt-1">days between</div>
          </div>
        )}

        {data.current_streak_accepted > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1 font-semibold">
              CURRENT STREAK
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {data.current_streak_accepted}
            </div>
            <div className="text-xs text-gray-500 mt-1">accepted in a row</div>
          </div>
        )}

        {data.longest_gap_days && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1 font-semibold">
              LONGEST GAP
            </div>
            <div className="text-2xl font-bold text-gray-700">
              {data.longest_gap_days}
            </div>
            <div className="text-xs text-gray-500 mt-1">days</div>
          </div>
        )}
      </div>

      {/* Prey Type Distribution */}
      {data.prey_type_distribution.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Prey Type Distribution
          </h4>
          <div className="space-y-2">
            {data.prey_type_distribution.map((prey, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium capitalize">
                      {prey.food_type}
                    </span>
                    <span className="text-gray-600">
                      {prey.count} ({prey.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all"
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
