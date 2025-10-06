'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import SpeciesAutocomplete from '@/components/SpeciesAutocomplete'

interface SelectedSpecies {
  id: string
  scientific_name: string
  common_names: string[]
  genus?: string
  care_level?: string
  image_url?: string
}

export default function EditTarantulaPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

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
  })
  const [selectedSpecies, setSelectedSpecies] = useState<SelectedSpecies | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
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
      setFormData({
        common_name: data.common_name || '',
        scientific_name: data.scientific_name || '',
        sex: data.sex || '',
        date_acquired: data.date_acquired || '',
        source: data.source || '',
        price_paid: data.price_paid ? String(data.price_paid) : '',
        photo_url: data.photo_url || '',
        notes: data.notes || '',
        species_id: data.species_id || '',
      })
      // If species_id exists, we could optionally fetch and set selectedSpecies
      // but it's not necessary for the form to work
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSpeciesSelect = (species: SelectedSpecies) => {
    setSelectedSpecies(species)
    setFormData({
      ...formData,
      species_id: species.id,
      scientific_name: species.scientific_name,
      common_name: species.common_names[0] || formData.common_name,
      photo_url: species.image_url || formData.photo_url,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const token = localStorage.getItem('auth_token')
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
      }

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update tarantula')
      }

      router.push(`/dashboard/tarantulas/${id}`)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push(`/dashboard/tarantulas/${id}`)}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Details
          </button>
        </div>

        <h1 className="text-4xl font-bold mb-8">Edit Tarantula</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
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
            <p className="text-xs text-gray-500 mt-1">
              Start typing to search our species database. Select to link species and enable care sheet access.
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
                placeholder="e.g., Grammostola rosea"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sex</label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Photo URL</label>
            <input
              type="url"
              value={formData.photo_url}
              onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="https://example.com/image.jpg"
            />
            <p className="text-xs text-gray-500 mt-1">Enter a URL to a photo of your tarantula</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 bg-white"
              placeholder="Any additional information about this tarantula..."
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/tarantulas/${id}`)}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
