"use client";

import { useState, useEffect } from "react";
import ActivityFeedItem, {
  ActivityFeedItemData,
  ActionType,
} from "./ActivityFeedItem";

interface ActivityFeedProps {
  feedType: "personalized" | "global" | "user";
  username?: string; // Required if feedType is "user"
  showFilters?: boolean;
}

interface ActivityFeedResponse {
  activities: ActivityFeedItemData[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export default function ActivityFeed({
  feedType,
  username,
  showFilters = true,
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityFeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionType | "all">(
    "all"
  );

  useEffect(() => {
    fetchActivities();
  }, [feedType, username, actionTypeFilter]);

  const fetchActivities = async (pageNum: number = 1) => {
    try {
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      let url = "";
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "20",
      });

      if (actionTypeFilter !== "all") {
        params.append("action_type", actionTypeFilter);
      }

      if (feedType === "personalized") {
        const token = localStorage.getItem("auth_token");
        if (!token) {
          throw new Error("Authentication required");
        }
        url = `${API_URL}/api/v1/activity/feed?${params.toString()}`;
        
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch activity feed");
        }

        const data: ActivityFeedResponse = await response.json();
        if (pageNum === 1) {
          setActivities(data.activities);
        } else {
          setActivities((prev) => [...prev, ...data.activities]);
        }
        setHasMore(data.has_more);
        setPage(pageNum);
      } else if (feedType === "global") {
        url = `${API_URL}/api/v1/activity/global?${params.toString()}`;
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch activity feed");
        }

        const data: ActivityFeedResponse = await response.json();
        if (pageNum === 1) {
          setActivities(data.activities);
        } else {
          setActivities((prev) => [...prev, ...data.activities]);
        }
        setHasMore(data.has_more);
        setPage(pageNum);
      } else if (feedType === "user" && username) {
        url = `${API_URL}/api/v1/activity/user/${username}?${params.toString()}`;
        
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch user activity");
        }

        const data: ActivityFeedResponse = await response.json();
        if (pageNum === 1) {
          setActivities(data.activities);
        } else {
          setActivities((prev) => [...prev, ...data.activities]);
        }
        setHasMore(data.has_more);
        setPage(pageNum);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    fetchActivities(page + 1);
  };

  const actionTypeOptions: { value: ActionType | "all"; label: string }[] = [
    { value: "all", label: "All Activity" },
    { value: "new_tarantula", label: "New Tarantulas" },
    { value: "molt", label: "Molts" },
    { value: "feeding", label: "Feedings" },
    { value: "follow", label: "Follows" },
    { value: "forum_thread", label: "Forum Threads" },
    { value: "forum_post", label: "Forum Posts" },
  ];

  if (loading && activities.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-dark-50 rounded-lg shadow-lg border border-electric-blue-500/20 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-electric-blue-500/30 rounded"></div>
              <div className="flex-1">
                <div className="h-4 bg-electric-blue-500/20 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-electric-blue-500/20 rounded w-1/4"></div>
              </div>
              <div className="w-10 h-10 bg-gradient-primary rounded-full opacity-50"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg backdrop-blur-sm">
        <p className="font-bold">Error</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      {showFilters && (
        <div className="bg-dark-50 rounded-lg shadow-lg border border-electric-blue-500/20 p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔧</span>
            <select
              value={actionTypeFilter}
              onChange={(e) =>
                setActionTypeFilter(e.target.value as ActionType | "all")
              }
              className="flex-1 px-3 py-2 bg-dark border border-electric-blue-500/30 text-gray-100 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent"
            >
              {actionTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Activity Items */}
      {activities.length === 0 ? (
        <div className="bg-dark-50 rounded-lg shadow-lg border border-electric-blue-500/20 p-8 text-center">
          <div className="text-6xl mb-4">🕷️</div>
          <h3 className="text-xl font-semibold text-gray-100 mb-2">
            No activity yet
          </h3>
          <p className="text-gray-400">
            {feedType === "personalized"
              ? "Follow other keepers to see their activity here!"
              : "Check back later for updates from the community."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {activities.map((activity) => (
              <ActivityFeedItem key={activity.id} activity={activity} />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:bg-gradient-primary-hover transition-colors shadow-lg shadow-electric-blue-500/30 hover:shadow-electric-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
