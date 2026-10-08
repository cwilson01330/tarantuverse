'use client'

/**
 * Animal detail page (web) for every taxon on the unified `inverts` surface.
 *
 * Since B5 (2026-10-07) this is the ONLY web detail page: the bespoke
 * /dashboard/tarantulas/[id] page redirects here, the way mobile's
 * tarantula/[id] already redirects to invert/[id] (ADR-013). Tarantula-only
 * extras (premolt, the richer feeding stats) are gated by the module
 * registry in lib/inverts.ts, not by a second page. Reads GET /inverts/{id};
 * logs come from the generic /inverts/{id}/… endpoints.
 */
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import GrowthChart from '@/components/GrowthChart'
import ShareCardModal from '@/components/ShareCardModal'
import UpgradeModal from '@/components/UpgradeModal'
import {
  ANIMAL_EVENT_LABELS,
  DEATH_CAUSE_LABELS,
  DEATH_CAUSE_ORDER,
  markInvertDied,
  tenureLabel,
  reviveInvert,
  type AnimalEvent,
  type DeathCause,
} from '@/lib/animal-lifecycle'
import AnimalEventDialog from '@/components/AnimalEventDialog'
import {
  taxonHasModule, growthLengthLabel, clutchSectionLabel, offspringNoun, taxonLaysClutch, showGrowthChart, lastMoltAgo,
  tracksInstars, formatStage, stageSummary, elapsedSince, stageCountLabel, adultStageHint,
  INVERT_TAXA, isInvertTaxon, type InvertTaxon,
} from '@/lib/inverts'
import { formatLocalDate } from '@/lib/date'
import FeedingCadenceDialog from '@/components/FeedingCadenceDialog'
import SpeciesLinkBanner from '@/components/SpeciesLinkBanner'
import InvertFeedingStatus, {
  type InvertFeedingStats,
} from '@/components/InvertFeedingStatus'
import FeedingStatsCard, { type FeedingStats as TarantulaFeedingStats } from '@/components/FeedingStatsCard'
import PauseFeedingModal from '@/components/PauseFeedingModal'
import PremoltPredictionSection from '@/components/PremoltPredictionSection'
import QRModal from '@/components/QRModal'
import { useUnits } from '@/components/UnitsProvider'
import { formatLengthMm, formatTempRange } from '@/lib/units'
import { ROLE_LABEL, attribution, can, useCollectionRole, type CollectionRole } from '@/lib/coKeepers'

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

// Glyph + label come from the shared registry. This page used to keep its own
// four-taxon table, so a mantis, jumper, millipede or roach resolved to no
// meta at all and the page rendered nothing but the back link.
function taxonMeta(taxon: string) {
  return INVERT_TAXA[isInvertTaxon(taxon) ? taxon : 'other']
}

interface Invert {
  id: string
  user_id?: string
  taxon: InvertTaxon
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
  misting_schedule?: string | null
  last_substrate_change?: string | null
  last_enclosure_cleaning?: string | null
  enclosure_notes?: string | null
  /** Room / rack / shelf (lib/locations). */
  location?: string | null
  // Feeding pause (pst_20260502). The page reads the live state from
  // feedingStats, which also applies the "until" date; these are the stored
  // values.
  feeding_paused_reason?: string | null
  feeding_paused_until?: string | null
  /** 'public' | 'private' is the source of truth; is_public is kept in step. */
  visibility?: string | null
  is_public?: boolean | null
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

interface Attributed { logged_by_user_id?: string | null; logged_by_name?: string | null; sitter_name?: string | null }
interface FeedingLog extends Attributed { id: string; fed_at: string; food_type?: string | null; food_size?: string | null; accepted: boolean; notes?: string | null }
interface MoltLog extends Attributed { id: string; molted_at: string; notes?: string | null; outcome?: string | null; is_ultimate?: boolean; leg_span_after?: string | number | null }
interface SubstrateChange extends Attributed { id: string; changed_at: string; substrate_type?: string | null; substrate_depth?: string | null; reason?: string | null; notes?: string | null }
/** Hydration events (car_20260909). Three types, because a top-up, a
 *  deliberate overflow to damp the substrate, and a misting are three
 *  different acts — see the care_log model docstring. */
type CareLogType = 'water_dish' | 'overflow' | 'misted'
interface CareLog extends Attributed { id: string; log_type: CareLogType; logged_at: string; notes?: string | null }
const CARE_LOG_LABELS: Record<CareLogType, string> = {
  water_dish: 'Water dish refreshed',
  overflow: 'Dish overflowed',
  misted: 'Misted',
}
interface Photo { id: string; url: string; thumbnail_url?: string | null; caption?: string | null }

/** The tarantula-only feeding analytics. Null on any failure — the card is an
 *  extra, and the verdict above it already says whether she's due. */
function fetchTarantulaStats(id: string, headers: Record<string, string>): Promise<TarantulaFeedingStats | null> {
  return fetch(
    `${API_URL}/api/v1/tarantulas/${id}/feeding-stats?tz_offset_minutes=${new Date().getTimezoneOffset()}`,
    { headers },
  ).then((r) => (r.ok ? r.json() : null)).catch(() => null)
}

function fetchInvertStats(id: string, headers: Record<string, string>): Promise<InvertFeedingStats | null> {
  return fetch(
    `${API_URL}/api/v1/inverts/${id}/feeding-stats?tz_offset_minutes=${new Date().getTimezoneOffset()}`,
    { headers },
  ).then((r) => (r.ok ? r.json() : null)).catch(() => null)
}

/**
 * `?log=molt` / `?log=feeding` deep links (the public /t/ and /i/ pages send
 * them). Its own component so useSearchParams sits inside a Suspense boundary,
 * which Next 14 requires. Acts once, and only for someone who can log here.
 * The query is stripped from history first, so Back from the form returns to
 * this page instead of bouncing into the form again.
 */
function LogDeepLink({ id, canLog, ready }: { id: string; canLog: boolean; ready: boolean }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const done = useRef(false)
  const log = searchParams?.get('log')
  useEffect(() => {
    if (done.current || !ready || !id) return
    if (log !== 'molt' && log !== 'feeding') return
    done.current = true
    window.history.replaceState(null, '', `/dashboard/inverts/${id}`)
    if (canLog) router.push(`/dashboard/inverts/${id}/add-${log}`)
  }, [log, id, canLog, ready, router])
  return null
}

export default function InvertDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const { units } = useUnits()

