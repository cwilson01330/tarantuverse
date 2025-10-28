'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import GrowthChart from '@/components/GrowthChart'
import FeedingStatsCard from '@/components/FeedingStatsCard'
import DashboardLayout from '@/components/DashboardLayout'

interface Tarantula {
  id: string
  species_id?: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  source?: string
  price_paid?: number
  notes?: string
  photo_url?: string
  visibility?: string

  // Husbandry
  enclosure_type?: string
  enclosure_size?: string
  substrate_type?: string
  substrate_depth?: string
  last_substrate_change?: string
  target_temp_min?: number
  target_temp_max?: number
  target_humidity_min?: number
  target_humidity_max?: number
  water_dish?: boolean
  misting_schedule?: string
  last_enclosure_cleaning?: string
  enclosure_notes?: string

  created_at: string
}

interface FeedingLog {
  id: string
  tarantula_id: string
  fed_at: string
  food_type?: string
  food_size?: string
  accepted: boolean
  notes?: string
  created_at: string
}

interface MoltLog {
  id: string
  tarantula_id: string
  molted_at: string
  premolt_started_at?: string
  leg_span_before?: number
  leg_span_after?: number
  weight_before?: number
  weight_after?: number
  notes?: string
  image_url?: string
  created_at: string
}

interface SubstrateChange {
  id: string
  tarantula_id: string
  changed_at: string
  substrate_type?: string
  substrate_depth?: string
  reason?: string
  notes?: string
  created_at: string
}

interface Photo {
  id: string
  tarantula_id: string
  url: string
  thumbnail_url?: string
  caption?: string
  taken_at: string
  created_at: string
}

interface GrowthDataPoint {
  date: string
  weight?: number
  leg_span?: number
  days_since_previous?: number
  weight_change?: number
  leg_span_change?: number
}

interface GrowthAnalytics {
  tarantula_id: string
  data_points: GrowthDataPoint[]
  total_molts: number
  average_days_between_molts?: number
  total_weight_gain?: number
  total_leg_span_gain?: number
  growth_rate_weight?: number
  growth_rate_leg_span?: number
  last_molt_date?: string
  days_since_last_molt?: number
}

interface PreyTypeCount {
  food_type: string
  count: number
  percentage: number
}

interface FeedingStats {
  tarantula_id: string
  total_feedings: number
  total_accepted: number
  total_refused: number
  acceptance_rate: number
  average_days_between_feedings?: number
  last_feeding_date?: string
  days_since_last_feeding?: number
  next_feeding_prediction?: string
  longest_gap_days?: number
  current_streak_accepted: number
  prey_type_distribution: PreyTypeCount[]
}

interface Pairing {
  id: string
  male_id: string
  female_id: string
  paired_date: string
  separated_date?: string
  pairing_type: string
  outcome: string
  notes?: string
  created_at: string
}

