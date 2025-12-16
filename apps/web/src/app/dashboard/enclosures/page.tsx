"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Enclosure {
  id: string
  name: string
  is_communal: boolean
  population_count: number | null
  species_name: string | null
  inhabitant_count: number
  days_since_last_feeding: number | null
  photo_url: string | null
  enclosure_type: string | null
}

export default function EnclosuresPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [enclosures, setEnclosures] = useState<Enclosure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchEnclosures()
  }, [router, isAuthenticated, isLoading, token])

  const fetchEnclosures = async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/v1/enclosures/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch enclosures')
      }

      const data = await response.json()
      setEnclosures(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load enclosures')
    } finally {
      setLoading(false)
    }
  }

  const getFeedingStatusColor = (days: number | null) => {
    if (days === null) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    if (days >= 21) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    if (days >= 14) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    if (days >= 7) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              My Enclosures
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your enclosures and communal setups
            </p>
          </div>
          <Link
            href="/dashboard/enclosures/add"
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition flex items-center gap-2"
          >
            <span>+</span>
            <span>Add Enclosure</span>
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Enclosures Grid */}
        {enclosures.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Enclosures Yet
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first enclosure to start tracking communal setups or organize your collection.
            </p>
            <Link
              href="/dashboard/enclosures/add"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition"
            >
              <span>+</span>
              <span>Add Your First Enclosure</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enclosures.map((enclosure) => (
              <Link
                key={enclosure.id}
                href={`/dashboard/enclosures/${enclosure.id}`}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition group"
              >
                {/* Photo or Placeholder */}
                <div className="h-40 bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative">
                  {enclosure.photo_url ? (
                    <img
                      src={enclosure.photo_url}
                      alt={enclosure.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-5xl">📦</div>
                  )}

                  {/* Communal Badge */}
                  {enclosure.is_communal && (
                    <span className="absolute top-3 left-3 px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-medium rounded-full">
                      Communal
                    </span>
                  )}

                  {/* Feeding Status Badge */}
                  <span className={`absolute top-3 right-3 px-2 py-1 text-xs font-medium rounded-full ${getFeedingStatusColor(enclosure.days_since_last_feeding)}`}>
                    {enclosure.days_since_last_feeding !== null
                      ? `Fed ${enclosure.days_since_last_feeding}d ago`
                      : 'No feedings'}
                  </span>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">
                    {enclosure.name}
                  </h3>

                  {enclosure.species_name && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mt-1">
                      {enclosure.species_name}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                    {/* Population */}
                    <span className="flex items-center gap-1">
                      {enclosure.is_communal ? '👥' : '👤'}
                      {enclosure.is_communal
                        ? `${enclosure.population_count || enclosure.inhabitant_count} spiders`
                        : `${enclosure.inhabitant_count} spider`}
                    </span>

                    {/* Type */}
                    {enclosure.enclosure_type && (
                      <span className="capitalize">
                        {enclosure.enclosure_type === 'terrestrial' && '🏜️'}
                        {enclosure.enclosure_type === 'arboreal' && '🌳'}
                        {enclosure.enclosure_type === 'fossorial' && '🕳️'}
                        {' '}{enclosure.enclosure_type}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
