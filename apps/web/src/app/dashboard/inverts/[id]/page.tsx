'use client'

/**
 * Generic invert detail page (web) — ADR-006 web parity B2.
 *
 * Lean detail for non-tarantula taxa (scorpion / centipede / whip spider)
 * on the unified `inverts` surface. Tarantulas keep their rich
 * /dashboard/tarantulas/[id] page. Reads GET /inverts/{id}; logs are
 * fetched through the per-taxon facade prefix (e.g. /whip-spiders/{id}/
 * feedings). Add/edit + log forms are B3 — the buttons here route to
 * those pages.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { formatLocalDate } from '@/lib/date'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type TaxonKey = 'scorpion' | 'centipede' | 'whip_spider' | 'tarantula'

const TAXON_META: Record<TaxonKey, { glyph: string; label: string; prefix: string }> = {
  scorpion: { glyph: '🦂', label: 'Scorpion', prefix: 'scorpions' },
  centipede: { glyph: '🐛', label: 'Centipede', prefix: 'centipedes' },
  whip_spider: { glyph: '🕸️', label: 'Whip spider', prefix: 'whip-spiders' },
  tarantula: { glyph: '🕷', label: 'Tarantula', prefix: 'tarantulas' },
}

interface Invert {
  id: string
  taxon: TaxonKey
  name?: string | null
  common_name?: string | null
  scientific_name?: string | null
  sex?: string | null
  date_acquired?: string | null
  current_instar?: number | null
  current_length_mm?: string | number | null
  enclosure_type?: string | null
  enclosure_size?: string | null
  substrate_type?: string | null
  substrate_depth?: string | null
  target_temp_min?: string | number | null
  target_temp_max?: string | number | null
  target_humidity_min?: string | number | null
  target_humidity_max?: string | number | null
  water_dish?: boolean | null
  enclosure_notes?: string | null
  photo_url?: string | null
  notes?: string | null
  species_id?: string | null
}

interface FeedingLog { id: string; fed_at: string; food_type?: string | null; accepted: boolean; notes?: string | null }
interface MoltLog { id: string; molted_at: string; notes?: string | null }
interface SubstrateChange { id: string; changed_at: string; substrate_type?: string | null; substrate_depth?: string | null; reason?: string | null; notes?: string | null }
interface Photo { id: string; url: string; thumbnail_url?: string | null; caption?: string | null }

export default function InvertDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [invert, setInvert] = useState<Invert | null>(null)
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [substrate, setSubstrate] = useState<SubstrateChange[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getImageUrl = (url?: string | null) => {
    if (!url) return ''
    return url.startsWith('http') ? url : `${API_URL}${url}`
  }

  const fetchAll = useCallback(async () => {
    if (!id || !token) return
    setLoading(true)
    setError(null)
    const headers = { Authorization: `Bearer ${token}` }
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, { headers })
      if (!res.ok) throw new Error('Could not load this animal.')
      const data: Invert = await res.json()
      setInvert(data)

      // Logs go through the generic /inverts/{id}/… endpoints (ADR-007),
      // so this works for every taxon without a per-taxon prefix.
      const [f, m, s, p] = await Promise.all([
        fetch(`${API_URL}/api/v1/inverts/${id}/feedings`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${API_URL}/api/v1/inverts/${id}/molts`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${API_URL}/api/v1/inverts/${id}/substrate-changes`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(`${API_URL}/api/v1/inverts/${id}/photos`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ])
      setFeedings(Array.isArray(f) ? f : [])
      setMolts(Array.isArray(m) ? m : [])
      setSubstrate(Array.isArray(s) ? s : [])
      setPhotos(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    fetchAll()
  }, [isLoading, isAuthenticated, token, fetchAll, router])

  const handleDelete = async () => {
    if (!invert || !token) return
    if (!confirm(`Permanently delete ${displayName(invert)} and all its logs? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) throw new Error()
      router.push('/dashboard/tarantulas')
    } catch {
      alert('Could not delete this animal. Please try again.')
    }
  }

  // ── Inline log + photo management (ADR-008) ─────────────────────────────
  const deleteLog = async (path: string, label: string) => {
    if (!token) return
    if (!confirm(`Delete this ${label} entry? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/api/v1/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok && res.status !== 204) throw new Error()
      fetchAll()
    } catch { alert('Could not delete. Please try again.') }
  }

  const setHeroPhoto = async (photoId: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/v1/photos/${photoId}/set-main`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      fetchAll()
    } catch { alert('Could not set hero photo.') }
  }

  const deletePhoto = async (photoId: string) => {
    if (!token) return
    if (!confirm('Delete this photo? This cannot be undone.')) return
    try {
      const res = await fetch(`${API_URL}/api/v1/photos/${photoId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok && res.status !== 204) throw new Error()
      fetchAll()
    } catch { alert('Could not delete photo.') }
  }

  // Build an edit query string (logId triggers edit mode on the add-* page).
  const qp = (obj: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

  const meta = invert ? TAXON_META[invert.taxon] : null
  const isWhipSpider = invert?.taxon === 'whip_spider'

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/dashboard/tarantulas" className="text-sm text-primary-600 hover:underline mb-4 inline-block">
          ← Back to collection
        </Link>

        {loading && <p className="text-theme-secondary">Loading…</p>}

        {error && !loading && (
          <div className="text-center py-12">
            <p className="text-theme-secondary mb-4">{error}</p>
            <button onClick={fetchAll} className="px-4 py-2 bg-gradient-brand text-white rounded-lg">Retry</button>
          </div>
        )}

        {invert && meta && !loading && (
          <>
            {/* Hero */}
            <div className="relative h-56 rounded-2xl overflow-hidden bg-gradient-to-br from-electric-blue-900/30 to-neon-pink-900/30 mb-6 flex items-center justify-center">
              {invert.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={getImageUrl(invert.photo_url)} alt={displayName(invert)} className="w-full h-full object-cover" />
              ) : (
                <span className="text-7xl">{meta.glyph}</span>
              )}
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => router.push(`/dashboard/inverts/${id}/edit`)}
                  className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg bg-red-600/90 text-white text-sm font-semibold backdrop-blur-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Identity */}
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-surface border border-theme text-theme-secondary text-xs font-semibold">
                  {meta.glyph} {meta.label}
                </span>
                {invert.species_id && (
                  <Link href={`/species/inverts/${invert.species_id}`} className="text-xs text-primary-600 hover:underline">
                    View care sheet →
                  </Link>
                )}
              </div>
              <h1 className="text-3xl font-bold text-theme-primary mt-2">
                {invert.name || invert.common_name || 'Unnamed'}
              </h1>
              {invert.scientific_name && (
                <p className="text-lg italic text-theme-secondary">{invert.scientific_name}</p>
              )}
            </div>

            {/* Identity facts */}
            <Section title="Identity">
              <Fact label="Sex" value={cap(invert.sex)} />
              <Fact label="Molts" value={invert.current_instar != null ? String(invert.current_instar) : null} />
              <Fact
                label={isWhipSpider ? 'Leg span' : 'Size'}
                value={invert.current_length_mm != null ? `${invert.current_length_mm} mm` : null}
              />
              <Fact label="Acquired" value={invert.date_acquired ? formatLocalDate(invert.date_acquired) : null} />
            </Section>

            {/* Husbandry */}
            {hasHusbandry(invert) && (
              <Section title="Husbandry">
                <Fact label="Type" value={cap(invert.enclosure_type)} />
                <Fact label="Size" value={invert.enclosure_size} />
                <Fact label="Substrate" value={invert.substrate_type} />
                <Fact label="Substrate depth" value={invert.substrate_depth} />
                {(invert.target_temp_min || invert.target_temp_max) && (
                  <Fact label="Temperature" value={`${invert.target_temp_min ?? '?'}–${invert.target_temp_max ?? '?'} °F`} />
                )}
                {(invert.target_humidity_min || invert.target_humidity_max) && (
                  <Fact label="Humidity" value={`${invert.target_humidity_min ?? '?'}–${invert.target_humidity_max ?? '?'}%`} />
                )}
                <Fact label="Water dish" value={invert.water_dish ? 'Yes' : 'No'} />
              </Section>
            )}

            {/* Logs */}
            <LogSection
              title="Feedings"
              cta="Log feeding"
              onCta={() => router.push(`/dashboard/inverts/${id}/add-feeding`)}
              empty="No feedings logged yet."
              rows={feedings.slice(0, 8).map((x) => ({
                key: x.id,
                left: `${x.food_type || 'Feeding'} · ${x.accepted ? 'Accepted' : 'Refused'}`,
                right: formatLocalDate(x.fed_at),
                onEdit: () => router.push(`/dashboard/inverts/${id}/add-feeding?${qp({ logId: x.id, fed_at: x.fed_at, food_type: x.food_type, accepted: x.accepted, notes: x.notes })}`),
                onDelete: () => deleteLog(`feedings/${x.id}`, 'feeding'),
              }))}
            />
            <LogSection
              title="Molts"
              cta="Log molt"
              onCta={() => router.push(`/dashboard/inverts/${id}/add-molt`)}
              empty="No molts logged yet."
              rows={molts.slice(0, 8).map((x) => ({
                key: x.id, left: 'Molt', right: formatLocalDate(x.molted_at),
                onEdit: () => router.push(`/dashboard/inverts/${id}/add-molt?${qp({ logId: x.id, molted_at: x.molted_at, notes: x.notes })}`),
                onDelete: () => deleteLog(`molts/${x.id}`, 'molt'),
              }))}
            />
            <LogSection
              title="Substrate changes"
              cta="Log substrate change"
              onCta={() => router.push(`/dashboard/inverts/${id}/add-substrate-change`)}
              empty="No substrate changes logged yet."
              rows={substrate.slice(0, 8).map((x) => ({
                key: x.id, left: x.substrate_type || 'Substrate change', right: formatLocalDate(x.changed_at),
                onEdit: () => router.push(`/dashboard/inverts/${id}/add-substrate-change?${qp({ logId: x.id, changed_at: x.changed_at, substrate_type: x.substrate_type, substrate_depth: x.substrate_depth, reason: x.reason, notes: x.notes })}`),
                onDelete: () => deleteLog(`substrate-changes/${x.id}`, 'substrate change'),
              }))}
            />

            {/* Photos */}
            <Section
              title="Photos"
              action={{ label: 'Add photo', onClick: () => router.push(`/dashboard/inverts/${id}/add-photo`) }}
            >
              {photos.length === 0 ? (
                <p className="text-sm text-theme-tertiary italic">No photos yet.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto">
                  {photos.map((p) => {
                    const isHero = invert.photo_url === p.url
                    return (
                      <div key={p.id} className="group relative flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getImageUrl(p.thumbnail_url || p.url)}
                          alt={p.caption || ''}
                          className="w-24 h-24 rounded-lg object-cover"
                        />
                        {isHero && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold">★ Hero</span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-black/55 rounded-b-lg py-1 opacity-0 group-hover:opacity-100 transition">
                          {!isHero && (
                            <button onClick={() => setHeroPhoto(p.id)} className="text-[10px] font-semibold text-white hover:underline" aria-label="Set as hero photo">
                              Set hero
                            </button>
                          )}
                          <button onClick={() => deletePhoto(p.id)} className="text-[10px] font-semibold text-red-300 hover:underline" aria-label="Delete photo">
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {invert.notes && (
              <Section title="Notes">
                <p className="text-sm text-theme-secondary whitespace-pre-line">{invert.notes}</p>
              </Section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function displayName(i: Invert): string {
  return i.name || i.common_name || i.scientific_name || 'this animal'
}

function cap(s?: string | null): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function hasHusbandry(i: Invert): boolean {
  return Boolean(
    i.enclosure_type || i.enclosure_size || i.substrate_type || i.substrate_depth ||
    i.target_temp_min || i.target_temp_max || i.target_humidity_min || i.target_humidity_max,
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-theme rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-theme-primary">{title}</h2>
        {action && (
          <button onClick={action.onClick} className="text-sm font-semibold text-primary-600 hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between py-1.5 border-b border-theme last:border-0">
      <span className="text-sm text-theme-tertiary">{label}</span>
      <span className="text-sm font-medium text-theme-primary text-right ml-3">{value}</span>
    </div>
  )
}

function LogSection({
  title,
  cta,
  onCta,
  empty,
  rows,
}: {
  title: string
  cta: string
  onCta: () => void
  empty: string
  rows: { key: string; left: string; right: string; onEdit?: () => void; onDelete?: () => void }[]
}) {
  return (
    <Section title={title} action={{ label: cta, onClick: onCta }}>
      {rows.length === 0 ? (
        <p className="text-sm text-theme-tertiary italic">{empty}</p>
      ) : (
        rows.map((r) => (
          <div key={r.key} className="group flex items-center gap-3 py-1.5 border-b border-theme last:border-0">
            <span className="flex-1 text-sm text-theme-primary">{r.left}</span>
            <span className="text-sm text-theme-tertiary">{r.right}</span>
            {r.onEdit && (
              <button
                onClick={r.onEdit}
                className="text-xs font-semibold text-primary-600 hover:underline opacity-60 group-hover:opacity-100 transition"
                aria-label={`Edit ${title.toLowerCase()} entry`}
              >
                Edit
              </button>
            )}
            {r.onDelete && (
              <button
                onClick={r.onDelete}
                className="text-xs font-semibold text-red-600 hover:underline opacity-60 group-hover:opacity-100 transition"
                aria-label={`Delete ${title.toLowerCase()} entry`}
              >
                Delete
              </button>
            )}
          </div>
        ))
      )}
    </Section>
  )
}
