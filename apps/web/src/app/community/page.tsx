'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ActivityFeed from '@/components/ActivityFeed'

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
  collection_visibility: string
}

export default function CommunityPage() {
  const router = useRouter()
  const [keepers, setKeepers] = useState<Keeper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [experienceFilter, setExperienceFilter] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'keepers' | 'activity'>('keepers')

  useEffect(() => {
    fetchKeepers()
  }, [experienceFilter, specialtyFilter])

  const fetchKeepers = async () => {
    try {
      setLoading(true)
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      
      const params = new URLSearchParams()
      if (experienceFilter) params.append('experience_level', experienceFilter)
      if (specialtyFilter) params.append('specialty', specialtyFilter)
      if (searchQuery) params.append('search', searchQuery)
      
      const response = await fetch(`${API_URL}/api/v1/keepers?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch keepers')
      }
      
      const data = await response.json()
      setKeepers(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchKeepers()
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
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🕷️</div>
          <p className="text-xl text-gray-300">Discovering keepers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Header */}
      <div className="bg-gradient-primary text-white shadow-lg shadow-electric-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">🌐 Keeper Community</h1>
              <p className="text-electric-blue-100 text-lg">Discover fellow tarantula enthusiasts</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/community/forums')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium border border-white/20"
              >
                💬 Forums
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium border border-white/20"
              >
                ← Dashboard
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-6 space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username, name, or location..."
                className="flex-1 px-4 py-3 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-electric-blue-200 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-white text-electric-blue-600 rounded-lg hover:bg-electric-blue-50 transition font-semibold"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              <select
                value={experienceFilter}
                onChange={(e) => setExperienceFilter(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <option value="" className="bg-dark text-gray-100">All Experience Levels</option>
                <option value="beginner" className="bg-dark text-gray-100">Beginner</option>
                <option value="intermediate" className="bg-dark text-gray-100">Intermediate</option>
                <option value="advanced" className="bg-dark text-gray-100">Advanced</option>
                <option value="expert" className="bg-dark text-gray-100">Expert</option>
              </select>

              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                <option value="" className="bg-dark text-gray-100">All Specialties</option>
                <option value="terrestrial" className="bg-dark text-gray-100">Terrestrial</option>
                <option value="arboreal" className="bg-dark text-gray-100">Arboreal</option>
                <option value="fossorial" className="bg-dark text-gray-100">Fossorial</option>
                <option value="new_world" className="bg-dark text-gray-100">New World</option>
                <option value="old_world" className="bg-dark text-gray-100">Old World</option>
                <option value="breeding" className="bg-dark text-gray-100">Breeding</option>
                <option value="slings" className="bg-dark text-gray-100">Slings</option>
                <option value="large_species" className="bg-dark text-gray-100">Large Species</option>
              </select>

              {(experienceFilter || specialtyFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setExperienceFilter('')
                    setSpecialtyFilter('')
                    setSearchQuery('')
                    fetchKeepers()
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition font-medium border border-white/20"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-dark-50 border-b border-electric-blue-500/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('keepers')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'keepers'
                  ? 'border-electric-blue-500 text-electric-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              👥 Keepers
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-6 py-4 font-semibold border-b-2 transition-colors ${
                activeTab === 'activity'
                  ? 'border-neon-pink-500 text-neon-pink-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              📊 Community Activity
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'keepers' ? (
          <>
            {error && (
              <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl">
                {error}
              </div>
            )}

        {keepers.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No keepers found</h2>
            <p className="text-gray-600 mb-6">
              {searchQuery || experienceFilter || specialtyFilter
                ? 'Try adjusting your filters or search query'
                : 'Be the first to make your collection public!'}
            </p>
            <button
              onClick={() => router.push('/dashboard/settings/profile')}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
            >
              Update Your Profile
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-gray-600">
                Found <strong>{keepers.length}</strong> keeper{keepers.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {keepers.map((keeper) => (
                <div
                  key={keeper.id}
                  onClick={() => router.push(`/community/${keeper.username}`)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-xl hover:border-purple-200 transition-all duration-200 cursor-pointer group"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-3xl flex-shrink-0 group-hover:scale-110 transition-transform">
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
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-gray-900 truncate group-hover:text-purple-600 transition">
                        {keeper.display_name}
                      </h3>
                      <p className="text-sm text-gray-500">@{keeper.username}</p>
                      {keeper.profile_location && (
                        <p className="text-sm text-gray-600 mt-1">📍 {keeper.profile_location}</p>
                      )}
                    </div>
                  </div>

                  {keeper.profile_bio && (
                    <p className="text-gray-700 text-sm mb-4 line-clamp-3">
                      {keeper.profile_bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mb-4">
                    {keeper.profile_experience_level && (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getExperienceBadgeColor(keeper.profile_experience_level)}`}>
                        {keeper.profile_experience_level.charAt(0).toUpperCase() + keeper.profile_experience_level.slice(1)}
                      </span>
                    )}
                    {keeper.profile_years_keeping && keeper.profile_years_keeping > 0 && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                        {keeper.profile_years_keeping} {keeper.profile_years_keeping === 1 ? 'year' : 'years'}
                      </span>
                    )}
                  </div>

                  {keeper.profile_specialties && keeper.profile_specialties.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Specialties</p>
                      <div className="flex flex-wrap gap-1">
                        {keeper.profile_specialties.slice(0, 3).map((specialty) => (
                          <span
                            key={specialty}
                            className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs"
                          >
                            {formatSpecialty(specialty)}
                          </span>
                        ))}
                        {keeper.profile_specialties.length > 3 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                            +{keeper.profile_specialties.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-100">
                    <button className="w-full py-2 text-purple-600 font-semibold hover:text-purple-700 transition flex items-center justify-center gap-2">
                      View Collection
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
          </>
        ) : (
          // Activity Feed Tab
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Community Activity</h2>
            <ActivityFeed feedType="global" showFilters={true} />
          </div>
        )}
      </div>
    </div>
  )
}
