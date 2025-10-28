"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface EggSac {
  id: string
  pairing_id: string
  laid_date: string
  spiderling_count: number | null
}

interface Tarantula {
  id: string
  name: string
  common_name: string
  scientific_name: string
}

export default function AddOffspringPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [eggSacs, setEggSacs] = useState<EggSac[]>([])
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    egg_sac_id: '',
    tarantula_id: '',
    status: 'unknown',
    status_date: '',
    buyer_info: '',
    price_sold: '',
    notes: '',
  })

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchData()
  }, [router, isAuthenticated, isLoading, token])

  const fetchData = async () => {
    if (!token) return

    try {
      // Fetch egg sacs
      const eggSacsRes = await fetch(`${API_URL}/api/v1/egg-sacs/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (eggSacsRes.ok) {
        const data = await eggSacsRes.json()
        setEggSacs(data)
      }

      // Fetch tarantulas (for linking if kept in collection)
      const tarantulasRes = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (tarantulasRes.ok) {
        const data = await tarantulasRes.json()
        setTarantulas(data)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      setError('Not authenticated')
      return
    }

    if (!formData.egg_sac_id) {
      setError('Please select an egg sac')
      return
    }

    try {
      setLoading(true)
      setError('')

      const submitData = {
        egg_sac_id: formData.egg_sac_id,
        tarantula_id: formData.tarantula_id || null,
        status: formData.status,
        status_date: formData.status_date || null,
        buyer_info: formData.buyer_info || null,
        price_sold: formData.price_sold ? parseFloat(formData.price_sold) : null,
        notes: formData.notes || null,
      }

      const response = await fetch(`${API_URL}/api/v1/offspring/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create offspring record')
      }

      // Success - redirect to breeding page
      router.push('/dashboard/breeding')
    } catch (err: any) {
      console.error('Error creating offspring:', err)
      setError(err.message || 'Failed to create offspring record')
      setLoading(false)
    }
  }

  const showBuyerFields = formData.status === 'sold' || formData.status === 'traded' || formData.status === 'given_away'
  const showTarantulaLink = formData.status === 'kept'

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
            className="text-purple-600 dark:text-purple-400 hover:underline mb-4 inline-block"
          >
            ← Back to Breeding
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">New Offspring</h1>
          <p className="text-gray-600 dark:text-gray-400">Track individual spiderlings</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Check if user has egg sacs */}
        {eggSacs.length === 0 ? (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">No Egg Sacs Found</h3>
            <p className="text-yellow-800 dark:text-yellow-300 mb-4">
              You need to create at least one egg sac before recording offspring.
            </p>
            <Link
              href="/dashboard/breeding/egg-sacs/add"
              className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
            >
              Create Egg Sac
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            {/* Egg Sac Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Egg Sac *
              </label>
              <select
                value={formData.egg_sac_id}
                onChange={(e) => setFormData({...formData, egg_sac_id: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select an egg sac...</option>
                {eggSacs.map((sac) => (
                  <option key={sac.id} value={sac.id}>
                    {new Date(sac.laid_date).toLocaleDateString()} {sac.spiderling_count ? `(${sac.spiderling_count} spiderlings)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status *
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="unknown">Unknown</option>
                <option value="kept">Kept (in collection)</option>
                <option value="sold">Sold</option>
                <option value="traded">Traded</option>
                <option value="given_away">Given Away</option>
                <option value="died">Died</option>
              </select>
            </div>

            {/* Link to Tarantula (if kept) */}
            {showTarantulaLink && (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Link to Tarantula in Collection
                </label>
                <select
                  value={formData.tarantula_id}
                  onChange={(e) => setFormData({...formData, tarantula_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">None (optional)</option>
                  {tarantulas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.common_name || t.scientific_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  Link this offspring to an existing tarantula record in your collection
                </p>
              </div>
            )}

            {/* Status Date */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status Date
              </label>
              <input
                type="date"
                value={formData.status_date}
                onChange={(e) => setFormData({...formData, status_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Buyer Information (if sold/traded/given away) */}
            {showBuyerFields && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Transaction Details</h3>

                {/* Buyer Info */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {formData.status === 'sold' ? 'Buyer' : formData.status === 'traded' ? 'Traded With' : 'Given To'}
                  </label>
                  <input
                    type="text"
                    value={formData.buyer_info}
                    onChange={(e) => setFormData({...formData, buyer_info: e.target.value})}
                    placeholder="Name, contact info, etc."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                {/* Price (if sold) */}
                {formData.status === 'sold' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Price Sold ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price_sold}
                      onChange={(e) => setFormData({...formData, price_sold: e.target.value})}
                      placeholder="0.00"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={4}
                placeholder="Any notes about this offspring..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Offspring Record'}
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
