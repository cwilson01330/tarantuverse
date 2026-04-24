"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate, toISODateLocal } from '@/lib/date'

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

interface Incident {
  id: string
  incident_type: string
  severity: string | null
  occurred_at: string
  tarantula_id: string | null
  tarantula_name: string | null
  description: string | null
  outcome: string | null
  created_at: string
}

const INCIDENT_TYPES = [
  { value: 'aggression', label: 'Aggression', emoji: '⚠️', color: 'red' },
  { value: 'cannibalism_attempt', label: 'Cannibalism Attempt', emoji: '💀', color: 'red' },
  { value: 'injury', label: 'Injury', emoji: '🩹', color: 'orange' },
  { value: 'death', label: 'Death', emoji: '✝️', color: 'gray' },
  { value: 'removal', label: 'Removal', emoji: '📤', color: 'indigo' },
  { value: 'addition', label: 'Addition', emoji: '📥', color: 'green' },
  { value: 'escape', label: 'Escape', emoji: '🏃', color: 'yellow' },
  { value: 'molt_found', label: 'Molt Found', emoji: '✨', color: 'purple' },
  { value: 'observation', label: 'Observation', emoji: '👁️', color: 'blue' },
]

const SEVERITY_TYPES = ['aggression', 'cannibalism_attempt', 'injury']

