"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Eye, Clock, Pin, Lock, ArrowLeft } from "lucide-react";

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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-dark-50 rounded w-1/4"></div>
          <div className="h-20 bg-dark-50 rounded"></div>
          <div className="h-20 bg-dark-50 rounded"></div>
          <div className="h-20 bg-dark-50 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
        <Link
          href="/community/forums"
          className="text-electric-blue-400 hover:text-electric-blue-300 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Forums
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/community/forums"
          className="text-electric-blue-400 hover:text-electric-blue-300 flex items-center gap-2 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Forums
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 mb-2 capitalize">
              {categorySlug.replace(/-/g, " ")}
            </h1>
            <p className="text-gray-400">{total} threads</p>
          </div>
          <button
            onClick={() => router.push(`/community/forums/${categorySlug}/new`)}
            className="bg-gradient-primary text-white px-6 py-2 rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all"
          >
            New Thread
          </button>
        </div>
      </div>

      {/* Sort Options */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setSortBy("recent")}
          className={`px-4 py-2 rounded-lg transition-all ${
            sortBy === "recent"
              ? "bg-electric-blue-500 text-white shadow-lg shadow-electric-blue-500/30"
              : "bg-dark-50 border border-electric-blue-500/20 text-gray-300 hover:border-electric-blue-500/40"
          }`}
        >
          Recent
        </button>
        <button
          onClick={() => setSortBy("popular")}
          className={`px-4 py-2 rounded-lg transition-all ${
            sortBy === "popular"
              ? "bg-neon-pink-500 text-white shadow-lg shadow-neon-pink-500/30"
              : "bg-dark-50 border border-electric-blue-500/20 text-gray-300 hover:border-electric-blue-500/40"
          }`}
        >
          Popular
        </button>
        <button
          onClick={() => setSortBy("pinned")}
          className={`px-4 py-2 rounded-lg transition-all ${
            sortBy === "pinned"
              ? "bg-gradient-primary text-white shadow-lg shadow-electric-blue-500/30"
              : "bg-dark-50 border border-electric-blue-500/20 text-gray-300 hover:border-electric-blue-500/40"
          }`}
        >
          Pinned
        </button>
      </div>

      {/* Threads List */}
      {threads.length === 0 ? (
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md p-8 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-100 mb-2">No Threads Yet</h3>
          <p className="text-gray-400 mb-4">Be the first to start a discussion!</p>
          <button
            onClick={() => router.push(`/community/forums/${categorySlug}/new`)}
            className="bg-gradient-primary text-white px-6 py-2 rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all"
          >
            Create Thread
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/community/forums/thread/${thread.id}`}
              className="block bg-dark-50 border border-electric-blue-500/20 rounded-lg hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition-all p-4"
            >
              <div className="flex items-start gap-4">
                {/* Thread Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {thread.is_pinned && (
                      <Pin className="w-4 h-4 text-neon-pink-400 flex-shrink-0" />
                    )}
                    {thread.is_locked && (
                      <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    )}
                    <h3 className="text-lg font-semibold text-gray-100 truncate">
                      {thread.title}
                    </h3>
                  </div>
                  <div className="text-sm text-gray-400">
                    by{" "}
                    <span className="font-medium text-electric-blue-400">
                      {thread.author.display_name || thread.author.username}
                    </span>{" "}
                    • {formatRelativeTime(thread.created_at)}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4 text-electric-blue-400" />
                    <span>{thread.post_count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4 text-neon-pink-400" />
                    <span>{thread.view_count}</span>
                  </div>
                </div>

                {/* Last Activity */}
                {thread.last_post_at && thread.last_post_user && (
                  <div className="text-sm text-gray-400 min-w-[150px] text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <Clock className="w-4 h-4" />
                      <span>{formatRelativeTime(thread.last_post_at)}</span>
                    </div>
                    <div className="text-xs">
                      by{" "}
                      {thread.last_post_user.display_name ||
                        thread.last_post_user.username}
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
            className="px-4 py-2 rounded-lg bg-dark-50 border border-electric-blue-500/20 text-gray-300 hover:border-electric-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-300">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="px-4 py-2 rounded-lg bg-dark-50 border border-electric-blue-500/20 text-gray-300 hover:border-electric-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
