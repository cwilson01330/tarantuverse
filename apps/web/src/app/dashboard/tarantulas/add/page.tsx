'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import SpeciesAutocomplete from '@/components/SpeciesAutocomplete'
import DashboardLayout from '@/components/DashboardLayout'

interface SelectedSpecies {
  id: string
  scientific_name: string
  common_names: string[]
  genus?: string
  care_level?: string
  image_url?: string
}

function AddTarantulaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [formData, setFormData] = useState({
    common_name: '',
    scientific_name: '',
    sex: '',
    date_acquired: '',
    source: '',
    price_paid: '',
    photo_url: '',
    notes: '',
    species_id: '',
    // Husbandry fields
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
  const [selectedSpecies, setSelectedSpecies] = useState<SelectedSpecies | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check for pre-filled species from URL params (from "Add to Collection" on species page)
  useEffect(() => {
    const speciesId = searchParams.get('speciesId')
    const scientificName = searchParams.get('scientificName')
    const commonName = searchParams.get('commonName')

    if (speciesId && scientificName) {
      // Pre-fill the form with species data
      setFormData(prev => ({
        ...prev,
        species_id: speciesId,
        scientific_name: scientificName,
        common_name: commonName || '',
      }))
      // Set selected species for display
      setSelectedSpecies({
        id: speciesId,
        scientific_name: scientificName,
        common_names: commonName ? [commonName] : [],
      })
    }
  }, [searchParams])

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return

    // Check if user is logged in
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [router, isAuthenticated, isLoading])

  const handleSpeciesSelect = (species: SelectedSpecies) => {
    setSelectedSpecies(species)
    setFormData({
      ...formData,
      species_id: species.id,
      scientific_name: species.scientific_name,
      common_name: species.common_names[0] || '',
      photo_url: species.image_url || formData.photo_url,
    })
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

      // Prepare data - convert empty strings to null for optional fields
      const submitData = {
        common_name: formData.common_name || null,
        scientific_name: formData.scientific_name || null,
        species_id: formData.species_id || null,
        sex: formData.sex || null,
        date_acquired: formData.date_acquired || null,
        source: formData.source || null,
        price_paid: formData.price_paid ? parseFloat(formData.price_paid) : null,
        photo_url: formData.photo_url || null,
        notes: formData.notes || null,
        // Husbandry fields
        enclosure_type: formData.enclosure_type || null,
        enclosure_size: formData.enclosure_size || null,
        substrate_type: formData.substrate_type || null,
        substrate_depth: formData.substrate_depth || null,
        last_substrate_change: formData.last_substrate_change || null,
        target_temp_min: formData.target_temp_min ? parseInt(formData.target_temp_min) : null,
        target_temp_max: formData.target_temp_max ? parseInt(formData.target_temp_max) : null,
        target_humidity_min: formData.target_humidity_min ? parseInt(formData.target_humidity_min) : null,
        target_humidity_max: formData.target_humidity_max ? parseInt(formData.target_humidity_max) : null,
        water_dish: formData.water_dish,
        misting_schedule: formData.misting_schedule || null,
        last_enclosure_cleaning: formData.last_enclosure_cleaning || null,
        enclosure_notes: formData.enclosure_notes || null,
      }

      const response = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      const data = await response.json()

      if (!response.ok) {
        const detail = data.detail
        const message = typeof detail === 'object' && detail !== null
          ? detail.message || JSON.stringify(detail)
          : detail || 'Failed to add tarantula'
        throw new Error(message)
      }

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
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
            onClick={() => router.push('/dashboard')}
            className="text-theme-secondary hover:text-theme-primary transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>

        <h1 className="text-4xl font-bold mb-8">Add Tarantula</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Species Search</label>
            <SpeciesAutocomplete
              onSelect={handleSpeciesSelect}
              initialValue={formData.scientific_name}
              placeholder="Search for a species (e.g., Grammostola rosea)"
            />
            <p className="text-xs text-theme-tertiary mt-1">
              Start typing to search our species database. Select to auto-fill species info.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Common Name *</label>
              <input
                type="text"
                required
                value={formData.common_name}
                onChange={(e) => setFormData({ ...formData, common_name: e.target.value })}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                placeholder="e.g., Rose Hair"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Scientific Name *</label>
              <input
                type="text"
                required
                value={formData.scientific_name}
                onChange={(e) => setFormData({ ...formData, scientific_name: e.target.value })}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                placeholder="e.g., Grammostola rosea"
              />
              <p className="text-xs text-theme-tertiary mt-1">
                Or enter manually if not found above
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sex</label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Acquired Date</label>
              <input
                type="date"
                value={formData.date_acquired}
                onChange={(e) => setFormData({ ...formData, date_acquired: e.target.value })}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              >
                <option value="">Select...</option>
                <option value="bred">Bred</option>
                <option value="bought">Bought</option>
                <option value="wild_caught">Wild Caught</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Price Paid ($)</label>
            <input
              type="number"
              step="0.01"
              value={formData.price_paid}
              onChange={(e) => setFormData({ ...formData, price_paid: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Photo URL</label>
            <input
              type="url"
              value={formData.photo_url}
              onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="https://example.com/image.jpg"
            />
            <p className="text-xs text-theme-tertiary mt-1">Enter a URL to a photo of your tarantula</p>
          </div>

          {/* Husbandry Section */}
          <div className="border-t border-theme pt-6 mt-8">
            <h2 className="text-2xl font-bold mb-4 text-theme-primary">Husbandry Information</h2>
            <p className="text-sm text-theme-secondary mb-6">Optional: Track enclosure setup and environmental conditions</p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Enclosure Size</label>
                  <input
                    type="text"
                    value={formData.enclosure_size}
                    onChange={(e) => setFormData({ ...formData, enclosure_size: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="e.g., 10x10x10 inches"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Substrate Type</label>
                  <input
                    type="text"
                    value={formData.substrate_type}
                    onChange={(e) => setFormData({ ...formData, substrate_type: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="e.g., coco fiber"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Substrate Depth</label>
                  <input
                    type="text"
                    value={formData.substrate_depth}
                    onChange={(e) => setFormData({ ...formData, substrate_depth: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="e.g., 3 inches"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Last Substrate Change</label>
                  <input
                    type="date"
                    value={formData.last_substrate_change}
                    onChange={(e) => setFormData({ ...formData, last_substrate_change: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Last Enclosure Cleaning</label>
                  <input
                    type="date"
                    value={formData.last_enclosure_cleaning}
                    onChange={(e) => setFormData({ ...formData, last_enclosure_cleaning: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Temperature (°F)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={formData.target_temp_min}
                      onChange={(e) => setFormData({ ...formData, target_temp_min: e.target.value })}
                      className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                      placeholder="Min"
                    />
                    <span className="text-theme-tertiary">to</span>
                    <input
                      type="number"
                      value={formData.target_temp_max}
                      onChange={(e) => setFormData({ ...formData, target_temp_max: e.target.value })}
                      className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                      placeholder="Max"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Humidity (%)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={formData.target_humidity_min}
                      onChange={(e) => setFormData({ ...formData, target_humidity_min: e.target.value })}
                      className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                      placeholder="Min"
                    />
                    <span className="text-theme-tertiary">to</span>
                    <input
                      type="number"
                      value={formData.target_humidity_max}
                      onChange={(e) => setFormData({ ...formData, target_humidity_max: e.target.value })}
                      className="flex-1 px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.water_dish}
                      onChange={(e) => setFormData({ ...formData, water_dish: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-theme rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">Water Dish Provided</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Misting Schedule</label>
                  <input
                    type="text"
                    value={formData.misting_schedule}
                    onChange={(e) => setFormData({ ...formData, misting_schedule: e.target.value })}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="e.g., 2x per week"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Enclosure Notes</label>
                <textarea
                  value={formData.enclosure_notes}
                  onChange={(e) => setFormData({ ...formData, enclosure_notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="Modifications, decorations, hide setup, etc."
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              placeholder="Any additional information about this tarantula..."
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-gradient-brand text-white rounded-xl hover:bg-gradient-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Adding...' : 'Add Tarantula'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
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

export default function AddTarantulaPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    }>
      <AddTarantulaContent />
    </Suspense>
  )
}