  const [invert, setInvert] = useState<Invert | null>(null)
  // Co-keepers (PRD-shared-keeping rung 3): what can this viewer do here? Only
  // hides controls — the API enforces every rule itself. Your own animal is
  // known to be 'owner' immediately, so owners never see a flicker.
  const shared = useCollectionRole(token, user?.id, invert?.user_id)
  const isMine = !!invert?.user_id && !!user?.id && invert.user_id === user.id
  const viewerRole: CollectionRole | null = isMine ? 'owner' : shared.role
  const isOwner = viewerRole === 'owner'
  const canKeep = can(viewerRole, 'keeper')
  const canLog = can(viewerRole, 'logger')
  // Loggers change only their own entries; keepers and the owner, any.
  const canChange = (x: Attributed) => canKeep || (canLog && !!user?.id && x.logged_by_user_id === user.id)
  const [feedings, setFeedings] = useState<FeedingLog[]>([])
  const [molts, setMolts] = useState<MoltLog[]>([])
  const [substrate, setSubstrate] = useState<SubstrateChange[]>([])
  const [careLogs, setCareLogs] = useState<CareLog[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  // Health & events (ADR-015 D5): injuries, illnesses, escapes, recoveries…
  const [events, setEvents] = useState<AnimalEvent[]>([])
  const [eventOpen, setEventOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<AnimalEvent | null>(null)
  const [logState, setLogState] = useState<Record<'feedings' | 'molts' | 'substrate' | 'photos' | 'care' | 'events', LoadState>>({
    feedings: 'loading', molts: 'loading', substrate: 'loading', photos: 'loading', care: 'loading', events: 'loading',
  })
  const [growth, setGrowth] = useState<any | null>(null)
  // Care sheet's sourced "molts to adult" (typical_instars_to_maturity), for the Stages card.
  const [moltsToAdult, setMoltsToAdult] = useState<number | null>(null)
  const [feedingStats, setFeedingStats] = useState<InvertFeedingStats | null>(null)
  // Tarantulas only: the richer card (streak, longest gap, prey mix) from
  // /tarantulas/{id}/feeding-stats. The verdict above it still comes from
  // feedingStats, so every taxon reads its feeding status the same way.
  const [tarantulaStats, setTarantulaStats] = useState<TarantulaFeedingStats | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseError, setPauseError] = useState<string | null>(null)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMolt, setShareMolt] = useState<string | null>(null)
  // Breeding module (registry-gated, ADR-021 Phase D)
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

