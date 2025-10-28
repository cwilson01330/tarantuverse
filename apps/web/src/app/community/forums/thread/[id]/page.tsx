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

interface ForumPost {
  id: number;
  thread_id: number;
  author_id: string;
  author: ThreadAuthor;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
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
  first_post: ForumPost | null;
}

interface PostListResponse {
  posts: ForumPost[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params?.id as string;
  const { user, token } = useAuth();

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [page, setPage] = useState(2); // Start at 2 since first post is in thread
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editingThread, setEditingThread] = useState(false);
  const [editThreadTitle, setEditThreadTitle] = useState("");

  useEffect(() => {
    if (threadId) {
      fetchThread();
      fetchPosts();
    }
  }, [threadId]);

  const fetchThread = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch thread");
      }

      const data: ForumThread = await response.json();
      setThread(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async (pageNum: number = 2) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}/posts?page=${pageNum}&limit=20`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch posts");
      }

      const data: PostListResponse = await response.json();
      if (pageNum === 2) {
        setPosts(data.posts);
      } else {
        setPosts((prev) => [...prev, ...data.posts]);
      }
      setHasMore(data.has_more);
      setPage(pageNum);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}/posts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: replyContent }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to post reply");
      }

      const newPost: ForumPost = await response.json();
      setPosts((prev) => [...prev, newPost]);
      setReplyContent("");
      
      // Refresh thread to update post count
      fetchThread();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPost = async (postId: number) => {
    if (!editContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/posts/${postId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: editContent }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update post");
      }

      const updatedPost: ForumPost = await response.json();
      
      // Update post in state
      if (thread?.first_post?.id === postId) {
        setThread({
          ...thread,
          first_post: updatedPost,
        });
      } else {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? updatedPost : p))
        );
      }
      
      setEditingPostId(null);
      setEditContent("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/posts/${postId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete post");
      }

      // Remove post from state
      if (thread?.first_post?.id === postId) {
        // Can't delete first post - should delete thread instead
        alert("Cannot delete the first post. Delete the thread instead.");
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      }
      
      // Refresh thread to update post count
      fetchThread();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete post");
    }
  };

  const startEdit = (post: ForumPost) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
  };

  const cancelEdit = () => {
    setEditingPostId(null);
    setEditContent("");
  };

  const startEditThread = () => {
    if (thread) {
      setEditingThread(true);
      setEditThreadTitle(thread.title);
    }
  };

  const cancelEditThread = () => {
    setEditingThread(false);
    setEditThreadTitle("");
  };

  const handleEditThread = async () => {
    if (!editThreadTitle.trim()) {
      alert("Thread title cannot be empty");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: editThreadTitle }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update thread");
      }

      const updatedThread = await response.json();
      setThread(updatedThread);
      setEditingThread(false);
      setEditThreadTitle("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update thread");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!confirm("Are you sure you want to delete this entire thread? This will delete all posts and cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads/${threadId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete thread");
      }

      // Redirect to forums page
      router.push("/community/forums");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete thread");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !thread) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 text-red-300 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            <p className="font-bold">Error</p>
            <p>{error || "Thread not found"}</p>
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

  const allPosts = thread.first_post ? [thread.first_post, ...posts] : posts;

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <ol className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
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
            <li className="text-gray-900 dark:text-white font-medium truncate max-w-md">{thread.title}</li>
          </ol>
        </nav>

        {/* Thread Header */}
        <div className="mb-6 bg-primary-600 dark:bg-primary-700 rounded-xl p-8 shadow-xl">
          {editingThread ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editThreadTitle}
                onChange={(e) => setEditThreadTitle(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-2xl font-bold"
                placeholder="Thread title..."
                maxLength={200}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditThread}
                  disabled={submitting}
                  className="bg-white text-primary-600 px-6 py-2 rounded-lg hover:bg-gray-100 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={cancelEditThread}
                  disabled={submitting}
                  className="bg-white/10 border border-white/20 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  {thread.is_pinned && <span>📌</span>}
                  {thread.is_locked && <span>🔒</span>}
                  <h1 className="text-4xl font-bold text-white">{thread.title}</h1>
                </div>

                {/* Edit/Delete Thread Buttons */}
                {user?.id && thread.author_id === user?.id && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={startEditThread}
                      className="text-white hover:bg-white/10 p-2.5 rounded-lg transition-all"
                      title="Edit thread title"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={handleDeleteThread}
                      className="text-white hover:bg-white/10 p-2.5 rounded-lg transition-all"
                      title="Delete thread"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6 text-white/90">
                <div className="flex items-center gap-2">
                  <span>💬</span>
                  <span className="font-medium">{thread.post_count} post{thread.post_count !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>👁️</span>
                  <span className="font-medium">{thread.view_count} view{thread.view_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3 mb-8">
        {allPosts.map((post, index) => (
          <div
            key={post.id}
            className="bg-surface border border-theme rounded-xl shadow-md hover:border-primary-600 dark:hover:border-primary-400 transition-all overflow-hidden"
          >
            <div className="flex">
              {/* Author sidebar */}
              <div className="bg-surface-elevated p-5 w-52 border-r border-theme">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-xl flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-white ring-4 ring-surface">
                    {(post.author.display_name || post.author.username)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white mb-1">
                    {post.author.display_name || post.author.username}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    @{post.author.username}
                  </div>
                  {index === 0 && (
                    <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-500/50 rounded text-xs text-primary-700 dark:text-primary-400 font-semibold">
                      <span>📌</span>
                      <span>Original Poster</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Post content */}
              <div className="flex-1 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">{formatDate(post.created_at)}</span>
                    {post.is_edited && post.edited_at && (
                      <span className="ml-2 text-xs italic text-gray-500 dark:text-gray-500">
                        • edited {formatDate(post.edited_at)}
                      </span>
                    )}
                  </div>
                  {/* Edit/Delete Buttons */}
                  {user?.id && post.author_id === user?.id && (
                    <div className="flex items-center gap-1">
                      {editingPostId !== post.id && (
                        <>
                          <button
                            onClick={() => startEdit(post)}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 p-2 rounded-lg transition-all"
                            title="Edit post"
                          >
                            ✏️
                          </button>
                          {index !== 0 && ( // Don't show delete for first post
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Delete post"
                            >
                              🗑️
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Mode */}
                {editingPostId === post.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      rows={6}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditPost(post.id)}
                        disabled={submitting}
                        className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={submitting}
                        className="bg-surface-elevated border border-theme text-theme-primary px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none dark:prose-invert">
                    <p className="text-gray-900 dark:text-gray-200 whitespace-pre-wrap">
                      {post.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load More Posts */}
      {hasMore && (
        <div className="text-center mb-8">
          <button
            onClick={() => fetchPosts(page + 1)}
            className="bg-surface-elevated border border-theme text-theme-primary px-6 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 hover:shadow-lg transition-all"
          >
            Load More Posts
          </button>
        </div>
      )}

      {/* Reply Form */}
      {!thread.is_locked && (
        <div className="bg-surface border border-theme rounded-xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span>💬</span>
            <span>Post a Reply</span>
          </h3>
          <form onSubmit={handleSubmitReply}>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
              rows={6}
              required
            />
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Be respectful and constructive in your replies
              </p>
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg hover:shadow-lg transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Posting..." : "Post Reply"}
              </button>
            </div>
          </form>
        </div>
      )}

      {thread.is_locked && (
        <div className="bg-surface border border-theme rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <p className="text-gray-600 dark:text-gray-400">
            This thread is locked. No more replies can be posted.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
