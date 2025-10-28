"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Tarantula {
  id: string
  name: string
  common_name: string
  scientific_name: string
  sex: string
}

export default function AddPairingPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    male_id: '',
    female_id: '',
    paired_date: new Date().toISOString().split('T')[0],
    separated_date: '',
    pairing_type: 'natural',
    outcome: 'in_progress',
    notes: '',
  })

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchTarantulas()
  }, [router, isAuthenticated, isLoading, token])

  const fetchTarantulas = async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tarantulas')
      }

      const data = await response.json()
      setTarantulas(data)
    } catch (err) {
      console.error('Error fetching tarantulas:', err)
      setError('Failed to load tarantulas')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      setError('Not authenticated')
      return
    }

    if (!formData.male_id || !formData.female_id) {
      setError('Please select both male and female tarantulas')
      return
    }

    try {
      setLoading(true)
      setError('')

      const submitData = {
        ...formData,
        separated_date: formData.separated_date || null,
      }

      const response = await fetch(`${API_URL}/api/v1/pairings/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create pairing')
      }

      // Success - redirect to breeding page
      router.push('/dashboard/breeding')
    } catch (err: any) {
      console.error('Error creating pairing:', err)
      setError(err.message || 'Failed to create pairing')
      setLoading(false)
    }
  }

  const males = tarantulas.filter(t => t.sex === 'male')
  const females = tarantulas.filter(t => t.sex === 'female')

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
            className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block"
          >
            ← Back to Breeding
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">New Pairing</h1>
          <p className="text-gray-600 dark:text-gray-400">Record a breeding pairing</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Check if user has male and female tarantulas */}
        {males.length === 0 || females.length === 0 ? (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">Missing Tarantulas</h3>
            <p className="text-yellow-800 dark:text-yellow-300 mb-4">
              You need at least one male and one female tarantula in your collection to record a pairing.
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Males: {males.length} | Females: {females.length}
            </p>
            <Link
              href="/dashboard/tarantulas/add"
              className="mt-4 inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
            >
              Add Tarantula
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            {/* Male Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Male Tarantula *
              </label>
              <select
                value={formData.male_id}
                onChange={(e) => setFormData({...formData, male_id: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select a male...</option>
                {males.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.common_name || t.scientific_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Female Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Female Tarantula *
              </label>
              <select
                value={formData.female_id}
                onChange={(e) => setFormData({...formData, female_id: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select a female...</option>
                {females.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.common_name || t.scientific_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Paired Date */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Paired Date *
              </label>
              <input
                type="date"
                value={formData.paired_date}
                onChange={(e) => setFormData({...formData, paired_date: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Separated Date */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Separated Date
              </label>
              <input
                type="date"
                value={formData.separated_date}
                onChange={(e) => setFormData({...formData, separated_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Pairing Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pairing Type *
              </label>
              <select
                value={formData.pairing_type}
                onChange={(e) => setFormData({...formData, pairing_type: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="natural">Natural</option>
                <option value="assisted">Assisted</option>
                <option value="forced">Forced</option>
              </select>
            </div>

            {/* Outcome */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Outcome *
              </label>
              <select
                value={formData.outcome}
                onChange={(e) => setFormData({...formData, outcome: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="in_progress">In Progress</option>
                <option value="successful">Successful</option>
                <option value="unsuccessful">Unsuccessful</option>
                <option value="unknown">Unknown</option>
              </select>
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
                placeholder="Any observations or notes about this pairing..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Pairing'}
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
