/**
 * Printable care sheets for a sitter (API: routers/care_sheets.py).
 *
 * The keeper picks animals → POST /care-sheets/ → a 24-hour link to the
 * public print page /care-sheet/[token]. The token is the access, so the page
 * is noindex, disallowed in robots.ts and kept out of analytics.
 *
 * Herpetoverse web keeps its own copy of this file
 * (apps/web-herpetoverse/src/lib/care-sheet.ts) — keep the types in step.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type CareSheetApp = 'tarantuverse' | 'herpetoverse'
export type FeedState = 'feed' | 'not_due' | 'dont_feed' | 'ask' | 'graze'

/** One row of GET /sitter-passes/candidates — the keeper's active animals. */
export interface CareSheetCandidate {
  kind: 'invert' | 'colony' | 'animal'
  id: string
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string | null
  location?: string | null
}

export interface CareSheetLine {
  text: string
  source: string
}

export interface CareSheetSection {
  key: 'safety' | 'feeding' | 'water' | 'heat' | 'note'
  title: string
  lines: CareSheetLine[]
}

export interface CareSheetAnimal {
  kind: 'invert' | 'colony' | 'animal'
  name: string | null
  common_name: string | null
  scientific_name: string | null
  taxon: string | null
  photo_url: string | null
  sex: 'male' | 'female' | null
  life_stage: string | null
  current_instar: number | null
  location: string | null
  substrate: string | null
  last_meal: string | null
  feeding: {
    state: FeedState
    headline: string
    last_fed_on: string | null
    days_since_fed: number | null
    interval_days: number | null
    next_due_on: string | null
  } | null
  sections: CareSheetSection[]
}

export interface CareSheet {
  app: CareSheetApp
  keeper_name: string
  note: string | null
  generated_on: string
  expires_at: string | null
  units: 'imperial' | 'metric'
  house_rules: string[]
  routine: {
    summary: { feed_today: number; dont_feed: number; not_due: number; check: number; total: number }
    steps: CareSheetLine[]
    emergency: CareSheetLine[]
    contact_line: string | null
    vet_contact: string | null
  }
  animals: CareSheetAnimal[]
  skipped: number
}

export type CareSheetLoad =
  | { status: 'ok'; sheet: CareSheet }
  | { status: 'expired' | 'missing' | 'unavailable' }

export const CARE_SHEET_NOTE_MAX = 500
export const CARE_SHEET_MAX_ANIMALS = 60

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (typeof body?.detail?.message === 'string') return body.detail.message
  } catch {
    /* not JSON */
  }
  return fallback
}

export async function listCareSheetCandidates(token: string, app: CareSheetApp): Promise<CareSheetCandidate[]> {
  const res = await fetch(`${API_URL}/api/v1/sitter-passes/candidates?app=${app}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not load your animals'))
  return res.json()
}

export async function createCareSheet(
  token: string,
  body: {
    app: CareSheetApp
    animal_ids: string[]
    colony_ids?: string[]
    note?: string | null
    units?: 'imperial' | 'metric'
  },
): Promise<{ url: string; expires_at: string }> {
  const res = await fetch(`${API_URL}/api/v1/care-sheets/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, tz_offset_minutes: new Date().getTimezoneOffset() }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Could not make the care sheet'))
  return res.json()
}

/** Server-side read for the print page. Never cached. */
export async function loadCareSheet(token: string): Promise<CareSheetLoad> {
  try {
    const r = await fetch(`${API_URL}/api/v1/care-sheets/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (r.status === 410) return { status: 'expired' }
    if (r.status === 404 || r.status === 422) return { status: 'missing' }
    if (!r.ok) return { status: 'unavailable' }
    return { status: 'ok', sheet: (await r.json()) as CareSheet }
  } catch {
    return { status: 'unavailable' }
  }
}

/** "Tue 14 Oct" from an ISO date, independent of the server's timezone. */
export function sheetDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** The big feeding line, worded for paper: a printed sheet is read on later
 *  days too, so it states dates rather than "today". */
export function feedingLine(a: CareSheetAnimal, generatedOn: string): { label: string; detail: string | null; tone: FeedState } {
  const f = a.feeding
  if (!f) return { label: 'No feeding information', detail: null, tone: 'ask' }
  const last = sheetDay(f.last_fed_on)
  const lastText = last ? `Last fed ${last}${a.last_meal ? ` (${a.last_meal})` : ''}` : null
  if (f.state === 'dont_feed') {
    return { label: 'DO NOT FEED', detail: f.headline.replace(/^Don't feed\s*[—-]\s*/i, ''), tone: 'dont_feed' }
  }
  if (f.state === 'graze') {
    return { label: 'Keep food available', detail: 'No feeding schedule — see Feeding below.', tone: 'graze' }
  }
  if (f.state === 'ask') {
    return { label: lastText ?? 'No feeding on record', detail: f.headline, tone: 'ask' }
  }
  const next = sheetDay(f.next_due_on)
  const every = f.interval_days ? ` · every ${f.interval_days} days` : ''
  const due = f.state === 'feed' ? ` — due as of ${sheetDay(generatedOn) ?? 'today'}` : ''
  return {
    label: lastText ?? 'Not fed yet',
    detail: next ? `Next feeding ${next}${due}${every}` : null,
    tone: f.state,
  }
}

/**
 * Opens the sheet in a new tab. The tab is opened synchronously in the click
 * handler (`placeholder`) so pop-up blockers allow it, then pointed at the URL
 * once the API answers. Returns false when the browser blocked it anyway —
 * the caller then shows the link to click.
 */
export function openPlaceholderTab(): Window | null {
  try {
    const w = window.open('', '_blank')
    if (w) {
      w.document.title = 'Preparing care sheet…'
      w.document.body.innerText = 'Preparing your care sheet…'
    }
    return w
  } catch {
    return null
  }
}
