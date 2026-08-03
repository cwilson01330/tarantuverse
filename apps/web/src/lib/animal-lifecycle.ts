/**
 * Death and per-animal events (ADR-015) — web.
 *
 * A separate module rather than an addition to `lib/inverts.ts`, which is a
 * pure registry (taxon metadata, feature-module gating) with no network calls
 * in it at all. Mixing an API client into it would make every page that just
 * wants a taxon label depend on fetch plumbing.
 *
 * Follows the `lib/colonies.ts` convention: raw fetch against the full
 * /api/v1/... path, caller passes its own token.
 *
 * Mirrors `apps/mobile/src/lib/inverts.ts` — keep the two in step. The labels
 * and orderings below are deliberately duplicated rather than shared, because
 * the alternative is a cross-app package for nine strings.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders(token: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

// ── Death ────────────────────────────────────────────────────────────────────

/**
 * Offered, never demanded. `unknown` is a real answer — most invertebrate
 * deaths are genuinely unexplained, and a keeper who doesn't know should be
 * able to say so rather than leave a blank that reads as an omission.
 */
export type DeathCause =
  | 'bad_molt'
  | 'dehydration'
  | 'dks'
  | 'illness'
  | 'injury'
  | 'escaped'
  | 'old_age'
  | 'unknown'
  | 'other'

export const DEATH_CAUSE_LABELS: Record<DeathCause, string> = {
  bad_molt: 'Bad molt',
  dehydration: 'Dehydration',
  dks: 'DKS',
  illness: 'Illness',
  injury: 'Injury',
  escaped: 'Escaped, never found',
  old_age: 'Old age',
  unknown: "I don't know",
  other: 'Something else',
}

/**
 * Display order.
 *
 * `bad_molt` leads because it's the most common way a tarantula dies.
 * `unknown` is second on purpose — burying "I don't know" at the bottom of a
 * list nudges people into guessing a cause they never observed, and a guessed
 * cause is worse than no cause: it becomes fiction in any later analysis.
 */
export const DEATH_CAUSE_ORDER: DeathCause[] = [
  'bad_molt',
  'unknown',
  'dehydration',
  'dks',
  'illness',
  'injury',
  'escaped',
  'old_age',
  'other',
]

export interface MarkDiedPayload {
  /** YYYY-MM-DD. Omit for today. Future dates are rejected server-side. */
  died_at?: string | null
  death_cause?: DeathCause | null
  death_notes?: string | null
}

/**
 * Record that an animal died.
 *
 * A terminal state, never a delete: the record and every log stay. The animal
 * drops out of the collection, the free-tier count, feeding status and every
 * reminder — nothing will ask you to feed it again.
 *
 * Its own endpoint rather than a field on the update route, so this cannot
 * happen as a side effect of an incidental edit.
 */
export async function markInvertDied(
  token: string,
  id: string,
  payload: MarkDiedPayload,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/inverts/${id}/died`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.detail || 'Could not save')
  }
}

/**
 * Undo a mark-as-died.
 *
 * Exists so a mis-tap doesn't leave someone living with a memorial for an
 * animal sitting in front of them. Deliberately not blocked when it would push
 * a free-tier keeper back over the cap.
 */
export async function reviveInvert(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/inverts/${id}/revive`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: '{}',
  })
  if (!res.ok) throw new Error('Could not restore')
}

/** The memorial view — animals that have died, records intact. */
export async function listDeceasedInverts(token: string): Promise<any[]> {
  const res = await fetch(`${API_URL}/api/v1/inverts/?deceased=true`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load')
  return res.json()
}

// ── Per-animal events ────────────────────────────────────────────────────────

export type AnimalEventType =
  | 'injury'
  | 'illness'
  | 'bad_molt'
  | 'escape'
  | 'recovered'
  | 'rehoused'
  | 'vet_visit'
  | 'observation'
  | 'death'

export type AnimalEventSeverity = 'minor' | 'moderate' | 'severe'

export interface AnimalEvent {
  id: string
  invert_id: string | null
  animal_id: string | null
  event_type: AnimalEventType
  /** YYYY-MM-DD — a date, not a timestamp. */
  occurred_at: string
  severity: AnimalEventSeverity | null
  notes: string | null
  created_at: string
}

export const ANIMAL_EVENT_LABELS: Record<AnimalEventType, string> = {
  injury: 'Injury',
  illness: 'Illness',
  bad_molt: 'Bad molt',
  escape: 'Escaped',
  recovered: 'Recovered',
  rehoused: 'Rehoused',
  vet_visit: 'Vet visit',
  observation: 'Observation',
  // The event type is `death`; the LABEL is "Died". Keeping the record's own
  // vocabulary consistent with the animal's died_at wording.
  death: 'Died',
}

/**
 * Picker order. `observation` leads because it's the catch-all people reach
 * for most; `death` sits last so nobody taps it by accident.
 */
export const ANIMAL_EVENT_ORDER: AnimalEventType[] = [
  'observation',
  'injury',
  'illness',
  'bad_molt',
  'recovered',
  'escape',
  'rehoused',
  'vet_visit',
  'death',
]

/**
 * Severity is only meaningful for injury and illness. Offering it on an
 * observation would invite a judgment the keeper never made.
 */
export function eventHasSeverity(t: AnimalEventType): boolean {
  return t === 'injury' || t === 'illness'
}

export async function listInvertEvents(
  token: string,
  id: string,
): Promise<AnimalEvent[]> {
  const res = await fetch(`${API_URL}/api/v1/inverts/${id}/events`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to load events')
  return res.json()
}

export async function createInvertEvent(
  token: string,
  id: string,
  payload: {
    event_type: AnimalEventType
    occurred_at?: string | null
    severity?: AnimalEventSeverity | null
    notes?: string | null
  },
): Promise<AnimalEvent> {
  const res = await fetch(`${API_URL}/api/v1/inverts/${id}/events`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Could not save event')
  return res.json()
}

/** Parent-agnostic — resolves ownership through whichever parent the row has. */
export async function deleteAnimalEvent(
  token: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/animal-events/${eventId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 204) throw new Error('Could not delete')
}

/**
 * "4 years, 2 months" — how long the animal was in the keeper's care.
 *
 * Mirrors tenureLabel in apps/mobile/src/lib/lifecycle-copy.ts.
 *
 * Returns null when we can't compute it honestly. Deliberately does NOT fall
 * back to created_at: when the RECORD was made isn't when the animal arrived,
 * and "2 months" on a spider someone imported after eight years would be a
 * quiet lie on what amounts to a memorial.
 *
 * Show it flatly. It turns maudlin the moment it's decorated — no icon, no
 * larger type than the row around it.
 */
export function tenureLabel(
  dateAcquired: string | null | undefined,
  diedAt: string | null | undefined,
): string | null {
  if (!dateAcquired || !diedAt) return null
  const from = new Date(`${dateAcquired.slice(0, 10)}T12:00:00`)
  const to = new Date(`${diedAt.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  if (to < from) return null

  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) months = 0

  const years = Math.floor(months / 12)
  const rem = months % 12
  // A sling that died in its first weeks shouldn't get a zero.
  if (years === 0 && rem === 0) return 'less than a month'

  const parts: string[] = []
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`)
  if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`)
  return parts.join(', ')
}
