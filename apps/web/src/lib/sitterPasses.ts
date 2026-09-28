/**
 * Keeper-side client for sitter passes (PRD-shared-keeping).
 *
 * The raw link token comes back ONLY from create and rotate, is shown once,
 * and is never stored here or anywhere else on the client — to hand a link
 * out again, the keeper rotates (which retires the old one).
 */
import type { Payload } from '@/components/SitterPassView'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const PASS_APP = 'tarantuverse' as const
export const PASS_MAX_DAYS = 30

export type PassStatus = 'scheduled' | 'active' | 'expired' | 'revoked' | 'locked'

export interface PassSummary {
  id: string
  app: string
  label: string | null
  token_prefix: string
  status: PassStatus
  starts_at: string
  expires_at: string
  revoked_at: string | null
  animal_count: number
  open_count: number
  last_used_at: string | null
  created_at: string | null
}

export interface PassCreated extends PassSummary {
  token: string
  share_path: string
}

export interface Candidate {
  kind: 'invert' | 'colony' | 'animal'
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string | null
  photo_url: string | null
  sitter_note: string | null
}

export interface SitterGuide {
  routine_steps: string[]
  emergency_text: string | null
  contact_line: string | null
  vet_contact: string | null
  default_emergency: string[]
}

export class PassApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail: unknown) {
    super(message)
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/sitter-passes${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const d = body?.detail
    const msg = typeof d === 'string' ? d : d?.message || (Array.isArray(d) ? d[0]?.msg : null) || 'Something went wrong.'
    throw new PassApiError(msg, res.status, d)
  }
  return body as T
}

export const sitterApi = {
  list: (t: string) => call<PassSummary[]>(t, `/?app=${PASS_APP}`),
  candidates: (t: string) => call<Candidate[]>(t, `/candidates?app=${PASS_APP}`),
  create: (t: string, body: {
    animals: { kind: string; id: string }[]; expires_at: string; starts_at?: string; label?: string
  }) => call<PassCreated>(t, '/', { method: 'POST', body: JSON.stringify({ app: PASS_APP, ...body }) }),
  update: (t: string, id: string, body: { label?: string; expires_at?: string }) =>
    call<PassSummary>(t, `/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  rotate: (t: string, id: string) => call<PassCreated>(t, `/${id}/rotate`, { method: 'POST' }),
  revoke: (t: string, id: string) => call<PassSummary>(t, `/${id}/revoke`, { method: 'POST' }),
  preview: (t: string, id: string) =>
    call<Payload>(t, `/${id}/preview?tz_offset_minutes=${new Date().getTimezoneOffset()}`),
  setNote: (t: string, kind: string, id: string, sitter_note: string | null) =>
    call<{ sitter_note: string | null }>(t, '/notes', { method: 'PUT', body: JSON.stringify({ kind, id, sitter_note }) }),
  guide: (t: string) => call<SitterGuide>(t, `/guide?app=${PASS_APP}`),
  saveGuide: (t: string, g: Omit<SitterGuide, 'default_emergency'>) =>
    call<SitterGuide>(t, `/guide?app=${PASS_APP}`, { method: 'PUT', body: JSON.stringify(g) }),
}

/** The full link. The token lives in the fragment, which browsers never send to a server. */
export function shareUrl(created: PassCreated): string {
  return `${window.location.origin}${created.share_path}`
}

export const STATUS_LABEL: Record<PassStatus, string> = {
  scheduled: 'Not started',
  active: 'Active',
  expired: 'Ended',
  revoked: 'Cancelled',
  locked: 'Locked',
}
