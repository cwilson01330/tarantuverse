/**
 * Photo timeline grouping (2026-10-20). Pure: no React, no fetch, no units.
 *
 * FOUR COPIES, KEEP IN LOCKSTEP: apps/web/src/lib/photoTimeline.ts,
 * apps/mobile/src/lib/photo-timeline.ts (tested in
 * src/lib/__tests__/photo-timeline.test.ts), apps/web-herpetoverse/src/lib/photoTimeline.ts,
 * apps/mobile-herpetoverse/src/lib/photo-timeline.ts. Tarantuverse passes
 * molts, Herpetoverse passes sheds; the rule is the same.
 *
 * The rules:
 *  - A photo's date is `taken_at` when it has one, else `created_at` (the
 *    upload time). `photoDate()` says which one was used.
 *  - Molts/sheds are numbered 1..n in date order, counting every LOGGED
 *    molt — it's "the 3rd molt we have a record of", not an instar.
 *  - Days compare as local CALENDAR days. A photo on the same day as a molt
 *    belongs AFTER that molt (it's almost always of the fresh molt or the
 *    shed skin), so it reads "molt day".
 *  - Photo number 0 = before the first logged molt.
 *  - Markers sit between photos: `beforeIndex` = how many photos predate the
 *    molt. Molts with no photos between them share one marker.
 */

export interface TimelinePhoto {
  id: string
  taken_at?: string | null
  created_at?: string | null
}

export interface TimelineMolt {
  id: string
  /** molted_at / shed_at. */
  at: string
}

export type PhotoDateSource = 'taken_at' | 'created_at'

export interface PhotoTimelineEntry<P extends TimelinePhoto> {
  photo: P
  /** The date used for ordering and labels. */
  date: string
  dateSource: PhotoDateSource
  /** 0 = before the first logged molt; n = after the n-th logged molt. */
  moltNumber: number
  moltId: string | null
  moltAt: string | null
  /** Calendar days from that molt to the photo (0 = same day); null before the first molt. */
  daysAfterMolt: number | null
}

export interface PhotoTimelineMarker {
  /** Photos at indices < beforeIndex were taken before these molts. 0..entries.length. */
  beforeIndex: number
  molts: { id: string; number: number; at: string }[]
}

export interface PhotoTimeline<P extends TimelinePhoto> {
  entries: PhotoTimelineEntry<P>[]
  markers: PhotoTimelineMarker[]
  moltCount: number
}

const DAY_MS = 86_400_000

/** Parse an ISO date or datetime. Bare "YYYY-MM-DD" is a LOCAL day, not UTC midnight. */
function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/** Local midnight of the day, as epoch ms. */
function dayOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Calendar days from a to b (b later = positive). Rounded so DST days still count as one. */
export function calendarDaysBetween(a: string, b: string): number | null {
  const da = parse(a)
  const db = parse(b)
  if (!da || !db) return null
  return Math.round((dayOf(db) - dayOf(da)) / DAY_MS)
}

/** taken_at if present and valid, else created_at. Null when neither parses. */
export function photoDate(p: TimelinePhoto): { date: string; source: PhotoDateSource } | null {
  if (p.taken_at && parse(p.taken_at)) return { date: p.taken_at, source: 'taken_at' }
  if (p.created_at && parse(p.created_at)) return { date: p.created_at, source: 'created_at' }
  return null
}

export function groupPhotosByMolt<P extends TimelinePhoto>(photos: P[], molts: TimelineMolt[]): PhotoTimeline<P> {
  // Molts oldest first: by calendar day, then exact time, then id (stable).
  const sortedMolts = molts
    .map((m) => ({ m, d: parse(m.at) }))
    .filter((x): x is { m: TimelineMolt; d: Date } => x.d !== null)
    .sort((a, b) => dayOf(a.d) - dayOf(b.d) || a.d.getTime() - b.d.getTime() || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0))
  const moltDays = sortedMolts.map((x) => dayOf(x.d))

  // Photos oldest first. A photo with no usable date can't be placed, so it's
  // left out (the API always sends created_at, so this is defensive only).
  const dated = photos
    .map((photo) => ({ photo, pd: photoDate(photo) }))
    .filter((x): x is { photo: P; pd: { date: string; source: PhotoDateSource } } => x.pd !== null)
    .map((x) => ({ ...x, d: parse(x.pd.date) as Date }))
    .sort((a, b) => a.d.getTime() - b.d.getTime() || (a.photo.id < b.photo.id ? -1 : a.photo.id > b.photo.id ? 1 : 0))

  const entries: PhotoTimelineEntry<P>[] = dated.map(({ photo, pd, d }) => {
    const day = dayOf(d)
    // Last molt on or before the photo's day.
    let n = 0
    while (n < moltDays.length && moltDays[n] <= day) n++
    const molt = n > 0 ? sortedMolts[n - 1] : null
    return {
      photo,
      date: pd.date,
      dateSource: pd.source,
      moltNumber: n,
      moltId: molt ? molt.m.id : null,
      moltAt: molt ? molt.m.at : null,
      daysAfterMolt: molt ? Math.round((day - dayOf(molt.d)) / DAY_MS) : null,
    }
  })

  const entryDays = dated.map((x) => dayOf(x.d))
  const markers: PhotoTimelineMarker[] = []
  sortedMolts.forEach((x, i) => {
    const md = moltDays[i]
    let before = 0
    while (before < entryDays.length && entryDays[before] < md) before++
    const last = markers[markers.length - 1]
    const molt = { id: x.m.id, number: i + 1, at: x.m.at }
    if (last && last.beforeIndex === before) last.molts.push(molt)
    else markers.push({ beforeIndex: before, molts: [molt] })
  })

  return { entries, markers, moltCount: sortedMolts.length }
}

