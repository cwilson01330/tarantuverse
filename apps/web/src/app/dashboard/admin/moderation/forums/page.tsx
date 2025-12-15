'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface ForumThread {
  id: number;
  category_id: number;
  title: string;
  slug: string;
  author: {
    username: string;
    email: string;
  };
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  last_post_at: string;
}

interface ForumPost {
  id: number;
  thread_id: number;
  author: {
    username: string;
    email: string;
  };
  content: string;
  is_edited: boolean;
  created_at: string;
}

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  thread_count: number;
  post_count: number;
}

export default function ForumModerationPage() {
  const router = useRouter();
  const { user, token, isLoading, isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [recentThreads, setRecentThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    if (!user.is_admin && !user.is_superuser) {
      router.push('/dashboard');
      return;
    }

    fetchForumData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  const fetchForumData = async () => {
    if (!token) {
      setError('No authentication token found. Please log in again.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch categories
      const categoriesResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        setCategories(categoriesData);

        // Fetch recent threads from all categories
        const threadPromises = categoriesData.slice(0, 3).map((cat: ForumCategory) =>
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories/${cat.slug}/threads?limit=10`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          ).then((res) => res.json())
        );

        const threadsData = await Promise.all(threadPromises);
        const allThreads = threadsData.flatMap((data) => data.threads || []);

        // Sort by most recent and take top 20
        allThreads.sort((a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        setRecentThreads(allThreads.slice(0, 20));
      } else {
        const errorData = await categoriesResponse.json().catch(() => ({ detail: 'Unknown error' }));
        setError(`Failed to load forum data: ${errorData.detail || categoriesResponse.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch forum data:', error);
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePin = async (threadId: number, isPinned: boolean) => {
    if (!token) return;

    try {
      setActionLoading(`pin-${threadId}`);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_pinned: !isPinned }),
        }
      );

      if (response.ok) {
        // Update local state
        setRecentThreads(threads =>
          threads.map(t => t.id === threadId ? { ...t, is_pinned: !isPinned } : t)
        );
      } else {
        const errorData = await response.json();
        alert(`Failed to toggle pin: ${errorData.detail}`);
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      alert('Failed to toggle pin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleLock = async (threadId: number, isLocked: boolean) => {
    if (!token) return;

    try {
      setActionLoading(`lock-${threadId}`);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_locked: !isLocked }),
        }
      );

      if (response.ok) {
        // Update local state
        setRecentThreads(threads =>
          threads.map(t => t.id === threadId ? { ...t, is_locked: !isLocked } : t)
        );
      } else {
        const errorData = await response.json();
        alert(`Failed to toggle lock: ${errorData.detail}`);
      }
    } catch (error) {
      console.error('Failed to toggle lock:', error);
      alert('Failed to toggle lock');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteThread = async (threadId: number, threadTitle: string) => {
    if (!token) return;

    if (!confirm(`Are you sure you want to delete the thread "${threadTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(`delete-${threadId}`);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        // Remove from local state
        setRecentThreads(threads => threads.filter(t => t.id !== threadId));
      } else {
        const errorData = await response.json();
        alert(`Failed to delete thread: ${errorData.detail}`);
      }
    } catch (error) {
      console.error('Failed to delete thread:', error);
      alert('Failed to delete thread');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading || loading) {
    return (
    <DashboardLayout
      userName={user?.display_name || user?.username || "Loading..."}
      userEmail={user?.email || ""}
      userAvatar={user?.avatar_url}
    >
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading forum moderation...</p>
        </div>
      </div>
    </DashboardLayout>
    );
  }

  if (!user || (!user.is_admin && !user.is_superuser)) {
    return null;
  }

  return (
    <DashboardLayout
      userName={user.display_name || user.username}
      userEmail={user.email}
      userAvatar={user.avatar_url}
    >
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Forum Moderation
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage forum threads, posts, and categories
              </p>
            </div>
            <Link
              href="/dashboard/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              ← Back to Admin
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-900 dark:text-red-200">Error Loading Data</h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => fetchForumData()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Forum Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">📁</div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {categories.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Categories</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">💬</div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {categories.reduce((sum, cat) => sum + cat.thread_count, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Threads</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">✉️</div>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {categories.reduce((sum, cat) => sum + cat.post_count, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Posts</p>
              </div>
            </div>
          </div>
        </div>

        {/* Categories List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Forum Categories</h2>
          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{category.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{category.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {category.thread_count} threads
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {category.post_count} posts
                    </p>
                  </div>
                  <Link
                    href={`/community/forums/${category.slug}`}
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Threads */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Threads</h2>

          {recentThreads.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-gray-500 dark:text-gray-400">No threads yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentThreads.map((thread) => (
                <div
                  key={thread.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link
                          href={`/community/forums/thread/${thread.id}`}
                          className="text-lg font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400"
                        >
                          {thread.title}
                        </Link>
                        {thread.is_pinned && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                            📌 Pinned
                          </span>
                        )}
                        {thread.is_locked && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                            🔒 Locked
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <span>by {thread.author.username}</span>
                        <span>•</span>
                        <span>{thread.post_count} replies</span>
                        <span>•</span>
                        <span>{thread.view_count} views</span>
                        <span>•</span>
                        <span>{formatRelativeTime(thread.last_post_at)}</span>
                      </div>
                    </div>

                    {/* Moderation Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleTogglePin(thread.id, thread.is_pinned)}
                        disabled={actionLoading === `pin-${thread.id}`}
                        className={`px-3 py-1 text-xs rounded-lg transition ${
                          thread.is_pinned
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                        title={thread.is_pinned ? 'Unpin thread' : 'Pin thread'}
                      >
                        {actionLoading === `pin-${thread.id}` ? '...' : thread.is_pinned ? '📌 Unpin' : '📌 Pin'}
                      </button>

                      <button
                        onClick={() => handleToggleLock(thread.id, thread.is_locked)}
                        disabled={actionLoading === `lock-${thread.id}`}
                        className={`px-3 py-1 text-xs rounded-lg transition ${
                          thread.is_locked
                            ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                        title={thread.is_locked ? 'Unlock thread' : 'Lock thread'}
                      >
                        {actionLoading === `lock-${thread.id}` ? '...' : thread.is_locked ? '🔓 Unlock' : '🔒 Lock'}
                      </button>

                      <button
                        onClick={() => handleDeleteThread(thread.id, thread.title)}
                        disabled={actionLoading === `delete-${thread.id}`}
                        className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        title="Delete thread"
                      >
                        {actionLoading === `delete-${thread.id}` ? '...' : '🗑️ Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
