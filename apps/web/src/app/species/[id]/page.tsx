'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

interface Species {
  id: string
  scientific_name: string
  common_names: string[]
  genus?: string
  species?: string
  family?: string
  care_level?: string
  temperament?: string
  native_region?: string
  adult_size_cm?: number
  growth_rate?: string
  type?: string
  min_temperature?: number
  max_temperature?: number
  min_humidity?: number
  max_humidity?: number
  enclosure_type?: string
  substrate_depth_cm?: number
  substrate_type?: string
  feeding_frequency_days?: number
  typical_diet?: string
  urticating_hairs?: boolean
  medically_significant_venom?: boolean
  defensive_behavior?: string
  lifespan_years_min?: number
  lifespan_years_max?: number
  image_url?: string
  is_verified?: boolean
  times_kept?: number
  average_rating?: number
}

export default function EnhancedSpeciesDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { user: authUser } = useAuth()

  const [species, setSpecies] = useState<Species | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [addingToCollection, setAddingToCollection] = useState(false)

  useEffect(() => {
    fetchSpecies()
  }, [id])

  const fetchSpecies = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/species/${id}`)

      if (!response.ok) {
        throw new Error('Species not found')
      }

      const data = await response.json()
      setSpecies(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load species')
    } finally {
      setLoading(false)
    }
  }

  const addToCollection = async () => {
    // TODO: Implement add to collection
    setAddingToCollection(true)
    setTimeout(() => {
      alert('Collection feature coming soon!')
      setAddingToCollection(false)
    }, 500)
  }

  const getCareLevel = (level?: string) => {
    switch (level) {
      case 'beginner': return { color: 'bg-green-500', text: 'Beginner Friendly', icon: '🟢' }
      case 'intermediate': return { color: 'bg-yellow-500', text: 'Intermediate', icon: '🟡' }
      case 'advanced': return { color: 'bg-red-500', text: 'Advanced', icon: '🔴' }
      default: return { color: 'bg-gray-500', text: 'Unknown', icon: '⚪' }
    }
  }

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'terrestrial': return '🏜️'
      case 'arboreal': return '🌳'
      case 'fossorial': return '⛰️'
      default: return '🕷️'
    }
  }

  const renderGauge = (value: number, min: number, max: number, label: string, unit: string) => {
    const percentage = ((value - min) / (max - min)) * 100
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{value}{unit}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div 
            className="bg-primary-600 h-2.5 rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">🕷️</div>
            <p className="text-gray-600 dark:text-gray-400">Loading species details...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !species) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">Species Not Found</h2>
              <p>{error || 'The requested species could not be found.'}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const careLevel = getCareLevel(species.care_level)
  const typeIcon = getTypeIcon(species.type)
  const canEdit = false // TODO: Add admin/superuser check when roles are implemented

  return (
    <DashboardLayout
      userName={authUser?.name ?? undefined}
      userEmail={authUser?.email ?? undefined}
      userAvatar={authUser?.image ?? undefined}
    >
      <div>

      {/* Hero Section */}
      <div className="relative h-96 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">
        {species.image_url && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${species.image_url})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-12">
          <div className="flex items-end gap-8 w-full">
            {/* Species Image */}
            <div className="flex-shrink-0 hidden sm:block">
              {species.image_url ? (
                <img
                  src={species.image_url}
                  alt={species.scientific_name}
                  className="w-48 h-48 object-cover rounded-xl border-4 border-white dark:border-gray-800 shadow-2xl"
                />
              ) : (
                <div className="w-48 h-48 bg-white dark:bg-gray-800 rounded-xl border-4 border-white dark:border-gray-800 shadow-2xl flex items-center justify-center text-8xl">
                  {typeIcon}
                </div>
              )}
            </div>

            {/* Title & Quick Info */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl sm:text-5xl font-bold text-white drop-shadow-lg">
                  {species.scientific_name}
                </h1>
                {species.is_verified && (
                  <span className="px-3 py-1 bg-purple-500/90 text-white rounded-full text-sm font-medium backdrop-blur-sm">
                    ✓ Verified
                  </span>
                )}
              </div>

              {species.common_names && species.common_names.length > 0 && (
                <p className="text-xl text-white/90 mb-4 drop-shadow">
                  {species.common_names.join(', ')}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <span className={`px-4 py-2 ${careLevel.color} text-white rounded-full text-sm font-medium shadow-lg flex items-center gap-2`}>
                  <span>{careLevel.icon}</span>
                  <span>{careLevel.text}</span>
                </span>
                {species.type && (
                  <span className="px-4 py-2 bg-blue-500/90 text-white rounded-full text-sm font-medium shadow-lg backdrop-blur-sm capitalize flex items-center gap-2">
                    <span>{typeIcon}</span>
                    <span>{species.type}</span>
                  </span>
                )}
                {species.native_region && (
                  <span className="px-4 py-2 bg-green-500/90 text-white rounded-full text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2">
                    <span>🌍</span>
                    <span>{species.native_region}</span>
                  </span>
                )}
                {species.urticating_hairs && (
                  <span className="px-4 py-2 bg-orange-500/90 text-white rounded-full text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2">
                    <span>🪮</span>
                    <span>Urticating Hairs</span>
                  </span>
                )}
                {species.medically_significant_venom && (
                  <span className="px-4 py-2 bg-red-600/90 text-white rounded-full text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2 animate-pulse">
                    <span>⚠️</span>
                    <span>Medically Significant Venom</span>
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pb-4">
              <button
                onClick={addToCollection}
                disabled={addingToCollection}
                className="px-6 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {addingToCollection ? 'Adding...' : '+ Add to Collection'}
              </button>
              
              {canEdit && (
                <button
                  onClick={() => router.push(`/species/${id}/edit`)}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold shadow-lg hover:bg-primary-700 transition-all"
                >
                  ✏️ Edit Species
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8 overflow-x-auto">
            {['overview', 'husbandry', 'behavior', 'stats'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Facts */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Quick Facts</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {species.adult_size_cm && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📏</span>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Adult Size</p>
                        <p className="font-semibold text-gray-900 dark:text-white">{species.adult_size_cm} cm leg span</p>
                      </div>
                    </div>
                  )}
                  {species.growth_rate && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📈</span>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Growth Rate</p>
                        <p className="font-semibold text-gray-900 dark:text-white capitalize">{species.growth_rate}</p>
                      </div>
                    </div>
                  )}
                  {(species.lifespan_years_min || species.lifespan_years_max) && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⏳</span>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Lifespan</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {species.lifespan_years_min}-{species.lifespan_years_max} years
                        </p>
                      </div>
                    </div>
                  )}
                  {species.temperament && (
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">😊</span>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Temperament</p>
                        <p className="font-semibold text-gray-900 dark:text-white capitalize">{species.temperament}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Taxonomy */}
              {(species.genus || species.family) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                  <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Taxonomy</h2>
                  <div className="space-y-2">
                    {species.genus && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Genus:</span>
                        <span className="font-medium text-gray-900 dark:text-white italic">{species.genus}</span>
                      </div>
                    )}
                    {species.species && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Species:</span>
                        <span className="font-medium text-gray-900 dark:text-white italic">{species.species}</span>
                      </div>
                    )}
                    {species.family && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Family:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{species.family}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Community Stats */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Community</h3>
                <div className="space-y-3">
                  {species.times_kept !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Keepers</span>
                      <span className="text-2xl font-bold text-primary-600">{species.times_kept}</span>
                    </div>
                  )}
                  {species.average_rating && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Rating</span>
                      <span className="text-2xl font-bold text-yellow-500 flex items-center gap-1">
                        ⭐ {species.average_rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Care Level Indicator */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Experience Required</h3>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-4xl">{careLevel.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{careLevel.text}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {species.care_level === 'beginner' && 'Great for first-time keepers'}
                      {species.care_level === 'intermediate' && 'Some experience recommended'}
                      {species.care_level === 'advanced' && 'Experienced keepers only'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Husbandry Tab */}
        {activeTab === 'husbandry' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Temperature & Humidity */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                🌡️ Climate Requirements
              </h2>
              {species.min_temperature && species.max_temperature && (
                renderGauge(
                  (species.min_temperature + species.max_temperature) / 2,
                  20,
                  32,
                  'Temperature Range',
                  '°C'
                )
              )}
              {species.min_humidity && species.max_humidity && (
                renderGauge(
                  (species.min_humidity + species.max_humidity) / 2,
                  40,
                  90,
                  'Humidity Range',
                  '%'
                )
              )}
            </div>

            {/* Enclosure */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                🏠 Enclosure Setup
              </h2>
              <div className="space-y-4">
                {species.enclosure_type && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Type</p>
                    <p className="font-semibold text-gray-900 dark:text-white capitalize">{species.enclosure_type}</p>
                  </div>
                )}
                {species.substrate_type && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Substrate</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{species.substrate_type}</p>
                  </div>
                )}
                {species.substrate_depth_cm && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Substrate Depth</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{species.substrate_depth_cm} cm</p>
                  </div>
                )}
              </div>
            </div>

            {/* Feeding */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                🍽️ Feeding Schedule
              </h2>
              <div className="space-y-4">
                {species.feeding_frequency_days && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Frequency</p>
                    <p className="font-semibold text-gray-900 dark:text-white">Every {species.feeding_frequency_days} days</p>
                  </div>
                )}
                {species.typical_diet && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Diet</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{species.typical_diet}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Behavior Tab */}
        {activeTab === 'behavior' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                🕷️ Behavior & Temperament
              </h2>
              <div className="space-y-4">
                {species.temperament && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">General Temperament</p>
                    <p className="font-semibold text-gray-900 dark:text-white capitalize">{species.temperament}</p>
                  </div>
                )}
                {species.defensive_behavior && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Defensive Behavior</p>
                    <p className="text-gray-900 dark:text-white">{species.defensive_behavior}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Safety Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
                ⚠️ Safety Information
              </h2>
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${species.urticating_hairs ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🪮</span>
                    <p className="font-semibold text-gray-900 dark:text-white">Urticating Hairs</p>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {species.urticating_hairs
                      ? 'This species has urticating hairs that can cause irritation if handled. Use caution during maintenance.'
                      : 'This species does not have urticating hairs (Old World species).'}
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${species.medically_significant_venom ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-500' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{species.medically_significant_venom ? '⚠️' : '✓'}</span>
                    <p className="font-semibold text-gray-900 dark:text-white">Venom Potency</p>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {species.medically_significant_venom
                      ? '⚠️ WARNING: This species has medically significant venom. Bites can cause severe pain and systemic effects. Only for experienced keepers. Seek immediate medical attention if bitten.'
                      : 'Venom is not considered medically significant to humans, though reactions may vary.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Species Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-4xl font-bold text-primary-600 mb-2">{species.times_kept || 0}</p>
                <p className="text-gray-600 dark:text-gray-400">Total Keepers</p>
              </div>
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-4xl font-bold text-yellow-500 mb-2">
                  {species.average_rating ? species.average_rating.toFixed(1) : 'N/A'}
                </p>
                <p className="text-gray-600 dark:text-gray-400">Average Rating</p>
              </div>
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-4xl font-bold text-green-500 mb-2">{careLevel.text}</p>
                <p className="text-gray-600 dark:text-gray-400">Care Level</p>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </DashboardLayout>
  )
}
