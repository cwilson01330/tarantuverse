/**
 * Co-keepers client (PRD-shared-keeping rung 3). Backend: /api/v1/collection-members.
 *
 * The server is the only authority on access — every role check here is a UI
 * hint so people don't see buttons that would fail. Removing a button never
 * grants or withholds anything; the API does that on every request.
 *
 * Mirrors apps/web/src/lib/coKeepers.ts and the mobile libs.
 */
import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
export const MEMBER_APP = 'herpetoverse' as const

export type Role = 'viewer' | 'logger' | 'keeper'
export type CollectionRole = Role | 'owner'

export interface Person { id: string; name: string; username: string | null; avatar_url: string | null }
export interface Member {
  id: string
  app: string
  role: Role
  status: 'pending' | 'active'
  invited_email: string | null
  member: Person | null
  created_at: string | null
  accepted_at: string | null
  invite_expires_at: string | null
}
export interface InviteCreated extends Member { accept_url: string; email_sent: boolean; invite_code: string }
export interface SharedCollection {
  membership_id: string
  owner: Person
  app: string
  role: Role
  read_only: boolean
  accepted_at: string | null
}
export interface PendingInvite { id: string; owner: Person; app: string; role: Role; invite_expires_at: string | null }
export interface SharedWithMe { collections: SharedCollection[]; invites: PendingInvite[]; email_verified: boolean }

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', logger: 'Logger', keeper: 'Keeper' }
export const ROLE_HELP: Record<Role, string> = {
  viewer: 'Sees the collection. Logs nothing.',
  logger: 'Logs feedings, weights, sheds and photos. Can change their own entries.',
  keeper: 'Everything a logger can, plus adding and editing animals.',
}

const RANK: Record<CollectionRole, number> = { viewer: 1, logger: 2, keeper: 3, owner: 4 }
export function can(role: CollectionRole | null | undefined, need: CollectionRole): boolean {
  return !!role && RANK[role] >= RANK[need]
}

export class CoKeeperApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail: unknown) {
    super(message)
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/collection-members${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const d = body?.detail
    const msg = typeof d === 'string' ? d : d?.message || (Array.isArray(d) ? d[0]?.msg : null) || 'Something went wrong.'
    throw new CoKeeperApiError(msg, res.status, d)
  }
  return body as T
}

export const coKeeperApi = {
  sharedWithMe: (t: string) => call<SharedWithMe>(t, '/shared-with-me'),
  members: (t: string) => call<Member[]>(t, `/?app=${MEMBER_APP}`),
  invite: (t: string, email: string, role: Role) =>
    call<InviteCreated>(t, '/', { method: 'POST', body: JSON.stringify({ app: MEMBER_APP, email, role }) }),
  resend: (t: string, id: string) => call<InviteCreated>(t, `/${id}/resend`, { method: 'POST' }),
  changeRole: (t: string, id: string, role: Role) =>
    call<Member>(t, `/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  remove: (t: string, id: string) => call<void>(t, `/${id}`, { method: 'DELETE' }),
  leave: (t: string, id: string) => call<void>(t, `/${id}/leave`, { method: 'POST' }),
  acceptToken: (t: string, token: string) =>
    call<SharedCollection>(t, '/accept', { method: 'POST', body: JSON.stringify({ token }) }),
  /** The code printed in the invite email, for inboxes whose filters block links. */
  acceptCode: (t: string, code: string) =>
    call<SharedCollection>(t, '/accept-code', { method: 'POST', body: JSON.stringify({ code }) }),
  acceptInvite: (t: string, id: string) => call<SharedCollection>(t, `/invites/${id}/accept`, { method: 'POST' }),
  declineInvite: (t: string, id: string) => call<void>(t, `/invites/${id}/decline`, { method: 'POST' }),
}

// ── role for an animal's owner, cached per page load ────────────────────────

let sharedCache: Promise<SharedWithMe | null> | null = null

export function loadSharedWithMe(token: string, fresh = false): Promise<SharedWithMe | null> {
  if (!sharedCache || fresh) {
    sharedCache = coKeeperApi.sharedWithMe(token).catch(() => null)
  }
  return sharedCache
}

/**
 * Your role in the collection that owns `ownerId`: 'owner' when it's yours,
 * your membership role when it's shared with you, null while loading or when
 * neither (the API would have 404'd the page anyway). Only ever used to hide
 * buttons — see the note at the top of this file.
 */
export function useCollectionRole(
  token: string | null | undefined,
  myId: string | null | undefined,
  ownerId: string | null | undefined,
): { role: CollectionRole | null; ownerName: string | null } {
  const [state, setState] = useState<{ role: CollectionRole | null; ownerName: string | null }>({ role: null, ownerName: null })
  useEffect(() => {
    if (!ownerId || !myId) return
    if (ownerId === myId) {
      setState({ role: 'owner', ownerName: null })
      return
    }
    if (!token) return
    let alive = true
    loadSharedWithMe(token).then((s) => {
      if (!alive) return
      const c = s?.collections.find((x) => x.owner.id === ownerId && x.app === MEMBER_APP)
      // A lapsed owner plan caps every co-keeper at viewer on the server (T12).
      setState({ role: c ? (c.read_only ? 'viewer' : c.role) : null, ownerName: c ? c.owner.name : null })
    })
    return () => { alive = false }
  }, [token, myId, ownerId])
  return state
}

/** "Logged by Alex" / "Logged by Sam (sitter link)" — or nothing for the owner's own entries. */
export function attribution(entry: { sitter_name?: string | null; logged_by_name?: string | null }): string | undefined {
  if (entry.sitter_name) return `Logged by ${entry.sitter_name} (sitter link)`
  if (entry.logged_by_name) return `Logged by ${entry.logged_by_name}`
  return undefined
}
