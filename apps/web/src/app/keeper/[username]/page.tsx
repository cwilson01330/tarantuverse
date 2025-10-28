'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

interface Keeper {
  id: number
  username: string
  display_name: string
  avatar_url?: string
  profile_bio?: string
  profile_location?: string
  profile_experience_level?: string
  profile_years_keeping?: number
  profile_specialties?: string[]
  social_links?: {
    instagram?: string
    youtube?: string
    website?: string
  }
}

interface Tarantula {
  id: number
  common_name: string
  scientific_name: string
  photo_url?: string
  sex?: string
  date_acquired?: string
}

interface KeeperStats {
  username: string
  total_public: number
  unique_species: number
  males: number
  females: number
  unsexed: number
}

interface FollowStats {
  followers_count: number
  following_count: number
}

export default function KeeperProfilePage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const [keeper, setKeeper] = useState<Keeper | null>(null)
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [stats, setStats] = useState<KeeperStats | null>(null)
  const [followStats, setFollowStats] = useState<FollowStats | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const username = params?.username as string

  useEffect(() => {
    if (!username) return
    fetchKeeperData()
    if (token) {
      checkFollowingStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, token])

  const checkFollowingStatus = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/follows/${username}/is-following`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setIsFollowing(data.is_following)
      }
    } catch (error) {
      // Silent fail - follow status will default to false
    }
  }

  const fetchKeeperData = async () => {
    try {
      setLoading(true)
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      
      // Fetch keeper profile
      const profileResponse = await fetch(`${API_URL}/api/v1/keepers/${username}/`)
      if (!profileResponse.ok) {
        if (profileResponse.status === 404) {
          throw new Error('Keeper not found or profile is private')
        }
        throw new Error('Failed to fetch keeper profile')
      }
      const profileData = await profileResponse.json()
      setKeeper(profileData)

      // Fetch collection
      const collectionResponse = await fetch(`${API_URL}/api/v1/keepers/${username}/collection/`)
      if (collectionResponse.ok) {
        const collectionData = await collectionResponse.json()
        setTarantulas(collectionData)
      }

      // Fetch stats
      const statsResponse = await fetch(`${API_URL}/api/v1/keepers/${username}/stats/`)
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }

      // Fetch follow stats
      const followStatsResponse = await fetch(`${API_URL}/api/v1/follows/${username}/stats`)
      if (followStatsResponse.ok) {
        const followStatsData = await followStatsResponse.json()
        setFollowStats(followStatsData)
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleFollowToggle = async () => {
    if (!token) {
      router.push('/login')
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const method = isFollowing ? 'DELETE' : 'POST'
      const response = await fetch(`${API_URL}/api/v1/follows/${username}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        setIsFollowing(!isFollowing)
        // Refresh follow stats
        const followStatsResponse = await fetch(`${API_URL}/api/v1/follows/${username}/stats`)
        if (followStatsResponse.ok) {
          const followStatsData = await followStatsResponse.json()
          setFollowStats(followStatsData)
        }
      }
    } catch (error) {
      console.error('Failed to toggle follow status')
    }
  }

  const getExperienceBadgeColor = (level?: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-800'
      case 'intermediate': return 'bg-blue-100 text-blue-800'
      case 'advanced': return 'bg-purple-100 text-purple-800'
      case 'expert': return 'bg-amber-100 text-amber-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatSpecialty = (specialty: string) => {
    return specialty.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  if (loading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🕷️</div>
            <p className="text-xl text-gray-600 dark:text-gray-400">Loading keeper profile...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !keeper) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Keeper Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {error || 'This keeper does not exist or their profile is private.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push('/community')}
                className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition font-semibold"
              >
                Browse Community
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-3 bg-surface-elevated text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition font-semibold"
              >
                Dashboard
              </button>
            </div>
          </div>
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="bg-primary-600 dark:bg-primary-700 text-white rounded-xl mb-8 shadow-lg">
          <div className="px-6 lg:px-8 py-12">
            <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-6xl flex-shrink-0 shadow-xl">
              {keeper.avatar_url ? (
                <img
                  src={keeper.avatar_url}
                  alt={keeper.display_name}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                '🕷️'
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{keeper.display_name}</h1>
              <p className="text-xl text-primary-100 mb-4">@{keeper.username}</p>

              {keeper.profile_location && (
                <p className="text-primary-100 mb-4 flex items-center gap-2">
                  <span>📍</span> {keeper.profile_location}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {keeper.profile_experience_level && (
                  <span className={`px-4 py-2 rounded-full font-semibold ${getExperienceBadgeColor(keeper.profile_experience_level)}`}>
                    {keeper.profile_experience_level.charAt(0).toUpperCase() + keeper.profile_experience_level.slice(1)}
                  </span>
                )}
                {keeper.profile_years_keeping && keeper.profile_years_keeping > 0 && (
                  <span className="px-4 py-2 rounded-full font-semibold bg-white/90 text-primary-900">
                    {keeper.profile_years_keeping} {keeper.profile_years_keeping === 1 ? 'year' : 'years'} keeping
                  </span>
                )}
              </div>

              {/* Follow Button and Stats */}
              {user && user.username !== username && (
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={handleFollowToggle}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                      isFollowing
                        ? 'bg-white/20 text-white border-2 border-white/40 hover:bg-white/30'
                        : 'bg-white text-primary-700 hover:bg-primary-50'
                    }`}
                  >
                    {isFollowing ? '✓ Following' : '+ Follow'}
                  </button>
                </div>
              )}

              {/* Followers/Following Stats */}
              {followStats && (
                <div className="flex gap-4 mb-4 text-primary-100">
                  <div>
                    <span className="font-bold text-white">{followStats.followers_count}</span> Followers
                  </div>
                  <div>
                    <span className="font-bold text-white">{followStats.following_count}</span> Following
                  </div>
                </div>
              )}

              {/* Social Links */}
              {keeper.social_links && (Object.values(keeper.social_links).some(link => link)) && (
                <div className="flex gap-3">
                  {keeper.social_links.instagram && (
                    <a
                      href={keeper.social_links.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition font-medium"
                    >
                      📷 Instagram
                    </a>
                  )}
                  {keeper.social_links.youtube && (
                    <a
                      href={keeper.social_links.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition font-medium"
                    >
                      🎥 YouTube
                    </a>
                  )}
                  {keeper.social_links.website && (
                    <a
                      href={keeper.social_links.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition font-medium"
                    >
                      🌐 Website
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - About & Stats */}
        <div className="space-y-6">
          {/* About */}
          {keeper.profile_bio && (
            <div className="bg-surface border border-theme rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">About</h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{keeper.profile_bio}</p>
            </div>
          )}

          {/* Specialties */}
          {keeper.profile_specialties && keeper.profile_specialties.length > 0 && (
            <div className="bg-surface border border-theme rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Specialties</h2>
              <div className="flex flex-wrap gap-2">
                {keeper.profile_specialties.map((specialty) => (
                  <span
                    key={specialty}
                    className="px-3 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm font-medium"
                  >
                    {formatSpecialty(specialty)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="bg-primary-600 dark:bg-primary-700 rounded-xl shadow-lg p-6 text-white">
              <h2 className="text-xl font-bold mb-4">Collection Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-primary-100">Public Tarantulas</span>
                  <span className="text-2xl font-bold">{stats.total_public}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-primary-100">Unique Species</span>
                  <span className="text-2xl font-bold">{stats.unique_species}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-white/20">
                  <span className="text-primary-100">♂️ Males</span>
                  <span className="text-lg font-bold">{stats.males}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-primary-100">♀️ Females</span>
                  <span className="text-lg font-bold">{stats.females}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-primary-100">⚧ Unsexed</span>
                  <span className="text-lg font-bold">{stats.unsexed}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Collection */}
        <div className="lg:col-span-2">
          <div className="bg-surface border border-theme rounded-xl shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Public Collection</h2>

            {tarantulas.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <div className="text-5xl mb-3">🕷️</div>
                <p>No public tarantulas yet</p>
              </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {tarantulas.map((tarantula) => (
                    <div
                      key={tarantula.id}
                      className="bg-surface-elevated rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 border border-theme"
                    >
                      {tarantula.photo_url ? (
                        <div className="relative h-48">
                          <img
                            src={tarantula.photo_url}
                            alt={tarantula.common_name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                            <h3 className="font-bold text-lg">{tarantula.common_name}</h3>
                            <p className="text-sm italic opacity-90">{tarantula.scientific_name}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4">
                          <div className="text-4xl mb-2 text-center">🕷️</div>
                          <h3 className="font-bold text-gray-900 dark:text-white">{tarantula.common_name}</h3>
                          <p className="text-sm italic text-gray-600 dark:text-gray-400">{tarantula.scientific_name}</p>
                        </div>
                      )}

                      <div className="p-4">
                        <div className="flex gap-2">
                          {tarantula.sex && (
                            <span className="px-2 py-1 bg-surface rounded text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {tarantula.sex === 'male' ? '♂️ Male' : tarantula.sex === 'female' ? '♀️ Female' : '⚧ Unsexed'}
                            </span>
                          )}
                          {tarantula.date_acquired && (
                            <span className="px-2 py-1 bg-surface rounded text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {new Date(tarantula.date_acquired).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
