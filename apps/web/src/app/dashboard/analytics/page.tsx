"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import apiClient from "@/lib/api";

interface SpeciesCount {
  species_name: string;
  count: number;
}

interface ActivityItem {
  type: string;
  date: string;
  tarantula_id: string;
  tarantula_name: string;
  description: string;
}

interface CollectionAnalytics {
  total_tarantulas: number;
  unique_species: number;
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
  species_counts: SpeciesCount[];
  total_value: number;
  average_age_months: number;
  total_feedings: number;
  total_molts: number;
  total_substrate_changes: number;
  average_days_between_feedings: number;
  most_active_molter: {
    tarantula_id: string;
    name: string;
    molt_count: number;
  } | null;
  newest_acquisition: {
    tarantula_id: string;
    name: string;
    date: string;
  } | null;
  oldest_acquisition: {
    tarantula_id: string;
    name: string;
    date: string;
  } | null;
  recent_activity: ActivityItem[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<CollectionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/api/v1/analytics/collection");
      setAnalytics(response.data);
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch analytics:", err);
      setError(err.response?.data?.detail || "Failed to load analytics");
      if (err.response?.status === 401) {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "feeding":
        return "🍴";
      case "molt":
        return "🦋";
      case "substrate_change":
        return "🏠";
      default:
        return "📝";
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Collection Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
    );
  }

  if (error || !analytics) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Collection Analytics</h1>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <p className="text-red-600 dark:text-red-400">{error || "No data available"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (analytics.total_tarantulas === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Collection Analytics</h1>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No tarantulas in your collection yet!
            </p>
            <button
              onClick={() => router.push("/dashboard/tarantulas/new")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Your First Tarantula
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSexed = analytics.sex_distribution.male + analytics.sex_distribution.female;
  const malePercent = totalSexed > 0 ? (analytics.sex_distribution.male / totalSexed * 100).toFixed(1) : 0;
  const femalePercent = totalSexed > 0 ? (analytics.sex_distribution.female / totalSexed * 100).toFixed(1) : 0;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">📊 Collection Analytics</h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Total Tarantulas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{analytics.total_tarantulas}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {analytics.unique_species} unique species
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Collection Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">${analytics.total_value.toFixed(2)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Avg: ${(analytics.total_value / analytics.total_tarantulas).toFixed(2)} each
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Average Age
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{analytics.average_age_months}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">months in collection</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Total Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {analytics.total_feedings + analytics.total_molts + analytics.total_substrate_changes}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {analytics.total_feedings} feedings, {analytics.total_molts} molts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sex Distribution and Notable Tarantulas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sex Distribution */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Sex Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Male Bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">♂️ Male</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{analytics.sex_distribution.male} ({malePercent}%)</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all"
                    style={{ width: `${malePercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Female Bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">♀️ Female</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{analytics.sex_distribution.female} ({femalePercent}%)</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-pink-500 h-3 rounded-full transition-all"
                    style={{ width: `${femalePercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Unknown */}
              <div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">❓ Unknown</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{analytics.sex_distribution.unknown}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notable Tarantulas */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Notable Tarantulas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.most_active_molter && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">🦋 Most Active Molter</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{analytics.most_active_molter.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{analytics.most_active_molter.molt_count} molts</p>
              </div>
            )}

            {analytics.newest_acquisition && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">🆕 Newest Addition</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{analytics.newest_acquisition.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Added {formatDate(analytics.newest_acquisition.date)}
                </p>
              </div>
            )}

            {analytics.oldest_acquisition && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">👴 Oldest in Collection</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{analytics.oldest_acquisition.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Since {formatDate(analytics.oldest_acquisition.date)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Species Distribution */}
      {analytics.species_counts.length > 0 && (
        <Card className="mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Species Distribution (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.species_counts.slice(0, 10).map((species, index) => {
                const percentage = (species.count / analytics.total_tarantulas * 100).toFixed(1);
                return (
                  <div key={index}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium truncate text-gray-900 dark:text-white">{species.species_name}</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{species.count} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feeding Statistics */}
      <Card className="mb-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Feeding Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{analytics.total_feedings}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Feedings</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{analytics.average_days_between_feedings}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg Days Between Feedings</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {analytics.total_tarantulas > 0
                  ? (analytics.total_feedings / analytics.total_tarantulas).toFixed(1)
                  : 0}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg Feedings Per Tarantula</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      {analytics.recent_activity.length > 0 && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.recent_activity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/tarantulas/${activity.tarantula_id}`)}
                >
                  <span className="text-2xl">{getActivityIcon(activity.type)}</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{activity.tarantula_name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{activity.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{formatDate(activity.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
