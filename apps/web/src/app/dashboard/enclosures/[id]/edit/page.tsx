"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Species {
  id: string
  scientific_name: string
  common_names: string[]
}

interface Enclosure {
  id: string
  name: string
  is_communal: boolean
  population_count: number | null
  species_id: string | null
  species_name?: string | null
  enclosure_type: string | null
  enclosure_size: string | null
  substrate_type: string | null
  substrate_depth: string | null
  target_temp_min: number | string | null
  target_temp_max: number | string | null
  target_humidity_min: number | string | null
  target_humidity_max: number | string | null
  water_dish: boolean
  misting_schedule: string | null
  notes: string | null
  photo_url: string | null
}

export default function EditEnclosurePage() {
  const router = useRouter()
  const params = useParams()
  const enclosureId = params.id as string
  const { token, isAuthenticated, isLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Species search (pre-populated from loaded enclosure)
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [speciesResults, setSpeciesResults] = useState<Species[]>([])
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null)

  // Form data (pre-filled after fetch)
  const [formData, setFormData] = useState({
    name: '',
    is_communal: false,
    population_count: '',
    enclosure_type: '',
    enclosure_size: '',
    substrate_type: '',
    substrate_depth: '',
    target_temp_min: '',
    target_temp_max: '',
    target_humidity_min: '',
    target_humidity_max: '',
    water_dish: true,
    misting_schedule: '',
    notes: '',
  })

  // Auth gate — wait for authLoading before deciding
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [router, isAuthenticated, isLoading])

  // Load existing enclosure
  useEffect(() => {
    if (isLoading || !token || !enclosureId) return

    const loadEnclosure = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Enclosure not found. It may have been deleted.')
          }
          if (res.status === 403) {
            throw new Error("You don't have permission to edit this enclosure.")
          }
          throw new Error('Failed to load enclosure')
        }
        const data: Enclosure = await res.json()

        setFormData({
          name: data.name ?? '',
          is_communal: Boolean(data.is_communal),
          population_count: data.population_count != null ? String(data.population_count) : '',
          enclosure_type: data.enclosure_type ?? '',
          enclosure_size: data.enclosure_size ?? '',
          substrate_type: data.substrate_type ?? '',
          substrate_depth: data.substrate_depth ?? '',
          target_temp_min: data.target_temp_min != null ? String(data.target_temp_min) : '',
          target_temp_max: data.target_temp_max != null ? String(data.target_temp_max) : '',
          target_humidity_min: data.target_humidity_min != null ? String(data.target_humidity_min) : '',
          target_humidity_max: data.target_humidity_max != null ? String(data.target_humidity_max) : '',
          water_dish: data.water_dish ?? true,
          misting_schedule: data.misting_schedule ?? '',
          notes: data.notes ?? '',
        })

        if (data.species_id && data.species_name) {
          setSelectedSpecies({
            id: data.species_id,
            scientific_name: data.species_name,
            common_names: [],
          })
        }
      } catch (err: any) {
        setLoadError(err.message || 'Failed to load enclosure')
      } finally {
        setLoading(false)
      }
    }

    loadEnclosure()
  }, [enclosureId, token, isLoading])

  // Species search
  useEffect(() => {
    const searchSpecies = async () => {
      if (speciesSearch.length < 2) {
        setSpeciesResults([])
        return
      }
      try {
        const response = await fetch(
          `${API_URL}/api/v1/species/search?q=${encodeURIComponent(speciesSearch)}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
          }
        )
        if (response.ok) {
          const data = await response.json()
          setSpeciesResults(data.slice(0, 10))
        }
      } catch (err) {
        console.error('Species search error:', err)
      }
    }

    const debounce = setTimeout(searchSpecies, 300)
    return () => clearTimeout(debounce)
  }, [speciesSearch, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setSubmitting(true)
    setError('')

    try {
      const payload = {
        name: formData.name,
        is_communal: formData.is_communal,
        population_count: formData.population_count ? parseInt(formData.population_count) : null,
        species_id: selectedSpecies?.id || null,
        enclosure_type: formData.enclosure_type || null,
        enclosure_size: formData.enclosure_size || null,
        substrate_type: formData.substrate_type || null,
        substrate_depth: formData.substrate_depth || null,
        target_temp_min: formData.target_temp_min ? parseFloat(formData.target_temp_min) : null,
        target_temp_max: formData.target_temp_max ? parseFloat(formData.target_temp_max) : null,
        target_humidity_min: formData.target_humidity_min ? parseFloat(formData.target_humidity_min) : null,
        target_humidity_max: formData.target_humidity_max ? parseFloat(formData.target_humidity_max) : null,
        water_dish: formData.water_dish,
        misting_schedule: formData.misting_schedule || null,
        notes: formData.notes || null,
      }

      // Path-param endpoint — no trailing slash
      const response = await fetch(`${API_URL}/api/v1/enclosures/${enclosureId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Failed to update enclosure')
      }

      router.push(`/dashboard/enclosures/${enclosureId}`)
    } catch (err: any) {
      setError(err.message || 'Failed to update enclosure')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  // Loading state — show spinner while auth or enclosure is loading
  if (isLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  // Load error — show retry instead of silently bouncing back
  if (loadError) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/dashboard/enclosures"
            className="text-primary-600 dark:text-primary-400 hover:underline mb-4 inline-block"
          >
            &larr; Back to Enclosures
          </Link>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mt-4">
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
              Couldn&apos;t load enclosure
            </h2>
            <p className="text-red-700 dark:text-red-400 mb-4">{loadError}</p>
            <button
              onClick={() => {
                setLoadError(null)
                // Trigger reload
                setLoading(true)
                setTimeout(() => window.location.reload(), 0)
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/enclosures/${enclosureId}`}
            className="text-primary-600 dark:text-primary-400 hover:underline mb-4 inline-block"
          >
            &larr; Back to Enclosure
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Edit Enclosure
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Update the details for this enclosure
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Basic Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enclosure Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g., Balfouri Colony 1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="is_communal"
                  id="is_communal"
                  checked={formData.is_communal}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="is_communal" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  This is a communal enclosure (multiple tarantulas)
                </label>
              </div>

              {formData.is_communal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Population Count (optional)
                  </label>
                  <input
                    type="number"
                    name="population_count"
                    value={formData.population_count}
                    onChange={handleInputChange}
                    min="1"
                    placeholder="e.g., 5"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    For communals where you don&apos;t track individuals separately
                  </p>
                </div>
              )}

              {/* Species Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Species (optional)
                </label>
                {selectedSpecies ? (
                  <div className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
                    <span className="text-gray-900 dark:text-white italic font-medium">
                      {selectedSpecies.scientific_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSpecies(null)
                        setSpeciesSearch('')
                      }}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={speciesSearch}
                    onChange={(e) => setSpeciesSearch(e.target.value)}
                    placeholder="Search for species..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                )}
                {speciesResults.length > 0 && !selectedSpecies && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {speciesResults.map(species => (
                      <button
                        key={species.id}
                        type="button"
                        onClick={() => {
                          setSelectedSpecies(species)
                          setSpeciesSearch('')
                          setSpeciesResults([])
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <span className="font-medium italic">{species.scientific_name}</span>
                        {species.common_names?.[0] && (
                          <span className="text-gray-500 dark:text-gray-400 ml-2">
                            ({species.common_names[0]})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Enclosure Properties */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Enclosure Properties
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enclosure Type
                </label>
                <select
                  name="enclosure_type"
                  value={formData.enclosure_type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select type...</option>
                  <option value="terrestrial">Terrestrial</option>
                  <option value="arboreal">Arboreal</option>
                  <option value="fossorial">Fossorial</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enclosure Size
                </label>
                <input
                  type="text"
                  name="enclosure_size"
                  value={formData.enclosure_size}
                  onChange={handleInputChange}
                  placeholder="e.g., 18x18x12 inches"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Substrate Type
                </label>
                <input
                  type="text"
                  name="substrate_type"
                  value={formData.substrate_type}
                  onChange={handleInputChange}
                  placeholder="e.g., Coco fiber/topsoil mix"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Substrate Depth
                </label>
                <input
                  type="text"
                  name="substrate_depth"
                  value={formData.substrate_depth}
                  onChange={handleInputChange}
                  placeholder="e.g., 6 inches"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Climate */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Climate Settings
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temperature Min (°F)
                </label>
                <input
                  type="number"
                  name="target_temp_min"
                  value={formData.target_temp_min}
                  onChange={handleInputChange}
                  step="0.1"
                  placeholder="e.g., 75"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temperature Max (°F)
                </label>
                <input
                  type="number"
                  name="target_temp_max"
                  value={formData.target_temp_max}
                  onChange={handleInputChange}
                  step="0.1"
                  placeholder="e.g., 82"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Humidity Min (%)
                </label>
                <input
                  type="number"
                  name="target_humidity_min"
                  value={formData.target_humidity_min}
                  onChange={handleInputChange}
                  step="1"
                  placeholder="e.g., 70"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Humidity Max (%)
                </label>
                <input
                  type="number"
                  name="target_humidity_max"
                  value={formData.target_humidity_max}
                  onChange={handleInputChange}
                  step="1"
                  placeholder="e.g., 80"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="water_dish"
                  id="water_dish"
                  checked={formData.water_dish}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="water_dish" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Water dish present
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Misting Schedule
                </label>
                <input
                  type="text"
                  name="misting_schedule"
                  value={formData.misting_schedule}
                  onChange={handleInputChange}
                  placeholder="e.g., 2x per week"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Notes
            </h2>

            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              placeholder="Any additional notes about this enclosure..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href={`/dashboard/enclosures/${enclosureId}`}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !formData.name}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
