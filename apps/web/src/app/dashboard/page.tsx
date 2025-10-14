'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ActivityFeed from '@/components/ActivityFeed'
import { SkeletonCard } from '@/components/ui/skeleton'

interface User {
  id: string
  email: string
  username: string
  display_name: string
}

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  photo_url?: string
}

interface FeedingStatus {
  tarantula_id: string
  days_since_last_feeding?: number
  acceptance_rate: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // Helper function to handle both R2 (absolute) and local (relative) URLs
  const getImageUrl = (url?: string) => {
    if (!url) return ''
    // If URL starts with http, it's already absolute (R2)
    if (url.startsWith('http')) {
      return url
    }
    // Otherwise, it's a local path - prepend the API base URL
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_URL}${url}`
  }

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/login')
      return
    }

    setUser(JSON.parse(userData))
    fetchTarantulas(token)
  }, [router])

  const fetchTarantulas = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setTarantulas(data)
        
        // Fetch feeding stats for each tarantula
        fetchAllFeedingStatuses(token, data)
      }
    } catch (error) {
      console.error('Failed to fetch tarantulas:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllFeedingStatuses = async (token: string, tarantulasList: Tarantula[]) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const statusMap = new Map<string, FeedingStatus>()
    
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await fetch(`${API_URL}/api/v1/tarantulas/${t.id}/feeding-stats`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          })
          if (response.ok) {
            const data = await response.json()
            statusMap.set(t.id, {
              tarantula_id: t.id,
              days_since_last_feeding: data.days_since_last_feeding,
              acceptance_rate: data.acceptance_rate,
            })
          }
        } catch (error) {
          console.error(`Failed to fetch feeding stats for ${t.id}:`, error)
        }
      })
    )
    
    setFeedingStatuses(statusMap)
  }

  const getFeedingStatusBadge = (tarantulaId: string) => {
    const status = feedingStatuses.get(tarantulaId)
    if (!status || status.days_since_last_feeding === undefined) return null

    const days = status.days_since_last_feeding
    let bgColor = 'bg-green-500/90'
    let textColor = 'text-white'
    let emoji = '✓'
    
    if (days >= 21) {
      bgColor = 'bg-red-500/90'
      emoji = '⚠️'
    } else if (days >= 14) {
      bgColor = 'bg-orange-500/90'
      emoji = '⏰'
    } else if (days >= 7) {
      bgColor = 'bg-yellow-500/90'
      emoji = '📅'
    }

    return (
      <span className={`px-3 py-1 rounded-full ${bgColor} backdrop-blur-sm ${textColor} text-xs font-semibold shadow-lg`}>
        {emoji} Fed {days}d ago
      </span>
    )
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    router.push('/')
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-theme">
        {/* Header skeleton */}
        <div className="bg-gradient-brand shadow-lg shadow-gradient-brand">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="animate-pulse">
              <div className="h-8 w-48 bg-white/30 rounded mb-2"></div>
              <div className="h-4 w-32 bg-white/20 rounded"></div>
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface p-6 rounded-lg border border-theme animate-pulse">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>

          {/* Collection skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const filteredTarantulas = searchQuery
    ? tarantulas.filter(t =>
        t.common_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.scientific_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tarantulas

  return (
    <div className="min-h-screen bg-theme">
      {/* Header with gradient */}
      <div className="bg-gradient-brand shadow-lg shadow-gradient-brand">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Welcome back, {user.display_name || user.username}! 🕷️</h1>
              <p className="text-white/90 mt-1">Manage your tarantula collection</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/species')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                🕷️ Species
              </button>
              <button
                onClick={() => router.push('/dashboard/analytics')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                📊 Analytics
              </button>
              <button
                onClick={() => router.push('/community')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                🌐 Community
              </button>
              <button
                onClick={() => router.push('/community/forums')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                💬 Forums
              </button>
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                ⚙️ Settings
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium text-white border border-white/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                🕷️
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">My Collection</p>
                <p className="text-3xl font-bold text-primary">{tarantulas.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                🍴
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Recent Feedings</p>
                <p className="text-3xl font-bold text-gradient-brand">0</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-6 hover:shadow-xl transition-all">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center text-2xl shadow-lg shadow-gradient-brand">
                📊
              </div>
              <div>
                <p className="text-sm text-theme-secondary font-medium">Upcoming Molts</p>
                <p className="text-3xl font-bold text-gradient-brand">0</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout for collection and activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content - Collection */}
          <div className="lg:col-span-2">
            {/* Search Bar */}
            {tarantulas.length > 0 && (
              <div className="mb-6">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your collection..."
                    className="w-full px-6 py-4 pl-12 bg-surface rounded-2xl shadow-lg border border-theme focus:outline-none focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent text-theme-primary placeholder-theme-tertiary"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-tertiary text-xl">
                    🔍
                  </div>
                </div>
              </div>
            )}

        {/* Collection Grid */}
        {tarantulas.length === 0 ? (
          <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
            <div className="text-6xl mb-4">🕷️</div>
            <h2 className="text-2xl font-bold mb-3 text-theme-primary">Your Collection is Empty</h2>
            <p className="text-theme-secondary mb-8 max-w-md mx-auto">
              Start tracking your tarantulas by adding your first one! Keep detailed records of feedings, molts, and husbandry.
            </p>
            <button
              onClick={() => router.push('/dashboard/tarantulas/add')}
              className="px-8 py-4 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
            >
              ➕ Add First Tarantula
            </button>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-theme-primary">
                {searchQuery ? `Search Results (${filteredTarantulas.length})` : 'My Collection'}
              </h2>
              <button
                onClick={() => router.push('/dashboard/tarantulas/add')}
                className="px-6 py-3 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition-all duration-200 font-semibold shadow-lg shadow-gradient-brand hover:shadow-2xl"
              >
                ➕ Add Tarantula
              </button>
            </div>

            {filteredTarantulas.length === 0 ? (
              <div className="bg-surface rounded-2xl shadow-lg border border-theme p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-theme-secondary">No tarantulas match your search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTarantulas.map((tarantula) => (
                  <div
                    key={tarantula.id}
                    onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                    className="group relative overflow-hidden rounded-2xl bg-surface shadow-lg hover:shadow-lg transition-all duration-300 cursor-pointer border border-theme hover:border-electric-blue-500/40"
                  >
                    {/* Image with gradient overlay */}
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30">
                      {tarantula.photo_url ? (
                        <>
                          <img
                            src={getImageUrl(tarantula.photo_url)}
                            alt={tarantula.common_name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-7xl bg-gradient-to-br from-electric-blue-900/50 to-neon-pink-900/50">
                          🕷️
                        </div>
                      )}

                      {/* Feeding status badge */}
                      <div className="absolute top-3 right-3">
                        {getFeedingStatusBadge(tarantula.id) || (
                          <span className="px-3 py-1 rounded-full bg-surface-elevated backdrop-blur-sm text-theme-secondary text-xs font-semibold shadow-lg border border-theme">
                            No data
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="font-bold text-lg text-theme-primary mb-1 line-clamp-1">
                        {tarantula.common_name}
                      </h3>
                      <p className="text-sm italic text-theme-secondary mb-3 line-clamp-1">
                        {tarantula.scientific_name}
                      </p>

                      {/* Quick stats */}
                      <div className="flex flex-wrap gap-2">
                        {tarantula.sex && (
                          <span className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-500/30">
                            {tarantula.sex === 'male' ? '♂️' : tarantula.sex === 'female' ? '♀️' : '⚧'} {tarantula.sex}
                          </span>
                        )}
                        {tarantula.date_acquired && (
                          <span className="px-3 py-1 rounded-lg bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 text-xs font-semibold border border-pink-200 dark:border-pink-500/30">
                            📅 {new Date(tarantula.date_acquired).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-electric-blue-600/0 to-neon-pink-600/0 group-hover:from-electric-blue-600/10 group-hover:to-neon-pink-600/5 transition-all duration-300 pointer-events-none" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
          </div>

          {/* Sidebar - Activity Feed */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h2 className="text-2xl font-bold text-theme-primary mb-4">Recent Activity</h2>
              <ActivityFeed feedType="personalized" showFilters={false} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button (Mobile-friendly) */}
      {tarantulas.length > 0 && (
        <button
          onClick={() => router.push('/dashboard/tarantulas/add')}
          className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-brand text-white shadow-2xl shadow-gradient-brand hover:scale-110 hover:shadow-2xl transition-all duration-200 flex items-center justify-center text-2xl sm:text-3xl z-50"
          aria-label="Add tarantula"
        >
          ➕
        </button>
      )}
    </div>
  )
}

