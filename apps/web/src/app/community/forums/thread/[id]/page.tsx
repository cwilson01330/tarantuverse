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
          <ArrowLeft className="w-4 h-4" />
          Back to Forums
        </Link>
      </div>
    );
  }

  const allPosts = thread.first_post ? [thread.first_post, ...posts] : posts;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/community/forums"
          className="text-electric-blue-400 hover:text-electric-blue-300 flex items-center gap-2 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Forums
        </Link>
        <div className="flex items-center gap-3 mb-2">
          {thread.is_pinned && <Pin className="w-5 h-5 text-neon-pink-400" />}
          {thread.is_locked && <Lock className="w-5 h-5 text-gray-500" />}
          <h1 className="text-3xl font-bold text-gray-100">{thread.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4 text-electric-blue-400" />
            <span>{thread.post_count} posts</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="w-4 h-4 text-neon-pink-400" />
            <span>{thread.view_count} views</span>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4 mb-8">
        {allPosts.map((post, index) => (
          <div
            key={post.id}
            className="bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md overflow-hidden"
          >
            <div className="flex">
              {/* Author sidebar */}
              <div className="bg-dark-500/50 p-4 w-48 border-r border-electric-blue-500/20">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-primary shadow-lg shadow-electric-blue-500/30 flex items-center justify-center mx-auto mb-2 text-2xl font-bold text-white">
                    {(post.author.display_name || post.author.username)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="font-semibold text-gray-100">
                    {post.author.display_name || post.author.username}
                  </div>
                  <div className="text-xs text-gray-400">
                    @{post.author.username}
                  </div>
                  {index === 0 && (
                    <div className="mt-2 text-xs text-neon-pink-400 font-semibold">
                      Thread Author
                    </div>
                  )}
                </div>
              </div>

              {/* Post content */}
              <div className="flex-1 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-gray-400">
                    {formatDate(post.created_at)}
                    {post.is_edited && post.edited_at && (
                      <span className="ml-2 text-xs italic">
                        (edited {formatDate(post.edited_at)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="prose max-w-none prose-invert">
                  <p className="text-gray-200 whitespace-pre-wrap">
                    {post.content}
                  </p>
                </div>
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
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">
            Post a Reply
          </h3>
          <form onSubmit={handleSubmitReply}>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write your reply..."
              className="w-full px-4 py-3 bg-dark border border-electric-blue-500/20 text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent resize-none"
              rows={6}
              required
            />
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="bg-gradient-primary text-white px-6 py-2 rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
