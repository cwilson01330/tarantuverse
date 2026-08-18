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
import GrowthChart from '@/components/GrowthChart'
import UpgradeModal from '@/components/UpgradeModal'
import {
  DEATH_CAUSE_LABELS,
  DEATH_CAUSE_ORDER,
  markInvertDied,
  tenureLabel,
  reviveInvert,
  type DeathCause,
} from '@/lib/animal-lifecycle'
import { taxonHasModule, growthLengthLabel } from '@/lib/inverts'
import { formatLocalDate } from '@/lib/date'
import FeedingCadenceDialog from '@/components/FeedingCadenceDialog'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary'

/** Local calendar today as YYYY-MM-DD. Not toISOString() — that's UTC, and
 *  would offer "tomorrow" to anyone east of Greenwich late in the day. */
function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Loading ≠ zero ≠ error.
 *
 * A count of 0 is a claim we verified. An em dash is the tell for "we don't
 * know". Rendering "No feedings logged yet." after a failed request converts
 * ignorance into a fact about the animal, and the keeper has no way to tell
 * the difference — which is exactly the case where they'd most want to.
 */
type LoadState = 'loading' | 'ok' | 'error' 

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
  provenance?: Record<string, any> | null
  bred_by_user_id?: string | null
  origin_keeper_name?: string | null
  transferred_out_at?: string | null
  // ADR-015. Non-null makes this a historical record: kept in full, out of the
  // collection, the cap, feeding status and every reminder.
  died_at?: string | null
  death_cause?: DeathCause | null
  death_notes?: string | null
  // ADR-017 — the keeper's own feeding cadence in days. null means the app
  // derives it from the care sheet or life stage, which is the default.
  feeding_interval_days?: number | null
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
  const [logState, setLogState] = useState<Record<'feedings' | 'molts' | 'substrate' | 'photos', LoadState>>({
    feedings: 'loading', molts: 'loading', substrate: 'loading', photos: 'loading',
  })
  const [growth, setGrowth] = useState<any | null>(null)
  // Breeding module (registry-gated, ADR-010 Phase D)
  const [pairings, setPairings] = useState<any[]>([])
  const [mates, setMates] = useState<Invert[]>([])
  const [pairOpen, setPairOpen] = useState(false)
  // Mark-as-died. Its own dialog rather than a field on edit, so this can't
  // happen as a side effect of an incidental save.
  const [cadenceOpen, setCadenceOpen] = useState(false)
  const [diedOpen, setDiedOpen] = useState(false)
  const [diedDate, setDiedDate] = useState('')
  const [diedCause, setDiedCause] = useState<DeathCause | ''>('')
  const [diedNotes, setDiedNotes] = useState('')
  const [diedExpanded, setDiedExpanded] = useState(false)
  const [diedBusy, setDiedBusy] = useState(false)
  const [diedError, setDiedError] = useState('')

  const tenure = tenureLabel(invert?.date_acquired, invert?.died_at)
  const [pairMateId, setPairMateId] = useState('')
  const [pairDate, setPairDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [pairType, setPairType] = useState('natural')
  const [pairBusy, setPairBusy] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  // Transfer ("rehome")
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferNote, setTransferNote] = useState('')
  const [transferPrice, setTransferPrice] = useState('')
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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
      // Per-source load state. These used to end in `.catch(() => [])`, which
      // turned a failed request into an empty array — and the section then
      // rendered "No feedings logged yet." A connection problem was displayed
      // as a verified fact about the animal's history, which is the honesty
      // violation the audit named: loading ≠ zero ≠ error.
      const load = async <T,>(path: string): Promise<{ data: T[]; state: LoadState }> => {
        try {
          const r = await fetch(`${API_URL}/api/v1/inverts/${id}/${path}`, { headers })
          if (!r.ok) return { data: [], state: 'error' }
          return { data: await r.json(), state: 'ok' }
        } catch {
          return { data: [], state: 'error' }
        }
      }

      const [f, m, s, p, g] = await Promise.all([
        load<any>('feedings'),
        load<any>('molts'),
        load<any>('substrate-changes'),
        load<any>('photos'),
        // Growth module is registry-gated (ADR-008) — only fetch where enabled
        taxonHasModule(data.taxon, 'growth')
          ? fetch(`${API_URL}/api/v1/inverts/${id}/growth`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : Promise.resolve(null),
      ])
      setFeedings(f.data)
      setMolts(m.data)
      setSubstrate(s.data)
      setPhotos(p.data)
      setLogState({
        feedings: f.state,
        molts: m.state,
        substrate: s.state,
        photos: p.state,
      })
      setGrowth(g)

      // Breeding module (registry-gated — ADR-010 Phase D). Fetch this
      // animal's pairings + the same-taxon collection for the mate picker.
      if (taxonHasModule(data.taxon, 'breeding')) {
        const [pr, coll] = await Promise.all([
          fetch(`${API_URL}/api/v1/inverts/${id}/pairings`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
          fetch(`${API_URL}/api/v1/inverts/?taxon=${data.taxon}`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ])
        setPairings(Array.isArray(pr) ? pr : [])
        setMates((Array.isArray(coll) ? coll : []).filter((x: Invert) => x.id !== id))
      }
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

  const openDied = () => {
    // Default to today, but leave it editable — backdating is normal, because
    // most people log this once they've dealt with it.
    setDiedDate(todayIso())
    setDiedCause('')
    setDiedNotes('')
    setDiedExpanded(false)
    setDiedError('')
    setDiedOpen(true)
  }

  const submitDied = async () => {
    if (!token || !id || diedBusy) return
    setDiedBusy(true)
    setDiedError('')
    try {
      await markInvertDied(token, String(id), {
        died_at: diedDate || null,
        death_cause: diedCause || null,
        death_notes: diedNotes.trim() || null,
      })
      setDiedOpen(false)
      await fetchAll()
    } catch (e) {
      // Stay open. Closing on failure would look like it worked, and they'd
      // find the animal still in their collection later with no idea why.
      setDiedError(e instanceof Error ? e.message : 'Couldn’t save that. Nothing has changed.')
    } finally {
      setDiedBusy(false)
    }
  }

  const handleRevive = async () => {
    if (!token || !id) return
    if (!confirm('Restore this animal to your collection? They’ll count toward your plan again and reappear in your reminders.')) return
    try {
      await reviveInvert(token, String(id))
      await fetchAll()
    } catch {
      alert('Could not restore. Please try again.')
    }
  }

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

  const createPairing = async () => {
    if (!token || !invert || pairBusy) return
    if (!pairMateId) { alert('Pick a mate.'); return }
    setPairBusy(true)
    try {
      // Infer male/female from this animal's sex (default self→male unless
      // explicitly female). The pairing's parents can be refined later; the
      // backend validates same-taxon, not sex.
      const selfFemale = invert.sex === 'female'
      const body = {
        male_invert_id: selfFemale ? pairMateId : invert.id,
        female_invert_id: selfFemale ? invert.id : pairMateId,
        paired_date: pairDate,
        pairing_type: pairType,
      }
      const res = await fetch(`${API_URL}/api/v1/inverts/pairings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.status === 402) { setPairOpen(false); setShowUpgrade(true); return }
      if (!res.ok) throw new Error()
      setPairOpen(false)
      setPairMateId('')
      fetchAll()
    } catch {
      alert('Could not create the pairing. Please try again.')
    } finally {
      setPairBusy(false)
    }
  }

  const createTransfer = async () => {
    if (transferBusy) return
    setTransferBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/inverts/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          note: transferNote.trim() || null,
          sale_price: transferPrice.trim() ? Number(transferPrice) : null,
          include_photos: true,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        const d = body?.detail
        alert(typeof d === 'string' ? d : d?.message || 'Could not create the transfer.')
        return
      }
      const data = await res.json()
      setClaimUrl(data.claim_url)
    } catch {
      alert('Could not create the transfer. Please try again.')
    } finally {
      setTransferBusy(false)
    }
  }

  const copyClaim = async () => {
    if (!claimUrl) return
    try { await navigator.clipboard.writeText(claimUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  // Resolve the "other parent" name for a pairing row.
  const mateName = (p: any): string => {
    const otherId = p.male_invert_id === id ? p.female_invert_id : p.male_invert_id
    const m = mates.find((x) => x.id === otherId)
    return m ? displayName(m) : 'Unknown mate'
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
                {/* Mark as died is the exit for an animal that died; delete
                    survives for records added by mistake, which is what it's
                    actually for. Neutral, not red — this destroys nothing. */}
                {invert?.died_at ? (
                  <button
                    onClick={handleRevive}
                    className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    onClick={openDied}
                    className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                  >
                    Mark as died
                  </button>
                )}
                {/* ADR-017 — an offer, not a setting. Once set it reports the
                    value, so the control doubles as the indicator. This page
                    has no feeding-stats card (an ADR-016 gap), so the animal
                    record is the only source for the current value here. */}
                <button
                  onClick={() => setCadenceOpen(true)}
                  className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                >
                  {invert?.feeding_interval_days
                    ? `Every ${invert.feeding_interval_days}d`
                    : 'Feeding schedule'}
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
              state={logState.feedings}
              onRetry={fetchAll}
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
              state={logState.molts}
              onRetry={fetchAll}
              rows={molts.slice(0, 8).map((x) => ({
                key: x.id, left: 'Molt', right: formatLocalDate(x.molted_at),
                onEdit: () => router.push(`/dashboard/inverts/${id}/add-molt?${qp({ logId: x.id, molted_at: x.molted_at, notes: x.notes })}`),
                onDelete: () => deleteLog(`molts/${x.id}`, 'molt'),
              }))}
            />

            {/* Provenance block (BRIEF §6) — render only what we actually know.
                Full "Pedigree" only when dam/sire present; else plain provenance. */}
            {invert?.provenance && (
              <Section title="Provenance">
                <dl className="text-sm text-theme-secondary space-y-1">
                  {invert.provenance.breeder_handle && (
                    <div className="flex justify-between gap-4"><dt className="text-theme-tertiary">Bred / sold by</dt><dd>@{invert.provenance.breeder_handle}</dd></div>
                  )}
                  {invert.provenance.dam_scientific_name && (
                    <div className="flex justify-between gap-4"><dt className="text-theme-tertiary">Dam</dt><dd className="italic text-right">{invert.provenance.dam_scientific_name}</dd></div>
                  )}
                  {invert.provenance.sire_scientific_name && (
                    <div className="flex justify-between gap-4"><dt className="text-theme-tertiary">Sire</dt><dd className="italic text-right">{invert.provenance.sire_scientific_name}</dd></div>
                  )}
                  {invert.provenance.sac_laid_date && (
                    <div className="flex justify-between gap-4"><dt className="text-theme-tertiary">Sac laid</dt><dd>{invert.provenance.sac_laid_date}</dd></div>
                  )}
                  {invert.provenance.transferred_at && (
                    <div className="flex justify-between gap-4"><dt className="text-theme-tertiary">Acquired via transfer</dt><dd>{formatLocalDate(invert.provenance.transferred_at)}</dd></div>
                  )}
                </dl>
              </Section>
            )}

            {/* Transfer / rehome (BRIEF §6) — owner action. Hidden once handed off. */}
            {invert && !invert.transferred_out_at && (
              <Section title="Transfer / rehome" action={{ label: 'Generate claim link', onClick: () => { setClaimUrl(null); setTransferOpen(true) } }}>
                <p className="text-sm text-theme-tertiary">
                  Sold or rehoming this {meta?.label.toLowerCase()}? Generate a claim link the
                  buyer can use to add it to their collection — pre-loaded with species,
                  provenance, and photos. We never process the sale.
                </p>
              </Section>
            )}
            {/* Status card. The mark is a filled slate dot — a full stop at
                the end of a sentence. Never red: red means destructive action
                everywhere else here, and nothing was destroyed. */}
            {invert?.died_at && (
              <div className="mb-6 p-4 rounded-2xl border border-theme bg-surface">
                <div className="flex items-center gap-2.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" aria-hidden="true" />
                  <p className="font-semibold text-theme-primary">
                    Died {formatLocalDate(invert.died_at)}
                  </p>
                </div>
                {tenure && <p className="mt-1 text-sm text-theme-secondary">In your care {tenure}</p>}
                <p className="mt-2 text-sm text-theme-secondary">
                  {invert.death_cause ? `${DEATH_CAUSE_LABELS[invert.death_cause]}. ` : ''}
                  This is a historical record — everything below is kept. They&apos;re out of
                  your collection, your reminders and your animal count.
                </p>
                {invert.death_notes && (
                  <p className="mt-2 text-sm italic text-theme-tertiary">{invert.death_notes}</p>
                )}
                <p className="mt-3 text-xs text-theme-tertiary">
                  Logging is closed. Records stay readable and exportable.
                </p>
              </div>
            )}

            {invert?.transferred_out_at && (
              <Section title="Transfer / rehome">
                <p className="text-sm text-theme-tertiary">
                  ✓ Transferred {formatLocalDate(invert.transferred_out_at)}. This is a historical record.
                </p>
              </Section>
            )}

            {/* Growth module (registry-gated — ADR-008 rollout, scorpion pilot) */}
            {invert && taxonHasModule(invert.taxon, 'growth') && growth && growth.total_molts > 0 && (
              <GrowthChart data={growth} lengthLabel={growthLengthLabel(invert.taxon)} />
            )}

            {/* Breeding module (registry-gated — ADR-010 Phase D) */}
            {invert && taxonHasModule(invert.taxon, 'breeding') && (
              <Section title="Breeding" action={{ label: '+ New pairing', onClick: () => setPairOpen(true) }}>
                {pairings.length === 0 ? (
                  <p className="text-sm text-theme-tertiary">
                    No pairings yet. Pair this {meta?.label.toLowerCase()} with another from your collection to start tracking.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pairings.map((p) => (
                      <div key={p.id} className="p-3 rounded-lg border border-theme">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-theme-primary">with {mateName(p)}</span>
                          <span className="text-xs text-theme-tertiary capitalize">{(p.outcome || '').replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-xs text-theme-tertiary mt-0.5">Paired {formatLocalDate(p.paired_date)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <LogSection
              title="Substrate changes"
              cta="Log substrate change"
              onCta={() => router.push(`/dashboard/inverts/${id}/add-substrate-change`)}
              empty="No substrate changes logged yet."
              state={logState.substrate}
              onRetry={fetchAll}
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

      {/* Keeper feeding cadence — ADR-017. Same dialog as the legacy tarantula
          page; it always addresses /inverts/{id}, which is this page's own
          endpoint anyway. */}
      <FeedingCadenceDialog
        open={cadenceOpen}
        animalId={id as string}
        token={token}
        current={invert?.feeding_interval_days ?? null}
        derivedDays={null}
        derivedSource={null}
        onClose={() => setCadenceOpen(false)}
        onSaved={fetchAll}
      />

      {/* New pairing modal (breeding module) */}
      {/* Mark as died. The dialog IS the confirm — the date is already
          defaulted, so the flow completes in one click. Cause and note sit
          behind one optional line so this never reads as a form. */}
      {diedOpen && invert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !diedBusy && setDiedOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-theme bg-surface p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-theme-primary">
              Mark {invert.name || invert.common_name || 'this animal'} as died
            </h2>

            {/* The most reassuring fact available, and it was invisible before
                this dialog existed. Counts come from the fetch this page
                already ran. */}
            <p className="text-sm text-theme-secondary">
              Nothing is deleted. {feedings.length > 0 || molts.length > 0 || photos.length > 0
                ? `Their ${[
                    feedings.length ? `${feedings.length} feeding${feedings.length === 1 ? '' : 's'}` : null,
                    molts.length ? `${molts.length} molt${molts.length === 1 ? '' : 's'}` : null,
                    photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : null,
                  ].filter(Boolean).join(', ')} stay in your records, and they stop counting toward your plan.`
                : 'Every feeding, molt and photo stays in your records, and they stop counting toward your plan.'}
            </p>

            <label className="block">
              <span className="block text-sm font-medium text-theme-secondary mb-1">
                Date of death
              </span>
              <input
                type="date"
                value={diedDate}
                // Today, not the current selection — the server rejects future
                // dates anyway, but the picker should say so first.
                max={todayIso()}
                onChange={(e) => setDiedDate(e.target.value)}
                className={inputCls}
              />
              <span className="block mt-1 text-xs text-theme-tertiary">
                Backdating is fine — pick any past date.
              </span>
            </label>

            {diedExpanded && (
              <>
                <fieldset>
                  <legend className="block text-sm font-medium text-theme-secondary mb-1">
                    Cause <span className="text-theme-tertiary font-normal">Optional</span>
                  </legend>
                  {/* Chips, not a dropdown — "I don't know" has to be as easy
                      to pick as a real cause, or people guess. */}
                  <div className="flex flex-wrap gap-2">
                    {DEATH_CAUSE_ORDER.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDiedCause(diedCause === c ? '' : c)}
                        aria-pressed={diedCause === c}
                        className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                          diedCause === c
                            ? 'bg-theme-primary border-theme-primary text-surface'
                            : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                        }`}
                      >
                        {DEATH_CAUSE_LABELS[c]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Note <span className="text-theme-tertiary font-normal">Optional</span>
                  </span>
                  <textarea
                    value={diedNotes}
                    onChange={(e) => setDiedNotes(e.target.value)}
                    rows={2}
                    placeholder="Stuck in the old exoskeleton at the third leg…"
                    className={inputCls}
                  />
                </label>
              </>
            )}

            {diedError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{diedError}</p>
            )}

            {/* Neutral ink, never the accent — colors.primary is user-chosen,
                and someone who picked hot pink shouldn't get it here. Never
                red either: red means destructive, and this destroys nothing. */}
            <button
              type="button"
              onClick={submitDied}
              disabled={diedBusy}
              className="w-full py-3 rounded-xl bg-theme-primary text-surface font-semibold disabled:opacity-60"
            >
              {diedBusy ? 'Saving…' : 'Mark as died'}
            </button>

            {!diedExpanded && (
              <button
                type="button"
                onClick={() => setDiedExpanded(true)}
                className="w-full text-sm font-semibold text-theme-secondary hover:underline"
              >
                Add a cause or a note
              </button>
            )}
            <button
              type="button"
              onClick={() => setDiedOpen(false)}
              className="w-full text-sm text-theme-tertiary hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pairOpen && invert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => !pairBusy && setPairOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface rounded-2xl p-6 border border-theme"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-theme-primary mb-1">New pairing</h3>
            <p className="text-sm text-theme-tertiary mb-4">
              Pair {displayName(invert)} with another {meta?.label.toLowerCase()} from your collection.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1">Mate</label>
            <select
              value={pairMateId}
              onChange={(e) => setPairMateId(e.target.value)}
              className="w-full mb-1 px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary"
            >
              <option value="">Select…</option>
              {mates.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m)}{m.sex ? ` (${m.sex})` : ''}
                </option>
              ))}
            </select>
            {mates.length === 0 && (
              <p className="text-xs text-theme-tertiary mb-3">
                No other {meta?.label.toLowerCase()}s in your collection yet — add one to pair.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 mt-3 mb-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1">Paired date</label>
                <input
                  type="date"
                  value={pairDate}
                  onChange={(e) => setPairDate(e.target.value)}
                  className="w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1">Type</label>
                <select
                  value={pairType}
                  onChange={(e) => setPairType(e.target.value)}
                  className="w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary capitalize"
                >
                  <option value="natural">Natural</option>
                  <option value="assisted">Assisted</option>
                  <option value="forced">Forced</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPairOpen(false)}
                disabled={pairBusy}
                className="px-4 py-2 text-sm font-medium text-theme-secondary hover:text-theme-primary transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createPairing}
                disabled={pairBusy || !pairMateId}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
              >
                {pairBusy ? 'Saving…' : 'Create pairing'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Breeding Module"
        description="Track pairings, egg sacs, and offspring across the season. Upgrade to unlock breeding for your whole collection."
      />

      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !transferBusy && setTransferOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 border border-gray-200 dark:border-gray-700 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Transfer this animal</h3>
            {!claimUrl ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Generate a one-time claim link to hand this {meta?.label.toLowerCase()} to its
                  new keeper. The sale happens on your own channel — this only moves the record.
                </p>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note to buyer (optional)</label>
                <textarea
                  value={transferNote} onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="e.g. 0.0.1 sling, last molt 6/1, eating well"
                  className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                  rows={2}
                />
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sale price (private — for your records only)</label>
                <input
                  value={transferPrice} onChange={(e) => setTransferPrice(e.target.value)}
                  inputMode="decimal" placeholder="$ optional"
                  className="w-full px-3 py-2 mb-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => setTransferOpen(false)} disabled={transferBusy} className="flex-1 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold">Cancel</button>
                  <button onClick={createTransfer} disabled={transferBusy} className="flex-1 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">{transferBusy ? 'Generating…' : 'Generate link'}</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Share this link with the buyer. When they claim it, this animal moves to their
                  collection and yours becomes a transferred record.
                </p>
                <div className="flex items-center gap-2 mb-4">
                  <input readOnly value={claimUrl} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 text-xs" />
                  <button onClick={copyClaim} className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold whitespace-nowrap">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <button onClick={() => { setTransferOpen(false); fetchAll() }} className="w-full px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold">Done</button>
              </>
            )}
          </div>
        </div>
      )}
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
  state = 'ok',
  onRetry,
}: {
  title: string
  cta: string
  onCta: () => void
  empty: string
  rows: { key: string; left: string; right: string; onEdit?: () => void; onDelete?: () => void }[]
  /** Loading ≠ zero ≠ error — see LoadState. */
  state?: LoadState
  onRetry?: () => void
}) {
  return (
    <Section title={title} action={{ label: cta, onClick: onCta }}>
      {state === 'loading' ? (
        // No text and no count. We don't know yet, so we say nothing.
        <div className="space-y-2" aria-busy="true">
          <div className="h-4 w-2/3 rounded bg-surface-elevated animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface-elevated animate-pulse" />
        </div>
      ) : state === 'error' ? (
        // Never the empty copy. These records still exist; we failed to fetch
        // them, and saying otherwise would be a claim about the animal.
        <div role="alert" className="text-sm text-theme-secondary">
          <p>
            We couldn&apos;t load {title.toLowerCase()}. They&apos;re still here — this is a
            connection problem.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      ) : rows.length === 0 ? (
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
