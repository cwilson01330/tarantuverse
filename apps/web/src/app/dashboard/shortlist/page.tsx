"use client"

/**
 * Shortlist — species the keeper saved from a care sheet but doesn't own.
 *
 * Server-backed, so this is the same list they see on mobile.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import {
  listShortlist,
  removeFromShortlist,
  updateShortlistNote,
  type ShortlistItem,
} from '@/lib/shortlist'

const CARE_COLORS: Record<string, string> = {
  beginner: 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40',
  intermediate: 'text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/40',
  advanced: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40',
}

function careLabel(level: string | null): string {
  if (!level) return ''
  return level.charAt(0).toUpperCase() + level.slice(1)
}

/**
 * Tarantulas keep their dedicated care sheet; the rest use the generic one.
 * Note the web path is `/species/inverts/{id}` — NOT `/invert-species/{id}`,
 * which is the mobile route and the API prefix. Kept in sync with the
 * `careSheetHref` logic in src/app/species/page.tsx.
 */
function sheetHref(item: ShortlistItem): string {
  return item.taxon === 'tarantula'
    ? `/species/${item.species_id}`
    : `/species/inverts/${item.species_id}`
}

export default function ShortlistPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [items, setItems] = useState<ShortlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const load = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      setError(null)
      setItems(await listShortlist(token))
    } catch {
      setError("Couldn't load your shortlist.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Gate on authLoading before evaluating auth state, or a refresh bounces
  // the user to /login before the token has been read.
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    load()
  }, [authLoading, isAuthenticated, router, load])

  const remove = async (item: ShortlistItem) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const previous = items
    setItems((rows) => rows.filter((r) => r.species_id !== item.species_id))
    try {
      await removeFromShortlist(token, item.species_id)
    } catch {
      setItems(previous)
      setError('Could not remove that species. Please try again.')
    }
  }

  const saveNote = async (item: ShortlistItem) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const next = noteDraft.trim() || null
    setEditingNote(null)
    const previous = items
    setItems((rows) =>
      rows.map((r) => (r.species_id === item.species_id ? { ...r, note: next } : r)),
    )
    try {
      await updateShortlistNote(token, item.species_id, next)
    } catch {
      setItems(previous)
      setError('Could not save that note. Please try again.')
    }
  }

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-gray-500 dark:text-gray-400">Loading your shortlist…</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shortlist</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {items.length === 0
              ? 'Species you save from a care sheet show up here.'
              : `${items.length} species you're considering`}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
            <p className="text-gray-900 dark:text-white font-semibold mb-1">Nothing saved yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Use the bookmark on any care sheet to save a species you&apos;re considering.
            </p>
            <Link
              href="/species"
              className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              Browse species
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex gap-4"
              >
                <Link href={sheetHref(item)} className="shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.scientific_name ?? ''}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs">
                      No photo
                    </div>
                  )}
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={sheetHref(item)} className="block group">
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:underline truncate">
                      {item.common_names?.[0] || item.scientific_name}
                    </p>
                    <p className="text-sm italic text-gray-500 dark:text-gray-400 truncate">
                      {item.scientific_name}
                    </p>
                  </Link>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {item.care_level && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          CARE_COLORS[item.care_level] ??
                          'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-700'
                        }`}
                      >
                        {careLabel(item.care_level)}
                      </span>
                    )}
                    {item.venom_severity === 'medically_significant' && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40">
                        Hot venom
                      </span>
                    )}
                    {/* Honest state: they bought it since saving it. */}
                    {item.owned && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40">
                        In collection
                      </span>
                    )}
                  </div>

                  {editingNote === item.species_id ? (
                    <div className="mt-3 flex gap-2">
                      <input
                        autoFocus
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveNote(item)
                          if (e.key === 'Escape') setEditingNote(null)
                        }}
                        placeholder="e.g. the one at $140 — ask about sexing"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                      />
                      <button
                        onClick={() => saveNote(item)}
                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingNote(item.species_id)
                        setNoteDraft(item.note ?? '')
                      }}
                      className="mt-2 text-sm text-left text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {item.note ? <span className="italic">{item.note}</span> : 'Add a note'}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => remove(item)}
                  aria-label={`Remove ${item.scientific_name} from shortlist`}
                  className="self-start text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  )
}
