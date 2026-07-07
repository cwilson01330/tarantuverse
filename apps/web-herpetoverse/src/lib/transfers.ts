/**
 * Data layer for animal transfers / provenance ("rehome").
 *
 * Ported from the Tarantuverse invert-transfer feature onto the shared
 * FastAPI backend's animal-aware path. A seller generates a one-time claim
 * link for an animal; the buyer claims it (auth required) and the record
 * moves into their collection, carrying a frozen provenance snapshot.
 *
 * Endpoints (all under /api/v1):
 *   - POST /animals/{id}/transfer          initiate (seller, auth)
 *   - GET  /transfers/{token}              preview (public — never leaks price)
 *   - POST /transfers/{token}/claim        claim (buyer, auth)
 *   - POST /transfers/{token}/cancel       cancel (seller, auth)
 *   - GET  /transfers/?role=sent|received  list (auth)
 *
 * The preview endpoint is public, so `previewTransfer` skips the auth header.
 * Everything else authenticates through apiFetch.
 */
'use client'

import { apiFetch, API_URL } from './apiClient'
import type { AnimalProvenance } from './animals'

export type { AnimalProvenance }

// ---------------------------------------------------------------------------
// Wire types — mirror the endpoint contract
// ---------------------------------------------------------------------------

export type TransferStatus = 'pending' | 'claimed' | 'cancelled' | 'expired'
export type TransferRole = 'sent' | 'received'

/** Public preview payload. NEVER includes sale_price. Reptile/amphibian
 *  transfers leave the invert-only fields (dam/sire/sac/molt) null — the
 *  claim page renders a plain provenance block for animals, no pedigree. */
export interface TransferPreview {
  status: TransferStatus
  taxon: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  sex: string | null
  life_stage: string | null
  species_id: string | null
  photo_urls: string[]
  breeder_handle: string | null
  note: string | null
  dam_scientific_name: string | null
  sire_scientific_name: string | null
  sac_laid_date: string | null
  molt_count_at_transfer: number | null
  last_molt_at_transfer: string | null
  expires_at: string | null
}

export interface InitiateTransferPayload {
  note?: string | null
  /** Private — for the seller's records only, never returned in preview. */
  sale_price?: number | null
  include_photos: boolean
  /** 1–90. */
  expires_in_days: number
}

export interface InitiateTransferResponse {
  token: string
  claim_url: string
  expires_at: string
}

export interface ClaimResponse {
  id: string
  taxon: string
  name: string | null
  scientific_name: string | null
}

export interface CancelResponse {
  status: 'cancelled'
}

/** One row in the sent/received transfers list. `sale_price` is only present
 *  on `sent` rows. For HV the invert_id fields are always null. */
export interface TransferListItem {
  id: string
  token: string
  status: TransferStatus
  role: TransferRole
  animal_id: string | null
  claimed_animal_id: string | null
  invert_id: string | null
  claimed_invert_id: string | null
  taxon: string
  display_name: string | null
  counterparty: string | null
  sale_price: number | null
  note: string | null
  created_at: string
  claimed_at: string | null
  expires_at: string | null
}

// AnimalProvenance is defined in lib/animals.ts (the Animal record carries it)
// and re-exported above so transfer consumers can import it from either place.

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Public — no auth header. Used by the claim page before sign-in. */
export function previewTransfer(token: string): Promise<TransferPreview> {
  return apiFetch<TransferPreview>(
    `/api/v1/transfers/${encodeURIComponent(token)}`,
    { auth: false },
  )
}

export function initiateTransfer(
  animalId: string,
  payload: InitiateTransferPayload,
): Promise<InitiateTransferResponse> {
  return apiFetch<InitiateTransferResponse>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/transfer`,
    { method: 'POST', json: payload },
  )
}

export function claimTransfer(
  token: string,
  newSignup?: boolean,
): Promise<ClaimResponse> {
  return apiFetch<ClaimResponse>(
    `/api/v1/transfers/${encodeURIComponent(token)}/claim`,
    {
      method: 'POST',
      // Only assert new_signup when we *know* it (the register resume path
      // set the marker). Otherwise omit the body and let the server's
      // account-age backstop decide.
      json: newSignup ? { new_signup: true } : {},
    },
  )
}

export function cancelTransfer(token: string): Promise<CancelResponse> {
  return apiFetch<CancelResponse>(
    `/api/v1/transfers/${encodeURIComponent(token)}/cancel`,
    { method: 'POST' },
  )
}

export function listTransfers(role: TransferRole): Promise<TransferListItem[]> {
  return apiFetch<TransferListItem[]>(
    `/api/v1/transfers/?role=${encodeURIComponent(role)}`,
  )
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Human status label for a chip. */
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  pending: 'Pending',
  claimed: 'Claimed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export { API_URL }
