/**
 * Keeper-side client for sitter passes (PRD-shared-keeping).
 *
 * The link token comes back ONLY from create and rotate, is shown once, and is
 * never stored on the device. To hand a link out again the keeper makes a new
 * one (rotate), which retires the old.
 *
 * Mirrors apps/mobile/src/lib/sitter-passes.ts (Tarantuverse) — keep the shapes in lockstep.
 */
import { apiClient } from '../services/api';
import { HV_WEB_ORIGIN } from './web-origin';

export const PASS_APP = 'herpetoverse' as const;
export const PASS_MAX_DAYS = 30;
/** Where links point. The token rides in the fragment, which is never sent to a server. */
// Herpetoverse links point at herpetoverse.com/sit (same page, HV-branded).
export const WEB_ORIGIN = HV_WEB_ORIGIN;

export type PassStatus = 'scheduled' | 'active' | 'expired' | 'revoked' | 'locked';
export type Source = 'safety' | 'keeper' | 'record' | 'species' | 'default';
export type FeedState = 'feed' | 'not_due' | 'dont_feed' | 'ask' | 'graze';

export interface PassSummary {
  id: string;
  app: string;
  label: string | null;
  token_prefix: string;
  status: PassStatus;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  animal_count: number;
  open_count: number;
  last_used_at: string | null;
  created_at: string | null;
}

export interface PassCreated extends PassSummary {
  token: string;
  share_path: string;
}

export interface Candidate {
  kind: 'invert' | 'colony' | 'animal';
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon: string | null;
  photo_url: string | null;
  sitter_note: string | null;
}

export interface SitterGuide {
  routine_steps: string[];
  emergency_text: string | null;
  contact_line: string | null;
  vet_contact: string | null;
  default_emergency: string[];
}

export interface CardLine { text: string; source: Source }
export interface CardSection { key: string; title: string; lines: CardLine[] }
export interface Card {
  kind: 'invert' | 'colony' | 'animal';
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon: string | null;
  photo_url: string | null;
  feeding: { state: FeedState; headline: string; last_fed_on: string | null; next_due_on: string | null } | null;
  sections: CardSection[];
}
export interface Payload {
  keeper_name: string;
  label: string | null;
  starts_at: string;
  expires_at: string;
  routine: {
    summary: { feed_today: number; dont_feed: number; not_due: number; check: number; total: number };
    steps: CardLine[];
    emergency: CardLine[];
    contact_line: string | null;
    vet_contact: string | null;
  };
  cards: Card[];
}

const BASE = '/sitter-passes';

export const sitterApi = {
  list: async () => (await apiClient.get<PassSummary[]>(`${BASE}/`, { params: { app: PASS_APP } })).data,
  candidates: async () =>
    (await apiClient.get<Candidate[]>(`${BASE}/candidates`, { params: { app: PASS_APP } })).data,
  create: async (body: {
    animals: { kind: string; id: string }[];
    expires_at: string;
    starts_at?: string;
    label?: string;
  }) => (await apiClient.post<PassCreated>(`${BASE}/`, { app: PASS_APP, ...body })).data,
  update: async (id: string, body: { label?: string; expires_at?: string }) =>
    (await apiClient.patch<PassSummary>(`${BASE}/${id}`, body)).data,
  rotate: async (id: string) => (await apiClient.post<PassCreated>(`${BASE}/${id}/rotate`)).data,
  revoke: async (id: string) => (await apiClient.post<PassSummary>(`${BASE}/${id}/revoke`)).data,
  preview: async (id: string) =>
    (await apiClient.get<Payload>(`${BASE}/${id}/preview`, {
      params: { tz_offset_minutes: new Date().getTimezoneOffset() },
    })).data,
  setNote: async (kind: string, id: string, sitter_note: string | null) =>
    (await apiClient.put<{ sitter_note: string | null }>(`${BASE}/notes`, { kind, id, sitter_note })).data,
  guide: async () => (await apiClient.get<SitterGuide>(`${BASE}/guide`, { params: { app: PASS_APP } })).data,
  saveGuide: async (g: Omit<SitterGuide, 'default_emergency'>) =>
    (await apiClient.put<SitterGuide>(`${BASE}/guide`, g, { params: { app: PASS_APP } })).data,
};

// One-shot, in-memory hand-off of a freshly made link between screens.
// NOT route params: those live in navigation state (and on web, the URL),
// which is exactly where a token shouldn't be. Taking it empties the slot.
let pendingReveal: PassCreated | null = null;
export function stashReveal(created: PassCreated): void {
  pendingReveal = created;
}
export function takeReveal(): PassCreated | null {
  const r = pendingReveal;
  pendingReveal = null;
  return r;
}

export function shareUrl(created: PassCreated): string {
  return `${WEB_ORIGIN}${created.share_path}`;
}

export const STATUS_LABEL: Record<PassStatus, string> = {
  scheduled: 'Not started',
  active: 'Active',
  expired: 'Ended',
  revoked: 'Cancelled',
  locked: 'Locked',
};

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Readable message from an axios error, including a 402's `detail.message`. */
export function passErrorMessage(e: any, fallback = 'Something went wrong.'): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d?.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
}