const incidentBadgeClasses: Record<string, string> = {
  aggression: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cannibalism_attempt: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  injury: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  death: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  removal: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  addition: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  escape: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-600',
  molt_found: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  observation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const severityBadgeClasses: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  moderate: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  severe: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

type TabType = 'info' | 'inhabitants' | 'feedings' | 'molts' | 'substrate' | 'incidents'

export default function EnclosureDetailPage() {
  const router = useRouter()
  const params = useParams()
  const enclosureId = params.id as string
  const { token, isAuthenticated, isLoading } = useAuth()

  const [enclosure, setEnclosure] = useState<Enclosure | null>(null)
  const [inhabitants, setInhabitants] = useState<Inhabitant[]>([])
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [substrateChanges, setSubstrateChanges] = useState<SubstrateChange[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('info')

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

  // Incident form
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentForm, setIncidentForm] = useState({
    incident_type: 'aggression',
    severity: 'minor',
    description: '',
    outcome: '',
  })
  const [submittingIncident, setSubmittingIncident] = useState(false)

  // Population edit
  const [editingPopulation, setEditingPopulation] = useState(false)
  const [populationInput, setPopulationInput] = useState('')

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
      const [enclosureRes, inhabitantsRes, feedingsRes, moltsRes, substrateRes, incidentsRes] =
        await Promise.all([
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/inhabitants`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/feedings`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/molts`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/substrate-changes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/incidents`, { headers: { Authorization: `Bearer ${token}` } }),
        ])

      if (!enclosureRes.ok) throw new Error('Enclosure not found')
      const enclosureData = await enclosureRes.json()
      setEnclosure(enclosureData)

      if (inhabitantsRes.ok) setInhabitants(await inhabitantsRes.json())
      if (feedingsRes.ok) setFeedings(await feedingsRes.json())
      if (moltsRes.ok) setMolts(await moltsRes.json())
      if (substrateRes.ok) setSubstrateChanges(await substrateRes.json())
      if (incidentsRes.ok) setIncidents(await incidentsRes.json())
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
      const res = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/feedings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fed_at: new Date().toISOString(),
          food_type: feedingForm.food_type,
          food_size: feedingForm.food_size || null,
          quantity: parseInt(feedingForm.quantity) || 1,
          accepted: feedingForm.accepted,
          notes: feedingForm.notes || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to add feeding')
      await fetchEnclosureData()
      setShowFeedingForm(false)
      setFeedingForm({ food_type: '', food_size: '', quantity: '1', accepted: true, notes: '' })
    } catch (err: any) {
      alert(err.message || 'Failed to add feeding')
    } finally {
      setSubmittingFeeding(false)
    }
  }

  const handleLogIncident = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmittingIncident(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          incident_type: incidentForm.incident_type,
          severity: SEVERITY_TYPES.includes(incidentForm.incident_type) ? incidentForm.severity : null,
          occurred_at: toISODateLocal(new Date()),
          description: incidentForm.description || null,
          outcome: incidentForm.outcome || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to log incident')
      const newIncident = await res.json()
      setIncidents((prev) => [newIncident, ...prev])
      setShowIncidentForm(false)
      setIncidentForm({ incident_type: 'aggression', severity: 'minor', description: '', outcome: '' })
    } catch (err: any) {
      alert(err.message || 'Failed to log incident')
    } finally {
      setSubmittingIncident(false)
    }
  }

  const handleDeleteIncident = async (incidentId: string) => {
    if (!confirm('Delete this incident log?')) return
    if (!token) return
    try {
      await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}/incidents/${incidentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setIncidents((prev) => prev.filter((i) => i.id !== incidentId))
    } catch {
      alert('Failed to delete incident')
    }
  }

  const handleUpdatePopulation = async () => {
    const count = parseInt(populationInput)
    if (isNaN(count) || count < 0) {
      alert('Please enter a valid number')
      return
    }
    if (!token) return
    try {
      await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ population_count: count }),
      })
      setEnclosure((prev) => prev ? { ...prev, population_count: count } : prev)
      setEditingPopulation(false)
    } catch {
      alert('Failed to update population count')
    }
  }

  const handleDeleteEnclosure = async () => {
    if (!confirm('Are you sure you want to delete this enclosure? All feeding and molt logs will be deleted.')) return
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to delete enclosure')
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Enclosure Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <Link href="/dashboard/enclosures" className="text-primary-600 dark:text-primary-400 hover:underline">
            &larr; Back to Enclosures
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const untrackedCount =
    enclosure.is_communal && enclosure.population_count !== null
      ? Math.max(0, enclosure.population_count - inhabitants.length)
      : 0

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'info', label: 'Info' },
    { key: 'inhabitants', label: 'Members', count: inhabitants.length },
    { key: 'feedings', label: 'Feedings', count: feedings.length },
    { key: 'molts', label: 'Molts', count: molts.length },
    { key: 'substrate', label: 'Substrate' },
    ...(enclosure.is_communal
      ? [{ key: 'incidents' as TabType, label: 'Incidents', count: incidents.length }]
      : []),
  ]

  const getIncidentMeta = (type: string) =>
    INCIDENT_TYPES.find((t) => t.value === type) ?? INCIDENT_TYPES[8]

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
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{enclosure.name}</h1>
                {enclosure.is_communal && (
                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-sm font-semibold rounded-full">
                    🏘️ Communal
                  </span>
                )}
                {enclosure.is_communal && incidents.length > 0 && (
                  <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm font-medium rounded-full">
                    {incidents.length} incident{incidents.length !== 1 ? 's' : ''} logged
                  </span>
                )}
              </div>
              {enclosure.species_name && (
                <p className="text-gray-600 dark:text-gray-400 italic mt-1">{enclosure.species_name}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span>
                  👥{' '}
                  {enclosure.is_communal
                    ? `${enclosure.population_count ?? inhabitants.length} total`
                    : `${inhabitants.length} spider${inhabitants.length !== 1 ? 's' : ''}`}
                </span>
                {enclosure.days_since_last_feeding !== null && (
                  <span
                    className={
                      enclosure.days_since_last_feeding >= 21
                        ? 'text-red-500'
                        : enclosure.days_since_last_feeding >= 14
                        ? 'text-orange-500'
                        : enclosure.days_since_last_feeding >= 7
                        ? 'text-yellow-500'
                        : 'text-green-500'
                    }
                  >
                    🍗 Fed {enclosure.days_since_last_feeding}d ago
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
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
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 font-medium whitespace-nowrap transition ${
                activeTab === tab.key
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Info Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Enclosure Info</h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-gray-900 dark:text-white capitalize">{enclosure.enclosure_type || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Size</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.enclosure_size || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Population</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.is_communal
                      ? `${enclosure.population_count ?? inhabitants.length} total (${inhabitants.length} tracked)`
                      : `${inhabitants.length} spider${inhabitants.length !== 1 ? 's' : ''}`}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Climate</h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Temperature</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.target_temp_min && enclosure.target_temp_max
                      ? `${enclosure.target_temp_min}–${enclosure.target_temp_max}°F`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Humidity</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {enclosure.target_humidity_min && enclosure.target_humidity_max
                      ? `${enclosure.target_humidity_min}–${enclosure.target_humidity_max}%`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Water Dish</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.water_dish ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Misting</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.misting_schedule || '—'}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Substrate</h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.substrate_type || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Depth</dt>
                  <dd className="text-gray-900 dark:text-white">{enclosure.substrate_depth || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600 dark:text-gray-400">Last Changed</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {formatLocalDate(enclosure.last_substrate_change) || '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {enclosure.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notes</h2>
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{enclosure.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Inhabitants Tab ───────────────────────────────────────────────── */}
        {activeTab === 'inhabitants' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Members (
                {enclosure.is_communal
                  ? enclosure.population_count ?? inhabitants.length
                  : inhabitants.length}
                )
              </h2>
              {enclosure.is_communal && (
                <Link
                  href={`/dashboard/tarantulas/add?enclosure_id=${enclosureId}`}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                >
                  + Add Tracked Member
                </Link>
              )}
            </div>

            {/* Untracked members banner */}
            {enclosure.is_communal && untrackedCount > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <span className="text-lg">❓</span>
                  <span className="text-sm font-medium">
                    {untrackedCount} untracked {untrackedCount === 1 ? 'member' : 'members'} in population count
                  </span>
                </div>
                {!editingPopulation ? (
                  <button
                    onClick={() => { setPopulationInput(String(enclosure.population_count ?? '')); setEditingPopulation(true) }}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium shrink-0"
                  >
                    Update count
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={populationInput}
                      onChange={(e) => setPopulationInput(e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="0"
                      autoFocus
                    />
                    <button
                      onClick={handleUpdatePopulation}
                      className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingPopulation(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Set population count prompt */}
            {enclosure.is_communal && enclosure.population_count === null && !editingPopulation && (
              <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Set total population count (tracked + untracked)
                </span>
                <button
                  onClick={() => { setPopulationInput(''); setEditingPopulation(true) }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  Set count
                </button>
              </div>
            )}
            {enclosure.is_communal && enclosure.population_count === null && editingPopulation && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="number"
                  value={populationInput}
                  onChange={(e) => setPopulationInput(e.target.value)}
                  placeholder="Total population"
                  className="w-32 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  min="0"
                  autoFocus
                />
                <button onClick={handleUpdatePopulation} className="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save</button>
                <button onClick={() => setEditingPopulation(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel</button>
              </div>
            )}

            {inhabitants.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No tracked members yet.
                {enclosure.is_communal ? (
                  <>
                    <br />
                    <span className="text-sm">
                      Add tracked members above, or update the population count to track the total.
                    </span>
                  </>
                ) : (
                  <>
                    <br />
                    <span className="text-sm">Assign tarantulas from their individual detail pages.</span>
                  </>
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {inhabitants.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/tarantulas/${t.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center overflow-hidden shrink-0">
                      {t.photo_url ? (
                        <img src={t.photo_url} alt={t.name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">🕷️</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {t.name || 'Unnamed'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic truncate">
                        {t.scientific_name}
                      </p>
                    </div>
                    {t.sex && (
                      <span
                        className={`text-lg shrink-0 ${
                          t.sex === 'female'
                            ? 'text-pink-500'
                            : t.sex === 'male'
                              ? 'text-blue-500'
                              : 'text-gray-400'
                        }`}
                        aria-label={
                          t.sex === 'female'
                            ? 'Female'
                            : t.sex === 'male'
                              ? 'Male'
                              : 'Unknown sex'
                        }
                      >
                        {t.sex === 'female' ? '♀' : t.sex === 'male' ? '♂' : '?'}
                      </span>
                    )}
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Feedings Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'feedings' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feeding Log</h2>
              <button
                onClick={() => setShowFeedingForm(!showFeedingForm)}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
              >
                + Add Feeding
              </button>
            </div>

            {showFeedingForm && (
              <form onSubmit={handleAddFeeding} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Food type (e.g., cricket)"
                    value={feedingForm.food_type}
                    onChange={(e) => setFeedingForm({ ...feedingForm, food_type: e.target.value })}
                    required
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Size (optional)"
                    value={feedingForm.food_size}
                    onChange={(e) => setFeedingForm({ ...feedingForm, food_size: e.target.value })}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={feedingForm.quantity}
                    onChange={(e) => setFeedingForm({ ...feedingForm, quantity: e.target.value })}
                    min="1"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={feedingForm.accepted}
                      onChange={(e) => setFeedingForm({ ...feedingForm, accepted: e.target.checked })}
                      className="w-4 h-4"
                    />
                    Accepted
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submittingFeeding}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    {submittingFeeding ? 'Adding...' : 'Add Feeding'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedingForm(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-sm text-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {feedings.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No feeding logs yet.</p>
            ) : (
              <div className="space-y-2">
                {feedings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {f.quantity > 1 ? `${f.quantity}x ` : ''}{f.food_type}
                        {f.food_size && ` (${f.food_size})`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
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

        {/* ── Molts Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'molts' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Molt Log</h2>
            {molts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No molts logged yet.</p>
            ) : (
              <div className="space-y-2">
                {molts.map((m) => (
                  <div key={m.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      ✨ Molt found {m.is_unidentified && <span className="text-yellow-600 dark:text-yellow-400">(unidentified)</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(m.molted_at).toLocaleDateString()}
                    </p>
                    {m.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{m.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Substrate Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'substrate' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Substrate Changes</h2>
            {substrateChanges.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No substrate changes logged yet.</p>
            ) : (
              <div className="space-y-2">
                {substrateChanges.map((s) => (
                  <div key={s.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {s.substrate_type || 'Substrate change'}
                          {s.substrate_depth && ` — ${s.substrate_depth}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatLocalDate(s.changed_at)}
                          {s.reason && ` · ${s.reason}`}
                        </p>
                      </div>
                    </div>
                    {s.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Incidents Tab (communal only) ─────────────────────────────────── */}
        {activeTab === 'incidents' && (
          <div className="space-y-6">
            {/* Log incident form */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Log an Incident</h2>
                <button
                  onClick={() => setShowIncidentForm(!showIncidentForm)}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm font-medium"
                >
                  {showIncidentForm ? 'Cancel' : '+ Log Incident'}
                </button>
              </div>

              {showIncidentForm && (
                <form onSubmit={handleLogIncident} className="space-y-4">
                  {/* Incident type picker */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Incident Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {INCIDENT_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setIncidentForm({ ...incidentForm, incident_type: t.value })}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                            incidentForm.incident_type === t.value
                              ? (incidentBadgeClasses[t.value] ?? '') + ' border-current'
                              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                          }`}
                        >
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Severity (only for aggressive types) */}
                  {SEVERITY_TYPES.includes(incidentForm.incident_type) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Severity
                      </label>
                      <div className="flex gap-2">
                        {['minor', 'moderate', 'severe'].map((sev) => (
                          <button
                            key={sev}
                            type="button"
                            onClick={() => setIncidentForm({ ...incidentForm, severity: sev })}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition capitalize ${
                              incidentForm.severity === sev
                                ? (severityBadgeClasses[sev] ?? '') + ' border-current'
                                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {sev}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="What happened?"
                      value={incidentForm.description}
                      onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Outcome <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Separated individual, Removed prey item"
                      value={incidentForm.outcome}
                      onChange={(e) => setIncidentForm({ ...incidentForm, outcome: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={submittingIncident}
                      className="px-5 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {submittingIncident ? 'Logging...' : 'Log Incident'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowIncidentForm(false)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Incident history */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Incident History
              </h2>

              {incidents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🛡️</div>
                  <p className="text-gray-500 dark:text-gray-400">No incidents logged</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">All quiet in this communal</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incidents.map((incident) => {
                    const meta = getIncidentMeta(incident.incident_type)
                    return (
                      <div
                        key={incident.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${incidentBadgeClasses[incident.incident_type] ?? 'bg-gray-100 text-gray-700'}`}>
                              {meta.emoji} {meta.label}
                            </span>
                            {incident.severity && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${severityBadgeClasses[incident.severity] ?? ''}`}>
                                {incident.severity}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {new Date(incident.occurred_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteIncident(incident.id)}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition shrink-0"
                            title="Delete incident"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        {incident.description && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                            {incident.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                          {incident.tarantula_name && (
                            <span>Individual: <span className="font-medium text-gray-600 dark:text-gray-300">{incident.tarantula_name}</span></span>
                          )}
                          {incident.outcome && (
                            <span>↳ {incident.outcome}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
