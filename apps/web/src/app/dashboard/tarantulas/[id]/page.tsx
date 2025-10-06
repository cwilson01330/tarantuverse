'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

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

export default function TarantulaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [tarantula, setTarantula] = useState<Tarantula | null>(null)
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showFeedingForm, setShowFeedingForm] = useState(false)
  const [showMoltForm, setShowMoltForm] = useState(false)
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

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
    fetchFeedings(token)
    fetchMolts(token)
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
      const token = localStorage.getItem('auth_token')
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
      fetchMolts(token!)
    } catch (err: any) {
      setError(err.message || 'Failed to add molt')
    }
  }

  const handleDeleteMolt = async (moltId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
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

      fetchMolts(token!)
    } catch (err: any) {
      setError(err.message || 'Failed to delete molt')
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
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-2">{tarantula.common_name}</h1>
                <p className="text-xl italic text-gray-600">{tarantula.scientific_name}</p>
                {tarantula.species_id && (
                  <button
                    onClick={() => router.push(`/species/${tarantula.species_id}`)}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm inline-flex items-center gap-2"
                  >
                    📖 View Care Sheet
                  </button>
                )}
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
                  <p className="text-lg text-gray-900 capitalize">{tarantula.sex}</p>
                </div>
              )}

              {tarantula.date_acquired && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Acquired</h3>
                  <p className="text-lg text-gray-900">{new Date(tarantula.date_acquired).toLocaleDateString()}</p>
                </div>
              )}

              {tarantula.source && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Source</h3>
                  <p className="text-lg text-gray-900 capitalize">{tarantula.source.replace('_', ' ')}</p>
                </div>
              )}

              {tarantula.price_paid !== null && tarantula.price_paid !== undefined && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Price Paid</h3>
                  <p className="text-lg text-gray-900">${parseFloat(String(tarantula.price_paid)).toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* Husbandry Section */}
            {(tarantula.enclosure_type || tarantula.enclosure_size || tarantula.substrate_type || tarantula.target_temp_min || tarantula.target_humidity_min) && (
              <div className="mb-8 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold mb-4">Husbandry Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {tarantula.enclosure_type && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Enclosure Type</h4>
                      <p className="text-lg text-gray-900 capitalize">{tarantula.enclosure_type}</p>
                    </div>
                  )}
                  {tarantula.enclosure_size && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Enclosure Size</h4>
                      <p className="text-lg text-gray-900">{tarantula.enclosure_size}</p>
                    </div>
                  )}
                  {tarantula.substrate_type && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Substrate</h4>
                      <p className="text-lg text-gray-900">
                        {tarantula.substrate_type}
                        {tarantula.substrate_depth && ` (${tarantula.substrate_depth})`}
                      </p>
                    </div>
                  )}
                  {tarantula.last_substrate_change && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Last Substrate Change</h4>
                      <p className="text-lg text-gray-900">{new Date(tarantula.last_substrate_change).toLocaleDateString()}</p>
                    </div>
                  )}
                  {(tarantula.target_temp_min || tarantula.target_temp_max) && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Target Temperature</h4>
                      <p className="text-lg text-gray-900">
                        {tarantula.target_temp_min && `${tarantula.target_temp_min}°F`}
                        {tarantula.target_temp_min && tarantula.target_temp_max && ' - '}
                        {tarantula.target_temp_max && `${tarantula.target_temp_max}°F`}
                      </p>
                    </div>
                  )}
                  {(tarantula.target_humidity_min || tarantula.target_humidity_max) && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Target Humidity</h4>
                      <p className="text-lg text-gray-900">
                        {tarantula.target_humidity_min && `${tarantula.target_humidity_min}%`}
                        {tarantula.target_humidity_min && tarantula.target_humidity_max && ' - '}
                        {tarantula.target_humidity_max && `${tarantula.target_humidity_max}%`}
                      </p>
                    </div>
                  )}
                  {tarantula.water_dish !== undefined && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Water Dish</h4>
                      <p className="text-lg text-gray-900">{tarantula.water_dish ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                  {tarantula.misting_schedule && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Misting Schedule</h4>
                      <p className="text-lg text-gray-900">{tarantula.misting_schedule}</p>
                    </div>
                  )}
                  {tarantula.last_enclosure_cleaning && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 uppercase mb-1">Last Enclosure Cleaning</h4>
                      <p className="text-lg text-gray-900">{new Date(tarantula.last_enclosure_cleaning).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                {tarantula.enclosure_notes && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Enclosure Notes</h4>
                    <p className="text-gray-700 whitespace-pre-wrap">{tarantula.enclosure_notes}</p>
                  </div>
                )}
              </div>
            )}

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
                            <p className="font-semibold text-gray-900">
                              {new Date(feeding.fed_at).toLocaleDateString()} at {new Date(feeding.fed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className={`px-2 py-0.5 rounded text-xs ${feeding.accepted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {feeding.accepted ? 'Accepted' : 'Refused'}
                            </span>
                          </div>
                          {feeding.food_type && (
                            <p className="text-sm text-gray-700">
                              {feeding.food_type}
                              {feeding.food_size && ` (${feeding.food_size})`}
                            </p>
                          )}
                          {feeding.notes && (
                            <p className="text-sm text-gray-600 mt-1">{feeding.notes}</p>
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

            {/* Molt Logs Section */}
            <div className="border-t border-gray-200 pt-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Molt Logs</h3>
                <button
                  onClick={() => setShowMoltForm(!showMoltForm)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                >
                  {showMoltForm ? 'Cancel' : '+ Add Molt'}
                </button>
              </div>

              {showMoltForm && (
                <form onSubmit={handleAddMolt} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Molt Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={moltFormData.molted_at}
                        onChange={(e) => setMoltFormData({ ...moltFormData, molted_at: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Premolt Started</label>
                      <input
                        type="datetime-local"
                        value={moltFormData.premolt_started_at}
                        onChange={(e) => setMoltFormData({ ...moltFormData, premolt_started_at: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Leg Span Before (inches)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.leg_span_before}
                        onChange={(e) => setMoltFormData({ ...moltFormData, leg_span_before: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Leg Span After (inches)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.leg_span_after}
                        onChange={(e) => setMoltFormData({ ...moltFormData, leg_span_after: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Weight Before (grams)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.weight_before}
                        onChange={(e) => setMoltFormData({ ...moltFormData, weight_before: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Weight After (grams)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={moltFormData.weight_after}
                        onChange={(e) => setMoltFormData({ ...moltFormData, weight_after: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Molt Photo URL</label>
                    <input
                      type="url"
                      value={moltFormData.image_url}
                      onChange={(e) => setMoltFormData({ ...moltFormData, image_url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      placeholder="https://example.com/molt-photo.jpg"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      value={moltFormData.notes}
                      onChange={(e) => setMoltFormData({ ...moltFormData, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                      placeholder="Optional notes about the molt..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                  >
                    Save Molt Log
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {molts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No molt logs yet</p>
                ) : (
                  molts.map((molt) => (
                    <div key={molt.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="mb-2">
                            <p className="font-semibold text-gray-900">
                              Molted: {new Date(molt.molted_at).toLocaleDateString()} at {new Date(molt.molted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {molt.premolt_started_at && (
                              <p className="text-sm text-gray-600">
                                Premolt started: {new Date(molt.premolt_started_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          {(molt.leg_span_before || molt.leg_span_after) && (
                            <div className="text-sm text-gray-700 mb-1">
                              <span className="font-medium">Leg span:</span>{' '}
                              {molt.leg_span_before && `${molt.leg_span_before}"`}
                              {molt.leg_span_before && molt.leg_span_after && ' → '}
                              {molt.leg_span_after && `${molt.leg_span_after}"`}
                            </div>
                          )}
                          {(molt.weight_before || molt.weight_after) && (
                            <div className="text-sm text-gray-700 mb-1">
                              <span className="font-medium">Weight:</span>{' '}
                              {molt.weight_before && `${molt.weight_before}g`}
                              {molt.weight_before && molt.weight_after && ' → '}
                              {molt.weight_after && `${molt.weight_after}g`}
                            </div>
                          )}
                          {molt.notes && (
                            <p className="text-sm text-gray-600 mt-2">{molt.notes}</p>
                          )}
                          {molt.image_url && (
                            <img
                              src={molt.image_url}
                              alt="Molt photo"
                              className="mt-2 w-32 h-32 object-cover rounded-lg"
                            />
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteMolt(molt.id)}
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
