"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

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

type DateRange = "all" | "1y" | "6m" | "3m";

export default function GrowthChart({ data }: GrowthChartProps) {
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [metric, setMetric] = useState<"weight" | "leg_span" | "both">("both");

  // Filter data based on selected date range
  const filterDataByRange = (points: GrowthDataPoint[]) => {
    if (dateRange === "all") return points;

    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case "1y":
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case "6m":
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case "3m":
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }

    return points.filter((point) => new Date(point.date) >= cutoffDate);
  };

  const filteredData = filterDataByRange(data.data_points);

  // Format data for chart
  const chartData = filteredData.map((point) => ({
    date: format(new Date(point.date), "MMM d, yyyy"),
    shortDate: format(new Date(point.date), "MMM d"),
    weight: point.weight ? parseFloat(point.weight.toString()) : null,
    legSpan: point.leg_span ? parseFloat(point.leg_span.toString()) : null,
  }));

  // Check if we have any data to display
  const hasWeightData = chartData.some((d) => d.weight !== null);
  const hasLegSpanData = chartData.some((d) => d.legSpan !== null);

  if (data.total_molts === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Growth Tracking</h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No molt data recorded yet. Add molt logs to track growth over time.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Growth Tracking</h3>

        <div className="flex flex-wrap gap-2">
          {/* Metric selector */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setMetric("both")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                metric === "both"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Both
            </button>
            <button
              onClick={() => setMetric("weight")}
              disabled={!hasWeightData}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                metric === "weight"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              Weight
            </button>
            <button
              onClick={() => setMetric("leg_span")}
              disabled={!hasLegSpanData}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                metric === "leg_span"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }`}
            >
              Leg Span
            </button>
          </div>

          {/* Date range selector */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setDateRange("3m")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                dateRange === "3m"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              3M
            </button>
            <button
              onClick={() => setDateRange("6m")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                dateRange === "6m"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              6M
            </button>
            <button
              onClick={() => setDateRange("1y")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                dateRange === "1y"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              1Y
            </button>
            <button
              onClick={() => setDateRange("all")}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                dateRange === "all"
                  ? "bg-white dark:bg-gray-600 shadow text-orange-600 dark:text-orange-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Molts</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.total_molts}
          </div>
        </div>
        {data.average_days_between_molts && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Avg Days Between</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {Math.round(data.average_days_between_molts)}
            </div>
          </div>
        )}
        {data.total_weight_gain && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Weight Gain</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              +{parseFloat(data.total_weight_gain.toString()).toFixed(1)}g
            </div>
          </div>
        )}
        {data.total_leg_span_gain && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Size Gain</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              +{parseFloat(data.total_leg_span_gain.toString()).toFixed(1)} cm
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="shortDate"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              label={{
                value: metric === "leg_span" ? "" : "Weight (g)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12 },
              }}
            />
            {(metric === "both" || metric === "leg_span") && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                label={{
                  value: "Leg Span (cm)",
                  angle: 90,
                  position: "insideRight",
                  style: { fontSize: 12 },
                }}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "rgb(31, 41, 55)", // gray-800
                border: "1px solid rgb(75, 85, 99)", // gray-600
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                color: "white",
              }}
              formatter={(value: any, name: string) => {
                if (name === "weight") return [`${value.toFixed(1)}g`, "Weight"];
                if (name === "legSpan")
                  return [`${value.toFixed(1)} cm`, "Leg Span"];
                return [value, name];
              }}
            />
            <Legend />
            {(metric === "both" || metric === "weight") && hasWeightData && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="weight"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: "#10b981", r: 4 }}
                name="Weight"
                connectNulls
              />
            )}
            {(metric === "both" || metric === "leg_span") &&
              hasLegSpanData && (
                <Line
                  yAxisId={metric === "leg_span" ? "left" : "right"}
                  type="monotone"
                  dataKey="legSpan"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  name="Leg Span"
                  connectNulls
                />
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Growth Rate Info */}
      {(data.growth_rate_weight || data.growth_rate_leg_span) && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-wrap gap-4 text-sm">
          {data.growth_rate_weight && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Weight Growth Rate:</span>{" "}
              <span className="font-semibold text-green-600 dark:text-green-400">
                {parseFloat(data.growth_rate_weight.toString()).toFixed(2)}g/mo
              </span>
            </div>
          )}
          {data.growth_rate_leg_span && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Size Growth Rate:</span>{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {parseFloat(data.growth_rate_leg_span.toString()).toFixed(2)}{" "}
                cm/mo
              </span>
            </div>
          )}
          {data.days_since_last_molt !== undefined && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Days Since Last Molt:</span>{" "}
              <span className="font-semibold text-gray-900 dark:text-white">{data.days_since_last_molt}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
