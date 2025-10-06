'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  source?: string
  price_paid?: number
  notes?: string
  photo_url?: string
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

export default function TarantulaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [tarantula, setTarantula] = useState<Tarantula | null>(null)
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showFeedingForm, setShowFeedingForm] = useState(false)
  const [feedingFormData, setFeedingFormData] = useState({
    fed_at: new Date().toISOString().slice(0, 16),
    food_type: '',
    food_size: '',
    accepted: true,
    notes: '',
  })

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
    fetchFeedings(token)
  }, [id, router])

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
      const token = localStorage.getItem('auth_token')
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
      fetchFeedings(token!)
    } catch (err: any) {
      setError(err.message || 'Failed to add feeding')
    }
  }

  const handleDeleteFeeding = async (feedingId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
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

      fetchFeedings(token!)
    } catch (err: any) {
      setError(err.message || 'Failed to delete feeding')
    }
  }

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('auth_token')
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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (error && !tarantula) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Dashboard
            </button>
          </div>
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (!tarantula) {
    return null
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Dashboard
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold mb-2">{tarantula.common_name}</h1>
                <p className="text-xl italic text-gray-600">{tarantula.scientific_name}</p>
              </div>
              {tarantula.photo_url ? (
                <img
                  src={tarantula.photo_url}
                  alt={tarantula.common_name}
                  className="w-32 h-32 object-cover rounded-lg"
                />
              ) : (
                <div className="text-8xl">🕷️</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {tarantula.sex && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Sex</h3>
                  <p className="text-lg capitalize">{tarantula.sex}</p>
                </div>
              )}

              {tarantula.date_acquired && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Acquired</h3>
                  <p className="text-lg">{new Date(tarantula.date_acquired).toLocaleDateString()}</p>
                </div>
              )}

              {tarantula.source && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Source</h3>
                  <p className="text-lg capitalize">{tarantula.source.replace('_', ' ')}</p>
                </div>
              )}

              {tarantula.price_paid !== null && tarantula.price_paid !== undefined && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Price Paid</h3>
                  <p className="text-lg">${parseFloat(String(tarantula.price_paid)).toFixed(2)}</p>
                </div>
              )}
            </div>

            {tarantula.notes && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{tarantula.notes}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Feeding Logs</h3>
                <button
                  onClick={() => setShowFeedingForm(!showFeedingForm)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                >
                  {showFeedingForm ? 'Cancel' : '+ Add Feeding'}
                </button>
              </div>

              {showFeedingForm && (
                <form onSubmit={handleAddFeeding} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={feedingFormData.fed_at}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, fed_at: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Food Type</label>
                      <input
                        type="text"
                        value={feedingFormData.food_type}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, food_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                        placeholder="e.g., Cricket, Roach"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Food Size</label>
                      <select
                        value={feedingFormData.food_size}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, food_size: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      >
                        <option value="">Select...</option>
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Accepted?</label>
                      <select
                        value={feedingFormData.accepted ? 'true' : 'false'}
                        onChange={(e) => setFeedingFormData({ ...feedingFormData, accepted: e.target.value === 'true' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      value={feedingFormData.notes}
                      onChange={(e) => setFeedingFormData({ ...feedingFormData, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      placeholder="Optional notes..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                  >
                    Save Feeding Log
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {feedings.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No feeding logs yet</p>
                ) : (
                  feedings.map((feeding) => (
                    <div key={feeding.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">
                              {new Date(feeding.fed_at).toLocaleDateString()} at {new Date(feeding.fed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className={`px-2 py-0.5 rounded text-xs ${feeding.accepted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {feeding.accepted ? 'Accepted' : 'Refused'}
                            </span>
                          </div>
                          {feeding.food_type && (
                            <p className="text-sm text-gray-600">
                              {feeding.food_type}
                              {feeding.food_size && ` (${feeding.food_size})`}
                            </p>
                          )}
                          {feeding.notes && (
                            <p className="text-sm text-gray-500 mt-1">{feeding.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteFeeding(feeding.id)}
                          className="ml-4 text-red-600 hover:text-red-800 text-sm"
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

          <div className="bg-gray-50 px-8 py-4 flex gap-4">
            <button
              onClick={() => router.push(`/dashboard/tarantulas/${id}/edit`)}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              Edit
            </button>

            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="px-6 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition"
              >
                Delete
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-600">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
