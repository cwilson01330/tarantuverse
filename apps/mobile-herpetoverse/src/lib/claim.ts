/**
 * Transfer claim helpers (Herpetoverse mobile).
 *
 * A seller shares https://herpetoverse.com/claim/{token}. With the app
 * installed, that universal / app link opens app/claim/[token].tsx, which
 * mirrors the HV web claim page (apps/web-herpetoverse/src/app/claim/[token]):
 * public preview → "Claim this animal" (auth required).
 *
 *   GET  /transfers/{token}        public preview, never carries sale_price
 *   POST /transfers/{token}/claim  auth; never 402s (claims are cap-exempt)
 *
 * apiClient's baseURL already includes /api/v1.
 *
 * Post-auth resume: a signed-out buyer taps "Sign in to claim", which parks the
 * claim route here. login/register call takePostAuthRoute() after a successful
 * sign-in and land back on the claim screen instead of the dashboard. In
 * memory only (one app session) and only ever a /claim/ path, so it can't be
 * used to redirect anywhere else.
 */
import { apiClient } from '../services/api';

export interface TransferPreview {
  status: string; // 'pending' | 'claimed' | 'cancelled' | 'expired'
  kind?: string | null; // 'animal' | 'invert' | 'colony'
  taxon: string;
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  sex?: string | null;
  life_stage?: string | null;
  photo_urls?: string[];
  breeder_handle?: string | null;
  note?: string | null;
  expires_at?: string | null;
}

export interface ClaimResult {
  id: string;
  kind?: string;
  taxon?: string;
  name?: string | null;
  scientific_name?: string | null;
}

export async function previewTransfer(token: string): Promise<TransferPreview> {
  const { data } = await apiClient.get<TransferPreview>(
    `/transfers/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function claimTransfer(token: string): Promise<ClaimResult> {
  const { data } = await apiClient.post<ClaimResult>(
    `/transfers/${encodeURIComponent(token)}/claim`,
    {},
  );
  return data;
}

let pendingRoute: string | null = null;

/** Remember a claim screen to return to after sign-in / sign-up. */
export function setPostAuthClaim(token: string): void {
  pendingRoute = `/claim/${encodeURIComponent(token)}`;
}

/** The parked claim route (consumed), or null. Only ever a /claim/ path. */
export function takePostAuthRoute(): string | null {
  const r = pendingRoute;
  pendingRoute = null;
  return r && r.startsWith('/claim/') ? r : null;
}
