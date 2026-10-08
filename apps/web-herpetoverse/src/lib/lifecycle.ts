/**
 * Recording a death — the Herpetoverse web mirror of the mobile lifecycle
 * helpers (apps/mobile-herpetoverse/src/lib/lifecycle.ts) and of TV web's
 * `animal-lifecycle.ts` (ADR-015, design handoff §14).
 *
 * The copy, tone rules and shape follow HV mobile — deliberately duplicated,
 * not shared, because the apps don't share a package. Change one, change both.
 *
 * Never write on these surfaces: "Successfully marked as died", any
 * checkmark, "Passed away", "Lost" (already means escaped), "Rest in peace".
 */
import { ApiError, apiFetch } from './apiClient'
import type { Animal } from './animals'

/** The API vocabulary (schemas/death.py) is shared by both products. HV
 *  offers the subset that means something for a reptile or amphibian —
 *  "bad molt" and "DKS" are invertebrate causes, and offering them here
 *  would invite a wrong answer rather than an honest "unknown". */
export type DeathCause =
  | 'unknown'
  | 'illness'
  | 'injury'
  | 'dehydration'
  | 'escaped'
  | 'old_age'
  | 'other'
  // Not offered in HV, but a record could carry one (e.g. set via the API).
  | 'bad_molt'
  | 'dks'

/** `unknown` second, straight after the most common real cause — "I don't
 *  know" must be as cheap to pick as a guess, or people guess. */
export const HV_DEATH_CAUSE_ORDER: DeathCause[] = [
  'illness',
  'unknown',
  'injury',
  'dehydration',
  'escaped',
  'old_age',
  'other',
]

export const DEATH_CAUSE_LABELS: Record<DeathCause, string> = {
  unknown: 'Unknown',
  illness: 'Illness',
  injury: 'Injury',
  dehydration: 'Dehydration',
  escaped: 'Escaped',
  old_age: 'Old age',
  other: 'Other',
  bad_molt: 'Bad molt',
  dks: 'DKS',
}

export interface Pronouns {
  subject: string
  object: string
  possessive: string
}

/** From recorded sex; never guessed. Unsexed is "them". */
export function pronounsFor(sex: string | null | undefined): Pronouns {
  const s = (sex || '').toLowerCase()
  if (s === 'female') return { subject: 'she', object: 'her', possessive: 'her' }
  if (s === 'male') return { subject: 'he', object: 'him', possessive: 'his' }
  return { subject: 'they', object: 'them', possessive: 'their' }
}

/** "4 years, 2 months" in the keeper's care — or null when we can't say
 *  honestly (no acquisition date, or dates out of order). Shown flatly.
 *  Deliberately never falls back to created_at: when the record was made isn't
 *  when the animal arrived. */
export function tenureLabel(
  dateAcquired: string | null | undefined,
  diedAt: string | null | undefined,
): string | null {
  if (!dateAcquired || !diedAt) return null
  const from = new Date(`${dateAcquired.slice(0, 10)}T12:00:00`)
  const to = new Date(`${diedAt.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return null
  }
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  months = Math.max(0, months)
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0 && rem === 0) return 'less than a month'
  const parts: string[] = []
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`)
  if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`)
  return parts.join(', ')
}

/** "Mar 4, 2026" for a YYYY-MM-DD date, without a UTC round-trip. */
export function fmtDay(ymd: string | null | undefined): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Today as YYYY-MM-DD in the keeper's local time. */
export function todayYMD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Status-card body once an animal is marked died. */
export function historicalRecordLine(
  cause: string | null | undefined,
  p: Pronouns,
): string {
  const label = cause ? DEATH_CAUSE_LABELS[cause as DeathCause] : undefined
  const causeSentence = label ? `${label}. ` : ''
  const who = p.subject.charAt(0).toUpperCase() + p.subject.slice(1)
  const verb = p.subject === 'they' ? '’re' : '’s'
  return (
    `${causeSentence}This is a historical record — everything below is kept. ` +
    `${who}${verb} out of your collection, your reminders and your animal count.`
  )
}

export const COPY = {
  endOfRecord: 'End of record',
  menuItem: 'Mark as died',
  menuItemSub: (p: Pronouns) =>
    `Keeps every feeding, weight, shed and photo. Removes ${p.object} from your collection, reminders and your plan’s animal count.`,
  dialogTitle: (name: string) => `Mark ${name} as died`,
  dialogBody: (p: Pronouns) =>
    `Nothing is deleted — every feeding, weight, shed and photo stays in your records, and ${
      p.subject === 'they' ? 'they stop' : `${p.subject} stops`
    } counting toward your plan.`,
  dateLabel: 'Date of death',
  dateHelper: 'Backdating is fine — any past date.',
  optionalToggle: 'Add a cause or a note',
  causeLabel: 'Cause',
  noteLabel: 'Note',
  confirm: 'Mark as died',
  cancel: 'Cancel',
  logsClosed: 'Logging is closed. Records stay readable and exportable.',
  restore: 'Restore to collection',
  restoreConfirm: (name: string) =>
    `Restore ${name} to your collection? Reminders will resume and the animal will count toward your plan again.`,
  archiveSub: (n: number) =>
    `${n} record${n === 1 ? '' : 's'} kept · not counted on your plan`,
} as const

/**
 * A readable message for a failed lifecycle call. The API returns structured
 * `detail` objects for plan-limit (402) errors, which apiFetch can't flatten to
 * a string, so look inside the body for a `message` before falling back.
 */
export function lifecycleErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null
    const detail = body && typeof body === 'object' ? body.detail : null
    if (detail && typeof detail === 'object') {
      const msg = (detail as { message?: unknown }).message
      if (typeof msg === 'string' && msg) return msg
    }
    if (err.status === 402 || !err.message || err.message.startsWith('Request failed')) {
      return fallback
    }
    return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export interface MarkDiedPayload {
  /** YYYY-MM-DD. Omit for today. Future dates are rejected server-side. */
  died_at?: string | null
  death_cause?: DeathCause | null
  death_notes?: string | null
}

/**
 * Record that an animal died. A terminal state, never a delete: the record and
 * every log stay. Its own endpoint rather than a field on the update route, so
 * this cannot happen as a side effect of an incidental edit.
 */
export function markAnimalDied(
  id: string,
  payload: MarkDiedPayload,
): Promise<Animal> {
  return apiFetch<Animal>(`/api/v1/animals/${encodeURIComponent(id)}/died`, {
    method: 'POST',
    json: payload,
  })
}

/** Undo a mark-as-died. Clears date, cause and notes together. */
export function reviveAnimal(id: string): Promise<Animal> {
  return apiFetch<Animal>(`/api/v1/animals/${encodeURIComponent(id)}/revive`, {
    method: 'POST',
    json: {},
  })
}

/** The "Died" archive (handoff §14.5) — same `status` vocabulary as /inverts/. */
export function listDeceasedAnimals(): Promise<Animal[]> {
  return apiFetch<Animal[]>('/api/v1/animals/?status=deceased')
}
