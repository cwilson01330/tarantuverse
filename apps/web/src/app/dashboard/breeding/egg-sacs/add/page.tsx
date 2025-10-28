"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Pairing {
  id: string
  male_id: string
  female_id: string
  paired_date: string
  pairing_type: string
  outcome: string
}

export default function AddEggSacPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    pairing_id: '',
    laid_date: new Date().toISOString().split('T')[0],
    pulled_date: '',
    hatch_date: '',
    incubation_temp_min: '',
    incubation_temp_max: '',
    incubation_humidity_min: '',
    incubation_humidity_max: '',
    spiderling_count: '',
    viable_count: '',
    notes: '',
    photo_url: '',
  })

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchPairings()
  }, [router, isAuthenticated, isLoading, token])

  const fetchPairings = async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/v1/pairings/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch pairings')
      }

      const data = await response.json()
      setPairings(data)
    } catch (err) {
      console.error('Error fetching pairings:', err)
      setError('Failed to load pairings')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      setError('Not authenticated')
      return
    }

    if (!formData.pairing_id) {
      setError('Please select a pairing')
      return
    }

    try {
      setLoading(true)
      setError('')

      const submitData = {
        pairing_id: formData.pairing_id,
        laid_date: formData.laid_date,
        pulled_date: formData.pulled_date || null,
        hatch_date: formData.hatch_date || null,
        incubation_temp_min: formData.incubation_temp_min ? parseInt(formData.incubation_temp_min) : null,
        incubation_temp_max: formData.incubation_temp_max ? parseInt(formData.incubation_temp_max) : null,
        incubation_humidity_min: formData.incubation_humidity_min ? parseInt(formData.incubation_humidity_min) : null,
        incubation_humidity_max: formData.incubation_humidity_max ? parseInt(formData.incubation_humidity_max) : null,
        spiderling_count: formData.spiderling_count ? parseInt(formData.spiderling_count) : null,
        viable_count: formData.viable_count ? parseInt(formData.viable_count) : null,
        notes: formData.notes || null,
        photo_url: formData.photo_url || null,
      }

      const response = await fetch(`${API_URL}/api/v1/egg-sacs/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create egg sac')
      }

      // Success - redirect to breeding page
      router.push('/dashboard/breeding')
    } catch (err: any) {
      console.error('Error creating egg sac:', err)
      setError(err.message || 'Failed to create egg sac')
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-900 dark:text-white">Loading...</p>
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/breeding"
            className="text-green-600 dark:text-green-400 hover:underline mb-4 inline-block"
          >
            ← Back to Breeding
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">New Egg Sac</h1>
          <p className="text-gray-600 dark:text-gray-400">Record an egg sac from a pairing</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Check if user has pairings */}
        {pairings.length === 0 ? (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">No Pairings Found</h3>
            <p className="text-yellow-800 dark:text-yellow-300 mb-4">
              You need to create at least one pairing before recording an egg sac.
            </p>
            <Link
              href="/dashboard/breeding/pairings/add"
              className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
            >
              Create Pairing
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            {/* Pairing Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pairing *
              </label>
              <select
                value={formData.pairing_id}
                onChange={(e) => setFormData({...formData, pairing_id: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select a pairing...</option>
                {pairings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {new Date(p.paired_date).toLocaleDateString()} - {p.pairing_type} ({p.outcome})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Laid Date *
                </label>
                <input
                  type="date"
                  value={formData.laid_date}
                  onChange={(e) => setFormData({...formData, laid_date: e.target.value})}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Pulled Date
                </label>
                <input
                  type="date"
                  value={formData.pulled_date}
                  onChange={(e) => setFormData({...formData, pulled_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hatch Date
                </label>
                <input
                  type="date"
                  value={formData.hatch_date}
                  onChange={(e) => setFormData({...formData, hatch_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Incubation Temperature */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Incubation Temperature (°F)</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Minimum
                  </label>
                  <input
                    type="number"
                    value={formData.incubation_temp_min}
                    onChange={(e) => setFormData({...formData, incubation_temp_min: e.target.value})}
                    placeholder="70"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Maximum
                  </label>
                  <input
                    type="number"
                    value={formData.incubation_temp_max}
                    onChange={(e) => setFormData({...formData, incubation_temp_max: e.target.value})}
                    placeholder="80"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Incubation Humidity */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Incubation Humidity (%)</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Minimum
                  </label>
                  <input
                    type="number"
                    value={formData.incubation_humidity_min}
                    onChange={(e) => setFormData({...formData, incubation_humidity_min: e.target.value})}
                    placeholder="70"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Maximum
                  </label>
                  <input
                    type="number"
                    value={formData.incubation_humidity_max}
                    onChange={(e) => setFormData({...formData, incubation_humidity_max: e.target.value})}
                    placeholder="80"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Spiderling Count
                </label>
                <input
                  type="number"
                  value={formData.spiderling_count}
                  onChange={(e) => setFormData({...formData, spiderling_count: e.target.value})}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Viable Count
                </label>
                <input
                  type="number"
                  value={formData.viable_count}
                  onChange={(e) => setFormData({...formData, viable_count: e.target.value})}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Photo URL */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Photo URL
              </label>
              <input
                type="url"
                value={formData.photo_url}
                onChange={(e) => setFormData({...formData, photo_url: e.target.value})}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={4}
                placeholder="Any observations about the egg sac..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Egg Sac'}
              </button>
              <Link
                href="/dashboard/breeding"
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  )
}
