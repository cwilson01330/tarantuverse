'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminStatCard,
  AdminTimeSeriesChart,
  AdminPieChart,
  PeriodSelector,
} from '@/components/admin';
import {
  AnalyticsPeriod,
  AdminAnalyticsOverview,
  UserAnalyticsResponse,
  RevenueAnalyticsResponse,
  ActivityAnalyticsResponse,
  CommunityAnalyticsResponse,
} from '@/types/admin-analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type TabType = 'users' | 'revenue' | 'activity' | 'community';

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  {
    id: 'users',
    label: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
  },
  {
    id: 'revenue',
    label: 'Revenue',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'community',
    label: 'Community',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
];

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<AdminAnalyticsOverview | null>(null);
  const [usersData, setUsersData] = useState<UserAnalyticsResponse | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueAnalyticsResponse | null>(null);
  const [activityData, setActivityData] = useState<ActivityAnalyticsResponse | null>(null);
  const [communityData, setCommunityData] = useState<CommunityAnalyticsResponse | null>(null);

  const getToken = () => localStorage.getItem('token');

  // Fetch overview data
  useEffect(() => {
    const fetchOverview = async () => {
      const token = getToken();
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/admin/analytics/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 403) {
          router.push('/dashboard');
          return;
        }

        if (!response.ok) throw new Error('Failed to fetch overview');
        const data = await response.json();
        setOverview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, [router]);

  // Fetch tab-specific data when period or tab changes
  useEffect(() => {
    const fetchTabData = async () => {
      const token = getToken();
      if (!token) return;

      try {
        const endpoint = {
          users: 'users',
          revenue: 'revenue',
          activity: 'activity',
          community: 'community',
        }[activeTab];

        const response = await fetch(
          `${API_URL}/api/v1/admin/analytics/${endpoint}?period=${period}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error(`Failed to fetch ${activeTab} data`);
        const data = await response.json();

        switch (activeTab) {
          case 'users':
            setUsersData(data);
            break;
          case 'revenue':
            setRevenueData(data);
            break;
          case 'activity':
            setActivityData(data);
            break;
          case 'community':
            setCommunityData(data);
            break;
        }
      } catch (err) {
        console.error(`Error fetching ${activeTab} data:`, err);
      }
    };

    fetchTabData();
  }, [period, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
          <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Admin Analytics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Platform metrics and insights
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Overview Stats */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <AdminStatCard
            title="Total Users"
            value={overview.total_users}
            trend={
              overview.user_growth_rate
                ? { value: overview.user_growth_rate, isPositive: overview.user_growth_rate > 0 }
                : undefined
            }
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            }
            color="blue"
          />
          <AdminStatCard
            title="Premium Users"
            value={overview.total_premium_users}
            subtitle={`${overview.subscription_conversion_rate.toFixed(1)}% conversion`}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            }
            color="purple"
          />
          <AdminStatCard
            title="MRR"
            value={`$${overview.mrr.toFixed(2)}`}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            color="green"
          />
          <AdminStatCard
            title="Active Today"
            value={overview.active_users_today}
            subtitle={`${overview.active_users_7d} in 7 days`}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            color="orange"
          />
          <AdminStatCard
            title="Total Tarantulas"
            value={overview.total_tarantulas}
            subtitle={`${overview.total_feedings_today} feedings today`}
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
            color="red"
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'users' && usersData && (
            <UsersTabContent data={usersData} />
          )}
          {activeTab === 'revenue' && revenueData && (
            <RevenueTabContent data={revenueData} />
          )}
          {activeTab === 'activity' && activityData && (
            <ActivityTabContent data={activityData} />
          )}
          {activeTab === 'community' && communityData && (
            <CommunityTabContent data={communityData} />
          )}
          {!usersData && !revenueData && !activityData && !communityData && (
            <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              Loading data...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Users Tab Content
function UsersTabContent({ data }: { data: UserAnalyticsResponse }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdminStatCard
          title="New Users"
          value={data.total_new_users}
          trend={{ value: data.growth_rate, isPositive: data.growth_rate > 0 }}
          color="blue"
        />
        <AdminStatCard
          title="30-Day Retention"
          value={`${data.average_retention_day_30.toFixed(1)}%`}
          color="green"
        />
        <AdminStatCard
          title="Growth Rate"
          value={`${data.growth_rate.toFixed(1)}%`}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminTimeSeriesChart
          title="User Growth"
          data={data.time_series}
          series={[
            { key: 'new_users', name: 'New Users', color: '#3B82F6' },
            { key: 'active_users', name: 'Active Users', color: '#10B981' },
          ]}
        />
        <AdminPieChart
          title="OAuth Providers"
          data={data.oauth_breakdown.map((item) => ({
            name: item.provider || 'Email',
            value: item.count,
            percentage: item.percentage,
          }))}
        />
      </div>

      {/* Retention Cohorts */}
      {data.retention_cohorts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Retention Cohorts
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Cohort
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Day 1
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Day 7
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Day 30
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.retention_cohorts.map((cohort, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {cohort.cohort_month}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {cohort.cohort_size}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {cohort.retained_day_1.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {cohort.retained_day_7.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {cohort.retained_day_30.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Revenue Tab Content
function RevenueTabContent({ data }: { data: RevenueAnalyticsResponse }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AdminStatCard
          title="MRR"
          value={`$${data.mrr.toFixed(2)}`}
          color="green"
        />
        <AdminStatCard
          title="Premium Users"
          value={data.total_premium_users}
          color="purple"
        />
        <AdminStatCard
          title="Conversion Rate"
          value={`${data.conversion_rate.toFixed(1)}%`}
          color="blue"
        />
        <AdminStatCard
          title="Churn Rate"
          value={`${data.churn_rate.toFixed(1)}%`}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminTimeSeriesChart
          title="Subscription Activity"
          data={data.time_series}
          series={[
            { key: 'new_subscriptions', name: 'New', color: '#10B981' },
            { key: 'cancellations', name: 'Cancellations', color: '#EF4444' },
            { key: 'active_subscriptions', name: 'Active', color: '#8B5CF6' },
          ]}
        />
        <div className="grid grid-cols-1 gap-6">
          <AdminPieChart
            title="Plan Distribution"
            data={data.subscription_breakdown.map((item) => ({
              name: item.plan_name,
              value: item.active_count,
              percentage: item.percentage,
            }))}
            height={150}
          />
          <AdminPieChart
            title="Subscription Source"
            data={data.source_breakdown.map((item) => ({
              name: item.source,
              value: item.count,
              percentage: item.percentage,
            }))}
            height={150}
          />
        </div>
      </div>
    </div>
  );
}

// Activity Tab Content
function ActivityTabContent({ data }: { data: ActivityAnalyticsResponse }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AdminStatCard
          title="Total Tarantulas"
          value={data.total_tarantulas}
          color="purple"
        />
        <AdminStatCard
          title="Total Feedings"
          value={data.total_feedings}
          color="green"
        />
        <AdminStatCard
          title="Total Molts"
          value={data.total_molts}
          color="blue"
        />
        <AdminStatCard
          title="Avg Collection Size"
          value={data.average_collection_size.toFixed(1)}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminTimeSeriesChart
          title="Platform Activity"
          data={data.time_series}
          series={[
            { key: 'new_tarantulas', name: 'New Tarantulas', color: '#8B5CF6' },
            { key: 'feedings', name: 'Feedings', color: '#10B981' },
            { key: 'molts', name: 'Molts', color: '#3B82F6' },
            { key: 'substrate_changes', name: 'Substrate', color: '#F59E0B' },
          ]}
        />
        <AdminPieChart
          title="Top Species"
          data={data.top_species.map((item) => ({
            name: item.species_name,
            value: item.count,
            percentage: item.percentage,
          }))}
        />
      </div>
    </div>
  );
}

// Community Tab Content
function CommunityTabContent({ data }: { data: CommunityAnalyticsResponse }) {
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AdminStatCard
          title="Total Threads"
          value={data.total_threads}
          color="purple"
        />
        <AdminStatCard
          title="Total Posts"
          value={data.total_posts}
          color="blue"
        />
        <AdminStatCard
          title="Total Follows"
          value={data.total_follows}
          color="green"
        />
        <AdminStatCard
          title="Avg Posts/Thread"
          value={data.average_posts_per_thread.toFixed(1)}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminTimeSeriesChart
          title="Community Activity"
          data={data.time_series}
          series={[
            { key: 'new_threads', name: 'Threads', color: '#8B5CF6' },
            { key: 'new_posts', name: 'Posts', color: '#3B82F6' },
            { key: 'new_messages', name: 'Messages', color: '#10B981' },
            { key: 'new_follows', name: 'Follows', color: '#F59E0B' },
          ]}
        />
        <AdminPieChart
          title="Forum Categories"
          data={data.forum_categories.map((item) => ({
            name: item.category_name,
            value: item.post_count,
          }))}
        />
      </div>

      {/* Top Contributors */}
      {data.top_contributors.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Top Contributors
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {data.top_contributors.map((contributor, index) => (
              <div
                key={contributor.user_id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {contributor.display_name || contributor.username}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {contributor.post_count} posts
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