export default function TarantulaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [tarantula, setTarantula] = useState<Tarantula | null>(null)
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [substrateChanges, setSubstrateChanges] = useState<SubstrateChange[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [growthData, setGrowthData] = useState<GrowthAnalytics | null>(null)
  const [feedingStats, setFeedingStats] = useState<FeedingStats | null>(null)
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'husbandry' | 'photos' | 'growth' | 'breeding'>('overview')
  const [showFeedingForm, setShowFeedingForm] = useState(false)
  const [showMoltForm, setShowMoltForm] = useState(false)
  const [showSubstrateForm, setShowSubstrateForm] = useState(false)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [feedingFormData, setFeedingFormData] = useState({
    fed_at: new Date().toISOString().slice(0, 16),
    food_type: '',
    food_size: '',
    accepted: true,
    notes: '',
  })
  const [moltFormData, setMoltFormData] = useState({
    molted_at: new Date().toISOString().slice(0, 16),
    premolt_started_at: '',
    leg_span_before: '',
    leg_span_after: '',
    weight_before: '',
    weight_after: '',
    notes: '',
    image_url: '',
  })
  const [substrateFormData, setSubstrateFormData] = useState({
    changed_at: new Date().toISOString().slice(0, 10),
    substrate_type: '',
    substrate_depth: '',
    reason: '',
    notes: '',
  })

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
    fetchFeedings(token)
    fetchMolts(token)
    fetchSubstrateChanges(token)
    fetchPhotos(token)
    fetchGrowth(token)
    fetchFeedingStats(token)
    fetchPairings(token)
  }, [id, router, isAuthenticated, authLoading, token])

  const fetchTarantula = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tarantula')
      }

      const data = await response.json()
      setTarantula(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const fetchFeedings = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/feedings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setFeedings(data)
      }
    } catch (err) {
      console.error('Failed to fetch feedings:', err)
    }
  }

  const handleAddFeeding = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/feedings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(feedingFormData),
      })

      if (!response.ok) {
        throw new Error('Failed to add feeding log')
      }

      // Reset form and refresh
      setFeedingFormData({
        fed_at: new Date().toISOString().slice(0, 16),
        food_type: '',
        food_size: '',
        accepted: true,
        notes: '',
      })
      setShowFeedingForm(false)
      fetchFeedings(token)
    } catch (err: any) {
      setError(err.message || 'Failed to add feeding')
    }
  }

  const handleDeleteFeeding = async (feedingId: string) => {
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/feedings/${feedingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete feeding log')
      }

      fetchFeedings(token)
    } catch (err: any) {
      setError(err.message || 'Failed to delete feeding')
    }
  }

  const fetchMolts = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/molts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setMolts(data)
      }
    } catch (err) {
      console.error('Failed to fetch molts:', err)
    }
  }

  const handleAddMolt = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      // Prepare data - convert empty strings to null
      const submitData = {
        molted_at: moltFormData.molted_at,
        premolt_started_at: moltFormData.premolt_started_at || null,
        leg_span_before: moltFormData.leg_span_before ? parseFloat(moltFormData.leg_span_before) : null,
        leg_span_after: moltFormData.leg_span_after ? parseFloat(moltFormData.leg_span_after) : null,
        weight_before: moltFormData.weight_before ? parseFloat(moltFormData.weight_before) : null,
        weight_after: moltFormData.weight_after ? parseFloat(moltFormData.weight_after) : null,
        notes: moltFormData.notes || null,
        image_url: moltFormData.image_url || null,
      }

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/molts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        throw new Error('Failed to add molt log')
      }

      // Reset form and refresh
      setMoltFormData({
        molted_at: new Date().toISOString().slice(0, 16),
        premolt_started_at: '',
        leg_span_before: '',
        leg_span_after: '',
        weight_before: '',
        weight_after: '',
        notes: '',
        image_url: '',
      })
      setShowMoltForm(false)
      fetchMolts(token)
    } catch (err: any) {
      setError(err.message || 'Failed to add molt')
    }
  }

  const handleDeleteMolt = async (moltId: string) => {
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/molts/${moltId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete molt log')
      }

      fetchMolts(token)
    } catch (err: any) {
      setError(err.message || 'Failed to delete molt')
    }
  }

  const fetchSubstrateChanges = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/substrate-changes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setSubstrateChanges(data)
      }
    } catch (err) {
      console.error('Failed to fetch substrate changes:', err)
    }
  }

  const handleAddSubstrateChange = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/substrate-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(substrateFormData),
      })

      if (!response.ok) {
        throw new Error('Failed to add substrate change log')
      }

      // Reset form and refresh
      setSubstrateFormData({
        changed_at: new Date().toISOString().slice(0, 10),
        substrate_type: '',
        substrate_depth: '',
        reason: '',
        notes: '',
      })
      setShowSubstrateForm(false)
      fetchSubstrateChanges(token)
      // Also refresh tarantula to update last_substrate_change
      fetchTarantula(token)
    } catch (err: any) {
      setError(err.message || 'Failed to add substrate change')
    }
  }

  const handleDeleteSubstrateChange = async (changeId: string) => {
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/substrate-changes/${changeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete substrate change log')
      }

      fetchSubstrateChanges(token)
    } catch (err: any) {
      setError(err.message || 'Failed to delete substrate change')
    }
  }

  const handleDelete = async () => {
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete tarantula')
      }

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
    }
  }

  const handleVisibilityToggle = async () => {
    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      
      const newVisibility = tarantula?.visibility === 'public' ? 'private' : 'public'

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...tarantula,
          visibility: newVisibility,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update visibility')
      }

      const data = await response.json()
      setTarantula(data)
    } catch (err: any) {
      setError(err.message || 'Failed to update visibility')
    }
  }

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

  const fetchPhotos = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/photos`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPhotos(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch photos:', err)
    }
  }

  const fetchGrowth = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/growth`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setGrowthData(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch growth data:', err)
    }
  }

  const fetchFeedingStats = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/feeding-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setFeedingStats(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch feeding stats:', err)
    }
  }

  const fetchPairings = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/pairings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPairings(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch pairings:', err)
    }
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploadingPhoto(true)
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}/photos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload photo')
      }

      // Refresh photos and tarantula (to get updated photo_url)
      await fetchPhotos(token)
      await fetchTarantula(token)
      setShowPhotoUpload(false)
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Are you sure you want to delete this photo?')) return

    try {
      if (!token) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/photos/${photoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete photo')
      }

      // Refresh photos and tarantula
      await fetchPhotos(token)
      await fetchTarantula(token)
      setSelectedPhoto(null)
    } catch (err: any) {
      setError(err.message || 'Failed to delete photo')
    }
  }

  if (loading || authLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-900 dark:text-white">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (error && !tarantula) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!tarantula) {
    return null
  }

  // Calculate time since acquired
  const daysSinceAcquired = tarantula.date_acquired
    ? Math.floor((new Date().getTime() - new Date(tarantula.date_acquired).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Hero Section with Image */}
      <div className="relative">
        {/* Background Image or Gradient */}
        <div className="h-80 relative overflow-hidden bg-gradient-to-br from-purple-600 to-purple-900">
          {tarantula.photo_url ? (
            <>
              <img
                src={getImageUrl(tarantula.photo_url)}
                alt={tarantula.common_name}
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-9xl opacity-20">
              🕷️
            </div>
          )}
        </div>

        {/* Hero Content Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 w-full">
            <button
              onClick={() => router.push('/dashboard')}
              className="mb-4 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 text-white font-medium inline-flex items-center gap-2"
            >
              ← Back
            </button>
            
            <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
              {tarantula.common_name}
            </h1>
            <p className="text-2xl italic text-purple-100 mb-4 drop-shadow">
              {tarantula.scientific_name}
            </p>

            {/* Quick Stats Pills */}
            <div className="flex flex-wrap gap-2">
              {tarantula.sex && (
                <span className="px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm text-purple-900 text-sm font-semibold inline-flex items-center gap-1">
                  {tarantula.sex === 'male' ? '♂️' : tarantula.sex === 'female' ? '♀️' : '⚧'} {tarantula.sex}
                </span>
              )}
              {daysSinceAcquired !== null && (
                <span className="px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm text-purple-900 text-sm font-semibold">
                  📅 {daysSinceAcquired < 30 ? `${daysSinceAcquired}d` : `${Math.floor(daysSinceAcquired / 30)}mo`}
                </span>
              )}
              {tarantula.price_paid && (
                <span className="px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm text-purple-900 text-sm font-semibold">
                  💵 ${tarantula.price_paid}
                </span>
              )}
              {tarantula.enclosure_type && (
                <span className="px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm text-purple-900 text-sm font-semibold capitalize">
                  🏠 {tarantula.enclosure_type}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-3 items-center">
            {tarantula.species_id && (
              <button
                onClick={() => router.push(`/species/${tarantula.species_id}`)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-sm"
              >
                📖 Care Sheet
              </button>
            )}
            <button
              onClick={() => router.push(`/dashboard/tarantulas/${id}/edit`)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-sm"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => {
                setActiveTab('logs')
                setShowFeedingForm(true)
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-sm"
            >
              🍴 Log Feeding
            </button>
            
            {/* Visibility Toggle */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {tarantula.visibility === 'public' ? '🌐 Public' : '🔒 Private'}
              </span>
              <button
                onClick={handleVisibilityToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  tarantula.visibility === 'public' ? 'bg-purple-600' : 'bg-gray-300'
                }`}
                title={tarantula.visibility === 'public' ? 'Make private' : 'Make public'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tarantula.visibility === 'public' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={() => setDeleteConfirm(true)}
              className="ml-auto px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-all duration-200 font-medium border border-red-200 dark:border-red-800"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
            {error}
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab('growth')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'growth'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            📈 Growth
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            📝 Logs
          </button>
          <button
            onClick={() => setActiveTab('husbandry')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'husbandry'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            🏠 Husbandry
          </button>
          <button
            onClick={() => setActiveTab('photos')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'photos'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            📸 Photos ({photos.length})
          </button>
          <button
            onClick={() => setActiveTab('breeding')}
            className={`px-6 py-3 font-semibold transition-all duration-200 border-b-2 whitespace-nowrap ${
              activeTab === 'breeding'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            🥚 Breeding ({pairings.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info Card */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Basic Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {tarantula.date_acquired && (
                    <div>
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Date Acquired</p>
                      <p className="text-lg text-gray-900 dark:text-white">{new Date(tarantula.date_acquired).toLocaleDateString()}</p>
                    </div>
                  )}
                  {tarantula.source && (
                    <div>
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Source</p>
                      <p className="text-lg text-gray-900 dark:text-white capitalize">{tarantula.source.replace('_', ' ')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity Timeline */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Recent Activity</h2>
                <div className="space-y-4">
                  {feedings.length === 0 && molts.length === 0 && substrateChanges.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-2">📋</div>
                      <p>No activity logged yet</p>
                    </div>
                  ) : (
                    <>
                      {[...feedings.slice(0, 3), ...molts.slice(0, 2), ...substrateChanges.slice(0, 2)]
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .slice(0, 5)
                        .map((item: any, index) => {
                          const isFeeding = 'fed_at' in item
                          const isMolt = 'molted_at' in item
                          const isSubstrate = 'changed_at' in item
                          
                          return (
                            <div key={index} className="flex gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                              <div className="text-3xl">
                                {isFeeding ? '🍴' : isMolt ? '🔄' : '💨'}
                              </div>
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900 dark:text-white">
                                  {isFeeding ? `Fed ${item.food_type || 'food'}` : isMolt ? 'Molted' : 'Substrate Changed'}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {new Date(item.fed_at || item.molted_at || item.changed_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                    </>
                  )}
                </div>
              </div>

              {tarantula.notes && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Notes</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{tarantula.notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Feeding Stats Card */}
              {feedingStats && <FeedingStatsCard data={feedingStats} />}
              
              {/* Stats Card */}
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl shadow-lg p-6 text-white">
                <h3 className="text-lg font-bold mb-4">Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-100">Total Feedings</span>
                    <span className="text-2xl font-bold">{feedings.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-100">Total Molts</span>
                    <span className="text-2xl font-bold">{molts.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-purple-100">Substrate Changes</span>
                    <span className="text-2xl font-bold">{substrateChanges.length}</span>
                  </div>
                </div>
              </div>

              {/* Quick Husbandry */}
              {(tarantula.target_temp_min || tarantula.target_humidity_min) && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Environment</h3>
                  <div className="space-y-4">
                    {(tarantula.target_temp_min || tarantula.target_temp_max) && (
                      <div>
                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Temperature</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {tarantula.target_temp_min && `${tarantula.target_temp_min}°F`}
                          {tarantula.target_temp_min && tarantula.target_temp_max && ' - '}
                          {tarantula.target_temp_max && `${tarantula.target_temp_max}°F`}
                        </p>
                      </div>
                    )}
                    {(tarantula.target_humidity_min || tarantula.target_humidity_max) && (
                      <div>
                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Humidity</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {tarantula.target_humidity_min && `${tarantula.target_humidity_min}%`}
                          {tarantula.target_humidity_min && tarantula.target_humidity_max && ' - '}
                          {tarantula.target_humidity_max && `${tarantula.target_humidity_max}%`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Growth Tab */}
        {activeTab === 'growth' && (
          <div>
            {growthData ? (
              <GrowthChart data={growthData} />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  Loading growth data...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-8">
            {/* Feeding Logs Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🍴 Feeding Logs</h2>
                <button
                  onClick={() => setShowFeedingForm(!showFeedingForm)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium shadow-sm"
                >
                  {showFeedingForm ? 'Cancel' : '+ Add Feeding'}
                </button>
              </div>

              {showFeedingForm && (
                <form onSubmit={handleAddFeeding} className="mb-6 p-6 border-2 border-purple-100 dark:border-purple-900 rounded-xl bg-purple-50/50 dark:bg-purple-900/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={feedingFormData.fed_at}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, fed_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Food Type</label>
                      <input
                        type="text"
                        value={feedingFormData.food_type}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, food_type: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="e.g., Cricket, Roach"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Food Size</label>
                      <select
                        value={feedingFormData.food_size}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, food_size: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      >
                        <option value="">Select...</option>
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Accepted?</label>
                      <select
                        value={feedingFormData.accepted ? 'true' : 'false'}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, accepted: e.target.value === 'true' })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Notes</label>
                    <textarea
                      value={feedingFormData.notes}
                      onChange={(e) => setFeedingFormData({ ...feedingFormData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      placeholder="Optional notes..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold shadow-sm"
                  >
                    💾 Save Feeding Log
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {feedings.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-5xl mb-3">🍽️</div>
                    <p>No feeding logs yet</p>
                  </div>
                ) : (
                  feedings.map((feeding) => (
                    <div key={feeding.id} className="p-5 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-md hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-200 bg-white dark:bg-gray-700">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🍴</span>
                            <div>
                              <p className="font-bold text-gray-900 dark:text-white">
                                {new Date(feeding.fed_at).toLocaleDateString()} at {new Date(feeding.fed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {feeding.food_type && (
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                  {feeding.food_type}
                                  {feeding.food_size && ` (${feeding.food_size})`}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${feeding.accepted ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {feeding.accepted ? '✓ Accepted' : '✗ Refused'}
                          </span>
                          {feeding.notes && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 pl-11">{feeding.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteFeeding(feeding.id)}
                          className="ml-4 px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-sm font-medium transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Molt Logs Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🔄 Molt Logs</h2>
                <button
                  onClick={() => setShowMoltForm(!showMoltForm)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium shadow-sm"
                >
                  {showMoltForm ? 'Cancel' : '+ Add Molt'}
                </button>
              </div>

              {showMoltForm && (
                <form onSubmit={handleAddMolt} className="mb-6 p-6 border-2 border-blue-100 dark:border-blue-900 rounded-xl bg-blue-50/50 dark:bg-blue-900/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Molt Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={moltFormData.molted_at}
                        onChange={(e) => setMoltFormData({ ...moltFormData, molted_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Premolt Started</label>
                      <input
                        type="datetime-local"
                        value={moltFormData.premolt_started_at}
                        onChange={(e) => setMoltFormData({ ...moltFormData, premolt_started_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Leg Span Before (inches)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.leg_span_before}
                        onChange={(e) => setMoltFormData({ ...moltFormData, leg_span_before: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Leg Span After (inches)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.leg_span_after}
                        onChange={(e) => setMoltFormData({ ...moltFormData, leg_span_after: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Weight Before (grams)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.weight_before}
                        onChange={(e) => setMoltFormData({ ...moltFormData, weight_before: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Weight After (grams)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.weight_after}
                        onChange={(e) => setMoltFormData({ ...moltFormData, weight_after: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Molt Photo URL</label>
                    <input
                      type="url"
                      value={moltFormData.image_url}
                      onChange={(e) => setMoltFormData({ ...moltFormData, image_url: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      placeholder="https://example.com/molt-photo.jpg"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Notes</label>
                    <textarea
                      value={moltFormData.notes}
                      onChange={(e) => setMoltFormData({ ...moltFormData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      placeholder="Optional notes about the molt..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold shadow-sm"
                  >
                    💾 Save Molt Log
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {molts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-5xl mb-3">🔄</div>
                    <p>No molt logs yet</p>
                  </div>
                ) : (
                  molts.map((molt) => (
                    <div key={molt.id} className="p-5 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-md hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-200 bg-white dark:bg-gray-700">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🔄</span>
                            <div>
                              <p className="font-bold text-gray-900 dark:text-white">
                                Molted: {new Date(molt.molted_at).toLocaleDateString()} at {new Date(molt.molted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {molt.premolt_started_at && (
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  Premolt started: {new Date(molt.premolt_started_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="pl-11 space-y-1">
                            {(molt.leg_span_before || molt.leg_span_after) && (
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Leg span:</span>{' '}
                                {molt.leg_span_before && `${molt.leg_span_before}"`}
                                {molt.leg_span_before && molt.leg_span_after && ' → '}
                                {molt.leg_span_after && `${molt.leg_span_after}"`}
                              </div>
                            )}
                            {(molt.weight_before || molt.weight_after) && (
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Weight:</span>{' '}
                                {molt.weight_before && `${molt.weight_before}g`}
                                {molt.weight_before && molt.weight_after && ' → '}
                                {molt.weight_after && `${molt.weight_after}g`}
                              </div>
                            )}
                            {molt.notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{molt.notes}</p>
                            )}
                            {molt.image_url && (
                              <img
                                src={molt.image_url}
                                alt="Molt photo"
                                className="mt-2 w-32 h-32 object-cover rounded-lg shadow-sm"
                              />
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteMolt(molt.id)}
                          className="ml-4 px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-sm font-medium transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Substrate Change Logs Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">💨 Substrate Changes</h2>
                <button
                  onClick={() => setShowSubstrateForm(!showSubstrateForm)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm font-medium shadow-sm"
                >
                  {showSubstrateForm ? 'Cancel' : '+ Log Change'}
                </button>
              </div>

              {showSubstrateForm && (
                <form onSubmit={handleAddSubstrateChange} className="mb-6 p-6 border-2 border-amber-100 dark:border-amber-900 rounded-xl bg-amber-50/50 dark:bg-amber-900/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Date Changed *</label>
                      <input
                        type="date"
                        required
                        value={substrateFormData.changed_at}
                        onChange={(e) => setSubstrateFormData({ ...substrateFormData, changed_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Substrate Type</label>
                      <input
                        type="text"
                        value={substrateFormData.substrate_type}
                        onChange={(e) => setSubstrateFormData({ ...substrateFormData, substrate_type: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="e.g., coco fiber, peat moss"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Substrate Depth</label>
                      <input
                        type="text"
                        value={substrateFormData.substrate_depth}
                        onChange={(e) => setSubstrateFormData({ ...substrateFormData, substrate_depth: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                        placeholder="e.g., 3 inches"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Reason</label>
                      <select
                        value={substrateFormData.reason}
                        onChange={(e) => setSubstrateFormData({ ...substrateFormData, reason: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      >
                        <option value="">Select reason...</option>
                        <option value="routine maintenance">Routine Maintenance</option>
                        <option value="mold">Mold</option>
                        <option value="rehousing">Rehousing</option>
                        <option value="flooding">Flooding</option>
                        <option value="mites">Mites</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Notes</label>
                    <textarea
                      value={substrateFormData.notes}
                      onChange={(e) => setSubstrateFormData({ ...substrateFormData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
                      placeholder="Optional notes about the substrate change..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-semibold shadow-sm"
                  >
                    💾 Save Substrate Change
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {substrateChanges.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-5xl mb-3">💨</div>
                    <p>No substrate change logs yet</p>
                  </div>
                ) : (
                  substrateChanges.map((change) => (
                    <div key={change.id} className="p-5 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-md hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-200 bg-white dark:bg-gray-700">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">💨</span>
                            <p className="font-bold text-gray-900 dark:text-white">
                              Changed: {new Date(change.changed_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="pl-11 space-y-1">
                            {change.substrate_type && (
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Type:</span> {change.substrate_type}
                              </div>
                            )}
                            {change.substrate_depth && (
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Depth:</span> {change.substrate_depth}
                              </div>
                            )}
                            {change.reason && (
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">Reason:</span>{' '}
                                <span className="capitalize">{change.reason.replace('_', ' ')}</span>
                              </div>
                            )}
                            {change.notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{change.notes}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteSubstrateChange(change.id)}
                          className="ml-4 px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-sm font-medium transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Husbandry Tab */}
        {activeTab === 'husbandry' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Husbandry Details</h2>
            
            {(tarantula.enclosure_type || tarantula.enclosure_size || tarantula.substrate_type || tarantula.target_temp_min || tarantula.target_humidity_min) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tarantula.enclosure_type && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Enclosure Type</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{tarantula.enclosure_type}</p>
                  </div>
                )}
                {tarantula.enclosure_size && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Enclosure Size</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{tarantula.enclosure_size}</p>
                  </div>
                )}
                {tarantula.substrate_type && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Substrate</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {tarantula.substrate_type}
                      {tarantula.substrate_depth && ` (${tarantula.substrate_depth})`}
                    </p>
                  </div>
                )}
                {tarantula.last_substrate_change && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Last Substrate Change</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{new Date(tarantula.last_substrate_change).toLocaleDateString()}</p>
                  </div>
                )}
                {(tarantula.target_temp_min || tarantula.target_temp_max) && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Target Temperature</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {tarantula.target_temp_min && `${tarantula.target_temp_min}°F`}
                      {tarantula.target_temp_min && tarantula.target_temp_max && ' - '}
                      {tarantula.target_temp_max && `${tarantula.target_temp_max}°F`}
                    </p>
                  </div>
                )}
                {(tarantula.target_humidity_min || tarantula.target_humidity_max) && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Target Humidity</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {tarantula.target_humidity_min && `${tarantula.target_humidity_min}%`}
                      {tarantula.target_humidity_min && tarantula.target_humidity_max && ' - '}
                      {tarantula.target_humidity_max && `${tarantula.target_humidity_max}%`}
                    </p>
                  </div>
                )}
                {tarantula.water_dish !== undefined && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Water Dish</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{tarantula.water_dish ? '✓ Yes' : '✗ No'}</p>
                  </div>
                )}
                {tarantula.misting_schedule && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Misting Schedule</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{tarantula.misting_schedule}</p>
                  </div>
                )}
                {tarantula.last_enclosure_cleaning && (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Last Enclosure Cleaning</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{new Date(tarantula.last_enclosure_cleaning).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <div className="text-5xl mb-3">🏠</div>
                <p>No husbandry information available</p>
                <button
                  onClick={() => router.push(`/dashboard/tarantulas/${id}/edit`)}
                  className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                >
                  Add Husbandry Details
                </button>
              </div>
            )}

            {tarantula.enclosure_notes && (
              <div className="mt-8 p-6 bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-purple-100 dark:border-purple-900">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">📝 Enclosure Notes</h3>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{tarantula.enclosure_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === 'photos' && (
          <div className="space-y-6">
            {/* Photo Upload Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📸 Photo Gallery</h2>
                <label className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium shadow-sm cursor-pointer inline-flex items-center gap-2">
                  {uploadingPhoto ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      + Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </>
                  )}
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">📷</div>
                  <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No Photos Yet</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">Start building your photo gallery by uploading your first photo</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedPhoto(photo)}
                      className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-gray-100 dark:bg-gray-700 hover:shadow-xl transition-all duration-300"
                    >
                      <img
                        src={getImageUrl(photo.thumbnail_url || photo.url)}
                        alt={photo.caption || 'Tarantula photo'}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-3xl">
                          🔍
                        </div>
                      </div>
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <p className="text-white text-xs font-medium truncate">{photo.caption}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Breeding Tab */}
        {activeTab === 'breeding' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🥚 Breeding History</h2>
                <button
                  onClick={() => router.push('/dashboard/breeding')}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium shadow-sm"
                >
                  View All Breeding
                </button>
              </div>

              {pairings.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <div className="text-6xl mb-4">🥚</div>
                  <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No Breeding History</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6">
                    This tarantula hasn't been involved in any pairings yet
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/breeding/pairings/add')}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                  >
                    + Record Pairing
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {pairings.map((pairing) => (
                    <div
                      key={pairing.id}
                      className="p-6 border border-gray-200 dark:border-gray-600 rounded-xl hover:shadow-lg hover:border-purple-200 dark:hover:border-purple-700 transition-all duration-200 bg-white dark:bg-gray-700"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-3xl">
                              {pairing.outcome === 'successful' ? '✅' :
                               pairing.outcome === 'unsuccessful' ? '❌' :
                               pairing.outcome === 'in_progress' ? '⏳' : '❓'}
                            </span>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Pairing - {new Date(pairing.paired_date).toLocaleDateString()}
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Type: <span className="capitalize">{pairing.pairing_type.replace('_', ' ')}</span>
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-12">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Paired Date</p>
                              <p className="text-sm text-gray-900 dark:text-white">{new Date(pairing.paired_date).toLocaleDateString()}</p>
                            </div>

                            {pairing.separated_date && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Separated Date</p>
                                <p className="text-sm text-gray-900 dark:text-white">{new Date(pairing.separated_date).toLocaleDateString()}</p>
                              </div>
                            )}

                            <div>
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Outcome</p>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                                pairing.outcome === 'successful' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                pairing.outcome === 'unsuccessful' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                pairing.outcome === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {pairing.outcome.replace('_', ' ')}
                              </span>
                            </div>
                          </div>

                          {pairing.notes && (
                            <div className="mt-4 pl-12 p-4 bg-gray-50 dark:bg-gray-600 rounded-lg">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Notes</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{pairing.notes}</p>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => router.push('/dashboard/breeding')}
                          className="ml-4 px-3 py-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg text-sm font-medium transition"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Link to full breeding module */}
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => router.push('/dashboard/breeding')}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition font-medium shadow-sm"
                    >
                      <span>View Full Breeding Module</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div 
            className="relative max-w-6xl w-full max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition text-2xl font-bold"
            >
              ✕ Close
            </button>

            {/* Image */}
            <div className="relative bg-black rounded-2xl overflow-hidden">
              <img
                src={getImageUrl(selectedPhoto.url)}
                alt={selectedPhoto.caption || 'Tarantula photo'}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              
              {/* Photo Info Overlay */}
              {selectedPhoto.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
                  <p className="text-white text-lg font-medium">{selectedPhoto.caption}</p>
                </div>
              )}
            </div>

            {/* Photo Actions */}
            <div className="mt-4 flex justify-between items-center text-white">
              <div className="text-sm">
                <p>Taken: {new Date(selectedPhoto.taken_at).toLocaleDateString()}</p>
                <p className="text-gray-400">Photo {photos.findIndex(p => p.id === selectedPhoto.id) + 1} of {photos.length}</p>
              </div>
              <button
                onClick={() => handleDeletePhoto(selectedPhoto.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium"
              >
                🗑️ Delete Photo
              </button>
            </div>

            {/* Navigation Arrows */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id)
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : photos.length - 1
                    setSelectedPhoto(photos[prevIndex])
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white p-4 rounded-full transition text-2xl"
                >
                  ←
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id)
                    const nextIndex = currentIndex < photos.length - 1 ? currentIndex + 1 : 0
                    setSelectedPhoto(photos[nextIndex])
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white p-4 rounded-full transition text-2xl"
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Delete Tarantula?</h2>
              <p className="text-gray-600 dark:text-gray-300">
                Are you sure you want to delete <strong>{tarantula.common_name}</strong>? 
                This will also delete all associated logs and cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  )
}
