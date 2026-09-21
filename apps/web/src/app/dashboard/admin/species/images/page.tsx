'use client'

/**
 * Admin: fill in missing species catalog images.
 *
 * 220 of 413 invert species have no picture, and a care sheet without one
 * reads as unfinished. `promote_photo_to_species.py` covers "use a photo
 * that's already in the app"; this covers the commoner case — a picture on
 * your phone, and no desire to open a terminal to use it.
 *
 * DEFAULTS TO WHAT'S MISSING
 * --------------------------
 * The working set is the gaps, not the catalog. Species that already have an
 * image are hidden unless you ask for them, and replacing one requires an
 * explicit confirm — the existing images are curated and attributed, and a
 * screen that can overwrite them with one misclick eventually will.
 *
 * ATTRIBUTION IS REQUIRED
 * -----------------------
 * Not decorative. 186 of the 193 existing images carry it, so an unattributed
 * entry reads as though its provenance was lost. The field remembers your last
 * value across rows, because filling ten species in a sitting shouldn't mean
 * typing your own name ten times.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface SpeciesRow {
  id: string
  scientific_name: string
  common_names: string[]
  taxon: string
  image_url: string | null
  image_attribution: string | null
}

const ATTRIBUTION_KEY = 'admin_species_image_attribution'

export default function AdminSpeciesImagesPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [rows, setRows] = useState<SpeciesRow[]>([])
  const [totals, setTotals] = useState({ total: 0, withImage: 0 })
  const [taxon, setTaxon] = useState('')
  const [missingOnly, setMissingOnly] = useState(true)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attribution, setAttribution] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  // Your own name doesn't change between rows. Remembering it turns filling
  // ten species from forty keystrokes into ten file pickers.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ATTRIBUTION_KEY)
      if (saved) setAttribution(saved)
    } catch {
      // Private mode or storage disabled — a blank field is a fine fallback.
    }
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (taxon) qs.set('taxon', taxon)
      qs.set('missing_only', String(missingOnly))
      const res = await fetch(`${API_URL}/api/v1/admin/species-images?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 403) throw new Error('Admin access required.')
      if (!res.ok) throw new Error('Could not load the species list.')
      const data = await res.json()
      setRows(data.species ?? [])
      setTotals({ total: data.total_species ?? 0, withImage: data.total_with_image ?? 0 })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [token, taxon, missingOnly])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    load()
  }, [isLoading, isAuthenticated, router, load])

  const upload = async (row: SpeciesRow, file: File) => {
    if (!token) return
    if (!attribution.trim()) {
      setError('Add an attribution before uploading — it applies to every image you add.')
      return
    }
    if (row.image_url) {
      const ok = window.confirm(
        `${row.scientific_name} already has an image. Replace it?\n\n` +
          `Current credit: ${row.image_attribution || '(none recorded)'}`,
      )
      if (!ok) return
    }

    setBusyId(row.id)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('attribution', attribution.trim())
      if (row.image_url) body.append('replace', 'true')

      const res = await fetch(`${API_URL}/api/v1/admin/species-images/${row.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        const d = b?.detail
        throw new Error(typeof d === 'string' ? d : d?.message || 'Upload failed.')
      }
      const saved = await res.json()

      try {
        localStorage.setItem(ATTRIBUTION_KEY, attribution.trim())
      } catch {
        // Non-fatal.
      }

      // Update in place rather than refetching — with missing_only on, a
      // refetch would make the row vanish the instant it succeeded, which
      // reads as "did that work?" Showing the new image is the confirmation.
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, image_url: saved.image_url, image_attribution: saved.image_attribution }
            : r,
        ),
      )
      setDoneIds((prev) => new Set(prev).add(row.id))
      setTotals((t) => ({ ...t, withImage: t.withImage + (row.image_url ? 0 : 1) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusyId(null)
      const input = fileInputs.current[row.id]
      // Clear it, or picking the same file twice after a failure is a no-op.
      if (input) input.value = ''
    }
  }

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.scientific_name, ...(r.common_names || [])]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })

  const taxa = Object.keys(INVERT_TAXA)

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-theme-primary mb-1">Species images</h1>
        <p className="text-sm text-theme-secondary mb-6">
          {totals.withImage} of {totals.total} species have a picture.{' '}
          {totals.total - totals.withImage} still to go.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="mb-6 p-4 rounded-xl border border-theme bg-surface">
          <label htmlFor="attribution" className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5">
            Credit — applies to every image you upload here
          </label>
          <input
            id="attribution"
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Cory Wilson, Appalachian Tarantulas"
            className="w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500"
          />
          <p className="mt-1.5 text-xs text-theme-tertiary">
            Required. Add the morph in the credit when the photo shows one — a Dairy Cow
            standing in for every <em>Porcellio laevis</em> would misrepresent the species.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <select
            value={taxon}
            onChange={(e) => setTaxon(e.target.value)}
            className="px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary"
          >
            <option value="">All groups</option>
            {taxa.map((t) => (
              <option key={t} value={t}>
                {isInvertTaxon(t) ? INVERT_TAXA[t].label : t}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="flex-1 min-w-[200px] px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary"
          />
          <label className="flex items-center gap-2 text-sm text-theme-secondary">
            <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
            Only missing
          </label>
        </div>

        {loading ? (
          <p className="text-theme-secondary">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-theme-secondary">
            {missingOnly
              ? 'Nothing missing here — every species in this filter has a picture.'
              : 'No species match.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-4 p-3 rounded-xl border border-theme bg-surface"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-elevated flex items-center justify-center shrink-0">
                  {row.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.image_url} alt={row.scientific_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl" aria-hidden="true">
                      {isInvertTaxon(row.taxon) ? INVERT_TAXA[row.taxon].glyph : '🐾'}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-theme-primary italic truncate">
                    {row.scientific_name}
                  </p>
                  {row.common_names?.length > 0 && (
                    <p className="text-xs text-theme-tertiary truncate">
                      {row.common_names.join(' · ')}
                    </p>
                  )}
                  {row.image_attribution && (
                    <p className="text-xs text-theme-tertiary truncate mt-0.5">
                      {row.image_attribution}
                    </p>
                  )}
                </div>

                {doneIds.has(row.id) && (
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400 shrink-0">
                    Saved
                  </span>
                )}

                <input
                  ref={(el) => {
                    fileInputs.current[row.id] = el
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) upload(row, f)
                  }}
                />
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => fileInputs.current[row.id]?.click()}
                  className="shrink-0 px-3.5 py-1.5 rounded-full border border-theme text-primary text-xs font-bold hover:bg-primary-soft transition disabled:opacity-50"
                >
                  {busyId === row.id ? 'Uploading…' : row.image_url ? 'Replace' : 'Upload'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
