/**
 * Admin Analytics TypeScript Types
 * Matches the backend Pydantic schemas
 */

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

// ============ Overview ============

export interface AdminAnalyticsOverview {
  total_users: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  user_growth_rate: number;
  total_premium_users: number;
  mrr: number;
  subscription_conversion_rate: number;
  total_tarantulas: number;
  total_feedings_today: number;
  total_molts_today: number;
  total_substrate_changes_today: number;
  total_forum_threads: number;
  total_forum_posts: number;
  total_messages_today: number;
  generated_at: string;
}

// ============ User Analytics ============

export interface UserTimeSeriesPoint {
  date: string;
  new_users: number;
  cumulative_users: number;
  active_users: number;
}

export interface UserRetentionCohort {
  cohort_month: string;
  cohort_size: number;
  retained_day_1: number;
  retained_day_7: number;
  retained_day_30: number;
}

export interface OAuthBreakdown {
  provider: string;
  count: number;
  percentage: number;
}

export interface UserAnalyticsResponse {
  time_series: UserTimeSeriesPoint[];
  retention_cohorts: UserRetentionCohort[];
  oauth_breakdown: OAuthBreakdown[];
  total_new_users: number;
  growth_rate: number;
  average_retention_day_30: number;
}

// ============ Revenue Analytics ============

export interface RevenueTimeSeriesPoint {
  date: string;
  new_subscriptions: number;
  cancellations: number;
  active_subscriptions: number;
}

export interface SubscriptionBreakdown {
  plan_name: string;
  active_count: number;
  percentage: number;
}

export interface SubscriptionSourceBreakdown {
  source: string;
  count: number;
  percentage: number;
}

export interface RevenueAnalyticsResponse {
  time_series: RevenueTimeSeriesPoint[];
  subscription_breakdown: SubscriptionBreakdown[];
  source_breakdown: SubscriptionSourceBreakdown[];
  mrr: number;
  total_premium_users: number;
  churn_rate: number;
  conversion_rate: number;
}

// ============ Activity Analytics ============

export interface ActivityTimeSeriesPoint {
  date: string;
  new_tarantulas: number;
  feedings: number;
  molts: number;
  substrate_changes: number;
}

export interface SpeciesPopularity {
  species_name: string;
  count: number;
  percentage: number;
}

export interface ActivityAnalyticsResponse {
  time_series: ActivityTimeSeriesPoint[];
  top_species: SpeciesPopularity[];
  total_tarantulas: number;
  total_feedings: number;
  total_molts: number;
  average_collection_size: number;
}

// ============ Community Analytics ============

export interface CommunityTimeSeriesPoint {
  date: string;
  new_threads: number;
  new_posts: number;
  new_messages: number;
  new_follows: number;
}

export interface ForumCategoryStats {
  category_name: string;
  thread_count: number;
  post_count: number;
}

export interface TopContributor {
  user_id: string;
  username: string;
  display_name: string | null;
  post_count: number;
}

export interface CommunityAnalyticsResponse {
  time_series: CommunityTimeSeriesPoint[];
  forum_categories: ForumCategoryStats[];
  top_contributors: TopContributor[];
  total_threads: number;
  total_posts: number;
  total_follows: number;
  average_posts_per_thread: number;
}