/** "After molt 3" / "Before first molt"; null when nothing is logged. */
export function periodLabel(moltNumber: number, moltCount: number, noun: 'molt' | 'shed'): string | null {
  if (moltCount === 0) return null
  return moltNumber === 0 ? `Before first ${noun}` : `After ${noun} ${moltNumber}`
}

/** "molt day" / "1 day after molt" / "12 days after molt". */
export function daysAfterLabel(days: number | null, noun: 'molt' | 'shed'): string | null {
  if (days == null) return null
  if (days <= 0) return `${noun} day`
  return `${days} ${days === 1 ? 'day' : 'days'} after ${noun}`
}

/** "Molts 2–3" style title for a marker; "Molt 2" for one. */
export function markerLabel(marker: PhotoTimelineMarker, noun: 'molt' | 'shed'): string {
  const cap = noun === 'molt' ? 'Molt' : 'Shed'
  const nums = marker.molts.map((m) => m.number)
  if (nums.length === 1) return `${cap} ${nums[0]}`
  return `${cap}s ${nums[0]}–${nums[nums.length - 1]}`
}

/**
 * Where a marker sits on a 0..1 track whose photo stops are i / (n - 1):
 * halfway between the last photo before it and the first one after,
 * clamped to the ends.
 */
export function markerFraction(beforeIndex: number, photoCount: number): number {
  if (photoCount <= 1) return 0
  if (beforeIndex <= 0) return 0
  if (beforeIndex >= photoCount) return 1
  return (beforeIndex - 0.5) / (photoCount - 1)
}

// ── Keeper-set photo dates (PATCH /photos/{id} { taken_at }) ─────────────────
// Uploads are dated by upload time (EXIF is stripped), so a batch of old photos
// lands out of order. Keepers fix it by setting the day each was taken — the
// timeline's order AND molt grouping both follow the date, which is why there
// is no free drag-to-reorder.

/** Earliest day a keeper may set (the API refuses anything before it). */
export const PHOTO_DATE_MIN = '1990-01-01'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local YYYY-MM-DD for a Date. */
export function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Local YYYY-MM-DD of an ISO date/datetime — where a date editor starts. Null if it doesn't parse. */
export function localDateInput(value: string | null | undefined): string | null {
  const d = parse(value)
  return d ? toLocalDateInput(d) : null
}

/** A real local calendar day from YYYY-MM-DD, or null ("2026-02-31" is null, not March 3). */
function parseDayStrict(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3])
  const d = new Date(y, mo, day, 12, 0, 0)
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null
  return d
}

/**
 * Why a keeper-entered day can't be saved, or null when it's fine. Mirrors the
 * API: a real date, not before 1990, not after today (local).
 */
export function photoDateError(ymd: string, today: Date = new Date()): string | null {
  const d = parseDayStrict(ymd)
  if (!d) return 'Enter a date like 2025-06-14.'
  if (toLocalDateInput(d) < PHOTO_DATE_MIN) return "Photo date can't be before 1990."
  if (toLocalDateInput(d) > toLocalDateInput(today)) return "Photo date can't be in the future."
  return null
}

/**
 * The taken_at to send for a keeper-chosen day: LOCAL NOON as an ISO string,
 * so the calendar day survives any time zone. Null for an invalid day.
 */
export function takenAtFromLocalDate(ymd: string): string | null {
  const d = parseDayStrict(ymd)
  return d ? d.toISOString() : null
}
