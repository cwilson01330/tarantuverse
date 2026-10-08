'use client'

/**
 * Colony detail (web) — ADR-010 Colony mode.
 *
 * Shows a colony's total population + per-life-stage breakdown, husbandry info,
 * and a colony_events timeline with an inline "add event" quick form. Events
 * with a count_delta adjust a stage bucket server-side.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { useUnits } from '@/components/UnitsProvider'
import { formatTempRange } from '@/lib/units'
import { ROLE_LABEL, can, useCollectionRole, type CollectionRole } from '@/lib/coKeepers'
import DashboardLayout from '@/components/DashboardLayout'
import ColonyPopulationChart from '@/components/ColonyPopulationChart'
const QRModal = dynamic(() => import('@/components/QRModal'), { ssr: false })
const ShareCardModal = dynamic(() => import('@/components/ShareCardModal'), { ssr: false })
import EditPanel, { type EditField, type EditValues } from './EditPanel'
import TransferPanel from './TransferPanel'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import {
  COLONY_EVENT_TYPES,
  colonyEventMeta,
  createColonyEvent,
  getColonyPopulationHistory,
  type PopulationHistory,
  deleteColony,
  deleteColonyEvent,
  updateColonyEvent,
  updateColonyFeeding,
  deleteColonyFeeding,
  updateColonyMolt,
  updateColonySubstrateChange,
  updateColonyCareLog,
  getColony,
  listColonyEvents,
  listColonyFeedings,
  listColonyMolts,
  listColonySubstrateChanges,
  createColonySubstrateChange,
  deleteColonySubstrateChange,
  colonySubstrateReasons,
  listColonyCareLogs,
  listColonyPhotos,
  setColonyMainPhoto,
  deleteColonyPhoto,
  updateColony,
  endColony,
  reopenColony,
  COLONY_END_REASON_ORDER,
  COLONY_END_REASON_LABELS,
  colonyEndReasonLabel,
  type ColonyEndReason,
  type ColonyPhoto,
  createColonyCareLog,
  deleteColonyCareLog,
  CARE_LOG_LABELS,
  type ColonyCareLog,
  type CareLogType,
  createColonyMolt,
  deleteColonyMolt,
  createColonyFeeding,
  colonyFoodTypes,
  colonyShowsPreySize,
  type ColonyFeedingLog,
  type ColonyMoltLog,
  type ColonySubstrateChange,
  type ColonyEventResponse,
  type ColonyEventType,
  type ColonyResponse,
} from '@/lib/colonies'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getImageUrl(url?: string | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${API_URL}${url}`
}

function taxonGlyph(taxon: string): string {
  return isInvertTaxon(taxon) ? INVERT_TAXA[taxon].glyph : '🐾'
}
function taxonLabel(taxon: string): string {
  return isInvertTaxon(taxon) ? INVERT_TAXA[taxon].label : 'Invertebrate'
}

// occurred_at is a YYYY-MM-DD date; parse locally to avoid TZ drift.
function formatEventDate(iso: string): string {
  const parts = iso.split('-').map((p) => Number.parseInt(p, 10))
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [y, m, d] = parts
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return iso
}

// Local calendar day of a stored timestamp, as YYYY-MM-DD.
function localDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Keep the original timestamp when the keeper left the day alone; otherwise
// noon local so the chosen day survives the UTC round trip.
function stampFor(origIso: string, newDate: string): string {
  if (localDate(origIso) === newDate) return origIso
  return new Date(`${newDate}T12:00:00`).toISOString()
}

type EditKind = 'feeding' | 'molt' | 'substrate' | 'care' | 'event'

function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

export default function ColonyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const colonyId = params?.id
  const { token, user, isAuthenticated, isLoading } = useAuth()
  const { units } = useUnits()

  const [colony, setColony] = useState<ColonyResponse | null>(null)
  // Co-keepers: hide what this viewer's role can't do. The API enforces it.
  const shared = useCollectionRole(token, user?.id, colony?.user_id)
  const isMine = !!colony?.user_id && !!user?.id && colony.user_id === user.id
  const viewerRole: CollectionRole | null = isMine ? 'owner' : shared.role
  const isOwner = viewerRole === 'owner'
  // An ended colony is a historical record: like a died animal's page, every
  // logging and editing control goes away. Only Reopen (below) survives, and it
  // needs the raw role, not the gated one.
  const isEnded = !!colony?.ended_at
  // Handed to another keeper through a claimed whole-colony transfer. Like an
  // ended colony it's a historical record, so logging and editing close too.
  const isTransferred = !!colony?.transferred_out_at
  const canKeepRole = can(viewerRole, 'keeper')
  const canKeep = canKeepRole && !isEnded && !isTransferred
  const canLog = can(viewerRole, 'logger') && !isEnded && !isTransferred
  const canChange = (x: { logged_by_user_id?: string | null }) =>
    canKeep || (canLog && !!user?.id && x.logged_by_user_id === user.id)
  const [events, setEvents] = useState<ColonyEventResponse[]>([])
  const [history, setHistory] = useState<PopulationHistory | null>(null)
  const [feedings, setFeedings] = useState<ColonyFeedingLog[]>([])
  const [molts, setMolts] = useState<ColonyMoltLog[]>([])
  const [moltOpen, setMoltOpen] = useState(false)
  const [moltDate, setMoltDate] = useState(todayIso())
  const [moltNote, setMoltNote] = useState('')
  const [moltBusy, setMoltBusy] = useState(false)
  const [moltError, setMoltError] = useState('')
  const [substrates, setSubstrates] = useState<ColonySubstrateChange[]>([])
  const [subOpen, setSubOpen] = useState(false)
  const [subDate, setSubDate] = useState(todayIso())
  const [subReason, setSubReason] = useState('')
  const [subType, setSubType] = useState('')
  const [subNote, setSubNote] = useState('')
  const [subBusy, setSubBusy] = useState(false)
  const [subError, setSubError] = useState('')
  // Hydration (cwc_20260910). Defaults to water_dish as the commonest act,
  // but for a detritivore culture misted/overflow are the load-bearing ones.
  const [careLogs, setCareLogs] = useState<ColonyCareLog[]>([])
  const [careOpen, setCareOpen] = useState(false)
  const [careType, setCareType] = useState<CareLogType>('water_dish')
  const [careDate, setCareDate] = useState(todayIso())
  const [careNote, setCareNote] = useState('')
  const [careBusy, setCareBusy] = useState(false)
  const [careError, setCareError] = useState('')
  // Photos. Tracked separately so a failed photo fetch says so — an empty
  // strip would read as "no photos yet" when the truth is "couldn't load".
  const [photos, setPhotos] = useState<ColonyPhoto[]>([])
  const [photosError, setPhotosError] = useState('')
  const [photoActionError, setPhotoActionError] = useState('')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  // End colony. Its own dialog rather than a field on edit, so it can't happen
  // by accident. The dialog is the confirm; the date is already defaulted.
  const [endOpen, setEndOpen] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [endReason, setEndReason] = useState<ColonyEndReason | ''>('')
  const [endNotes, setEndNotes] = useState('')
  const [endBusy, setEndBusy] = useState(false)
  const [endError, setEndError] = useState('')
  const [reopenBusy, setReopenBusy] = useState(false)
  const [reopenError, setReopenError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Add-event form
  const [evtType, setEvtType] = useState<ColonyEventType>('added')
  const [evtStage, setEvtStage] = useState('')
  const [evtDelta, setEvtDelta] = useState('')
  const [evtDate, setEvtDate] = useState(todayIso())
  const [evtSeverity, setEvtSeverity] = useState('')
  const [evtNotes, setEvtNotes] = useState('')
  const [evtSubmitting, setEvtSubmitting] = useState(false)
  const [evtError, setEvtError] = useState('')

  // Log-feeding form. A group feeding is entered, not one-tapped: for a
  // communal the prey COUNT is the record, and a one-tap "fed" would write a
  // log that silently claims a quantity nobody counted.
  const [feedOpen, setFeedOpen] = useState(false)
  const [feedDate, setFeedDate] = useState(todayIso())
  const [feedType, setFeedType] = useState('')
  const [feedSize, setFeedSize] = useState('')
  const [feedQty, setFeedQty] = useState('')
  const [feedAccepted, setFeedAccepted] = useState(true)
  const [feedNotes, setFeedNotes] = useState('')
  const [feedSubmitting, setFeedSubmitting] = useState(false)
  const [feedError, setFeedError] = useState('')

  // Inline edit of an existing log row (one at a time)
  const [editing, setEditing] = useState<{ kind: EditKind; id: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [showAllFeed, setShowAllFeed] = useState(false)

  // Delete colony
  const [deleting, setDeleting] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  // Share card (spec 2026-09-29): changes nothing about the colony or who can see it.
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!token || !colonyId) return
    try {
      const [c, evs, feeds, mlts, subs, care, hist, pics] = await Promise.all([
        getColony(token, colonyId),
        listColonyEvents(token, colonyId).catch(() => [] as ColonyEventResponse[]),
        // Non-fatal: a colony with no feedings is the normal state and must
        // not be able to break the whole page.
        listColonyFeedings(token, colonyId).catch(() => [] as ColonyFeedingLog[]),
        listColonyMolts(token, colonyId).catch(() => [] as ColonyMoltLog[]),
        listColonySubstrateChanges(token, colonyId).catch(
          () => [] as ColonySubstrateChange[],
        ),
        listColonyCareLogs(token, colonyId).catch(() => [] as ColonyCareLog[]),
        // Non-fatal like the rest: a chart that can't load must not take the
        // whole colony page with it.
        getColonyPopulationHistory(token, colonyId).catch(() => null),
        // Non-fatal, but a failure is shown in the Photos section rather than
        // swallowed into an empty list.
        listColonyPhotos(token, colonyId).then(
          (data) => ({ data, failed: false }),
          () => ({ data: [] as ColonyPhoto[], failed: true }),
        ),
      ])
      setColony(c)
      setEvents(evs)
      setFeedings(feeds)
      setMolts(mlts)
      setSubstrates(subs)
      setCareLogs(care)
      setHistory(hist)
      setPhotos(pics.data)
      setPhotosError(pics.failed ? 'Couldn’t load photos. Check your connection and refresh.' : '')
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [colonyId, token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    fetchAll()
  }, [isLoading, isAuthenticated, router, fetchAll])

  const meta = evtType ? colonyEventMeta(evtType) : undefined
  const stageOptions = useMemo(() => {
    if (!colony?.stage_counts) return []
    return Object.keys(colony.stage_counts)
  }, [colony])

  const submitSubstrate = async () => {
    if (!token || !colonyId) return
    setSubBusy(true)
    setSubError('')
    try {
      await createColonySubstrateChange(token, colonyId, {
        changed_at: subDate,
        substrate_type: subType.trim() || null,
        reason: subReason || null,
        notes: subNote.trim() || null,
      })
      setSubOpen(false)
      setSubReason('')
      setSubType('')
      setSubNote('')
      await fetchAll()
    } catch (e) {
      setSubError(e instanceof Error ? e.message : 'Failed to log change')
    } finally {
      setSubBusy(false)
    }
  }

  const removeSubstrate = async (id: string) => {
    if (!token) return
    if (!confirm('Delete this substrate change?')) return
    try {
      await deleteColonySubstrateChange(token, id)
      await fetchAll()
    } catch (e) {
      setSubError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const submitCareLog = async () => {
    if (!token || !colonyId) return
    setCareBusy(true)
    setCareError('')
    try {
      // Column is a timestamp, the keeper picks a day. Combine the chosen day
      // with the current time of day rather than stamping a fabricated
      // midnight, and never display the time.
      const chosen = new Date(`${careDate}T00:00:00`)
      const now = new Date()
      chosen.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)
      await createColonyCareLog(token, colonyId, {
        log_type: careType,
        logged_at: (chosen > now ? now : chosen).toISOString(),
        notes: careNote.trim() || null,
      })
      setCareOpen(false)
      setCareNote('')
      await fetchAll()
    } catch (e) {
      setCareError(e instanceof Error ? e.message : 'Failed to log water')
    } finally {
      setCareBusy(false)
    }
  }

  const removeCareLog = async (id: string) => {
    if (!token) return
    if (!confirm('Delete this water log?')) return
    try {
      await deleteColonyCareLog(token, id)
      await fetchAll()
    } catch (e) {
      setCareError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const submitMolt = async () => {
    if (!token || !colonyId) return
    setMoltBusy(true)
    setMoltError('')
    try {
      await createColonyMolt(token, colonyId, {
        molted_at: new Date(`${moltDate}T12:00:00`).toISOString(),
        notes: moltNote.trim() || null,
      })
      setMoltOpen(false)
      setMoltNote('')
      await fetchAll()
    } catch (e) {
      setMoltError(e instanceof Error ? e.message : 'Failed to log molt')
    } finally {
      setMoltBusy(false)
    }
  }

  const removeMolt = async (id: string) => {
    if (!token) return
    if (!confirm('Delete this molt record?')) return
    try {
      await deleteColonyMolt(token, id)
      await fetchAll()
    } catch (e) {
      setMoltError(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const makeHeroPhoto = async (photoId: string) => {
    if (!token) return
    setPhotoActionError('')
    try {
      await setColonyMainPhoto(token, photoId)
      // Refetch so colony.photo_url (the header image + "★ Hero" badge) updates.
      await fetchAll()
    } catch (e) {
      setPhotoActionError(e instanceof Error ? e.message : 'Could not set hero photo.')
    }
  }

  const removePhoto = async (photoId: string) => {
    if (!token) return
    if (!confirm('Delete this photo? This cannot be undone.')) return
    setPhotoActionError('')
    try {
      await deleteColonyPhoto(token, photoId)
      await fetchAll()
    } catch (e) {
      setPhotoActionError(e instanceof Error ? e.message : 'Could not delete photo.')
    }
  }

  const toggleArchive = async () => {
    if (!token || !colony || archiveBusy) return
    const archiving = colony.is_active
    if (
      archiving &&
      !confirm(
        'Archive this colony? It will be hidden from your collection and the free-plan count, and you can unarchive it any time.',
      )
    ) {
      return
    }
    setArchiveBusy(true)
    setArchiveError('')
    try {
      await updateColony(token, colony.id, { is_active: !archiving })
      await fetchAll()
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : 'Could not update the colony.')
    } finally {
      setArchiveBusy(false)
    }
  }

  const openEnd = () => {
    // Today by default but editable: most people log an ending after the fact.
    setEndDate(todayIso())
    setEndReason('')
    setEndNotes('')
    setEndError('')
    setEndOpen(true)
  }

  const submitEnd = async () => {
    if (!token || !colony || endBusy) return
    if (!endReason) {
      setEndError('Pick a reason.')
      return
    }
    setEndBusy(true)
    setEndError('')
    try {
      await endColony(token, colony.id, {
        ended_at: endDate || null,
        reason: endReason,
        notes: endNotes.trim() || null,
      })
      setEndOpen(false)
      await fetchAll()
    } catch (e) {
      // Stay open. Closing on failure would look like it worked.
      setEndError(e instanceof Error ? e.message : 'Could not save. Nothing has changed.')
    } finally {
      setEndBusy(false)
    }
  }

  const handleReopen = async () => {
    if (!token || !colony || reopenBusy) return
    if (
      !confirm(
        'Reopen this colony? It will return to your collection, count toward your plan again, and logging will be open.',
      )
    ) {
      return
    }
    setReopenBusy(true)
    setReopenError('')
    try {
      await reopenColony(token, colony.id)
      await fetchAll()
    } catch (e) {
      setReopenError(e instanceof Error ? e.message : 'Could not reopen the colony.')
    } finally {
      setReopenBusy(false)
    }
  }

  const removeFeeding = async (id: string) => {
    if (!token) return
    if (!confirm('Delete this feeding?')) return
    try {
      await deleteColonyFeeding(token, id)
      await fetchAll()
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Failed to delete feeding')
    }
  }

  const startEdit = (kind: EditKind, id: string) => {
    setEditError('')
    setEditing({ kind, id })
  }

  const saveEdit = async (values: EditValues) => {
    if (!token || !editing) return
    setEditBusy(true)
    setEditError('')
    const text = (k: string) => String(values[k] ?? '').trim()
    try {
      if (editing.kind === 'feeding') {
        const f = feedings.find((x) => x.id === editing.id)
        if (!f) return
        const n = parseInt(text('quantity'), 10)
        await updateColonyFeeding(token, f.id, {
          fed_at: stampFor(f.fed_at, text('date')),
          food_type: text('food_type') || null,
          ...(colonyShowsPreySize(colony?.taxon) ? { food_size: text('food_size') || null } : {}),
          quantity: Number.isFinite(n) && n > 0 ? n : null,
          accepted: values.accepted === true,
          notes: text('notes') || null,
        })
      } else if (editing.kind === 'molt') {
        const m = molts.find((x) => x.id === editing.id)
        if (!m) return
        await updateColonyMolt(token, m.id, {
          molted_at: stampFor(m.molted_at, text('date')),
          notes: text('notes') || null,
        })
      } else if (editing.kind === 'substrate') {
        await updateColonySubstrateChange(token, editing.id, {
          changed_at: text('date'),
          substrate_type: text('substrate_type') || null,
          reason: text('reason') || null,
          notes: text('notes') || null,
        })
      } else if (editing.kind === 'care') {
        const c = careLogs.find((x) => x.id === editing.id)
        if (!c) return
        await updateColonyCareLog(token, c.id, {
          log_type: text('log_type') as CareLogType,
          logged_at: stampFor(c.logged_at, text('date')),
          notes: text('notes') || null,
        })
      } else {
        const ev = events.find((x) => x.id === editing.id)
        if (!ev) return
        const em = colonyEventMeta(ev.event_type)
        const payload: Record<string, unknown> = {
          occurred_at: text('date') || ev.occurred_at,
          notes: text('notes') || null,
        }
        if (em?.hasSeverity) payload.severity = text('severity') || null
        if (ev.count_delta != null || em?.adjustsCount) {
          const raw = text('count_delta')
          if (raw === '' && em?.adjustsCount) {
            setEditError('Enter a count change (use − to remove).')
            return
          }
          if (raw !== '') {
            const parsed = Number.parseInt(raw, 10)
            if (!Number.isFinite(parsed)) {
              setEditError('That doesn’t look like a number.')
              return
            }
            if (em && !em.allowNegative && parsed < 0) {
              setEditError(`${em.label} amounts must be positive.`)
              return
            }
            payload.count_delta = parsed
          } else {
            payload.count_delta = null
          }
          payload.stage = text('stage') || null
        }
        if (ev.event_type === 'observation' && !text('notes')) {
          setEditError('An observation needs a note.')
          return
        }
        await updateColonyEvent(token, ev.id, payload)
      }
      setEditing(null)
      await fetchAll()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setEditBusy(false)
    }
  }

  const renderEditor = (kind: EditKind) => {
    if (!editing || editing.kind !== kind) return null
    let title = ''
    let fields: EditField[] = []
    let initial: EditValues = {}
    if (kind === 'feeding') {
      const f = feedings.find((x) => x.id === editing.id)
      if (!f) return null
      title = 'Edit feeding'
      const food = colonyFoodTypes(colony?.taxon)
      const foodOpts = [{ value: '', label: 'Not recorded' }, ...food.map((x) => ({ value: x, label: x }))]
      if (f.food_type && !food.includes(f.food_type)) foodOpts.push({ value: f.food_type, label: f.food_type })
      fields = [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'food_type', label: 'Food type', type: 'select', options: foodOpts },
        ...(colonyShowsPreySize(colony?.taxon)
          ? ([{
              key: 'food_size',
              label: 'Prey size',
              type: 'select',
              options: ['', 'Small', 'Medium', 'Large'].map((v) => ({ value: v, label: v || 'Not recorded' })),
            }] as EditField[])
          : []),
        { key: 'quantity', label: 'Amount', type: 'number', hint: 'Leave blank if you didn’t count.' },
        { key: 'accepted', label: 'Outcome', type: 'toggle', toggleLabels: ['Taken', 'Refused'] },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]
      initial = {
        date: localDate(f.fed_at),
        food_type: f.food_type ?? '',
        food_size: f.food_size ?? '',
        quantity: f.quantity != null ? String(f.quantity) : '',
        accepted: f.accepted,
        notes: f.notes ?? '',
      }
    } else if (kind === 'molt') {
      const m = molts.find((x) => x.id === editing.id)
      if (!m) return null
      title = 'Edit molt'
      fields = [
        { key: 'date', label: 'Date found', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]
      initial = { date: localDate(m.molted_at), notes: m.notes ?? '' }
    } else if (kind === 'substrate') {
      const c = substrates.find((x) => x.id === editing.id)
      if (!c) return null
      title = 'Edit substrate change'
      const reasons = colonySubstrateReasons(colony?.taxon)
      const opts = [{ value: '', label: 'Not set' }, ...reasons.map((r) => ({ value: r, label: r }))]
      if (c.reason && !reasons.includes(c.reason)) opts.push({ value: c.reason, label: c.reason })
      fields = [
        { key: 'date', label: 'Date changed', type: 'date' },
        { key: 'substrate_type', label: 'Substrate type', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'select', options: opts },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]
      initial = {
        date: c.changed_at.slice(0, 10),
        substrate_type: c.substrate_type ?? '',
        reason: c.reason ?? '',
        notes: c.notes ?? '',
      }
    } else if (kind === 'care') {
      const c = careLogs.find((x) => x.id === editing.id)
      if (!c) return null
      title = 'Edit water log'
      fields = [
        { key: 'log_type', label: 'What did you do?', type: 'select',
          options: (Object.keys(CARE_LOG_LABELS) as CareLogType[]).map((k) => ({ value: k, label: CARE_LOG_LABELS[k] })) },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]
      initial = { log_type: c.log_type, date: localDate(c.logged_at), notes: c.notes ?? '' }
    } else {
      const ev = events.find((x) => x.id === editing.id)
      if (!ev) return null
      const em = colonyEventMeta(ev.event_type)
      title = `Edit ${em?.label ?? 'event'}`
      fields = [{ key: 'date', label: 'Date', type: 'date' }]
      initial = { date: ev.occurred_at.slice(0, 10), notes: ev.notes ?? '' }
      if (ev.count_delta != null || em?.adjustsCount) {
        fields.push(
          { key: 'stage', label: 'Stage', type: 'text', placeholder: 'Blank = mixed' },
          {
            key: 'count_delta',
            label: 'Count change',
            type: 'text',
            hint: 'Changing this moves the population by the difference.',
          },
        )
        initial.stage = ev.stage ?? ''
        initial.count_delta = ev.count_delta != null ? String(ev.count_delta) : ''
      }
      if (em?.hasSeverity) {
        fields.push({
          key: 'severity', label: 'Severity', type: 'select',
          options: [
            { value: '', label: 'Not set' },
            { value: 'minor', label: 'Minor' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'severe', label: 'Severe' },
          ],
        })
        initial.severity = ev.severity ?? ''
      }
      fields.push({ key: 'notes', label: 'Notes', type: 'textarea' })
    }
    return (
      <div className="mb-3">
        <EditPanel
          key={`${kind}-${editing.id}`}
          title={title}
          fields={fields}
          initial={initial}
          busy={editBusy}
          error={editError}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  const editBtnCls =
    'text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0'
  const delBtnCls = 'text-xs font-medium text-red-600 dark:text-red-400 hover:underline shrink-0'

  const submitFeeding = async () => {
    if (!token || !colonyId) return
    setFeedSubmitting(true)
    setFeedError('')
    try {
      const n = parseInt(feedQty, 10)
      await createColonyFeeding(token, colonyId, {
        // Noon local so the date the keeper picked survives the UTC round trip
        // instead of sliding a day back for anyone west of Greenwich.
        fed_at: new Date(`${feedDate}T12:00:00`).toISOString(),
        food_type: feedType || null,
        food_size: feedSize || null,
        // null, not 1 — an uncounted feeding stays uncounted.
        quantity: Number.isFinite(n) && n > 0 ? n : null,
        accepted: feedAccepted,
        notes: feedNotes.trim() || null,
      })
      setFeedOpen(false)
      setFeedQty('')
      setFeedNotes('')
      setFeedAccepted(true)
      await fetchAll()
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Failed to log feeding')
    } finally {
      setFeedSubmitting(false)
    }
  }

  const submitEvent = async () => {
    if (!token || !colony || !meta) return
    setEvtError('')

    let deltaNum: number | null = null
    if (meta.adjustsCount) {
      if (evtDelta.trim() === '') {
        setEvtError('Enter a count change (use − to remove).')
        return
      }
      const parsed = Number.parseInt(evtDelta, 10)
      if (!Number.isFinite(parsed)) {
        setEvtError('That doesn’t look like a number.')
        return
      }
      if (!meta.allowNegative && parsed < 0) {
        setEvtError(`${meta.label} amounts must be positive.`)
        return
      }
      deltaNum = parsed
    }

    setEvtSubmitting(true)
    try {
      await createColonyEvent(token, colony.id, {
        event_type: evtType,
        stage: evtStage.trim() || null,
        count_delta: deltaNum,
        occurred_at: evtDate || todayIso(),
        severity: meta.hasSeverity && evtSeverity ? evtSeverity : null,
        notes: evtNotes.trim() || null,
      })
      // Reset form (keep the type so logging several is quick)
      setEvtStage('')
      setEvtDelta('')
      setEvtSeverity('')
      setEvtNotes('')
      setEvtDate(todayIso())
      await fetchAll()
    } catch (e) {
      setEvtError(e instanceof Error ? e.message : 'Failed to log event')
    } finally {
      setEvtSubmitting(false)
    }
  }

  const removeEvent = async (eventId: string) => {
    if (!token || !colony) return
    if (
      !confirm(
        'Delete this event? Its count change will be taken back out of the population.',
      )
    ) {
      return
    }
    try {
      await deleteColonyEvent(token, eventId)
      await fetchAll()
    } catch (e) {
      setEvtError(e instanceof Error ? e.message : 'Failed to delete event')
    }
  }

  const removeColony = async () => {
    if (!token || !colony) return
    setDeleting(true)
    try {
      await deleteColony(token, colony.id)
      router.push('/dashboard/tarantulas')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Something went wrong')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const totalCountLabel = useMemo(() => {
    if (!colony || colony.total_count == null) return '—'
    const n = colony.total_count.toLocaleString()
    return colony.count_is_estimated ? `≈${n}` : n
  }, [colony])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-6 w-32 rounded bg-surface-elevated animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface-elevated animate-pulse" />
          <div className="h-64 rounded-2xl bg-surface-elevated animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (loadError || !colony) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="text-5xl mb-4" aria-hidden="true">🐾</div>
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {loadError || 'Colony not found'}
          </h1>
          <p className="text-theme-secondary mb-6">
            It may have been deleted, or you may not have access to it.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/tarantulas"
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Back to collection
            </Link>
            {loadError && (
              <button
                onClick={() => {
                  setLoading(true)
                  setLoadError('')
                  fetchAll()
                }}
                className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const speciesLabel = colony.species_missing
    ? 'Species removed'
    : colony.species_display_name ||
      colony.species_scientific_name ||
      'No species set'
  const stageEntries = colony.stage_counts ? Object.entries(colony.stage_counts) : []
  const hasHusbandry =
    colony.enclosure_type ||
    colony.enclosure_size ||
    colony.substrate_type ||
    colony.substrate_depth ||
    colony.target_temp_min != null ||
    colony.target_temp_max != null ||
    colony.target_humidity_min != null ||
    colony.target_humidity_max != null ||
    colony.water_dish != null

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <Link
          href={isOwner || !colony.user_id ? '/dashboard/tarantulas' : `/dashboard/shared/${colony.user_id}`}
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back to {isOwner ? 'collection' : shared.ownerName ? `${shared.ownerName}'s collection` : 'shared collection'}
        </Link>
        {!isOwner && viewerRole && (
          <p className="mt-2 px-3 py-2 rounded-xl bg-surface border border-theme text-sm text-theme-secondary">
            {shared.ownerName ? `${shared.ownerName}'s colony` : 'Shared colony'} · you&apos;re a {ROLE_LABEL[viewerRole as 'viewer' | 'logger' | 'keeper']}
          </p>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-2 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            {colony.photo_url ? (
              <img
                src={getImageUrl(colony.photo_url)}
                alt={colony.name}
                className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
              />
            ) : (
              <span className="text-4xl flex-shrink-0" aria-hidden="true">
                {taxonGlyph(colony.taxon)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-theme-primary truncate">
                  {colony.name}
                </h1>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200">
                  Colony
                </span>
              </div>
              <p
                className={`mt-1 ${
                  colony.species_missing
                    ? 'italic text-theme-tertiary'
                    : 'text-theme-secondary'
                }`}
              >
                {taxonGlyph(colony.taxon)} {taxonLabel(colony.taxon)} · {speciesLabel}
              </p>
              {!colony.is_active && !isEnded && (
                <span
                  className="inline-block mt-2 text-xs font-semibold px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  aria-label="Archived colony"
                >
                  Archived
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canKeep && <Link
              href={`/dashboard/colonies/${colony.id}/edit`}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Edit
            </Link>}
            {canKeep && <button
              type="button"
              onClick={toggleArchive}
              disabled={archiveBusy}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition disabled:opacity-50"
            >
              {archiveBusy ? 'Saving…' : colony.is_active ? 'Archive' : 'Unarchive'}
            </button>}
            {/* Neutral, not red: ending a colony destroys nothing. */}
            {canKeep && <button
              type="button"
              onClick={openEnd}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              End colony
            </button>}
            {/* Keeper-level, like sharing an animal. An ended colony can't
                get a new card (the API says 409), so the button goes too. */}
            {canKeep && <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              Share card
            </button>}
            {isOwner && <button
              onClick={() => setQrOpen(true)}
              className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
            >
              QR
            </button>}
            {isOwner && <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition"
            >
              Delete
            </button>}
          </div>
        </div>

        {archiveError && (
          <div
            role="alert"
            className="mb-4 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
          >
            {archiveError}
          </div>
        )}

        {/* Status card for an ended colony. A filled slate dot, the same quiet
            full stop the died-animal card uses: never red, nothing was
            destroyed, and no success colour either. */}
        {isEnded && colony.ended_at && (
          <section
            aria-labelledby="ended-heading"
            className="mb-6 p-4 rounded-2xl border border-theme bg-surface"
          >
            <div className="flex items-center gap-2.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" aria-hidden="true" />
              <h2 id="ended-heading" className="font-semibold text-theme-primary">
                {[`Ended ${formatEventDate(colony.ended_at)}`, colonyEndReasonLabel(colony.end_reason)]
                  .filter(Boolean)
                  .join(' · ')}
              </h2>
            </div>
            <p className="mt-2 text-sm text-theme-secondary">
              This is a historical record. Everything below is kept. The colony is out of your
              collection and your animal count.
            </p>
            {colony.end_notes && (
              <p className="mt-2 text-sm italic text-theme-tertiary whitespace-pre-wrap">{colony.end_notes}</p>
            )}
            <p className="mt-3 text-xs text-theme-tertiary">
              Logging is closed. Records stay readable and exportable.
            </p>
            {canKeepRole && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={reopenBusy}
                  className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary text-sm font-semibold hover:bg-surface-elevated transition disabled:opacity-50"
                >
                  {reopenBusy ? 'Saving…' : 'Reopen colony'}
                </button>
                {reopenError && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {reopenError}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Handed off as a whole colony. Same quiet slate full stop as the
            ended card: nothing was destroyed. */}
        {isTransferred && colony.transferred_out_at && (
          <section
            aria-labelledby="transferred-heading"
            className="mb-6 p-4 rounded-2xl border border-theme bg-surface"
          >
            <div className="flex items-center gap-2.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" aria-hidden="true" />
              <h2 id="transferred-heading" className="font-semibold text-theme-primary">
                Transferred {new Date(colony.transferred_out_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h2>
            </div>
            <p className="mt-2 text-sm text-theme-secondary">
              This colony went to a new keeper through a claim link. This is a historical record:
              everything below is kept, and the colony is out of your collection and your animal count.
            </p>
          </section>
        )}

        {/* Population card */}
        <section
          aria-labelledby="population-heading"
          className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              id="population-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Population
            </h2>
            {colony.count_is_estimated && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                Estimated
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-theme-primary">{totalCountLabel}</span>
            <span className="text-sm text-theme-tertiary">total across stages</span>
          </div>

          {stageEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {stageEntries.map(([stage, n]) => (
                <span
                  key={stage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-theme bg-surface-elevated text-sm"
                >
                  <span className="capitalize text-theme-secondary">{stage}</span>
                  <span className="font-semibold text-theme-primary">
                    {n.toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-tertiary">
              {isEnded
                ? 'No stage counts were recorded.'
                : 'No stage counts yet. Use “Log event” below to record births, additions, etc.'}
            </p>
          )}

          <div className="mt-6 pt-5 border-t border-theme">
            <h3 className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3">
              Over time
            </h3>
            <ColonyPopulationChart history={history} taxon={colony.taxon} />
          </div>

          {colony.species_id && !colony.species_missing && (
            <Link
              href={`/species/inverts/${colony.species_id}`}
              className="inline-block mt-4 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              View care sheet →
            </Link>
          )}
        </section>

        {/* Husbandry card */}
        {hasHusbandry && (
          <section
            aria-labelledby="husbandry-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="husbandry-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
            >
              Husbandry
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {(colony.enclosure_type || colony.enclosure_size) && (
                <div>
                  <div className="text-theme-tertiary">Enclosure</div>
                  <div className="text-theme-primary font-medium capitalize">
                    {[colony.enclosure_size, colony.enclosure_type]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              )}
              {colony.substrate_type && (
                <div>
                  <div className="text-theme-tertiary">Substrate</div>
                  <div className="text-theme-primary font-medium">
                    {colony.substrate_type}
                    {colony.substrate_depth ? ` · ${colony.substrate_depth}` : ''}
                  </div>
                </div>
              )}
              {(colony.target_temp_min != null || colony.target_temp_max != null) && (
                <div>
                  <div className="text-theme-tertiary">Temperature</div>
                  <div className="text-theme-primary font-medium">
                    {formatTempRange(colony.target_temp_min, colony.target_temp_max, units)}
                  </div>
                </div>
              )}
              {(colony.target_humidity_min != null ||
                colony.target_humidity_max != null) && (
                <div>
                  <div className="text-theme-tertiary">Humidity</div>
                  <div className="text-theme-primary font-medium">
                    {colony.target_humidity_min ?? '?'}–{colony.target_humidity_max ?? '?'}%
                  </div>
                </div>
              )}
              {colony.water_dish != null && (
                <div>
                  <div className="text-theme-tertiary">Water dish</div>
                  <div className="text-theme-primary font-medium">
                    {colony.water_dish ? 'Yes' : 'No'}
                  </div>
                </div>
              )}
              {colony.last_substrate_change && (
                <div>
                  <div className="text-theme-tertiary">Last substrate change</div>
                  <div className="text-theme-primary font-medium">
                    {formatEventDate(colony.last_substrate_change)}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Notes */}
        {colony.notes && (
          <section
            aria-labelledby="notes-heading"
            className="mb-6 p-6 rounded-2xl border border-theme bg-surface"
          >
            <h2
              id="notes-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
            >
              Notes
            </h2>
            <div className="text-theme-primary whitespace-pre-wrap">{colony.notes}</div>
          </section>
        )}

        {/* Feeding. ADR-010 deferred this for colonies on the grounds that
            colony taxa are casual-feed detritivores — true of isopods, not of
            a balfouri communal, which is fed on a cadence like any tarantula.
            cph_20260729_colony_logs added the parent column. */}
        <section aria-labelledby="feeding-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="feeding-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Feeding
            </h2>
            {canLog && (
            <button
              type="button"
              onClick={() => setFeedOpen((o) => !o)}
              aria-expanded={feedOpen}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {feedOpen ? 'Cancel' : '+ Log feeding'}
            </button>
            )}
          </div>

          {feedOpen && (
            <div className="p-4 mb-3 rounded-2xl border border-theme bg-surface space-y-3">
              {feedError && (
                <div
                  role="alert"
                  className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                >
                  {feedError}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">Date</span>
                  <input
                    type="date"
                    value={feedDate}
                    max={todayIso()}
                    onChange={(e) => setFeedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-theme bg-surface text-theme-primary"
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Food type
                  </span>
                  <select
                    value={feedType}
                    onChange={(e) => setFeedType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-theme bg-surface text-theme-primary"
                  >
                    <option value="">Not recorded</option>
                    {/* Taxon-aware: greens for a dubia bin, crickets for a
                        communal tarantula. */}
                    {colonyFoodTypes(colony.taxon).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                {colonyShowsPreySize(colony.taxon) && (
                  <label className="block">
                    <span className="block text-sm font-medium text-theme-secondary mb-1">
                      Prey size
                    </span>
                    <select
                      value={feedSize}
                      onChange={(e) => setFeedSize(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-theme bg-surface text-theme-primary"
                    >
                      <option value="">Not recorded</option>
                      <option value="Small">Small</option>
                      <option value="Medium">Medium</option>
                      <option value="Large">Large</option>
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    {colonyShowsPreySize(colony.taxon) ? 'How many?' : 'Amount'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={feedQty}
                    onChange={(e) => setFeedQty(e.target.value)}
                    placeholder="e.g. 6"
                    className="w-full px-3 py-2 rounded-lg border border-theme bg-surface text-theme-primary"
                  />
                  <span className="block mt-1 text-xs text-theme-tertiary">
                    {colonyShowsPreySize(colony.taxon)
                      ? 'Prey items offered to the group — six crickets for eleven spiders says far more than “fed”.'
                      : 'Portions or items offered.'}{' '}
                    Leave blank if you didn&apos;t count.
                  </span>
                </label>
              </div>
              <fieldset>
                <legend className="block text-sm font-medium text-theme-secondary mb-1">
                  Outcome
                </legend>
                <div className="flex gap-2">
                  {[
                    { v: true, l: 'Taken' },
                    { v: false, l: 'Refused' },
                  ].map((opt) => (
                    <button
                      key={opt.l}
                      type="button"
                      onClick={() => setFeedAccepted(opt.v)}
                      aria-pressed={feedAccepted === opt.v}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                        feedAccepted === opt.v
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                <span className="block mt-1 text-xs text-theme-tertiary">
                  For a group this means the colony took it, not any one animal.
                </span>
              </fieldset>
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Notes (optional)
                </span>
                <textarea
                  value={feedNotes}
                  onChange={(e) => setFeedNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-theme bg-surface text-theme-primary"
                />
              </label>
              <button
                type="button"
                onClick={submitFeeding}
                disabled={feedSubmitting}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition disabled:opacity-60"
              >
                {feedSubmitting ? 'Saving…' : 'Save feeding'}
              </button>
            </div>
          )}

          {renderEditor('feeding')}
          <div className="p-4 rounded-2xl border border-theme bg-surface">
            {feedings.length === 0 ? (
              <p className="text-sm text-theme-tertiary">No feedings logged yet.</p>
            ) : (
              <ul className="divide-y divide-theme">
                {(showAllFeed ? feedings : feedings.slice(0, 10)).map((f) => (
                  <li key={f.id} className="py-2 flex items-center gap-3 text-sm">
                    <span aria-hidden="true">{f.accepted ? '🍽️' : '🚫'}</span>
                    <span className="flex-1 text-theme-primary">
                      {/* Count leads — for a group it's the number that carries
                          the meaning. Omitted when unrecorded rather than shown
                          as 1, which would invent a fact. */}
                      {[f.quantity != null ? `${f.quantity}×` : null, f.food_size, f.food_type]
                        .filter(Boolean)
                        .join(' ') || 'Fed'}
                      {f.accepted ? '' : ' — refused'}
                      {f.notes ? (
                        <span className="block text-theme-tertiary">{f.notes}</span>
                      ) : null}
                    </span>
                    <time
                      dateTime={f.fed_at}
                      className="text-theme-tertiary whitespace-nowrap"
                    >
                      {new Date(f.fed_at).toLocaleDateString()}
                    </time>
                    {canChange(f) && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit('feeding', f.id)}
                          className={editBtnCls}
                          aria-label={`Edit feeding from ${new Date(f.fed_at).toLocaleDateString()}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFeeding(f.id)}
                          className={delBtnCls}
                          aria-label={`Delete feeding from ${new Date(f.fed_at).toLocaleDateString()}`}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {feedings.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllFeed((v) => !v)}
                className="mt-3 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                {showAllFeed ? 'Show fewer' : `See all ${feedings.length}`}
              </button>
            )}
          </div>
        </section>

        {/* Water (cwc_20260910).
            ABOVE substrate deliberately. For a detritivore culture — isopods,
            springtails — hydration IS the husbandry: they're misted or
            overflowed constantly and fed almost incidentally, so this is closer
            to what a feeding log is for a tarantula than to a maintenance note.
            No due date and no overdue state anywhere; there is no evidence base
            for a watering cadence and a derived deadline would be invented. */}
        <section aria-labelledby="water-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="water-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Water
            </h2>
            {canLog && (
            <button
              type="button"
              onClick={() => setCareOpen((o) => !o)}
              aria-expanded={careOpen}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {careOpen ? 'Cancel' : '+ Log water'}
            </button>
            )}
          </div>

          {careError && (
            <div
              role="alert"
              className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {careError}
            </div>
          )}

          {careOpen && (
            <div className="p-4 mb-3 rounded-2xl border border-theme bg-surface space-y-3">
              <div>
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  What did you do?
                </span>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CARE_LOG_LABELS) as CareLogType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={careType === k}
                      onClick={() => setCareType(k)}
                      className={`px-3 py-2 rounded-full text-sm font-semibold ${
                        careType === k
                          ? 'bg-gradient-brand text-white'
                          : 'bg-surface border border-theme text-theme-secondary'
                      }`}
                    >
                      {CARE_LOG_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Date
                </span>
                <input
                  type="date"
                  value={careDate}
                  max={todayIso()}
                  onChange={(e) => setCareDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Notes
                </span>
                <textarea
                  value={careNote}
                  onChange={(e) => setCareNote(e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </label>
              <button
                type="button"
                onClick={submitCareLog}
                disabled={careBusy}
                className="px-4 py-2 rounded-xl bg-gradient-brand text-white font-semibold disabled:opacity-60"
              >
                {careBusy ? 'Saving…' : 'Save water log'}
              </button>
            </div>
          )}

          {renderEditor('care')}
          {careLogs.length === 0 ? (
            <p className="text-sm text-theme-tertiary">No watering logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {careLogs.slice(0, 10).map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-4 p-3 rounded-xl border border-theme bg-surface"
                >
                  <div>
                    <p className="text-sm font-medium text-theme-primary">
                      {CARE_LOG_LABELS[c.log_type] ?? 'Watered'}
                    </p>
                    {/* Date only — the stored clock time is ours, not theirs. */}
                    <p className="text-xs text-theme-tertiary mt-0.5">
                      {[new Date(c.logged_at).toLocaleDateString(), c.notes]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {canChange(c) && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit('care', c.id)}
                      className={editBtnCls}
                      aria-label={`Edit water log from ${new Date(c.logged_at).toLocaleDateString()}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCareLog(c.id)}
                      className={delBtnCls}
                      aria-label={`Delete water log from ${new Date(c.logged_at).toLocaleDateString()}`}
                    >
                      Delete
                    </button>
                  </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Substrate (csc_20260731). Every colony taxon has substrate — a dubia
            bin gets cleaned out, and for detritivores it IS the food — so this
            isn't gated to communal tarantulas. Only the reasons differ. */}
        <section aria-labelledby="substrate-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="substrate-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Substrate
            </h2>
            {canLog && (
            <button
              type="button"
              onClick={() => setSubOpen((o) => !o)}
              aria-expanded={subOpen}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {subOpen ? 'Cancel' : '+ Log change'}
            </button>
            )}
          </div>

          {subError && (
            <div
              role="alert"
              className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {subError}
            </div>
          )}

          {subOpen && (
            <div className="p-4 mb-3 rounded-2xl border border-theme bg-surface space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Date changed
                  </span>
                  <input
                    type="date"
                    value={subDate}
                    max={todayIso()}
                    onChange={(e) => setSubDate(e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-theme-secondary mb-1">
                    Substrate type
                  </span>
                  <input
                    type="text"
                    value={subType}
                    onChange={(e) => setSubType(e.target.value)}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="block text-sm font-medium text-theme-secondary mb-1">
                  Reason
                </legend>
                <div className="flex flex-wrap gap-2">
                  {/* Taxon-aware: nobody rehouses dubia, they clean out frass. */}
                  {colonySubstrateReasons(colony.taxon).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSubReason(subReason === r ? '' : r)}
                      aria-pressed={subReason === r}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                        subReason === r
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Notes
                </span>
                <textarea
                  value={subNote}
                  onChange={(e) => setSubNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. moved back to the taller enclosure"
                  className={inputCls}
                />
              </label>
              <button
                type="button"
                onClick={submitSubstrate}
                disabled={subBusy}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition disabled:opacity-60"
              >
                {subBusy ? 'Saving…' : 'Save change'}
              </button>
            </div>
          )}

          {renderEditor('substrate')}
          <div className="p-4 rounded-2xl border border-theme bg-surface">
            {substrates.length === 0 ? (
              <p className="text-sm text-theme-tertiary">
                No substrate changes logged yet.
              </p>
            ) : (
              <ul className="divide-y divide-theme">
                {substrates.slice(0, 12).map((c) => (
                  <li key={c.id} className="py-2 flex items-start gap-3 text-sm">
                    <span aria-hidden="true">🪵</span>
                    <span className="flex-1 text-theme-primary">
                      {[c.reason, c.substrate_type].filter(Boolean).join(' · ') ||
                        'Substrate changed'}
                      {c.notes ? (
                        <span className="block text-theme-tertiary">{c.notes}</span>
                      ) : null}
                    </span>
                    <time
                      dateTime={c.changed_at}
                      className="text-theme-tertiary whitespace-nowrap"
                    >
                      {formatEventDate(c.changed_at)}
                    </time>
                    {canChange(c) && (
                    <button
                      type="button"
                      onClick={() => startEdit('substrate', c.id)}
                      className={editBtnCls}
                      aria-label={`Edit substrate change from ${formatEventDate(c.changed_at)}`}
                    >
                      Edit
                    </button>
                    )}
                    {canChange(c) && (
                    <button
                      type="button"
                      onClick={() => removeSubstrate(c.id)}
                      aria-label={`Delete substrate change from ${formatEventDate(c.changed_at)}`}
                      className="text-theme-tertiary hover:text-red-600 transition"
                    >
                      ×
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Molts (cml_20260730). For a communal a shed skin is often the only
            observation that surfaces on its own — the animals are hidden and
            can't be handled without dismantling the enclosure — and it's how
            sexing happens: you sex the molt, not the spider. */}
        <section aria-labelledby="molts-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="molts-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Molts
            </h2>
            {canLog && (
            <button
              type="button"
              onClick={() => setMoltOpen((o) => !o)}
              aria-expanded={moltOpen}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              {moltOpen ? 'Cancel' : '+ Found a molt'}
            </button>
            )}
          </div>

          {moltError && (
            <div
              role="alert"
              className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {moltError}
            </div>
          )}

          {moltOpen && (
            <div className="p-4 mb-3 rounded-2xl border border-theme bg-surface space-y-3">
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Date found
                </span>
                <input
                  type="date"
                  value={moltDate}
                  max={todayIso()}
                  onChange={(e) => setMoltDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Notes
                </span>
                <textarea
                  value={moltNote}
                  onChange={(e) => setMoltNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. one molt, confirmed female"
                  className={inputCls}
                />
                {/* Deliberately no legspan or weight fields. Measuring means
                    knowing whose molt it is, and in a communal you don't — a
                    guessed number would be worse than a missing one. */}
                <span className="block mt-1 text-xs text-theme-tertiary">
                  Colony molts aren&apos;t tied to one animal — nobody can tell which
                  of the group shed it.
                </span>
              </label>
              <button
                type="button"
                onClick={submitMolt}
                disabled={moltBusy}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition disabled:opacity-60"
              >
                {moltBusy ? 'Saving…' : 'Save molt'}
              </button>
            </div>
          )}

          {renderEditor('molt')}
          <div className="p-4 rounded-2xl border border-theme bg-surface">
            {molts.length === 0 ? (
              <p className="text-sm text-theme-tertiary">No molts recorded yet.</p>
            ) : (
              <ul className="divide-y divide-theme">
                {molts.slice(0, 12).map((m) => (
                  <li key={m.id} className="py-2 flex items-center gap-3 text-sm">
                    <span aria-hidden="true">🪶</span>
                    <span className="flex-1 text-theme-primary">
                      {m.notes || 'Molt found'}
                    </span>
                    <time
                      dateTime={m.molted_at}
                      className="text-theme-tertiary whitespace-nowrap"
                    >
                      {new Date(m.molted_at).toLocaleDateString()}
                    </time>
                    {canChange(m) && (
                    <button
                      type="button"
                      onClick={() => startEdit('molt', m.id)}
                      className={editBtnCls}
                      aria-label={`Edit molt record from ${new Date(m.molted_at).toLocaleDateString()}`}
                    >
                      Edit
                    </button>
                    )}
                    {canChange(m) && (
                    <button
                      type="button"
                      onClick={() => removeMolt(m.id)}
                      aria-label={`Delete molt record from ${new Date(m.molted_at).toLocaleDateString()}`}
                      className="text-theme-tertiary hover:text-red-600 transition"
                    >
                      ×
                    </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Photos. Same strip as the animal detail page: hero badge, and
            keepers get Set hero / Delete on hover. Uncapped for colonies. */}
        <section aria-labelledby="photos-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="photos-heading"
              className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide"
            >
              Photos
            </h2>
            {canLog && (
              <Link
                href={`/dashboard/colonies/${colony.id}/add-photo`}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                + Add photo
              </Link>
            )}
          </div>
          {photosError && (
            <div
              role="alert"
              className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {photosError}
            </div>
          )}
          {photoActionError && (
            <div
              role="alert"
              className="mb-3 p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {photoActionError}
            </div>
          )}
          {photos.length === 0 ? (
            !photosError && (
              <div className="p-6 rounded-2xl border border-theme bg-surface text-center text-theme-secondary">
                No photos yet.
              </div>
            )
          ) : (
            <div className="p-4 rounded-2xl border border-theme bg-surface">
              <div className="flex gap-3 overflow-x-auto">
                {photos.map((p) => {
                  const isHero = colony.photo_url === p.url
                  return (
                    <div key={p.id} className="group relative flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getImageUrl(p.thumbnail_url || p.url)}
                        alt={p.caption || ''}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      {isHero && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold">
                          ★ Hero
                        </span>
                      )}
                      {canKeep && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-black/55 rounded-b-lg py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                          {!isHero && (
                            <button
                              type="button"
                              onClick={() => makeHeroPhoto(p.id)}
                              className="text-[10px] font-semibold text-white hover:underline"
                              aria-label="Set as hero photo"
                            >
                              Set hero
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePhoto(p.id)}
                            className="text-[10px] font-semibold text-red-300 hover:underline"
                            aria-label="Delete photo"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* Add event — loggers and up */}
        {canLog && <section aria-labelledby="addevent-heading" className="mb-6">
          <h2
            id="addevent-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Log event
          </h2>
          <div className="p-4 rounded-2xl border border-theme bg-surface space-y-3">
            {evtError && (
              <div
                role="alert"
                className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
              >
                {evtError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evt-type"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Event type
                </label>
                <select
                  id="evt-type"
                  value={evtType}
                  onChange={(e) => setEvtType(e.target.value as ColonyEventType)}
                  className={inputCls}
                >
                  {COLONY_EVENT_TYPES.map((et) => (
                    <option key={et.type} value={et.type}>
                      {et.icon} {et.label}
                    </option>
                  ))}
                </select>
                {meta && (
                  <p className="text-xs text-theme-tertiary mt-1">{meta.description}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="evt-date"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Date
                </label>
                <input
                  id="evt-date"
                  type="date"
                  value={evtDate}
                  onChange={(e) => setEvtDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {meta?.adjustsCount && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="evt-stage"
                    className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                  >
                    Stage
                  </label>
                  {stageOptions.length > 0 ? (
                    <select
                      id="evt-stage"
                      value={evtStage}
                      onChange={(e) => setEvtStage(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— mixed —</option>
                      {stageOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="evt-stage"
                      value={evtStage}
                      onChange={(e) => setEvtStage(e.target.value)}
                      placeholder="e.g. nymphs (blank = mixed)"
                      className={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label
                    htmlFor="evt-delta"
                    className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                  >
                    Count change {meta.allowNegative ? '(use − to remove)' : ''}
                  </label>
                  <input
                    id="evt-delta"
                    type="text"
                    inputMode={meta.allowNegative ? 'text' : 'numeric'}
                    pattern={meta.allowNegative ? '-?\\d*' : '\\d*'}
                    value={evtDelta}
                    onChange={(e) => {
                      const v = e.target.value
                      if (
                        v === '' ||
                        (meta.allowNegative ? /^-?\d*$/ : /^\d*$/).test(v)
                      ) {
                        setEvtDelta(v)
                      }
                    }}
                    placeholder={meta.allowNegative ? 'e.g. -3' : 'e.g. 20'}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {meta?.hasSeverity && (
              <div>
                <label
                  htmlFor="evt-severity"
                  className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
                >
                  Severity
                </label>
                <select
                  id="evt-severity"
                  value={evtSeverity}
                  onChange={(e) => setEvtSeverity(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— not set —</option>
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="evt-notes"
                className="block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5"
              >
                Notes {evtType === 'observation' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                id="evt-notes"
                rows={2}
                maxLength={2000}
                value={evtNotes}
                onChange={(e) => setEvtNotes(e.target.value)}
                placeholder="Optional — what did you notice?"
                className={inputCls}
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={submitEvent}
                disabled={
                  evtSubmitting || (evtType === 'observation' && !evtNotes.trim())
                }
                className="px-5 py-2 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {evtSubmitting ? 'Saving…' : 'Log it'}
              </button>
            </div>
          </div>
        </section>}

        {/* Timeline */}
        <section aria-labelledby="timeline-heading" className="mb-10">
          <h2
            id="timeline-heading"
            className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
          >
            Timeline
          </h2>
          {renderEditor('event')}
          {events.length === 0 ? (
            <div className="p-6 rounded-2xl border border-theme bg-surface text-center text-theme-secondary">
              {isEnded ? 'No events were logged.' : 'No events yet. Use Log event above to record your first one.'}
            </div>
          ) : (
            <ul className="divide-y divide-theme rounded-2xl border border-theme bg-surface overflow-hidden">
              {events.map((ev) => {
                const em = colonyEventMeta(ev.event_type)
                return (
                  <li key={ev.id} className="p-4 flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0" aria-hidden="true">
                      {em?.icon ?? '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-medium text-theme-primary">
                          {em?.label ?? ev.event_type}
                          {ev.stage && (
                            <span className="ml-2 text-xs text-theme-tertiary capitalize">
                              {ev.stage}
                            </span>
                          )}
                          {ev.count_delta != null && (
                            <span
                              className={`ml-2 text-sm font-semibold ${
                                ev.count_delta > 0
                                  ? 'text-green-700 dark:text-green-400'
                                  : ev.count_delta < 0
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-theme-tertiary'
                              }`}
                            >
                              {ev.count_delta > 0 ? '+' : ''}
                              {ev.count_delta.toLocaleString()}
                            </span>
                          )}
                          {ev.severity && (
                            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 capitalize">
                              {ev.severity}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-theme-tertiary flex-shrink-0">
                          {formatEventDate(ev.occurred_at)}
                        </div>
                      </div>
                      {ev.notes && (
                        <p className="mt-1 text-sm text-theme-secondary whitespace-pre-wrap">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                    {canChange(ev) && (
                    <button
                      type="button"
                      onClick={() => startEdit('event', ev.id)}
                      aria-label={`Edit ${em?.label ?? ev.event_type} event`}
                      className={`${editBtnCls} px-1`}
                    >
                      Edit
                    </button>
                    )}
                    {canChange(ev) && (
                    <button
                      type="button"
                      onClick={() => removeEvent(ev.id)}
                      aria-label={`Delete ${em?.label ?? ev.event_type} event`}
                      className="flex-shrink-0 text-theme-tertiary hover:text-red-600 dark:hover:text-red-400 transition px-2"
                    >
                      ✕
                    </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Transfer or sell — owner only, and only for a running colony. The
            API refuses ended, archived and already-transferred colonies too. */}
        {token && isOwner && !isEnded && !isTransferred && colony.is_active && (
          <TransferPanel token={token} colony={colony} />
        )}

        {/* End colony. The dialog IS the confirm: the date is defaulted, so the
            flow completes in one pick and one click. Neutral ink, never the
            accent and never red -- nothing is destroyed. */}
        {endOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-dialog-heading"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => !endBusy && setEndOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-theme bg-surface p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="end-dialog-heading" className="text-xl font-bold text-theme-primary">
                End {colony.name}
              </h3>
              <p className="text-sm text-theme-secondary">
                Nothing is deleted. Every event, feeding and photo stays in your records, and the
                colony stops counting toward your plan. You can reopen it later.
              </p>

              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Date it ended
                </span>
                <input
                  type="date"
                  value={endDate}
                  max={todayIso()}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                />
              </label>

              <fieldset>
                <legend className="block text-sm font-medium text-theme-secondary mb-1">
                  Reason
                </legend>
                <div className="flex flex-wrap gap-2">
                  {COLONY_END_REASON_ORDER.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEndReason(endReason === r ? '' : r)}
                      aria-pressed={endReason === r}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${
                        endReason === r
                          ? 'bg-theme-primary border-theme-primary text-surface'
                          : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                      }`}
                    >
                      {COLONY_END_REASON_LABELS[r]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="block text-sm font-medium text-theme-secondary mb-1">
                  Note <span className="text-theme-tertiary font-normal">Optional</span>
                </span>
                <textarea
                  value={endNotes}
                  onChange={(e) => setEndNotes(e.target.value.slice(0, 2000))}
                  rows={3}
                  className={inputCls}
                />
              </label>

              {endError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">{endError}</p>
              )}

              <button
                type="button"
                onClick={submitEnd}
                disabled={endBusy || !endReason}
                className="w-full py-3 rounded-xl bg-theme-primary text-surface font-semibold disabled:opacity-60"
              >
                {endBusy ? 'Saving…' : 'End colony'}
              </button>
              <button
                type="button"
                onClick={() => setEndOpen(false)}
                disabled={endBusy}
                className="w-full text-sm text-theme-tertiary hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Delete confirm modal */}
        {confirmDelete && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-heading"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => !deleting && setConfirmDelete(false)}
          >
            <div
              className="max-w-md w-full p-6 rounded-2xl bg-surface border border-theme shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="delete-dialog-heading"
                className="text-lg font-bold text-theme-primary mb-2"
              >
                Delete this colony?
              </h3>
              <p className="text-sm text-theme-secondary mb-5">
                All events for <strong>{colony.name}</strong> will be permanently
                deleted. This can’t be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={removeColony}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Enclosure label + phone photo upload. `resource="colonies"` points the
            label at /col/{id} and the upload session at the colony route. */}
        {qrOpen && colony && (
          <QRModal
            tarantulaId={colony.id}
            tarantulaName={colony.name}
            scientificName={colony.species_scientific_name ?? null}
            sex={null}
            resource="colonies"
            population={colony.total_count}
            populationIsEstimated={colony.count_is_estimated}
            onClose={() => setQrOpen(false)}
            onPhotoAdded={fetchAll}
          />
        )}
        {token && colony && (
          <ShareCardModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            app="tarantuverse"
            animalId={colony.id}
            kind="colony"
            token={token}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
