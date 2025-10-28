"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
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
  const { user } = useAuth();
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
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="container mx-auto px-4 py-8">
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
          <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
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
            <li className="text-gray-900 dark:text-gray-100 font-medium">Forums</li>
          </ol>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Community Forums</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Connect with fellow tarantula keepers, share experiences, and learn from the community
          </p>
        </div>

        {/* Guidelines Box */}
        <div className="mb-6 bg-surface-elevated border border-theme rounded-lg p-5">
          <div className="flex items-start gap-3">
            <span className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0">💬</span>
            <div>
              <h3 className="font-semibold text-primary-600 dark:text-primary-400 mb-2">Forum Guidelines</h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                Be respectful, share knowledge, and help fellow keepers. Search before posting duplicate questions.
              </p>
            </div>
          </div>
        </div>

        {/* Categories List */}
        {categories.length === 0 ? (
          <div className="bg-surface border border-theme rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Categories Yet</h3>
            <p className="text-gray-600 dark:text-gray-400">Forum categories will appear here once created.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/community/forums/${category.slug}`}
                className="group block bg-surface border border-theme rounded-xl shadow-md hover:shadow-xl hover:border-primary-600 dark:hover:border-primary-400 hover:scale-[1.01] transition-all duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {category.icon && (
                          <span className="text-3xl">{category.icon}</span>
                        )}
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                          {category.name}
                        </h2>
                      </div>
                      {category.description && (
                        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{category.description}</p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex gap-8 text-sm">
                      <div className="flex items-center gap-2 text-center">
                        <span className="text-primary-600 dark:text-primary-400">💬</span>
                        <div>
                          <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                            {category.thread_count}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">Thread{category.thread_count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-center">
                        <span className="text-primary-600 dark:text-primary-400">👥</span>
                        <div>
                          <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                            {category.post_count}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">Post{category.post_count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
