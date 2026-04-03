'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { Metadata } from 'next'
import Link from 'next/link'

interface TarantulaPublicProfile {
  tarantula: {
    id: string
    name?: string
    common_name?: string
    scientific_name?: string
    sex?: string
    date_acquired?: string
    photo_url?: string
    notes?: string
  }
  owner: {
    username: string
    display_name?: string
    avatar_url?: string
  }
  species?: {
    id: string
    scientific_name: string
    common_names?: string[]
    care_level?: string
    type?: string
    native_region?: string
    adult_size?: string
    image_url?: string
  }
  feeding_summary: {
    total_feedings: number
    acceptance_rate: number
    last_fed_date?: string
  }
  molt_timeline: Array<{
    id: string
    molted_at: string
    leg_span_before?: number
    leg_span_after?: number
    weight_before?: number
    weight_after?: number
    notes?: string
  }>
  photos: Array<{
    id: string
    url: string
    thumbnail_url?: string
    caption?: string
    taken_at?: string
  }>
}

export default function PublicTarantulaProfile() {
  const params = useParams()
  const username = params.username as string
  const tarantula = params.tarantula as string

  const [profile, setProfile] = useState<TarantulaPublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/tarantulas/public/${username}/${tarantula}`
        )

        if (!response.ok) {
          if (response.status === 404) {
            setError('Tarantula profile not found or is not public')
          } else {
            setError('Failed to load tarantula profile')
          }
          return
        }

        const data = await response.json()
        setProfile(data)
      } catch (err) {
        setError('Error loading tarantula profile')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [username, tarantula])

  const copyToClipboard = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Not recorded'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatMonth = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading tarantula profile...</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🕷️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Oops! Profile not found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error || 'The tarantula profile you are looking for does not exist or is not public.'}
          </p>
          <Link
            href="/register"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Create Your Own Collection
          </Link>
        </div>
      </div>
    )
  }

  const t = profile.tarantula
  const lastFedDate = profile.feeding_summary.last_fed_date
    ? new Date(profile.feeding_summary.last_fed_date)
    : null
  const daysSinceFed = lastFedDate
    ? Math.floor(
        (Date.now() - lastFedDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="text-xl font-bold text-blue-600 dark:text-blue-400"
          >
            Tarantuverse
          </Link>
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            {copied ? '✓ Copied!' : '📤 Share'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section with Photo */}
        <div className="mb-12">
          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Main Photo */}
            <div className="md:col-span-2">
              <div className="relative h-96 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                {t.photo_url ? (
                  <Image
                    src={t.photo_url}
                    alt={t.name || t.common_name || 'Tarantula'}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl">
                    🕷️
                  </div>
                )}
              </div>
            </div>

            {/* Quick Info Card */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 shadow">
              <h1 className="text-3xl font-bold mb-2">{t.name}</h1>
              {t.common_name && (
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  {t.common_name}
                </p>
              )}

              <div className="space-y-3 mb-6">
                {t.sex && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Sex</p>
                    <p className="font-semibold capitalize">{t.sex}</p>
                  </div>
                )}
                {t.date_acquired && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Acquired
                    </p>
                    <p className="font-semibold">
                      {formatDate(t.date_acquired)}
                    </p>
                  </div>
                )}
              </div>

              {/* Owner Info */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Keeper
                </p>
                <div className="flex items-center gap-3">
                  {profile.owner.avatar_url && (
                    <Image
                      src={profile.owner.avatar_url}
                      alt={profile.owner.display_name || profile.owner.username}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-sm">
                      {profile.owner.display_name || profile.owner.username}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      @{profile.owner.username}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Species Care Info */}
        {profile.species && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Species Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4">Care Details</h3>
                <div className="space-y-3">
                  {profile.species.care_level && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Care Level
                      </p>
                      <p className="capitalize font-semibold">
                        {profile.species.care_level}
                      </p>
                    </div>
                  )}
                  {profile.species.type && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Type
                      </p>
                      <p className="capitalize font-semibold">
                        {profile.species.type}
                      </p>
                    </div>
                  )}
                  {profile.species.native_region && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Native Region
                      </p>
                      <p className="font-semibold">
                        {profile.species.native_region}
                      </p>
                    </div>
                  )}
                  {profile.species.adult_size && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Adult Size
                      </p>
                      <p className="font-semibold">
                        {profile.species.adult_size}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {profile.species.image_url && (
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden h-64 relative">
                  <Image
                    src={profile.species.image_url}
                    alt={profile.species.scientific_name}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Feeding Statistics */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Feeding Summary</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6 border border-green-200 dark:border-green-900">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Total Feedings
              </p>
              <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                {profile.feeding_summary.total_feedings}
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6 border border-blue-200 dark:border-blue-900">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Acceptance Rate
              </p>
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                {profile.feeding_summary.acceptance_rate.toFixed(0)}%
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-gray-800 dark:to-gray-800 rounded-lg p-6 border border-purple-200 dark:border-purple-900">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Last Fed
              </p>
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {daysSinceFed !== null
                  ? daysSinceFed === 0
                    ? 'Today'
                    : daysSinceFed === 1
                      ? 'Yesterday'
                      : `${daysSinceFed} days ago`
                  : 'Never'}
              </p>
            </div>
          </div>
        </section>

        {/* Molt Timeline */}
        {profile.molt_timeline.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Molt Timeline</h2>
            <div className="space-y-4">
              {profile.molt_timeline.map((molt, index) => (
                <div
                  key={molt.id}
                  className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-2xl">📈</div>
                    <div className="flex-1">
                      <p className="font-semibold text-lg">
                        Molt #{profile.molt_timeline.length - index}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {formatDate(molt.molted_at)}
                      </p>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {molt.leg_span_before !== undefined &&
                          molt.leg_span_after !== undefined && (
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">
                                Leg Span
                              </p>
                              <p className="font-semibold">
                                {molt.leg_span_before}" →{' '}
                                {molt.leg_span_after}"
                              </p>
                            </div>
                          )}
                        {molt.weight_before !== undefined &&
                          molt.weight_after !== undefined && (
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">
                                Weight
                              </p>
                              <p className="font-semibold">
                                {molt.weight_before}g →{' '}
                                {molt.weight_after}g
                              </p>
                            </div>
                          )}
                      </div>

                      {molt.notes && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                          {molt.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Photo Gallery */}
        {profile.photos.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">
              Photo Gallery ({profile.photos.length})
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {profile.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative h-64 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden shadow hover:shadow-lg transition group"
                >
                  <Image
                    src={photo.thumbnail_url || photo.url}
                    alt={photo.caption || 'Tarantula photo'}
                    fill
                    className="object-cover group-hover:scale-105 transition"
                  />
                  {photo.caption && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-end p-4">
                      <p className="text-white text-sm">{photo.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Notes */}
        {t.notes && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Notes</h2>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {t.notes}
              </p>
            </div>
          </section>
        )}

        {/* CTA Banner */}
        <section className="mb-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-3">
            Track Your Own Tarantulas
          </h2>
          <p className="text-blue-100 mb-6">
            Join Tarantuverse and start tracking feeding, molts, and growth for
            your entire collection.
          </p>
          <Link
            href="/register"
            className="inline-block px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition"
          >
            Sign Up Free
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-gray-600 dark:text-gray-400">
              Powered by Tarantuverse
            </p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                Privacy
              </Link>
              <Link
                href="/help"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                Help
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
