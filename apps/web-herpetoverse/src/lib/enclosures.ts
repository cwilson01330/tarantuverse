/**
 * Data layer for enclosure picker helpers used by the Herpetoverse web app.
 *
 * The enclosures table lives on the tarantula-side API and is tagged with a
 * lightweight `purpose` column ('tarantula' | 'feeder' | null). For v1 we
 * treat the "tarantula" + null rows as generic solo-animal enclosures and
 * reuse them for reptiles — no schema extension was needed to ship the
 * picker. The listing endpoint already supports `?purpose=tarantula` which
 * includes NULL rows server-side.
 *
 * Future: when the enclosure model grows a proper taxon tag for reptiles,
 * flip the filter here and drop this compatibility note.
 */
'use client'

import { apiFetch } from './apiClient'

// ---------------------------------------------------------------------------
// Types — mirror EnclosureListResponse on the backend
// ---------------------------------------------------------------------------

export type EnclosurePurpose = 'tarantula' | 'feeder'

export interface EnclosureSummary {
  id: string
  name: string
  is_communal: boolean
  population_count: number | null
  purpose: EnclosurePurpose | null
  species_name: string | null
  inhabitant_count: number
  days_since_last_feeding: number | null
  photo_url: string | null
  enclosure_type: string | null
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * List the current user's enclosures, optionally filtered by purpose.
 *
 *   - `purpose === 'tarantula'` (default): returns tarantula + NULL-purpose
 *     rows. This is what the reptile picker wants — solo-animal enclosures
 *     without feeder colonies mixed in.
 *   - `purpose === 'feeder'`: feeder-only rows.
 *   - `purpose === 'all'` or undefined: every row the user owns.
 */
export function listEnclosures(
  purpose: 'tarantula' | 'feeder' | 'all' = 'tarantula',
): Promise<EnclosureSummary[]> {
  const qs = new URLSearchParams({ purpose }).toString()
  return apiFetch<EnclosureSummary[]>(`/api/v1/enclosures/?${qs}`)
}
