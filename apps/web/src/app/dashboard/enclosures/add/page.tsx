"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Species {
  id: string
  scientific_name: string
  common_names: string[]
}

export default function AddEnclosurePage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Species search
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [speciesResults, setSpeciesResults] = useState<Species[]>([])
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null)
  const [searchingSpecies, setSearchingSpecies] = useState(false)

  // Form data
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

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }
  }, [router, isAuthenticated, isLoading])

  // Search species
  useEffect(() => {
    const searchSpecies = async () => {
      if (speciesSearch.length < 2) {
        setSpeciesResults([])
        return
      }

      setSearchingSpecies(true)
      try {
        const response = await fetch(
          `${API_URL}/api/v1/species/search?q=${encodeURIComponent(speciesSearch)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        )
        if (response.ok) {
          const data = await response.json()
          setSpeciesResults(data.slice(0, 10))
        }
      } catch (err) {
        console.error('Species search error:', err)
      } finally {
        setSearchingSpecies(false)
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

      const response = await fetch(`${API_URL}/api/v1/enclosures/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to create enclosure')
      }

      const newEnclosure = await response.json()
      router.push(`/dashboard/enclosures/${newEnclosure.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create enclosure')
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
            href="/dashboard/enclosures"
            className="text-primary-600 dark:text-primary-400 hover:underline mb-4 inline-block"
          >
            &larr; Back to Enclosures
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Add New Enclosure
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create a new enclosure for your tarantula collection
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
                    For communals where you don't track individuals separately
                  </p>
                </div>
              )}

              {/* Species Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Species (optional)
                </label>
                <input
                  type="text"
                  value={selectedSpecies ? selectedSpecies.scientific_name : speciesSearch}
                  onChange={(e) => {
                    setSpeciesSearch(e.target.value)
                    setSelectedSpecies(null)
                  }}
                  placeholder="Search for species..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
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
              href="/dashboard/enclosures"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !formData.name}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Enclosure'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
