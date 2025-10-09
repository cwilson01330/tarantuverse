"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Clock, Pin } from "lucide-react";

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
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Community Forums</h1>
        <p className="text-gray-600">
          Connect with fellow tarantula keepers, share experiences, and learn from the community
        </p>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Categories Yet</h3>
          <p className="text-gray-500">Forum categories will appear here once created.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/community/forums/${category.slug}`}
              className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {category.icon && (
                        <span className="text-2xl">{category.icon}</span>
                      )}
                      <h2 className="text-xl font-semibold text-gray-900">
                        {category.name}
                      </h2>
                    </div>
                    {category.description && (
                      <p className="text-gray-600 mb-3">{category.description}</p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-6 ml-6 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      <div className="text-center">
                        <div className="font-semibold text-gray-900">
                          {category.thread_count}
                        </div>
                        <div>Threads</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <div className="text-center">
                        <div className="font-semibold text-gray-900">
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
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Forum Guidelines</h3>
        <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
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