  // Public care-sheet read; only instar taxa with a linked species use it.
  const speciesIdForStages = invert && tracksInstars(invert.taxon) ? invert.species_id ?? null : null
  useEffect(() => {
    setMoltsToAdult(null)
    if (!speciesIdForStages) return
    let cancelled = false
    fetch(`${API_URL}/api/v1/invert-species/${speciesIdForStages}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sp) => { if (!cancelled) setMoltsToAdult(sp?.typical_instars_to_maturity ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [speciesIdForStages])
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

      const [f, m, s, p, g, c, fs, ts, ev] = await Promise.all([
        load<any>('feedings'),
        load<any>('molts'),
        load<any>('substrate-changes'),
        load<any>('photos'),
        // Growth module is registry-gated (ADR-008) — only fetch where enabled
        taxonHasModule(data.taxon, 'growth')
          ? fetch(`${API_URL}/api/v1/inverts/${id}/growth`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : Promise.resolve(null),
        // Not registry-gated: every taxon here needs water in some form, and
        // the ones that never use a dish get misted instead.
        load<any>('care-logs'),
        // Feeding status. Registry-gated like growth — the detritivores that
        // graze rather than take prey on a cadence are deliberately off, and
        // "12 days since fed" would be a number without a meaning for them.
        taxonHasModule(data.taxon, 'feedingStats')
          ? fetch(
              `${API_URL}/api/v1/inverts/${id}/feeding-stats?tz_offset_minutes=${new Date().getTimezoneOffset()}`,
              { headers },
            ).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : Promise.resolve(null),
        data.taxon === 'tarantula' ? fetchTarantulaStats(id, headers) : Promise.resolve(null),
        // Every taxon — an escape or a vet visit isn't species-specific.
        load<AnimalEvent>('events'),
      ])
      setFeedings(f.data)
      setMolts(m.data)
      setSubstrate(s.data)
      setPhotos(p.data)
      setCareLogs(c.data)
      setEvents(ev.data)
      setLogState({
        feedings: f.state,
        molts: m.state,
        substrate: s.state,
        photos: p.state,
        care: c.state,
        events: ev.state,
      })
      setGrowth(g)
      setFeedingStats(fs)
      setTarantulaStats(ts)

      // Breeding module (registry-gated — ADR-021 Phase D). Fetch this
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

  // ── Feeding pause + visibility (ported from the legacy tarantula page) ──
  // Both write PUT /inverts/{id}. Pause is keeper-level; visibility is
  // owner-only, and the server strips it from a co-keeper's write anyway.
  const putInvert = async (body: Record<string, unknown>): Promise<Invert> => {
    const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(typeof data?.detail === 'string' ? data.detail : 'Couldn’t save that. Nothing has changed.')
    }
    return res.json()
  }

  // Re-reads only what a pause changes, without the full-page loading state.
  const refreshFeeding = async (updated?: Invert) => {
    if (!token || !id) return
    const headers = { Authorization: `Bearer ${token}` }
    const taxon = updated?.taxon ?? invert?.taxon
    if (updated) setInvert(updated)
    const [fs, ts] = await Promise.all([
      taxon && taxonHasModule(taxon, 'feedingStats') ? fetchInvertStats(id, headers) : Promise.resolve(null),
      taxon === 'tarantula' ? fetchTarantulaStats(id, headers) : Promise.resolve(null),
    ])
    setFeedingStats(fs)
    setTarantulaStats(ts)
  }

  /** PauseFeedingModal shows its own error when this throws, and stays open. */
  const handlePauseFeeding = async (reason: string, until: string | null) => {
    if (!token) throw new Error('Not signed in')
    const updated = await putInvert({ feeding_paused_reason: reason, feeding_paused_until: until })
    setPauseError(null)
    await refreshFeeding(updated)
  }

  const handleResumeFeeding = async () => {
    if (!token) return
    setPauseError(null)
    try {
      const updated = await putInvert({ feeding_paused_reason: null, feeding_paused_until: null })
      await refreshFeeding(updated)
    } catch (e) {
      setPauseError(e instanceof Error ? e.message : 'Couldn’t resume feeding. Nothing has changed.')
    }
  }

  // `visibility` is what the keeper profile filters on; `is_public` is written
  // in step so nothing reading the old flag disagrees. The legacy page wrote
  // only is_public, which the profile never reads — its toggle did nothing.
  const isPublic = invert?.visibility ? invert.visibility === 'public' : !!invert?.is_public
  const handleVisibilityToggle = async () => {
    if (!token || !invert || visibilityBusy) return
    setVisibilityBusy(true)
    setVisibilityError(null)
    try {
      const next = !isPublic
      const updated = await putInvert({ visibility: next ? 'public' : 'private', is_public: next })
      setInvert(updated)
    } catch (e) {
      setVisibilityError(e instanceof Error ? e.message : 'Couldn’t change visibility. Nothing has changed.')
    } finally {
      setVisibilityBusy(false)
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
      // Case-insensitive defensively. The API serialises the Sex enum's
      // .value so this arrives lowercase; the DB stores the uppercase NAME.
      // Normalising means a change at either layer can't silently match nothing.
      const selfFemale = (invert.sex ?? '').toLowerCase() === 'female'
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
      // The server advises rather than refuses on a cross-species pairing — it
      // records what the keeper did. Surface the note; don't suppress it.
      const saved = await res.json().catch(() => null)
      if (saved?.warnings?.length) alert(saved.warnings.join('\n\n'))
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
  // Parents now arrive resolved from the server (services/breeding_service.py).
  // The local `mates` lookup is kept only as a fallback for an older API in
  // front of a newer build — it was never able to name an animal outside this
  // taxon, which is why non-tarantula pairings used to read "Unknown mate".
  const mateName = (p: any): string => {
    const resolved = p.male_parent?.id === id ? p.female_parent : p.male_parent
    if (resolved?.display_name) return resolved.display_name
    const otherId = p.male_invert_id === id ? p.female_invert_id : p.male_invert_id
    const m = mates.find((x) => x.id === otherId)
    return m ? displayName(m) : 'Unknown animal'
  }

  // Build an edit query string (logId triggers edit mode on the add-* page).
  const qp = (obj: Record<string, string | number | boolean | null | undefined>) =>
    Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

  const meta = invert ? taxonMeta(invert.taxon) : null

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {invert ? (
          <SpeciesLinkBanner
            animalId={invert.id} taxon={invert.taxon} scientificName={invert.scientific_name}
            speciesId={invert.species_id} died={!!invert.died_at} canEdit={canKeep} token={token ?? null}
            onChanged={() => fetchAll()}
          />
        ) : null}
        {invert && !isOwner && invert.user_id ? (
          <Link href={`/dashboard/shared/${invert.user_id}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
            ← Back to {shared.ownerName ? `${shared.ownerName}'s collection` : 'shared collection'}
          </Link>
        ) : (
          <Link href="/dashboard/tarantulas" className="text-sm text-primary-600 hover:underline mb-4 inline-block">
            ← Back to collection
          </Link>
        )}
        {invert && !isOwner && viewerRole && (
          <p className="mb-4 px-3 py-2 rounded-xl bg-surface border border-theme text-sm text-theme-secondary">
            {shared.ownerName ? `${shared.ownerName}'s animal` : 'Shared animal'} · you&apos;re a {ROLE_LABEL[viewerRole as 'viewer' | 'logger' | 'keeper']}
          </p>
        )}

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
                {canKeep && (<>
                <button
                  onClick={() => setShareOpen(true)}
                  className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                >
                  Share card
                </button>
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
                    value, so the control doubles as the indicator. Only for
                    taxa with a feeding cadence — a grazer has none to set. */}
                {taxonHasModule(invert.taxon, 'feedingStats') && <button
                  onClick={() => setCadenceOpen(true)}
                  className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                >
                  {invert?.feeding_interval_days
                    ? `Every ${invert.feeding_interval_days}d`
                    : 'Feeding schedule'}
                </button>}
                </>)}
                {isOwner && (<>
                {/* QR was tarantula-only on web until QRModal gained a
                    `resource` prop — mobile's QRSheet has had one for
                    months. */}
                <button
                  onClick={() => setQrOpen(true)}
                  className="px-4 py-2 rounded-lg bg-black/50 text-white text-sm font-semibold backdrop-blur-sm hover:bg-black/70"
                >
                  QR
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-lg bg-red-600/90 text-white text-sm font-semibold backdrop-blur-sm hover:bg-red-600"
                >
                  Delete
                </button>
                </>)}
              </div>
            </div>

