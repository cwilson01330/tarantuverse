'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { SkeletonList } from '@/components/ui/skeleton'

interface DiscoverResponse {
  stats: {
    total_keepers: number
    total_tarantulas: number
    total_species: number
    total_forum_threads: number
  }
  trending_threads: Array<{
    id: number
    title: string
    category: string
    reply_count: number
    author_username: string
    created_at: string
  }>
  active_keepers: Array<{
    id: string
    username: string
    display_name?: string
    avatar_url?: string
    activity_count: number
  }>
  popular_species: Array<{
    id: string
    scientific_name: string
    common_names?: string[]
    image_url?: string
    times_kept: number
    care_level?: string
  }>
  recent_activity: Array<{
    id: number
    user_username: string
    activity_type: string
    data?: any
    created_at: string
  }>
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getActivityEmoji(actionType: string): string {
  switch (actionType) {
    case 'new_tarantula':
      return '🕷️'
    case 'feeding':
      return '🍗'
    case 'molt':
      return '🔄'
    case 'forum_thread':
      return '💬'
    case 'forum_post':
      return '💭'
    case 'follow':
      return '👥'
    default:
      return '📝'
  }
}

function getActivityLabel(actionType: string): string {
  switch (actionType) {
    case 'new_tarantula':
      return 'added a tarantula'
    case 'feeding':
      return 'logged a feeding'
    case 'molt':
      return 'logged a molt'
    case 'forum_thread':
      return 'started a discussion'
    case 'forum_post':
      return 'replied in a discussion'
    case 'follow':
      return 'followed someone'
    default:
      return 'did something'
  }
}

function getCareLeveColor(level?: string): string {
  switch (level) {
    case 'beginner':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'intermediate':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    case 'advanced':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }
}

export default function DiscoverPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDiscoverFeed()
  }, [])

  const fetchDiscoverFeed = async () => {
    try {
      setLoading(true)
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/discover/`)

      if (!response.ok) {
        throw new Error('Failed to fetch discover feed')
      }

      const data = await response.json()
      setDiscover(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <SkeletonList count={8} />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
            ✨ Discover
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Explore trending content, active keepers, and popular species from the community
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500/50 text-red-700 dark:text-red-300 rounded-xl">
            {error}
          </div>
        )}

        {discover && (
          <>
            {/* Platform Stats Banner */}
            <div className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl p-6 border border-purple-200 dark:border-purple-700/50">
                <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                  {discover.stats.total_keepers}
                </div>
                <div className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  Active Keepers
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-2xl p-6 border border-blue-200 dark:border-blue-700/50">
                <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                  {discover.stats.total_tarantulas}
                </div>
                <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                  Tarantulas Tracked
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-2xl p-6 border border-green-200 dark:border-green-700/50">
                <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                  {discover.stats.total_species}
                </div>
                <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Species in Database
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-2xl p-6 border border-orange-200 dark:border-orange-700/50">
                <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">
                  {discover.stats.total_forum_threads}
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                  Discussions
                </div>
              </div>
            </div>

            {/* Trending Discussions Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span>🔥</span> Trending Discussions
              </h2>
              <div className="space-y-3">
                {discover.trending_threads.length > 0 ? (
                  discover.trending_threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => router.push(`/community/forums/thread/${thread.id}`)}
                      className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg dark:hover:shadow-lg hover:border-primary-600 dark:hover:border-primary-400 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate hover:text-primary-600 dark:hover:text-primary-400 transition">
                            {thread.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-medium">
                              {thread.category}
                            </span>
                            <span>by @{thread.author_username}</span>
                            <span>{formatDate(thread.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                            {thread.reply_count}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            replies
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No trending discussions yet
                  </div>
                )}
              </div>
            </section>

            {/* Active Keepers Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span>👥</span> Active Keepers
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {discover.active_keepers.length > 0 ? (
                  discover.active_keepers.map((keeper) => (
                    <button
                      key={keeper.id}
                      onClick={() => router.push(`/community/${keeper.username}`)}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg dark:hover:shadow-lg hover:border-primary-600 dark:hover:border-primary-400 transition-all duration-200 text-left group"
                    >
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl flex-shrink-0 mb-3 group-hover:scale-110 transition-transform">
                          {keeper.avatar_url ? (
                            <img
                              src={keeper.avatar_url}
                              alt={keeper.display_name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            '🕷️'
                          )}
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-center truncate w-full group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">
                          {keeper.display_name || keeper.username}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          @{keeper.username}
                        </p>
                        <div className="mt-3 text-center">
                          <div className="text-lg font-bold text-primary-600 dark:text-primary-400">
                            {keeper.activity_count}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            activities
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                    No active keepers yet
                  </div>
                )}
              </div>
            </section>

            {/* Popular Species Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span>⭐</span> Popular Species
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {discover.popular_species.length > 0 ? (
                  discover.popular_species.map((species) => (
                    <button
                      key={species.id}
                      onClick={() => router.push(`/species/${species.id}`)}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg dark:hover:shadow-lg hover:border-primary-600 dark:hover:border-primary-400 transition-all duration-200 group text-left"
                    >
                      <div className="aspect-square bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform overflow-hidden">
                        {species.image_url ? (
                          <img
                            src={species.image_url}
                            alt={species.scientific_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          '🕷️'
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">
                          {species.scientific_name}
                        </h3>
                        {species.common_names && species.common_names.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {species.common_names[0]}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {species.care_level && (
                            <span className={`text-xs font-medium px-2 py-1 rounded ${getCareLeveColor(species.care_level)}`}>
                              {species.care_level.charAt(0).toUpperCase() + species.care_level.slice(1)}
                            </span>
                          )}
                          <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                            {species.times_kept}x kept
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                    No popular species yet
                  </div>
                )}
              </div>
            </section>

            {/* Recent Activity Section */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <span>📊</span> Recent Activity
              </h2>
              <div className="space-y-3">
                {discover.recent_activity.length > 0 ? (
                  discover.recent_activity.map((activity) => (
                    <div
                      key={activity.id}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg dark:hover:shadow-lg transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getActivityEmoji(activity.activity_type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 dark:text-white">
                            <button
                              onClick={() => router.push(`/community/${activity.user_username}`)}
                              className="font-semibold hover:text-primary-600 dark:hover:text-primary-400 transition"
                            >
                              @{activity.user_username}
                            </button>
                            <span className="text-gray-600 dark:text-gray-400">
                              {' '}
                              {getActivityLabel(activity.activity_type)}
                            </span>
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {formatDate(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No recent activity yet
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
