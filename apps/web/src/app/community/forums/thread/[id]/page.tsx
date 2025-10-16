"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  Eye,
  Pin,
  Lock,
  Edit,
  Trash2,
} from "lucide-react";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState(false);
  const [editThreadTitle, setEditThreadTitle] = useState("");

  useEffect(() => {
    // Get current user ID from token or API
    const fetchCurrentUser = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) return;
        
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        if (response.ok) {
          const user = await response.json();
          setCurrentUserId(user.id);
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
      }
    };
    
    fetchCurrentUser();
  }, []);

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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
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
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-dark-50 rounded w-1/2"></div>
          <div className="h-32 bg-dark-50 rounded"></div>
          <div className="h-32 bg-dark-50 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4">
          <p className="font-bold">Error</p>
          <p>{error || "Thread not found"}</p>
        </div>
        <Link
          href="/community/forums"
          className="text-electric-blue-400 hover:text-electric-blue-300 flex items-center gap-2"
        >
          <span className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Forums
          </span>
        </Link>
      </div>
    );
  }

  const allPosts = thread.first_post ? [thread.first_post, ...posts] : posts;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <ol className="flex items-center gap-2 text-gray-400">
            <li>
              <Link href="/community" className="hover:text-electric-blue-400 transition-colors">
                Community
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link href="/community/forums" className="hover:text-electric-blue-400 transition-colors">
                Forums
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-100 font-medium truncate max-w-md">{thread.title}</li>
          </ol>
        </nav>

        {/* Thread Header */}
        <div className="mb-6 bg-gradient-to-r from-electric-blue-600 to-neon-pink-600 rounded-xl p-8 shadow-xl shadow-electric-blue-500/20">
          {editingThread ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editThreadTitle}
                onChange={(e) => setEditThreadTitle(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 text-white placeholder-white/50 rounded-lg focus:ring-2 focus:ring-white/50 focus:border-transparent text-2xl font-bold"
                placeholder="Thread title..."
                maxLength={200}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditThread}
                  disabled={submitting}
                  className="bg-white text-electric-blue-600 px-6 py-2 rounded-lg hover:bg-gray-100 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
                  {thread.is_pinned && <Pin className="w-6 h-6 text-white/90 flex-shrink-0" />}
                  {thread.is_locked && <Lock className="w-6 h-6 text-white/70 flex-shrink-0" />}
                  <h1 className="text-4xl font-bold text-white">{thread.title}</h1>
                </div>
                
                {/* Edit/Delete Thread Buttons */}
                {currentUserId && thread.author_id === currentUserId && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={startEditThread}
                      className="text-white hover:bg-white/10 p-2.5 rounded-lg transition-all"
                      title="Edit thread title"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleDeleteThread}
                      className="text-white hover:bg-white/10 p-2.5 rounded-lg transition-all"
                      title="Delete thread"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6 text-white/80">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  <span className="font-medium">{thread.post_count} post{thread.post_count !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
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
            className="bg-dark-50 border border-electric-blue-500/20 rounded-xl shadow-md hover:border-electric-blue-500/30 transition-all overflow-hidden"
          >
            <div className="flex">
              {/* Author sidebar */}
              <div className="bg-gradient-to-b from-dark-100 to-dark-50 p-5 w-52 border-r border-electric-blue-500/20">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-electric-blue-600 to-neon-pink-600 shadow-xl shadow-electric-blue-500/30 flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-white ring-4 ring-dark-50">
                    {(post.author.display_name || post.author.username)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="font-bold text-gray-100 mb-1">
                    {post.author.display_name || post.author.username}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    @{post.author.username}
                  </div>
                  {index === 0 && (
                    <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 bg-neon-pink-500/20 border border-neon-pink-500/50 rounded text-xs text-neon-pink-400 font-semibold">
                      <Pin className="w-3 h-3" />
                      Original Poster
                    </div>
                  )}
                </div>
              </div>

              {/* Post content */}
              <div className="flex-1 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-400">
                    <span className="font-medium">{formatDate(post.created_at)}</span>
                    {post.is_edited && post.edited_at && (
                      <span className="ml-2 text-xs italic text-gray-500">
                        • edited {formatDate(post.edited_at)}
                      </span>
                    )}
                  </div>
                  {/* Edit/Delete Buttons */}
                  {currentUserId && post.author_id === currentUserId && (
                    <div className="flex items-center gap-1">
                      {editingPostId !== post.id && (
                        <>
                          <button
                            onClick={() => startEdit(post)}
                            className="text-electric-blue-400 hover:text-electric-blue-300 hover:bg-electric-blue-500/10 p-2 rounded-lg transition-all"
                            title="Edit post"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {index !== 0 && ( // Don't show delete for first post
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition-colors"
                              title="Delete post"
                            >
                              <Trash2 className="w-4 h-4" />
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
                      className="w-full px-4 py-3 bg-dark border border-electric-blue-500/20 text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent resize-none"
                      rows={6}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditPost(post.id)}
                        disabled={submitting}
                        className="bg-gradient-primary text-white px-4 py-2 rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={submitting}
                        className="bg-dark-50 border border-electric-blue-500/20 text-gray-300 px-4 py-2 rounded-lg hover:border-electric-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none prose-invert">
                    <p className="text-gray-200 whitespace-pre-wrap">
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
            className="bg-dark-50 border border-electric-blue-500/20 text-gray-300 px-6 py-2 rounded-lg hover:border-electric-blue-500/40 hover:shadow-lg hover:shadow-electric-blue-500/20 transition-all"
          >
            Load More Posts
          </button>
        </div>
      )}

      {/* Reply Form */}
      {!thread.is_locked && (
        <div className="bg-gradient-to-br from-dark-50 to-dark-100 border border-electric-blue-500/30 rounded-xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-100 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-electric-blue-400" />
            Post a Reply
          </h3>
          <form onSubmit={handleSubmitReply}>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full px-4 py-3 bg-dark border border-electric-blue-500/20 text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent resize-none hover:border-electric-blue-500/40 transition-colors"
              rows={6}
              required
            />
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-400">
                Be respectful and constructive in your replies
              </p>
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="bg-gradient-to-r from-electric-blue-600 to-neon-pink-600 text-white px-8 py-3 rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Posting..." : "Post Reply"}
              </button>
            </div>
          </form>
        </div>
      )}

      {thread.is_locked && (
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-lg p-6 text-center">
          <Lock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-400">
            This thread is locked. No more replies can be posted.
          </p>
        </div>
      )}
    </div>
  );
}
