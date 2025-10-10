"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Clock, Pin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  thread_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export default function ForumsPage() {
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }

      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8 bg-gradient-primary rounded-lg p-8 shadow-lg shadow-electric-blue-500/20 animate-pulse">
          <Skeleton height="h-8" width="w-1/3" className="mb-2 bg-white/30" />
          <Skeleton height="h-4" width="w-2/3" className="bg-white/20" />
        </div>

        {/* Category skeletons */}
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-surface p-6 rounded-lg border border-theme">
              <div className="flex items-start gap-4">
                <Skeleton width="w-12 h-12" rounded="lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton width="w-1/4" height="h-6" />
                  <Skeleton width="w-3/4" height="h-4" />
                  <div className="flex gap-4 pt-2">
                    <Skeleton width="w-20" height="h-5" />
                    <Skeleton width="w-20" height="h-5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 bg-gradient-primary rounded-lg p-8 shadow-lg shadow-electric-blue-500/20">
        <h1 className="text-3xl font-bold text-white mb-2">Community Forums</h1>
        <p className="text-white/80">
          Connect with fellow tarantula keepers, share experiences, and learn from the community
        </p>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md p-8 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-100 mb-2">No Categories Yet</h3>
          <p className="text-gray-400">Forum categories will appear here once created.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/community/forums/${category.slug}`}
              className="block bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md hover:shadow-lg hover:shadow-electric-blue-500/20 hover:border-electric-blue-500/40 transition-all"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {category.icon && (
                        <span className="text-2xl">{category.icon}</span>
                      )}
                      <h2 className="text-xl font-semibold text-gray-100">
                        {category.name}
                      </h2>
                    </div>
                    {category.description && (
                      <p className="text-gray-300 mb-3">{category.description}</p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 ml-6 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-electric-blue-400" />
                      <div className="text-center">
                        <div className="font-semibold text-gray-100">
                          {category.thread_count}
                        </div>
                        <div>Threads</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-neon-pink-400" />
                      <div className="text-center">
                        <div className="font-semibold text-gray-100">
                          {category.post_count}
                        </div>
                        <div>Posts</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-lg p-6">
        <h3 className="font-semibold text-electric-blue-300 mb-2">Forum Guidelines</h3>
        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
          <li>Be respectful and courteous to all members</li>
          <li>Stay on topic within each category</li>
          <li>Search before posting to avoid duplicates</li>
          <li>Share your knowledge and help others</li>
          <li>Report any inappropriate content to moderators</li>
        </ul>
      </div>
    </div>
  );
}
