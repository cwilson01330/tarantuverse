"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import apiClient from "@/lib/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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

const COLORS = [
  "#8B5CF6",
  "#EC4899",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#8B4513",
  "#6366F1",
  "#14B8A6",
];

const SEX_COLORS: { [key: string]: string } = {
  male: "#3B82F6",
  female: "#EC4899",
  unknown: "#9CA3AF",
};

const ENCLOSURE_COLORS: { [key: string]: string } = {
  terrestrial: "#92400E",
  arboreal: "#059669",
  fossorial: "#7C3AED",
  unknown: "#6B7280",
};

export default function AdvancedAnalyticsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdvancedAnalytics();
  }, []);

  const fetchAdvancedAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/api/v1/analytics/advanced/");
      setAnalytics(response.data);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch advanced analytics:", err);
      setError(err.response?.data?.detail || "Failed to load advanced analytics");
      if (err.response?.status === 401) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
            ✨ Advanced Analytics
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card
                key={i}
                className="animate-pulse bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <CardHeader>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !analytics) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
            ✨ Advanced Analytics
          </h1>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6">
              <p className="text-red-600 dark:text-red-400">
                {error || "No data available"}
              </p>
              <button
                onClick={() => router.push("/dashboard/analytics")}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Back to Analytics
              </button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (
    analytics.molt_heatmap.length === 0 &&
    analytics.collection_growth.length === 0
  ) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
            ✨ Advanced Analytics
          </h1>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Not enough data yet to show advanced analytics. Keep tracking your
                tarantulas!
              </p>
              <button
                onClick={() => router.push("/dashboard/analytics")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Back to Analytics
              </button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const sexDistributionData = [
    { name: "Male", value: analytics.sex_distribution.male },
    { name: "Female", value: analytics.sex_distribution.female },
    { name: "Unknown", value: analytics.sex_distribution.unknown },
  ].filter((d) => d.value > 0);

  const enclosureDistributionData = Object.entries(
    analytics.enclosure_type_distribution
  ).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: count,
  }));

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push("/dashboard/analytics")}
              className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-2 transition-colors"
            >
              ← Back to Analytics
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              ✨ Advanced Analytics
            </h1>
          </div>
          <div className="px-3 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full text-sm font-medium">
            Premium
          </div>
        </div>

        {/* Collection Value Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total Collection Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                ${analytics.collection_value_total.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Across all tarantulas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Average Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                ${analytics.collection_value_average.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Per tarantula
              </p>
            </CardContent>
          </Card>

          {analytics.most_expensive_name && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Most Expensive
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {analytics.most_expensive_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  ${analytics.most_expensive_price?.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Est. Monthly Feeding Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                ${analytics.estimated_monthly_feeding_cost.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                At $0.50 per feeding
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Molt Heatmap */}
          {analytics.molt_heatmap.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">
                  🦋 Molt Activity (Last 12 Months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.molt_heatmap}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="month"
                      stroke="#9CA3AF"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #4B5563",
                        borderRadius: "8px",
                        color: "#F3F4F6",
                      }}
                    />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Collection Growth */}
          {analytics.collection_growth.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">
                  📈 Collection Growth (Last 12 Months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.collection_growth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="month"
                      stroke="#9CA3AF"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #4B5563",
                        borderRadius: "8px",
                        color: "#F3F4F6",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: "#10B981", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Sex Distribution */}
          {sexDistributionData.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">
                  👥 Sex Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sexDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) =>
                        `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {sexDistributionData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SEX_COLORS[entry.name.toLowerCase()]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #4B5563",
                        borderRadius: "8px",
                        color: "#F3F4F6",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Enclosure Type Distribution */}
          {enclosureDistributionData.length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white">
                  🏠 Enclosure Types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={enclosureDistributionData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#9CA3AF"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #4B5563",
                        borderRadius: "8px",
                        color: "#F3F4F6",
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#F59E0B"
                      radius={[0, 8, 8, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Species Distribution */}
        {analytics.species_distribution.length > 0 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-6">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">
                🕷️ Top Species (Top 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analytics.species_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="species_name"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      border: "1px solid #4B5563",
                      borderRadius: "8px",
                      color: "#F3F4F6",
                    }}
                  />
                  <Bar dataKey="count" fill="#EC4899" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Activity Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total Feedings Logged
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {analytics.total_feedings_logged}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                feeding events tracked
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total Molts Logged
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {analytics.total_molts_logged}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                molt events tracked
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Species Diversity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {analytics.species_distribution.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                unique species
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
