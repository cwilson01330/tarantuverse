'use client'

/**
 * Public tarantula profile page — the permanent QR code destination.
 * URL: /t/{tarantula_id}
 *
 * Shows different content based on viewer:
 *   • owner (logged in, collection matches) → full detail + quick-log buttons
 *   • other keeper / unauthenticated        → public care card + lineage
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

interface SpeciesData {
  id: string
  scientific_name: string
  common_names: string[]
  care_level: string | null
  temperament: string | null
  type: string | null
  temperature_min: number | null
  temperature_max: number | null
  humidity_min: number | null
  humidity_max: number | null
  urticating_hairs: boolean
  medically_significant_venom: boolean
  image_url: string | null
}

interface ProfileData {
  id: string
  display_name: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  sex: string | null
  photo_url: string | null
  is_owner: boolean
  owner_username: string | null
  species: SpeciesData | null
  photos: Array<{ id: string; url: string; thumbnail_url: string | null; caption: string | null; taken_at: string | null }>
  lineage: {
    pairing_date?: string
    father?: { id: string; display_name: string; scientific_name: string | null; photo_url: string | null }
    mother?: { id: string; display_name: string; scientific_name: string | null; photo_url: string | null }
  }
  last_feeding: { date: string; food_type: string; food_size: string; accepted: boolean } | null
  last_molt: { date: string; leg_span_after: number | null; weight_after: number | null } | null
  husbandry?: {
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
  }
  date_acquired?: string | null
  source?: string | null
  notes?: string | null
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function careColor(level: string | null) {
  if (level === 'beginner') return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
  if (level === 'intermediate') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
  if (level === 'advanced') return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    fetch(`${API}/api/v1/t/${id}`, { headers })
      .then(async (res) => {
        if (res.status === 403) { setError('private'); return }
        if (res.status === 404) { setError('notfound'); return }
        if (!res.ok) throw new Error()
        setProfile(await res.json())
      })
      .catch(() => setError('error'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">🕷️</div>
        <p className="text-gray-500 dark:text-gray-400">Loading profile…</p>
      </div>
    </div>
  )

  if (error === 'private') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Private Collection</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">This keeper's collection is set to private.</p>
        <Link href="/" className="text-purple-600 hover:underline">← Back to Tarantuverse</Link>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Not Found</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">This tarantula profile doesn't exist.</p>
        <Link href="/" className="text-purple-600 hover:underline">← Back to Tarantuverse</Link>
      </div>
    </div>
  )

  if (!profile) return null

  const sp = profile.species
  const photos = profile.photos
  const hasLineage = profile.lineage?.father || profile.lineage?.mother

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🕷️</span>
          <span className="font-bold text-gray-900 dark:text-white text-sm">Tarantuverse</span>
        </Link>
        {profile.owner_username && (
          <Link href={`/keeper/${profile.owner_username}`} className="text-sm text-purple-600 hover:underline">
            @{profile.owner_username}
          </Link>
        )}
      </div>

      <div className="max-w-2xl mx-auto pb-12">
        {/* Hero photo */}
        {photos.length > 0 ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[activePhoto]?.url || profile.photo_url || ''}
              alt={profile.display_name}
              className="w-full h-72 object-cover"
            />
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={`w-2 h-2 rounded-full transition-all ${i === activePhoto ? 'bg-white scale-125' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : profile.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo_url} alt={profile.display_name} className="w-full h-72 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <span className="text-8xl">🕷️</span>
          </div>
        )}

        <div className="px-4 pt-4 space-y-4">
          {/* Name & badges */}
          <div>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.display_name}</h1>
                {profile.scientific_name && (
                  <p className="text-gray-500 dark:text-gray-400 italic text-sm">{profile.scientific_name}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {profile.sex && (
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium capitalize">
                    {profile.sex === 'male' ? '♂' : profile.sex === 'female' ? '♀' : '?'} {profile.sex}
                  </span>
                )}
                {sp?.care_level && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${careColor(sp.care_level)}`}>
                    {sp.care_level}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Safety badges */}
          {sp && (sp.medically_significant_venom || sp.urticating_hairs) && (
            <div className="flex gap-2 flex-wrap">
              {sp.medically_significant_venom && (
                <span className="px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold">
                  ⚠️ Medically Significant Venom
                </span>
              )}
              {sp.urticating_hairs && (
                <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full text-xs font-bold">
                  🔸 Urticating Hairs
                </span>
              )}
            </div>
          )}

          {/* Owner quick actions */}
          {profile.is_owner && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => router.push(`/dashboard/tarantulas/${profile.id}`)}
                className="flex flex-col items-center gap-1 p-3 bg-purple-600 text-white rounded-xl text-xs font-semibold"
              >
                <span className="text-xl">📋</span>
                Full Detail
              </button>
              <button
                onClick={() => router.push(`/dashboard/tarantulas/${profile.id}?log=feeding`)}
                className="flex flex-col items-center gap-1 p-3 bg-green-600 text-white rounded-xl text-xs font-semibold"
              >
                <span className="text-xl">🍽️</span>
                Log Feeding
              </button>
              <button
                onClick={() => router.push(`/dashboard/tarantulas/${profile.id}?log=molt`)}
                className="flex flex-col items-center gap-1 p-3 bg-blue-600 text-white rounded-xl text-xs font-semibold"
              >
                <span className="text-xl">🔄</span>
                Log Molt
              </button>
            </div>
          )}

          {/* Stats row */}
          {(profile.last_feeding || profile.last_molt) && (
            <div className="grid grid-cols-2 gap-3">
              {profile.last_feeding && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Feeding</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {daysSince(profile.last_feeding.date)}d ago
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {profile.last_feeding.food_type} · {profile.last_feeding.accepted ? '✅ Accepted' : '❌ Refused'}
                  </p>
                </div>
              )}
              {profile.last_molt && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Molt</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    {daysSince(profile.last_molt.date)}d ago
                  </p>
                  {profile.last_molt.leg_span_after && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {profile.last_molt.leg_span_after}" leg span
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Care requirements */}
          {sp && (sp.temperature_min || sp.humidity_min || sp.type) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Care Requirements</h2>
              </div>
              <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-200 dark:divide-gray-700">
                {sp.type && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Type</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm capitalize">{sp.type}</p>
                  </div>
                )}
                {sp.temperament && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Temperament</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm capitalize">{sp.temperament}</p>
                  </div>
                )}
                {sp.temperature_min && sp.temperature_max && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">🌡️ Temperature</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {sp.temperature_min}–{sp.temperature_max}°F
                    </p>
                  </div>
                )}
                {sp.humidity_min && sp.humidity_max && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">💧 Humidity</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {sp.humidity_min}–{sp.humidity_max}%
                    </p>
                  </div>
                )}
              </div>
              {sp.id && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <Link href={`/species/${sp.id}`} className="text-purple-600 text-sm font-medium hover:underline">
                    View full care sheet →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Lineage */}
          {hasLineage && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">🧬 Lineage</h2>
                {profile.lineage.pairing_date && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Paired {new Date(profile.lineage.pairing_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                {['father', 'mother'].map((role) => {
                  const parent = role === 'father' ? profile.lineage.father : profile.lineage.mother
                  return (
                    <div key={role} className="px-4 py-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 capitalize">
                        {role === 'father' ? '♂ Father' : '♀ Mother'}
                      </p>
                      {parent ? (
                        <Link href={`/t/${parent.id}`} className="group">
                          <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-purple-600 transition-colors">
                            {parent.display_name}
                          </p>
                          {parent.scientific_name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">{parent.scientific_name}</p>
                          )}
                        </Link>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Unknown</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Owner husbandry */}
          {profile.is_owner && profile.husbandry && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">🏠 Current Setup</h2>
              </div>
              <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-200 dark:divide-gray-700">
                {profile.husbandry.enclosure_type && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enclosure</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm capitalize">
                      {profile.husbandry.enclosure_type}
                      {profile.husbandry.enclosure_size ? ` · ${profile.husbandry.enclosure_size}` : ''}
                    </p>
                  </div>
                )}
                {profile.husbandry.substrate_type && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Substrate</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm capitalize">
                      {profile.husbandry.substrate_type}
                      {profile.husbandry.substrate_depth ? ` · ${profile.husbandry.substrate_depth}` : ''}
                    </p>
                  </div>
                )}
                {profile.husbandry.misting_schedule && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Misting</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{profile.husbandry.misting_schedule}</p>
                  </div>
                )}
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Water Dish</p>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {profile.husbandry.water_dish ? '✅ Yes' : '❌ No'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Tracked with{' '}
              <Link href="/" className="text-purple-500 hover:underline font-medium">
                Tarantuverse
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
