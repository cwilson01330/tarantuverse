"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Enclosure {
  id: string
  name: string
  is_communal: boolean
  population_count: number | null
  species_id: string | null
  species_name: string | null
  enclosure_type: string | null
  enclosure_size: string | null
  substrate_type: string | null
  substrate_depth: string | null
  last_substrate_change: string | null
  target_temp_min: number | null
  target_temp_max: number | null
  target_humidity_min: number | null
  target_humidity_max: number | null
  water_dish: boolean
  misting_schedule: string | null
  notes: string | null
  photo_url: string | null
  inhabitant_count: number
  days_since_last_feeding: number | null
  created_at: string
}

interface Inhabitant {
  id: string
  name: string | null
  scientific_name: string | null
  sex: string | null
  photo_url: string | null
}

interface FeedingLog {
  id: string
  fed_at: string
  food_type: string
  food_size: string | null
  quantity: number
  accepted: boolean
  notes: string | null
}

interface MoltLog {
  id: string
  molted_at: string
  is_unidentified: boolean
  notes: string | null
  tarantula_id: string | null
}

interface SubstrateChange {
  id: string
  changed_at: string
  substrate_type: string | null
  substrate_depth: string | null
  reason: string | null
  notes: string | null
}

export default function EnclosureDetailPage() {
  const router = useRouter()
  const params = useParams()
  const enclosureId = params.id as string
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [enclosure, setEnclosure] = useState<Enclosure | null>(null)
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([])
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [substrateChanges, setSubstrateChanges] = useState<SubstrateChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'info' | 'inhabitants' | 'feedings' | 'molts' | 'substrate'>('info')

  // Feeding form
  const [showFeedingForm, setShowFeedingForm] = useState(false)
  const [feedingForm, setFeedingForm] = useState({
    food_type: '',
    food_size: '',
    quantity: '1',
    accepted: true,
    notes: '',
  })
  const [submittingFeeding, setSubmittingFeeding] = useState(false)

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchEnclosureData()
  }, [router, isAuthenticated, isLoading, token, enclosureId])

  const fetchEnclosureData = async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      // Fetch enclosure details
      const enclosureRes = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!enclosureRes.ok) throw new Error('Enclosure not found')
      const enclosureData = await enclosureRes.json()
      setEnclosure(enclosureData)

      // Fetch inhabitants
      const inhabitantsRes = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/inhabitants`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (inhabitantsRes.ok) {
        setInhabitants(await inhabitantsRes.json())
      }

      // Fetch feedings
      const feedingsRes = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/feedings`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (feedingsRes.ok) {
        setFeedings(await feedingsRes.json())
      }

      // Fetch molts
      const moltsRes = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/molts`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (moltsRes.ok) {
        setMolts(await moltsRes.json())
      }

      // Fetch substrate changes
      const substrateRes = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/substrate-changes`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (substrateRes.ok) {
        setSubstrateChanges(await substrateRes.json())
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load enclosure')
    } finally {
      setLoading(false)
    }
  }

  const handleAddFeeding = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setSubmittingFeeding(true)
    try {
      const response = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/feedings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          fed_at: new Date().toISOString(),
          food_type: feedingForm.food_type,
          food_size: feedingForm.food_size || null,
          quantity: parseInt(feedingForm.quantity) || 1,
          accepted: feedingForm.accepted,
          notes: feedingForm.notes || null,
        }),
      })

      if (!response.ok) throw new Error('Failed to add feeding')

      // Refresh data
      await fetchEnclosureData()
      setShowFeedingForm(false)
      setFeedingForm({ food_type: '', food_size: '', quantity: '1', accepted: true, notes: '' })
    } catch (err: any) {
      alert(err.message || 'Failed to add feeding')
    } finally {
      setSubmittingFeeding(false)
    }
  }

  const handleDeleteEnclosure = async () => {
    if (!confirm('Are you sure you want to delete this enclosure? All feeding and molt logs will be deleted.')) return
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!response.ok) throw new Error('Failed to delete enclosure')

      router.push('/dashboard/enclosures')
    } catch (err: any) {
      alert(err.message || 'Failed to delete enclosure')
    }
  }

  if (isLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !enclosure) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <div className="text-6xl mb-4">😞</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Enclosure Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <Link
            href="/dashboard/enclosures"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            &larr; Back to Enclosures
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard/enclosures"
            className="text-primary-600 dark:text-primary-400 hover:underline mb-4 inline-block"
          >
            &larr; Back to Enclosures
          </Link>

          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {enclosure.name}
                </h1>
                {enclosure.is_communal && (
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-sm font-medium rounded-full">
                    Communal
                  </span>
                )}
              </div>
              {enclosure.species_name && (
                <p className="text-gray-600 dark:text-gray-400 italic mt-1">
                  {enclosure.species_name}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Link
                href={`/dashboard/enclosures/${enclosureId}/edit`}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                Edit
              </Link>
              <button
                onClick={handleDeleteEnclosure}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {(['info', 'inhabitants', 'feedings', 'molts', 'substrate'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize transition ${
                activeTab === tab
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab === 'substrate' ? 'Substrate Changes' : tab}
              {tab === 'inhabitants' && ` (${inhabitants.length})`}
              {tab === 'feedings' && ` (${feedings.length})`}
              {tab === 'molts' && ` (${molts.length})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Enclosure Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Enclosure Info
              </h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-gray-900 dark:text-white capitalize">{enclosure.enclosure_type || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Size</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.enclosure_size || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Population</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.population_count || enclosure.inhabitant_count} spider(s)
                  </dd>
                </div>
              </dl>
            </div>

            {/* Climate */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Climate
              </h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Temperature</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.target_temp_min && enclosure.target_temp_max
                      ? `${enclosure.target_temp_min}-${enclosure.target_temp_max}°F`
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Humidity</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.target_humidity_min && enclosure.target_humidity_max
                      ? `${enclosure.target_humidity_min}-${enclosure.target_humidity_max}%`
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Water Dish</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.water_dish ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Misting</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.misting_schedule || '-'}</dd>
                </div>
              </dl>
            </div>

            {/* Substrate */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Substrate
              </h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.substrate_type || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Depth</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.substrate_depth || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Last Changed</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.last_substrate_change
                      ? new Date(enclosure.last_substrate_change).toLocaleDateString()
                      : '-'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Notes */}
            {enclosure.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Notes
                </h2>
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {enclosure.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'inhabitants' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Inhabitants ({inhabitants.length})
              </h2>
            </div>

            {inhabitants.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No tarantulas assigned to this enclosure yet.
                <br />
                <span className="text-sm">
                  Assign tarantulas from their individual detail pages.
                </span>
              </p>
            ) : (
              <div className="space-y-3">
                {inhabitants.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/tarantulas/${t.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center overflow-hidden">
                      {t.photo_url ? (
                        <img src={t.photo_url} alt={t.name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">🕷️</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t.name || 'Unnamed'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        {t.scientific_name}
                      </p>
                    </div>
                    {t.sex && (
                      <span className={`text-lg ${t.sex === 'female' ? 'text-pink-500' : 'text-blue-500'}`}>
                        {t.sex === 'female' ? '♀' : '♂'}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedings' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Feeding Log
              </h2>
              <button
                onClick={() => setShowFeedingForm(!showFeedingForm)}
                className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
              >
                + Add Feeding
              </button>
            </div>

            {/* Feeding Form */}
            {showFeedingForm && (
              <form onSubmit={handleAddFeeding} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <input
                    type="text"
                    placeholder="Food type (e.g., cricket)"
                    value={feedingForm.food_type}
                    onChange={(e) => setFeedingForm({ ...feedingForm, food_type: e.target.value })}
                    required
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Size (optional)"
                    value={feedingForm.food_size}
                    onChange={(e) => setFeedingForm({ ...feedingForm, food_size: e.target.value })}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={feedingForm.quantity}
                    onChange={(e) => setFeedingForm({ ...feedingForm, quantity: e.target.value })}
                    min="1"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={feedingForm.accepted}
                      onChange={(e) => setFeedingForm({ ...feedingForm, accepted: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-700 dark:text-gray-300">Accepted</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submittingFeeding}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {submittingFeeding ? 'Adding...' : 'Add Feeding'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedingForm(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {feedings.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No feeding logs yet. Add your first feeding!
              </p>
            ) : (
              <div className="space-y-3">
                {feedings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {f.quantity}x {f.food_type} {f.food_size && `(${f.food_size})`}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(f.fed_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      f.accepted
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {f.accepted ? 'Accepted' : 'Refused'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'molts' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Molt Log
              </h2>
            </div>

            {molts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No molts logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {molts.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        🦋 Molt found
                        {m.is_unidentified && ' (unidentified)'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(m.molted_at).toLocaleDateString()}
                      </p>
                      {m.notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{m.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'substrate' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Substrate Changes
              </h2>
            </div>

            {substrateChanges.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No substrate changes logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {substrateChanges.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {s.substrate_type || 'Substrate change'}
                          {s.substrate_depth && ` - ${s.substrate_depth}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(s.changed_at).toLocaleDateString()}
                          {s.reason && ` • ${s.reason}`}
                        </p>
                      </div>
                    </div>
                    {s.notes && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{s.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
