'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import apiClient from '@/lib/api'

interface KeeperProfile {
  id: number
  username: string
  display_name: string
  email: string
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
  collection_visibility: string
  created_at: string
}

interface Tarantula {
  id: string
  name: string
  species_name?: string
  sex?: string
  photo_url?: string
  age_months?: number
}

interface Stats {
  username: string
  total_public: number
  unique_species: number
  sex_distribution: {
    male: number
    female: number
    unknown: number
  }
}

interface FollowStats {
  followers_count: number
  following_count: number
}

export default function KeeperProfilePage() {
  const params = useParams()
  const router = useRouter()
  const username = params?.username as string
  
  const [profile, setProfile] = useState<KeeperProfile | null>(null)
  const [collection, setCollection] = useState<Tarantula[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [followStats, setFollowStats] = useState<FollowStats | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'collection' | 'about'>('collection')
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    checkAuth()
    if (username) {
      fetchProfile()
      fetchCollection()
      fetchStats()
      fetchFollowStats()
    }
  }, [username])

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setCurrentUser({ id: payload.sub, username: payload.username })
        // Check if following
        if (username) {
          checkFollowingStatus()
        }
      }
    } catch (error) {
      console.error('Failed to decode token')
    }
  }

  const checkFollowingStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/follows/${username}/is-following`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setIsFollowing(data.is_following)
      }
    } catch (error) {
      console.error('Failed to check following status')
    }
  }

  const fetchFollowStats = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/follows/${username}/stats`)
      if (response.ok) {
        const data = await response.json()
        setFollowStats(data)
      }
    } catch (error) {
      console.error('Failed to load follow stats')
    }
  }

  const handleFollowToggle = async () => {
    const token = localStorage.getItem('auth_token')
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
        fetchFollowStats() // Refresh counts
      }
    } catch (error) {
      console.error('Failed to toggle follow')
    }
  }

  const handleMessage = () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }
    router.push(`/messages/${username}`)
  }

  const fetchProfile = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/`, {
        headers
      })
      if (!response.ok) {
        if (response.status === 404) {
          setError('Keeper not found or profile is private')
        } else {
          throw new Error('Failed to load profile')
        }
        return
      }
      const data = await response.json()
      setProfile(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load profile')
    }
  }

  const fetchCollection = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/collection/`, {
        headers
      })
      if (response.ok) {
        const data = await response.json()
        setCollection(data)
      }
    } catch (err) {
      console.error('Failed to load collection')
    }
  }

  const fetchStats = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/stats/`, {
        headers
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const getExperienceBadge = (level?: string) => {
    const badges = {
      beginner: { label: 'Beginner', color: 'bg-green-100 text-green-800' },
      intermediate: { label: 'Intermediate', color: 'bg-blue-100 text-blue-800' },
      advanced: { label: 'Advanced', color: 'bg-purple-100 text-purple-800' },
      expert: { label: 'Expert', color: 'bg-amber-100 text-amber-800' }
    }
    return badges[level as keyof typeof badges] || { label: level, color: 'bg-gray-100 text-gray-800' }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🕷️</div>
          <p className="text-xl text-gray-600">Loading keeper profile...</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-4">Profile Not Available</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/community"
            className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition"
          >
            ← Back to Community
          </Link>
        </div>
      </div>
    )
  }

  const badge = getExperienceBadge(profile.profile_experience_level)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/community" className="inline-flex items-center text-purple-200 hover:text-white mb-4">
            <span className="mr-2">←</span>
            Back to Community
          </Link>
        </div>
      </div>

      {/* Profile Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 h-32"></div>
          <div className="px-8 pb-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between -mt-16 mb-6">
              <div className="flex items-end gap-6 mb-4 md:mb-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
                    <span className="text-5xl">🕷️</span>
                  </div>
                )}
                <div className="pb-2">
                  <h1 className="text-3xl font-bold text-gray-900">{profile.display_name}</h1>
                  <p className="text-gray-600">@{profile.username}</p>
                </div>
              </div>
              
              {currentUser && currentUser.username !== username && (
                <div className="flex gap-3">
                  <button 
                    onClick={handleFollowToggle}
                    className={`px-6 py-2 rounded-lg hover:shadow-lg transition font-semibold ${
                      isFollowing 
                        ? 'border-2 border-purple-600 text-purple-600 hover:bg-purple-50' 
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                    }`}
                  >
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                  <button 
                    onClick={handleMessage}
                    className="px-6 py-2 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition font-semibold"
                  >
                    Message
                  </button>
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex flex-wrap gap-4 mb-6">
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${badge.color}`}>
                {badge.label}
              </span>
              
              {profile.profile_location && (
                <span className="px-4 py-2 bg-gray-100 rounded-full text-sm font-semibold text-gray-700">
                  📍 {profile.profile_location}
                </span>
              )}
              
              {profile.profile_years_keeping && (
                <span className="px-4 py-2 bg-gray-100 rounded-full text-sm font-semibold text-gray-700">
                  🕰️ {profile.profile_years_keeping} {profile.profile_years_keeping === 1 ? 'year' : 'years'} keeping
                </span>
              )}
            </div>

            {/* Specialties */}
            {profile.profile_specialties && profile.profile_specialties.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">SPECIALTIES</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.profile_specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium"
                    >
                      {specialty.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social Links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <div className="flex gap-4 pt-4 border-t">
                {profile.social_links.instagram && (
                  <a
                    href={profile.social_links.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 transition"
                  >
                    📷 Instagram
                  </a>
                )}
                {profile.social_links.youtube && (
                  <a
                    href={profile.social_links.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 transition"
                  >
                    🎥 YouTube
                  </a>
                )}
                {profile.social_links.website && (
                  <a
                    href={profile.social_links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 transition"
                  >
                    🌐 Website
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
            <div className="bg-white rounded-xl p-6 shadow text-center">
              <div className="text-3xl font-bold text-purple-600">{stats.total_public}</div>
              <div className="text-sm text-gray-600">Tarantulas</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.unique_species}</div>
              <div className="text-sm text-gray-600">Species</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow text-center">
              <div className="text-3xl font-bold text-pink-600">{stats.sex_distribution.female}</div>
              <div className="text-sm text-gray-600">Females</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow text-center">
              <div className="text-3xl font-bold text-cyan-600">{stats.sex_distribution.male}</div>
              <div className="text-sm text-gray-600">Males</div>
            </div>
            {followStats && (
              <>
                <div className="bg-white rounded-xl p-6 shadow text-center">
                  <div className="text-3xl font-bold text-indigo-600">{followStats.followers_count}</div>
                  <div className="text-sm text-gray-600">Followers</div>
                </div>
                <div className="bg-white rounded-xl p-6 shadow text-center">
                  <div className="text-3xl font-bold text-teal-600">{followStats.following_count}</div>
                  <div className="text-sm text-gray-600">Following</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-8 border-b border-gray-200">
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab('collection')}
              className={`pb-4 px-2 font-semibold transition ${
                activeTab === 'collection'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Collection ({collection.length})
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`pb-4 px-2 font-semibold transition ${
                activeTab === 'about'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              About
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === 'collection' ? (
            collection.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {collection.map((tarantula) => (
                  <div key={tarantula.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition">
                    {tarantula.photo_url ? (
                      <img
                        src={tarantula.photo_url}
                        alt={tarantula.name}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
                        <span className="text-6xl">🕷️</span>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-bold text-lg mb-1">{tarantula.name}</h3>
                      {tarantula.species_name && (
                        <p className="text-sm text-gray-600 italic mb-2">{tarantula.species_name}</p>
                      )}
                      <div className="flex gap-2">
                        {tarantula.sex && (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            tarantula.sex === 'female' ? 'bg-pink-100 text-pink-800' :
                            tarantula.sex === 'male' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {tarantula.sex === 'female' ? '♀' : tarantula.sex === 'male' ? '♂' : '?'} {tarantula.sex}
                          </span>
                        )}
                        {tarantula.age_months !== undefined && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                            {tarantula.age_months}mo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📦</div>
                <p className="text-gray-600">No public tarantulas in this collection</p>
              </div>
            )
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-8">
              {profile.profile_bio ? (
                <div>
                  <h3 className="text-xl font-bold mb-4">Bio</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{profile.profile_bio}</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600">No bio added yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
