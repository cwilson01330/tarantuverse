'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import DateInput from '@/components/DateInput'

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  species_id?: string

  // Husbandry fields
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
}

export default function EditHusbandryPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()

  const [tarantula, setTarantula] = useState<Tarantula | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    enclosure_type: '',
    enclosure_size: '',
    substrate_type: '',
    substrate_depth: '',
    last_substrate_change: '',
    target_temp_min: '',
    target_temp_max: '',
    target_humidity_min: '',
    target_humidity_max: '',
    water_dish: true,
    misting_schedule: '',
    last_enclosure_cleaning: '',
    enclosure_notes: '',
  })

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
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

      // Pre-populate form with existing data
      setFormData({
        enclosure_type: data.enclosure_type || '',
        enclosure_size: data.enclosure_size || '',
        substrate_type: data.substrate_type || '',
        substrate_depth: data.substrate_depth || '',
        last_substrate_change: data.last_substrate_change || '',
        target_temp_min: data.target_temp_min || '',
        target_temp_max: data.target_temp_max || '',
        target_humidity_min: data.target_humidity_min || '',
        target_humidity_max: data.target_humidity_max || '',
        water_dish: data.water_dish !== undefined ? data.water_dish : true,
        misting_schedule: data.misting_schedule || '',
        last_enclosure_cleaning: data.last_enclosure_cleaning || '',
        enclosure_notes: data.enclosure_notes || '',
      })
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!token) {
      setError('Not authenticated')
      setLoading(false)
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      // Prepare data - convert empty strings to null
      const submitData = {
        enclosure_type: formData.enclosure_type ? formData.enclosure_type.toLowerCase() : null,
        enclosure_size: formData.enclosure_size || null,
        substrate_type: formData.substrate_type || null,
        substrate_depth: formData.substrate_depth || null,
        last_substrate_change: formData.last_substrate_change || null,
        target_temp_min: formData.target_temp_min ? parseFloat(formData.target_temp_min) : null,
        target_temp_max: formData.target_temp_max ? parseFloat(formData.target_temp_max) : null,
        target_humidity_min: formData.target_humidity_min ? parseFloat(formData.target_humidity_min) : null,
        target_humidity_max: formData.target_humidity_max ? parseFloat(formData.target_humidity_max) : null,
        water_dish: formData.water_dish,
        misting_schedule: formData.misting_schedule || null,
        last_enclosure_cleaning: formData.last_enclosure_cleaning || null,
        enclosure_notes: formData.enclosure_notes || null,
      }

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update husbandry')
      }

      // Redirect back to detail page
      router.push(`/dashboard/tarantulas/${id}`)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !tarantula || authLoading) {
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
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <button
              onClick={() => router.push(`/dashboard/tarantulas/${id}`)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Back to Tarantula
            </button>
          </div>
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
            {error}
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
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push(`/dashboard/tarantulas/${id}`)}
            className="text-theme-secondary hover:text-theme-primary transition-colors"
          >
            ← Back to {tarantula?.common_name}
          </button>
        </div>

        <h1 className="text-4xl font-bold mb-2">Edit Husbandry</h1>
        <p className="text-xl text-theme-secondary mb-8">{tarantula?.common_name} - {tarantula?.scientific_name}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Enclosure Section */}
          <div className="bg-surface border border-theme rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Enclosure Setup</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Enclosure Type</label>
                <select
                  value={formData.enclosure_type}
                  onChange={(e) => setFormData({ ...formData, enclosure_type: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                >
                  <option value="">Select...</option>
                  <option value="terrestrial">Terrestrial</option>
                  <option value="arboreal">Arboreal</option>
                  <option value="fossorial">Fossorial</option>
                </select>
                <p className="text-xs text-theme-tertiary mt-1">Ground-dwelling, tree-dwelling, or burrowing</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Enclosure Size</label>
                <input
                  type="text"
                  value={formData.enclosure_size}
                  onChange={(e) => setFormData({ ...formData, enclosure_size: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="e.g., 10x10x12 inches"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Last Enclosure Cleaning</label>
                <DateInput
                  value={formData.last_enclosure_cleaning}
                  onChange={(value) => setFormData({ ...formData, last_enclosure_cleaning: value })}
                />
              </div>
            </div>
          </div>

          {/* Substrate Section */}
          <div className="bg-surface border border-theme rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Substrate</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Substrate Type</label>
                <input
                  type="text"
                  value={formData.substrate_type}
                  onChange={(e) => setFormData({ ...formData, substrate_type: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="e.g., Coco fiber, peat moss, mix"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Substrate Depth</label>
                <input
                  type="text"
                  value={formData.substrate_depth}
                  onChange={(e) => setFormData({ ...formData, substrate_depth: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="e.g., 3 inches, 5-6 inches"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Last Substrate Change</label>
                <DateInput
                  value={formData.last_substrate_change}
                  onChange={(value) => setFormData({ ...formData, last_substrate_change: value })}
                />
              </div>
            </div>
          </div>

          {/* Climate Section */}
          <div className="bg-surface border border-theme rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Climate Control</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Temp Min (°F)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.target_temp_min}
                    onChange={(e) => setFormData({ ...formData, target_temp_min: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="70"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Temp Max (°F)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.target_temp_max}
                    onChange={(e) => setFormData({ ...formData, target_temp_max: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="80"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Humidity Min (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.target_humidity_min}
                    onChange={(e) => setFormData({ ...formData, target_humidity_min: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Humidity Max (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.target_humidity_max}
                    onChange={(e) => setFormData({ ...formData, target_humidity_max: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="75"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Maintenance Section */}
          <div className="bg-surface border border-theme rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Maintenance</h2>

            <div className="space-y-4">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.water_dish}
                    onChange={(e) => setFormData({ ...formData, water_dish: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-theme rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium">Water Dish Present</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Misting Schedule</label>
                <input
                  type="text"
                  value={formData.misting_schedule}
                  onChange={(e) => setFormData({ ...formData, misting_schedule: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="e.g., 2x per week, Daily, As needed"
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="bg-surface border border-theme rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Enclosure Notes</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.enclosure_notes}
                onChange={(e) => setFormData({ ...formData, enclosure_notes: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                placeholder="Decorations, hides, modifications, special setup details..."
              />
              <p className="text-xs text-theme-tertiary mt-1">
                Document hides, decorations, modifications, or any special setup details
              </p>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Saving...' : 'Save Husbandry Info'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/tarantulas/${id}`)}
              className="px-6 py-3 border border-theme rounded-xl hover:bg-surface-elevated transition text-theme-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
