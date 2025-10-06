'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Species {
  id: string
  scientific_name: string
  common_names: string[]
  genus?: string
  family?: string
  care_level?: string
  temperament?: string
  native_region?: string
  adult_size?: string
  growth_rate?: string
  type?: string
  temperature_min?: number
  temperature_max?: number
  humidity_min?: number
  humidity_max?: number
  enclosure_size_sling?: string
  enclosure_size_juvenile?: string
  enclosure_size_adult?: string
  substrate_depth?: string
  substrate_type?: string
  prey_size?: string
  feeding_frequency_sling?: string
  feeding_frequency_juvenile?: string
  feeding_frequency_adult?: string
  water_dish_required?: boolean
  webbing_amount?: string
  burrowing?: boolean
  care_guide?: string
  image_url?: string
  source_url?: string
  is_verified?: boolean
  community_rating?: number
  times_kept?: number
}

export default function SpeciesCareSheetPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [species, setSpecies] = useState<Species | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSpecies()
  }, [id])

  const fetchSpecies = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/species/${id}`)

      if (!response.ok) {
        throw new Error('Species not found')
      }

      const data = await response.json()
      setSpecies(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load species')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (error || !species) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back
          </button>
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error || 'Species not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900 mb-6"
        >
          ← Back
        </button>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <div className="flex items-start gap-6">
            {species.image_url ? (
              <img
                src={species.image_url}
                alt={species.scientific_name}
                className="w-48 h-48 object-cover rounded-lg"
              />
            ) : (
              <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center text-8xl">
                🕷️
              </div>
            )}

            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{species.scientific_name}</h1>
              {species.common_names.length > 0 && (
                <p className="text-xl text-gray-600 mb-4">
                  {species.common_names.join(', ')}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {species.care_level && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    species.care_level === 'beginner' ? 'bg-green-100 text-green-800' :
                    species.care_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {species.care_level}
                  </span>
                )}
                {species.type && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 capitalize">
                    {species.type}
                  </span>
                )}
                {species.is_verified && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    ✓ Verified
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {species.native_region && (
                  <div className="text-gray-900">
                    <span className="font-semibold">Native to:</span> {species.native_region}
                  </div>
                )}
                {species.adult_size && (
                  <div className="text-gray-900">
                    <span className="font-semibold">Adult size:</span> {species.adult_size}
                  </div>
                )}
                {species.temperament && (
                  <div className="text-gray-900">
                    <span className="font-semibold">Temperament:</span> {species.temperament}
                  </div>
                )}
                {species.growth_rate && (
                  <div className="text-gray-900">
                    <span className="font-semibold">Growth rate:</span> {species.growth_rate}
                  </div>
                )}
              </div>

              {species.times_kept && species.times_kept > 0 && (
                <p className="text-sm text-gray-500 mt-4">
                  Kept by {species.times_kept} keeper{species.times_kept !== 1 ? 's' : ''} on Tarantuverse
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Husbandry Requirements */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Husbandry Requirements</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Temperature & Humidity */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Climate</h3>
              {(species.temperature_min || species.temperature_max) && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600">Temperature</p>
                  <p className="text-lg text-gray-900">
                    {species.temperature_min}°F - {species.temperature_max}°F
                  </p>
                </div>
              )}
              {(species.humidity_min || species.humidity_max) && (
                <div>
                  <p className="text-sm text-gray-600">Humidity</p>
                  <p className="text-lg text-gray-900">
                    {species.humidity_min}% - {species.humidity_max}%
                  </p>
                </div>
              )}
            </div>

            {/* Enclosure */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Enclosure</h3>
              {species.enclosure_size_sling && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">Sling</p>
                  <p className="text-gray-900">{species.enclosure_size_sling}</p>
                </div>
              )}
              {species.enclosure_size_juvenile && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">Juvenile</p>
                  <p className="text-gray-900">{species.enclosure_size_juvenile}</p>
                </div>
              )}
              {species.enclosure_size_adult && (
                <div>
                  <p className="text-sm text-gray-600">Adult</p>
                  <p className="text-gray-900">{species.enclosure_size_adult}</p>
                </div>
              )}
            </div>

            {/* Substrate */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Substrate</h3>
              {species.substrate_type && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600">Type</p>
                  <p className="text-gray-900">{species.substrate_type}</p>
                </div>
              )}
              {species.substrate_depth && (
                <div>
                  <p className="text-sm text-gray-600">Depth</p>
                  <p className="text-gray-900">{species.substrate_depth}</p>
                </div>
              )}
            </div>

            {/* Additional Care */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Additional Care</h3>
              <div className="space-y-2 text-gray-900">
                <p className="flex items-center gap-2">
                  {species.water_dish_required ? '✓' : '✗'}
                  <span>Water dish {species.water_dish_required ? 'required' : 'optional'}</span>
                </p>
                {species.webbing_amount && (
                  <p className="flex items-center gap-2">
                    🕸️ <span className="capitalize">{species.webbing_amount} webbing</span>
                  </p>
                )}
                <p className="flex items-center gap-2">
                  {species.burrowing ? '⛏️' : '🏠'}
                  <span>{species.burrowing ? 'Burrower' : 'Non-burrowing'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feeding Schedule */}
        {(species.feeding_frequency_sling || species.feeding_frequency_juvenile || species.feeding_frequency_adult) && (
          <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Feeding Schedule</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {species.feeding_frequency_sling && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900">Sling</h3>
                  <p className="text-gray-900">{species.feeding_frequency_sling}</p>
                </div>
              )}
              {species.feeding_frequency_juvenile && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900">Juvenile</h3>
                  <p className="text-gray-900">{species.feeding_frequency_juvenile}</p>
                </div>
              )}
              {species.feeding_frequency_adult && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900">Adult</h3>
                  <p className="text-gray-900">{species.feeding_frequency_adult}</p>
                </div>
              )}
            </div>
            {species.prey_size && (
              <p className="mt-4 text-sm text-gray-600">
                <span className="font-semibold">Prey size:</span> {species.prey_size}
              </p>
            )}
          </div>
        )}

        {/* Care Guide */}
        {species.care_guide && (
          <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Care Guide</h2>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap text-gray-700">{species.care_guide}</p>
            </div>
          </div>
        )}

        {/* Source */}
        {species.source_url && (
          <div className="text-center text-sm text-gray-500">
            <a
              href={species.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-600"
            >
              View source →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