            {/* Feeding status. Registry-gated, so the detritivores that graze
                rather than take prey on a cadence don't get a countdown that
                would mean nothing for them. */}
            {taxonHasModule(invert.taxon, 'feedingStats') && (
              <InvertFeedingStatus
                stats={feedingStats}
                onSetCadence={canKeep ? () => setCadenceOpen(true) : undefined}
                actions={canKeep && feedingStats && !invert.died_at ? (
                  // Mirrors mobile app/invert/[id].tsx: pause sits with the
                  // feeding status, and a paused animal gets the way back
                  // out in the same place.
                  feedingStats.is_feeding_paused ? (
                    <>
                      <button
                        type="button"
                        onClick={handleResumeFeeding}
                        className="px-3 py-1.5 rounded-full border border-current text-xs font-bold hover:opacity-80 transition"
                      >
                        Resume feeding
                      </button>
                      <button
                        type="button"
                        onClick={() => setPauseOpen(true)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold hover:underline"
                      >
                        Manage pause
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setPauseError(null); setPauseOpen(true) }}
                      className="px-3 py-1.5 rounded-full border border-current text-xs font-semibold opacity-80 hover:opacity-100 transition"
                      aria-label="Pause feeding reminders"
                    >
                      Pause feeding
                    </button>
                  )
                ) : undefined}
              />
            )}
            {pauseError && (
              <p role="alert" className="-mt-4 mb-6 text-sm text-red-600 dark:text-red-400">{pauseError}</p>
            )}

            {/* Premolt prediction — tarantula only (registry-gated). The card
                fetches its own data from the canonical premolt endpoint. */}
            {taxonHasModule(invert.taxon, 'premolt') && !invert.died_at && (
              <div className="mb-6">
                <PremoltPredictionSection tarantulaId={invert.id} />
              </div>
            )}

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
              <Fact
                label={stageCountLabel(invert.taxon)}
                value={invert.current_instar != null ? (tracksInstars(invert.taxon) ? formatStage(invert.taxon, invert.current_instar) : String(invert.current_instar)) : null}
              />
              <Fact label="Last molt" value={lastMoltAgo(molts)} />
              <Fact
                // Registry wording, so it agrees with the add form, the share
                // card and the growth chart (Leg span for spiders and whip
                // spiders, Length for the rest).
                label={meta.sizeLabel.replace(/\s*\(mm\)$/, '')}
                value={formatLengthMm(invert.current_length_mm, units)}
              />
              <Fact label="Acquired" value={invert.date_acquired ? formatLocalDate(invert.date_acquired) : null} />
            </Section>

            {/* Husbandry */}
            {hasHusbandry(invert) && (
              <Section title="Husbandry">
                <Fact label="Location" value={invert.location} />
                <Fact label="Type" value={cap(invert.enclosure_type)} />
                <Fact label="Size" value={invert.enclosure_size} />
                <Fact label="Substrate" value={invert.substrate_type} />
                <Fact label="Substrate depth" value={invert.substrate_depth} />
                <Fact label="Last substrate change" value={invert.last_substrate_change ? formatLocalDate(invert.last_substrate_change) : null} />
                {(invert.target_temp_min || invert.target_temp_max) && (
                  <Fact label="Temperature" value={formatTempRange(invert.target_temp_min, invert.target_temp_max, units)} />
                )}
                {(invert.target_humidity_min || invert.target_humidity_max) && (
                  <Fact label="Humidity" value={`${invert.target_humidity_min ?? '?'}–${invert.target_humidity_max ?? '?'}%`} />
                )}
                <Fact label="Water dish" value={invert.water_dish ? 'Yes' : 'No'} />
                <Fact label="Misting" value={invert.misting_schedule} />
                <Fact label="Last enclosure cleaning" value={invert.last_enclosure_cleaning ? formatLocalDate(invert.last_enclosure_cleaning) : null} />
                {invert.enclosure_notes && (
                  <div className="py-1.5">
                    <span className="block text-sm text-theme-tertiary">Enclosure notes</span>
                    <p className="mt-0.5 text-sm text-theme-primary whitespace-pre-line">{invert.enclosure_notes}</p>
                  </div>
                )}
              </Section>
            )}

            {/* Logs */}
            <LogSection
              title="Feedings"
              cta={canLog ? 'Log feeding' : undefined}
              onCta={canLog ? () => router.push(`/dashboard/inverts/${id}/add-feeding`) : undefined}
              empty="No feedings logged yet."
              state={logState.feedings}
              onRetry={fetchAll}
              rows={feedings.map((x) => ({
                key: x.id,
                left: `${[x.food_size, x.food_type].filter(Boolean).join(' ') || 'Feeding'} · ${x.accepted ? 'Accepted' : 'Refused'}`,
                right: formatLocalDate(x.fed_at),
                sub: attribution(x),
                onEdit: canChange(x) ? () => router.push(`/dashboard/inverts/${id}/add-feeding?${qp({ logId: x.id, fed_at: x.fed_at, food_type: x.food_type, accepted: x.accepted, notes: x.notes })}`) : undefined,
                onDelete: canChange(x) ? () => deleteLog(`feedings/${x.id}`, 'feeding') : undefined,
              }))}
            />
            {/* Tarantula feeding analytics: streak, longest gap, refusals and
                prey mix. Its own status banner is hidden — the verdict at the
                top of the page already says when she was fed and whether
                she's due or paused, and two banners could disagree. */}
            {invert.taxon === 'tarantula' && tarantulaStats && tarantulaStats.total_feedings > 0 && (
              <div className="mb-4">
                <FeedingStatsCard data={tarantulaStats} hideStatus />
              </div>
            )}
            <LogSection
              title="Molts"
              cta={canLog ? 'Log molt' : undefined}
              onCta={canLog ? () => router.push(`/dashboard/inverts/${id}/add-molt`) : undefined}
              empty="No molts logged yet."
              state={logState.molts}
              onRetry={fetchAll}
              rows={molts.map((x) => ({
                key: x.id, left: 'Molt', right: formatLocalDate(x.molted_at), sub: attribution(x),
                onEdit: canChange(x) ? () => router.push(`/dashboard/inverts/${id}/add-molt?${qp({ logId: x.id, molted_at: x.molted_at, notes: x.notes })}`) : undefined,
                onDelete: canChange(x) ? () => deleteLog(`molts/${x.id}`, 'molt') : undefined,
                onShare: canKeep ? () => setShareMolt(x.id) : undefined,
              }))}
            />

            {/* Health & events (ADR-015 D5) — everything that isn't a feeding
                or a molt and used to have nowhere to go but the notes blob.
                Same permissions as the other logs: loggers add, and change
                only their own entries. Logging closes once an animal died. */}
            <LogSection
              title="Health & events"
              cta={canLog && !invert.died_at ? 'Log event' : undefined}
              onCta={canLog && !invert.died_at ? () => { setEditingEvent(null); setEventOpen(true) } : undefined}
              empty="No events recorded. Injuries, illnesses, escapes and recoveries go here."
              state={logState.events}
              onRetry={fetchAll}
              rows={events.map((e) => ({
                key: e.id,
                // Severity only exists for injury and illness.
                left: e.severity
                  ? `${ANIMAL_EVENT_LABELS[e.event_type] ?? 'Event'} · ${e.severity[0].toUpperCase()}${e.severity.slice(1)}`
                  : ANIMAL_EVENT_LABELS[e.event_type] ?? 'Event',
                right: formatLocalDate(e.occurred_at),
                // The keeper's own words are the record; attribution after.
                sub: [e.notes, attribution(e)].filter(Boolean).join(' · ') || undefined,
                onEdit: canChange(e) ? () => { setEditingEvent(e); setEventOpen(true) } : undefined,
                onDelete: canChange(e) ? () => deleteLog(`animal-events/${e.id}`, 'event') : undefined,
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

            {/* Visibility — owner only. Hidden from co-keepers; the server
                strips visibility from their writes regardless. */}
            {isOwner && !invert.transferred_out_at && (
              <Section title="Visibility">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-theme-primary">{isPublic ? 'Public' : 'Private'}</p>
                    <p className="text-xs text-theme-tertiary mt-0.5">
                      Public animals are listed on your keeper profile when your collection is public.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublic}
                    aria-label={isPublic ? 'Make private' : 'Make public'}
                    onClick={handleVisibilityToggle}
                    disabled={visibilityBusy}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                      isPublic ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        isPublic ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {visibilityError && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{visibilityError}</p>
                )}
              </Section>
            )}

            {/* Transfer / rehome (BRIEF §6) — owner action. Hidden once handed off. */}
            {invert && isOwner && !invert.transferred_out_at && (
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

            {/* Stages (2026-10-07): instar animals' molts as the stages they
                reached, days per stage, problem molts and time since adulthood.
                Plus the care sheet's typical molts to adult, when it has a
                sourced figure — a hint, never a countdown. */}
            {invert && tracksInstars(invert.taxon) && (molts.length > 0 || invert.current_instar != null) && (() => {
              const st = stageSummary(molts, invert.current_instar)
              const now = invert.current_instar != null ? formatStage(invert.taxon, invert.current_instar) : null
              const typical = st.adultSince ? null : adultStageHint(invert.taxon, moltsToAdult)
              return (
                <Section title="Stages">
                  <div className="space-y-1">
                    {now ? (
                      <p className="text-sm text-theme-primary">
                        Now <span className="font-semibold">{now}</span>{st.adultSince ? ` · adult for ${elapsedSince(st.adultSince)}` : ''}
                      </p>
                    ) : null}
                    {typical ? <p className="text-xs text-theme-secondary">{typical}</p> : null}
                    {st.averageDaysPerStage != null ? (
                      <p className="text-xs text-theme-secondary">About {st.averageDaysPerStage} days between molts so far</p>
                    ) : null}
                    {st.problemSummary ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">{st.problemCount} of {molts.length} molts had problems ({st.problemSummary})</p>
                    ) : null}
                  </div>
                  {st.entries.length > 0 ? (
                    <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
                      {st.entries.map((e) => (
                        <li key={e.id} className="flex justify-between py-2 text-sm">
                          <span className="font-medium text-theme-primary">
                            {e.stage != null ? formatStage(invert.taxon, e.stage) : 'Molt'}{e.isFinal ? ' · adult' : ''}
                            {e.outcome && e.outcome !== 'successful' ? ` · ${e.outcome === 'lost_limb' ? 'lost a limb' : e.outcome}` : ''}
                          </span>
                          <span className="text-theme-secondary">
                            {formatLocalDate(e.molted_at)}{e.daysSincePrevious != null ? ` · ${e.daysSincePrevious}d` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {invert.current_instar == null ? (
                    <p className="mt-2 text-xs text-theme-tertiary">Set the current instar in Edit and every molt will be numbered.</p>
                  ) : null}
                </Section>
              )
            })()}

            {/* Growth module (registry-gated — ADR-008 rollout, scorpion pilot) */}
            {invert && growth && showGrowthChart(invert.taxon, growth) && (
              <GrowthChart data={growth} lengthLabel={growthLengthLabel(invert.taxon)} />
            )}

            {/* Breeding module (registry-gated — ADR-021 Phase D) */}
            {invert && isOwner && taxonHasModule(invert.taxon, 'breeding') && (
              <Section title="Breeding" action={{ label: '+ New pairing', onClick: () => setPairOpen(true) }}>
                {pairings.length === 0 ? (
                  <p className="text-sm text-theme-tertiary">
                    No pairings yet. Pair this {meta?.label.toLowerCase()} with another from
                    your collection to start tracking{' '}
                    {taxonLaysClutch(invert.taxon)
                      ? `${clutchSectionLabel(invert.taxon).toLowerCase()} and ${offspringNoun(invert.taxon)}`
                      : offspringNoun(invert.taxon)}.
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

            {/* Water. Sits above substrate because it happens far more often —
                the list order follows frequency, not schema order. There is
                deliberately no "last watered" or "due" line anywhere on this
                page: no evidence base for a hydration cadence exists, so a
                derived deadline would be a fabricated number. */}
            <LogSection
              title="Water"
              cta={canLog ? 'Log water' : undefined}
              onCta={canLog ? () => router.push(`/dashboard/inverts/${id}/add-care-log`) : undefined}
              empty="No watering logged yet."
              state={logState.care}
              onRetry={fetchAll}
              rows={careLogs.map((x) => ({
                key: x.id,
                left: CARE_LOG_LABELS[x.log_type] ?? 'Watered',
                right: formatLocalDate(x.logged_at),
                sub: attribution(x),
                onEdit: canChange(x) ? () => router.push(`/dashboard/inverts/${id}/add-care-log?${qp({ logId: x.id, log_type: x.log_type, logged_at: x.logged_at, notes: x.notes })}`) : undefined,
                onDelete: canChange(x) ? () => deleteLog(`care-logs/${x.id}`, 'water log') : undefined,
              }))}
            />

            <LogSection
              title="Substrate changes"
              cta={canLog ? 'Log substrate change' : undefined}
              onCta={canLog ? () => router.push(`/dashboard/inverts/${id}/add-substrate-change`) : undefined}
              empty="No substrate changes logged yet."
              state={logState.substrate}
              onRetry={fetchAll}
              rows={substrate.map((x) => ({
                key: x.id, left: x.substrate_type || 'Substrate change', right: formatLocalDate(x.changed_at), sub: attribution(x),
                onEdit: canChange(x) ? () => router.push(`/dashboard/inverts/${id}/add-substrate-change?${qp({ logId: x.id, changed_at: x.changed_at, substrate_type: x.substrate_type, substrate_depth: x.substrate_depth, reason: x.reason, notes: x.notes })}`) : undefined,
                onDelete: canChange(x) ? () => deleteLog(`substrate-changes/${x.id}`, 'substrate change') : undefined,
              }))}
            />

            {/* Photos */}
            <Section
              title="Photos"
              action={canLog ? { label: 'Add photo', onClick: () => router.push(`/dashboard/inverts/${id}/add-photo`) } : undefined}
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
                        {canKeep && <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-black/55 rounded-b-lg py-1 opacity-0 group-hover:opacity-100 transition">
                          {!isHero && (
                            <button onClick={() => setHeroPhoto(p.id)} className="text-[10px] font-semibold text-white hover:underline" aria-label="Set as hero photo">
                              Set hero
                            </button>
                          )}
                          <button onClick={() => deletePhoto(p.id)} className="text-[10px] font-semibold text-red-300 hover:underline" aria-label="Delete photo">
                            Delete
                          </button>
                        </div>}
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

      {token && invert && canKeep ? (
        <>
          <ShareCardModal open={shareOpen} onClose={() => setShareOpen(false)} app="tarantuverse" animalId={invert.id} kind="profile" token={token} />
          <ShareCardModal open={!!shareMolt} onClose={() => setShareMolt(null)} app="tarantuverse" animalId={invert.id} kind="molt" moltId={shareMolt ?? undefined} token={token} />
        </>
      ) : null}

      {/* Keeper feeding cadence — ADR-017. Same dialog as the legacy tarantula
          page; it always addresses /inverts/{id}, which is this page's own
          endpoint anyway. */}
      <FeedingCadenceDialog
        open={cadenceOpen}
        animalId={id as string}
        token={token}
        current={invert?.feeding_interval_days ?? null}
        // What the keeper is overriding, as mobile passes it. Once they've
        // set their own cadence the server's interval IS their number, not
        // what clearing returns to — so pass nothing rather than call the
        // keeper's figure "our default".
        derivedDays={feedingStats?.interval_source === 'keeper' ? null : feedingStats?.interval_days ?? null}
        derivedSource={feedingStats?.interval_source === 'keeper' ? null : feedingStats?.interval_source ?? null}
        onClose={() => setCadenceOpen(false)}
        onSaved={fetchAll}
      />

      {/* Feeding pause — PUT /inverts/{id}, so it works for every taxon with
          a feeding cadence. Current values come from feedingStats, like mobile. */}
      {invert && canKeep && (
        <PauseFeedingModal
          isOpen={pauseOpen}
          onClose={() => setPauseOpen(false)}
          onSubmit={handlePauseFeeding}
          initialReason={feedingStats?.feeding_paused_reason ?? invert.feeding_paused_reason ?? undefined}
          initialUntil={feedingStats?.feeding_paused_until ?? invert.feeding_paused_until ?? undefined}
          isPaused={!!feedingStats?.is_feeding_paused}
        />
      )}

      {invert && canLog && (
        <AnimalEventDialog
          open={eventOpen}
          token={token}
          invertId={invert.id}
          editing={editingEvent}
          onClose={() => { setEventOpen(false); setEditingEvent(null) }}
          onSaved={fetchAll}
        />
      )}

      <Suspense fallback={null}>
        <LogDeepLink id={id} canLog={canLog && !invert?.died_at} ready={!!invert && !loading && viewerRole !== null} />
      </Suspense>

      {/* `resource="inverts"` is the whole point — the default tarantula
          routes 404 for every other taxon. */}
      {qrOpen && invert && (
        <QRModal
          tarantulaId={invert.id}
          tarantulaName={invert.name || invert.common_name || 'Unnamed'}
          scientificName={invert.scientific_name ?? null}
          sex={invert.sex ?? null}
          // Recent molts on the label, as the legacy tarantula page offered.
          // leg_span_after is inches for every taxon; QRModal prints it in
          // the keeper's units.
          molts={molts.map((m) => ({
            id: m.id,
            molted_at: m.molted_at,
            leg_span_after: m.leg_span_after != null && m.leg_span_after !== '' ? Number(m.leg_span_after) : undefined,
          }))}
          resource="inverts"
          onClose={() => setQrOpen(false)}
          onPhotoAdded={fetchAll}
        />
      )}

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

      {/* Description is built from the taxon vocabulary rather than fixed:
          promising "egg sacs" to a scorpion keeper describes a stage their
          animal doesn't have — it gives live birth. That was the copy that
          shipped with the scorpion pilot. */}
      <UpgradeModal source="breeding"
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Breeding Module"
        description={
          invert && taxonLaysClutch(invert.taxon)
            ? `Track pairings, ${clutchSectionLabel(invert.taxon).toLowerCase()} and ${offspringNoun(invert.taxon)} across the season. Upgrade to unlock breeding for your whole collection.`
            : `Track pairings and ${invert ? offspringNoun(invert.taxon) : 'offspring'} across the season. Upgrade to unlock breeding for your whole collection.`
        }
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
                  placeholder="e.g. unsexed juvenile, last molt 6/1, eating well"
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
    i.target_temp_min || i.target_temp_max || i.target_humidity_min || i.target_humidity_max ||
    i.location || i.last_substrate_change || i.misting_schedule || i.last_enclosure_cleaning || i.enclosure_notes,
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

/** How many entries a log list shows before "Show all (N)". */
const LOG_PREVIEW = 8

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
  /** Omitted when the viewer can't log here (a co-keeper viewer). */
  cta?: string
  onCta?: () => void
  empty: string
  rows: { key: string; left: string; right: string; sub?: string; onEdit?: () => void; onDelete?: () => void; onShare?: () => void }[]
  /** Loading ≠ zero ≠ error — see LoadState. */
  state?: LoadState
  onRetry?: () => void
}) {
  // The newest LOG_PREVIEW entries, with the full history one click away.
  // This used to be a hard .slice(0, 8): a tarantula with 60 feedings had
  // 52 of them unreachable on web.
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rows : rows.slice(0, LOG_PREVIEW)
  return (
    <Section title={title} action={cta && onCta ? { label: cta, onClick: onCta } : undefined}>
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
        <>
        {shown.map((r) => (
          <div key={r.key} className="group flex items-center gap-3 py-1.5 border-b border-theme last:border-0">
            <span className="flex-1 text-sm text-theme-primary">
              {r.left}
              {r.sub && <span className="block text-xs text-theme-tertiary">{r.sub}</span>}
            </span>
            <span className="text-sm text-theme-tertiary">{r.right}</span>
            {r.onShare && (
              <button
                onClick={r.onShare}
                className="text-xs font-semibold text-primary-600 hover:underline opacity-60 group-hover:opacity-100 transition"
                aria-label="Share molt card"
              >
                Share
              </button>
            )}
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
        ))}
        {rows.length > LOG_PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-2 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            {expanded ? 'Show fewer' : `Show all (${rows.length})`}
          </button>
        )}
        </>
      )}
    </Section>
  )
}
