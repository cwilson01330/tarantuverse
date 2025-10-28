"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";

interface ThreadAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ForumThread {
  id: number;
  category_id: number;
  author_id: string;
  author: ThreadAuthor;
  title: string;
  slug: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  last_post_at: string | null;
  last_post_user_id: string | null;
  last_post_user: ThreadAuthor | null;
}

interface ThreadListResponse {
  threads: ForumThread[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const categorySlug = params?.category as string;
  const { user } = useAuth();

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "pinned">("recent");

  useEffect(() => {
    if (categorySlug) {
      fetchThreads();
    }
  }, [categorySlug, page, sortBy]);

  const fetchThreads = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories/${categorySlug}/threads?page=${page}&limit=20&sort=${sortBy}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Category not found");
        }
        throw new Error("Failed to fetch threads");
      }

      const data: ThreadListResponse = await response.json();
      setThreads(data.threads);
      setTotal(data.total);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 text-red-300 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
          <Link
            href="/community/forums"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-block"
          >
            ← Back to Forums
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <ol className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
            <li>
              <Link href="/community" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                Community
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/community/forums" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                Forums
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-gray-100 font-medium capitalize">
              {categorySlug.replace(/-/g, " ")}
            </li>
          </ol>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 capitalize">
                {categorySlug.replace(/-/g, " ")}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">{total} thread{total !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => router.push(`/community/forums/${categorySlug}/new`)}
              className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg transition-all font-semibold shadow-lg"
            >
              + New Thread
            </button>
          </div>
        </div>

        {/* Sort Tabs */}
        <div className="mb-6 bg-surface border border-theme rounded-xl overflow-hidden">
          <div className="flex">
            <button
              onClick={() => setSortBy("recent")}
              className={`flex-1 px-6 py-4 font-medium transition-all relative ${
                sortBy === "recent"
                  ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-surface-elevated"
              }`}
            >
              Recent
              {sortBy === "recent" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
            <button
              onClick={() => setSortBy("popular")}
              className={`flex-1 px-6 py-4 font-medium transition-all relative ${
                sortBy === "popular"
                  ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-surface-elevated"
              }`}
            >
              Popular
              {sortBy === "popular" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
            <button
              onClick={() => setSortBy("pinned")}
              className={`flex-1 px-6 py-4 font-medium transition-all relative ${
                sortBy === "pinned"
                  ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-surface-elevated"
              }`}
            >
              Pinned
              {sortBy === "pinned" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 dark:bg-primary-400"></div>
              )}
            </button>
          </div>
        </div>

        {/* Threads List */}
        {threads.length === 0 ? (
          <div className="bg-surface border border-theme rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Threads Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Be the first to start a discussion!</p>
            <button
              onClick={() => router.push(`/community/forums/${categorySlug}/new`)}
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg transition-all font-semibold"
            >
              Create Thread
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/community/forums/thread/${thread.id}`}
              className="group block bg-surface border border-theme rounded-xl hover:border-primary-600 dark:hover:border-primary-400 hover:shadow-lg hover:scale-[1.005] transition-all p-5"
            >
              <div className="flex items-start gap-6">
                {/* Thread Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {thread.is_pinned && (
                      <span className="text-primary-600 dark:text-primary-400 flex-shrink-0">📌</span>
                    )}
                    {thread.is_locked && (
                      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">🔒</span>
                    )}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                      {thread.title}
                    </h3>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    by{" "}
                    <span className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
                      {thread.author.display_name || thread.author.username}
                    </span>{" "}
                    <span className="text-gray-500 dark:text-gray-500">•</span> {formatRelativeTime(thread.created_at)}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-1 min-w-[60px]">
                    <span className="text-primary-600 dark:text-primary-400">💬</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-200">{thread.post_count}</span>
                    <span className="text-xs">Post{thread.post_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 min-w-[60px]">
                    <span className="text-primary-600 dark:text-primary-400">👁️</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-200">{thread.view_count}</span>
                    <span className="text-xs">View{thread.view_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Last Activity */}
                {thread.last_post_at && thread.last_post_user && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 min-w-[160px] text-right border-l border-gray-200 dark:border-gray-700 pl-6">
                    <div className="flex items-center gap-1 justify-end mb-1">
                      <span>🕒</span>
                      <span className="font-medium">{formatRelativeTime(thread.last_post_at)}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      by {thread.last_post_user.display_name || thread.last_post_user.username}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-surface border border-theme text-theme-primary hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-theme-primary">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="px-4 py-2 rounded-lg bg-surface border border-theme text-theme-primary hover:bg-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
