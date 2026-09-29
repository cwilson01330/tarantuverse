/**
 * Co-keepers client (PRD-shared-keeping rung 3). Backend: /api/v1/collection-members.
 *
 * The server is the only authority on access — every role check here is a UI
 * hint so people don't see buttons that would fail. Removing a button never
 * grants or withholds anything; the API does that on every request.
 *
 * Mirrors apps/mobile/src/lib/co-keepers.ts and apps/web-herpetoverse — keep
 * the shapes in lockstep.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

export const MEMBER_APP = 'herpetoverse' as const;

export type Role = 'viewer' | 'logger' | 'keeper';
export type CollectionRole = Role | 'owner';

export interface Person { id: string; name: string; username: string | null; avatar_url: string | null }
export interface Member {
  id: string;
  app: string;
  role: Role;
  status: 'pending' | 'active';
  invited_email: string | null;
  member: Person | null;
  created_at: string | null;
  accepted_at: string | null;
  invite_expires_at: string | null;
}
export interface InviteCreated extends Member { accept_url: string; email_sent: boolean; invite_code: string }
export interface SharedCollection {
  membership_id: string;
  owner: Person;
  app: string;
  role: Role;
  read_only: boolean;
  accepted_at: string | null;
}
export interface PendingInvite { id: string; owner: Person; app: string; role: Role; invite_expires_at: string | null }
export interface SharedWithMe { collections: SharedCollection[]; invites: PendingInvite[]; email_verified: boolean }

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', logger: 'Logger', keeper: 'Keeper' };
export const ROLE_HELP: Record<Role, string> = {
  viewer: 'Sees the collection. Logs nothing.',
  logger: 'Logs feedings, weights, sheds and photos. Can change their own entries.',
  keeper: 'Everything a logger can, plus adding and editing animals.',
};
export const ROLES: Role[] = ['viewer', 'logger', 'keeper'];

const RANK: Record<CollectionRole, number> = { viewer: 1, logger: 2, keeper: 3, owner: 4 };
export function can(role: CollectionRole | null | undefined, need: CollectionRole): boolean {
  return !!role && RANK[role] >= RANK[need];
}

/** Loggers may change only their own entries; keepers and the owner, any. */
export function canChangeEntry(
  role: CollectionRole | null | undefined,
  myId: string | null | undefined,
  entry: { logged_by_user_id?: string | null },
): boolean {
  if (can(role, 'keeper')) return true;
  return can(role, 'logger') && !!myId && entry.logged_by_user_id === myId;
}

export function coKeeperErrorMessage(e: any, fallback = 'Something went wrong.'): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d?.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
}

const base = '/collection-members'; // apiClient's baseURL already ends in /api/v1

export const coKeeperApi = {
  sharedWithMe: async () => (await apiClient.get<SharedWithMe>(`${base}/shared-with-me`)).data,
  members: async () => (await apiClient.get<Member[]>(`${base}/`, { params: { app: MEMBER_APP } })).data,
  invite: async (email: string, role: Role) =>
    (await apiClient.post<InviteCreated>(`${base}/`, { app: MEMBER_APP, email, role })).data,
  resend: async (id: string) => (await apiClient.post<InviteCreated>(`${base}/${id}/resend`)).data,
  changeRole: async (id: string, role: Role) => (await apiClient.patch<Member>(`${base}/${id}`, { role })).data,
  remove: async (id: string) => { await apiClient.delete(`${base}/${id}`); },
  leave: async (id: string) => { await apiClient.post(`${base}/${id}/leave`); },
  /** The code printed in the invite email, for inboxes whose filters block links. */
  acceptCode: async (code: string) =>
    (await apiClient.post<SharedCollection>(`${base}/accept-code`, { code })).data,
  acceptInvite: async (id: string) => (await apiClient.post<SharedCollection>(`${base}/invites/${id}/accept`)).data,
  declineInvite: async (id: string) => { await apiClient.post(`${base}/invites/${id}/decline`); },
};

// ── role for an animal's owner, cached for the session ──────────────────────

// Keyed by the signed-in user so a second account on the same phone never
// reads the first one's roles out of the cache.
let sharedCache: { uid: string | null; p: Promise<SharedWithMe | null> } | null = null;

/** Cached; pass fresh=true after accepting / leaving, or on pull-to-refresh. */
export function loadSharedWithMe(fresh = false, uid: string | null = null): Promise<SharedWithMe | null> {
  if (!sharedCache || fresh || (uid && sharedCache.uid !== uid)) {
    sharedCache = { uid, p: coKeeperApi.sharedWithMe().catch(() => null) };
  }
  return sharedCache.p;
}

/** Drop the cache on sign-out so the next account never sees the last one's roles. */
export function clearSharedCache(): void {
  sharedCache = null;
}

/**
 * Your role in the collection owned by `ownerId`: 'owner' when it's yours,
 * your membership role when it's shared with you (capped at viewer while the
 * owner's plan has lapsed, as the server does), null while loading or when
 * neither. Only ever used to hide buttons — see the note at the top.
 */
export function useCollectionRole(
  myId: string | null | undefined,
  ownerId: string | null | undefined,
): { role: CollectionRole | null; ownerName: string | null } {
  const [state, setState] = useState<{ role: CollectionRole | null; ownerName: string | null }>({ role: null, ownerName: null });
  useEffect(() => {
    if (!ownerId || !myId) return;
    if (ownerId === myId) {
      setState({ role: 'owner', ownerName: null });
      return;
    }
    let alive = true;
    loadSharedWithMe(false, myId).then((s) => {
      if (!alive) return;
      const c = s?.collections.find((x) => x.owner.id === ownerId && x.app === MEMBER_APP);
      setState({ role: c ? (c.read_only ? 'viewer' : c.role) : null, ownerName: c ? c.owner.name : null });
    });
    return () => { alive = false; };
  }, [myId, ownerId]);
  return state;
}

/** "Logged by Alex" / "Logged by Sam (sitter link)" — or nothing for the owner's own entries. */
export function attribution(entry: { sitter_name?: string | null; logged_by_name?: string | null }): string | undefined {
  if (entry.sitter_name) return `Logged by ${entry.sitter_name} (sitter link)`;
  if (entry.logged_by_name) return `Logged by ${entry.logged_by_name}`;
  return undefined;
}
