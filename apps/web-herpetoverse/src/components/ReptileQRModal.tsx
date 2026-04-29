'use client'

/**
 * ReptileQRModal — two-tab modal for QR-based workflows on a reptile.
 *
 *   Upload tab: generates a 20-minute upload session token. The phone
 *               that scans the QR can post photos without auth — useful
 *               for handing capture off to a guest's device.
 *   Label tab:  renders a printable enclosure label. The label QR
 *               points at the reptile's permanent public profile
 *               (`/s/<id>` or `/l/<id>`) — when the owner scans it
 *               they jump to quick-action buttons (Log feeding / shed),
 *               when a visitor scans it they see a read-only profile.
 *
 * The upload session uses `position: fixed` polling at 5s — fine for a
 * 20-min session lifetime. The label flow is fully client-side: the
 * preview QR is rendered with qrcode.react, and Print opens a popup
 * window with the same SVG markup so the printer gets a vector-quality
 * label instead of a rasterized screenshot.
 */

import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Tiny HTML-escape — used for label text inserted into the print
 *  popup. Animal names that contain `<` or `&` would otherwise produce
 *  a malformed document or, worst case, an injection vector. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// Label customization — sizes, fonts, color themes
// ---------------------------------------------------------------------------

interface LabelSize {
  id: string
  label: string
  description: string
  width: string
  height: string
  qrSize: number
  /** Preview scale via CSS transform — keeps the on-screen label readable
   *  while the printed dimensions stay accurate. */
  previewScale: number
  fontSize: { name: number; sci: number; meta: number; tag: number }
}

const LABEL_SIZES: LabelSize[] = [
  {
    id: 'small',
    label: 'Small',
    description: 'Hatchling tub',
    width: '2in',
    height: '1.25in',
    qrSize: 60,
    previewScale: 1.9,
    fontSize: { name: 9, sci: 7, meta: 6, tag: 5.5 },
  },
  {
    id: 'medium',
    label: 'Medium',
    description: 'Standard enclosure',
    width: '3in',
    height: '1.5in',
    qrSize: 80,
    previewScale: 1.3,
    fontSize: { name: 11, sci: 8, meta: 7, tag: 6.5 },
  },
  {
    id: 'large',
    label: 'Large',
    description: 'Display / XL tank',
    width: '4in',
    height: '2in',
    qrSize: 110,
    previewScale: 1.0,
    fontSize: { name: 14, sci: 10, meta: 8, tag: 7.5 },
  },
]

interface LabelFont {
  id: string
  label: string
  stack: string
}

const LABEL_FONTS: LabelFont[] = [
  { id: 'sans', label: 'Clean', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Classic', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', stack: '"Courier New", Courier, monospace' },
  { id: 'rounded', label: 'Round', stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
]

interface LabelTheme {
  id: string
  border: string
  /** Sex badge / domain text / decorative accents. */
  accent: string
  /** Color of the swatch button in the picker. */
  swatch: string
}

const LABEL_THEMES: LabelTheme[] = [
  // Default keeps the label legible without competing with the
  // Herpetoverse green — useful when keepers print on colored stock.
  { id: 'default', border: '#000', accent: '#555', swatch: '#111' },
  // Herpetoverse emerald — primary brand color.
  { id: 'emerald', border: '#10b981', accent: '#10b981', swatch: '#10b981' },
  // Cool teal — pairs with the lime accent we use elsewhere on the site.
  { id: 'teal', border: '#0d9488', accent: '#0d9488', swatch: '#0d9488' },
  { id: 'rose', border: '#e11d48', accent: '#e11d48', swatch: '#e11d48' },
  { id: 'slate', border: '#475569', accent: '#475569', swatch: '#475569' },
]

const SEX_LABEL: Record<
  string,
  { symbol: string; text: string }
> = {
  male: { symbol: '♂', text: 'Male' },
  female: { symbol: '♀', text: 'Female' },
  unknown: { symbol: '?', text: 'Unknown' },
}

/**
 * Slim shed shape for the printed label. The detail clients already
 * track full ShedLog rows in state — we only need shed_at and an
 * optional post-shed length, so we accept this minimal projection
 * to keep the prop contract narrow.
 */
export interface LabelShed {
  id: string
  shed_at: string
  /** Length after shed, when measured. Stringified Decimal from API. */
  length_after_in?: string | null
}

/** "Apr 2026" — short month + year for tight label real estate. */
function formatShedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 7)
  }
}

// ---------------------------------------------------------------------------
// Pure label-HTML builder — the print window writes this verbatim. Kept
// outside the component so it's testable as a pure function later if we
// add unit tests for label rendering.
// ---------------------------------------------------------------------------

interface RenderLabelOptions {
  animalName: string
  scientificName: string | null
  commonName: string | null
  sex: string | null
  sheds: LabelShed[]
  size: LabelSize
  font: LabelFont
  theme: LabelTheme
  showSex: boolean
  showSciName: boolean
  showCommonName: boolean
  showSheds: boolean
  showDomain: boolean
  /** Pre-rendered inline QR SVG markup pulled from the live preview. */
  qrSvgMarkup: string
}

/** Sort sheds newest-first and take the most recent N — same shape used
 *  by the live preview and the print HTML so they don't drift. */
function topRecentSheds(sheds: LabelShed[], n = 3): LabelShed[] {
  return [...sheds]
    .sort(
      (a, b) =>
        new Date(b.shed_at).getTime() - new Date(a.shed_at).getTime(),
    )
    .slice(0, n)
}

function renderLabelHTML(opts: RenderLabelOptions): string {
  const {
    animalName,
    scientificName,
    commonName,
    sex,
    sheds,
    size,
    font,
    theme,
    showSex,
    showSciName,
    showCommonName,
    showSheds,
    showDomain,
    qrSvgMarkup,
  } = opts

  const sexInfo = sex && SEX_LABEL[sex] ? SEX_LABEL[sex] : null
  const recentSheds = topRecentSheds(sheds, 3)

  // "Apr 2026 (38\") · Mar 2026 · Feb 2026 (35\")" — length suffix only
  // when measured. Length-shedded snakes can be a couple feet long
  // so we use the inch suffix to keep the line skimmable.
  const shedsHtml = recentSheds
    .map((s, i) => {
      const date = escapeHtml(formatShedDate(s.shed_at))
      const lenRaw = s.length_after_in ? Number(s.length_after_in) : null
      const len =
        lenRaw != null && Number.isFinite(lenRaw)
          ? ` (${lenRaw.toString().replace(/\.0+$/, '')}")`
          : ''
      const sep = i < recentSheds.length - 1 ? ' · ' : ''
      return `${date}${escapeHtml(len)}${sep}`
    })
    .join('')

  return `
    <div style="
      width: ${size.width};
      height: ${size.height};
      border: 1.5px solid ${theme.border};
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 6px;
      gap: 6px;
      background: #fff;
      flex-shrink: 0;
      font-family: ${font.stack};
    ">
      ${qrSvgMarkup}
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: ${size.fontSize.name}px; font-weight: 700; color: #111; line-height: 1.2;">
          ${escapeHtml(animalName)}
        </div>
        ${
          showSex && sexInfo
            ? `
          <div style="font-size: ${size.fontSize.sci}px; color: ${theme.accent}; font-weight: 600; line-height: 1.3; letter-spacing: 0.01em;">
            ${escapeHtml(sexInfo.symbol)} ${escapeHtml(sexInfo.text)}
          </div>
        `
            : ''
        }
        ${
          showSciName && scientificName
            ? `
          <div style="font-size: ${size.fontSize.sci}px; font-style: italic; color: #555; line-height: 1.2;">
            ${escapeHtml(scientificName)}
          </div>
        `
            : ''
        }
        ${
          showCommonName && commonName
            ? `
          <div style="font-size: ${size.fontSize.meta}px; color: #777; line-height: 1.2;">
            ${escapeHtml(commonName)}
          </div>
        `
            : ''
        }
        ${
          showSheds && recentSheds.length > 0
            ? `
          <div style="font-size: ${size.fontSize.tag}px; color: #777; margin-top: 2px; line-height: 1.3; border-top: 0.5px solid ${theme.border}22; padding-top: 2px;">
            <span style="font-weight: 600; color: ${theme.accent};">Sheds: </span>${shedsHtml}
          </div>
        `
            : ''
        }
        ${
          showDomain
            ? `
          <div style="font-size: ${size.fontSize.tag}px; color: ${theme.accent}; opacity: 0.65; margin-top: 2px;">
            herpetoverse
          </div>
        `
            : ''
        }
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Pref persistence — keepers print labels rarely, but when they do it's
// usually a batch. Persisting the last-used size/font/theme/toggle set
// avoids re-picking on every print.
// ---------------------------------------------------------------------------

const PREFS_KEY = 'hv_qr_label_prefs'

interface StoredPrefs {
  sizeId?: string
  fontId?: string
  themeId?: string
  showSex?: boolean
  showSciName?: boolean
  showCommonName?: boolean
  showSheds?: boolean
  showDomain?: boolean
}

function loadPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as StoredPrefs
    return {}
  } catch {
    return {}
  }
}

function savePrefs(prefs: StoredPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage quota / privacy mode — silent. The pickers still work,
    // they just don't persist between sessions.
  }
}

import { ApiError } from '@/lib/apiClient'
import { listPhotos as listSnakePhotos } from '@/lib/snakes'
import { listPhotos as listLizardPhotos } from '@/lib/lizards'
import {
  type QRTaxon,
  type UploadSessionResponse,
  createUploadSession,
} from '@/lib/qr'

interface Props {
  taxon: QRTaxon
  animalId: string
  /** For copy in the modal header. Falls back to a generic if absent. */
  animalName: string | null
  /** Italicized line on the printed label when "Scientific name" is on. */
  scientificName?: string | null
  /** Common-name line on the printed label when "Common name" is on. */
  commonName?: string | null
  /** Sex code — drives the Sex toggle's badge on the printed label. */
  sex?: 'male' | 'female' | 'unknown' | null
  /** Shed history — most recent 3 are surfaced when "Sheds" toggle is on. */
  sheds?: LabelShed[]
  onClose: () => void
  /** Fires when a photo is detected as uploaded against the open session. */
  onPhotoAdded?: () => void
}

type Tab = 'upload' | 'label'

type State =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | {
      kind: 'ready'
      session: UploadSessionResponse
      timeLeft: string
      receivedCount: number
    }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

const POLL_INTERVAL_MS = 5_000

export default function ReptileQRModal({
  taxon,
  animalId,
  animalName,
  scientificName,
  commonName,
  sex,
  sheds = [],
  onClose,
  onPhotoAdded,
}: Props) {
  const [tab, setTab] = useState<Tab>('upload')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  // Ref into the label preview so we can read the rendered QR SVG and
  // pipe its outerHTML into the print window — guarantees the printer
  // gets vector-quality, not a screenshot.
  const labelPreviewRef = useRef<HTMLDivElement>(null)

  // Label picker state — initialized from defaults; restored from
  // localStorage in a useEffect below to dodge SSR mismatch warnings.
  const [labelSize, setLabelSize] = useState<LabelSize>(LABEL_SIZES[1])
  const [labelFont, setLabelFont] = useState<LabelFont>(LABEL_FONTS[0])
  const [labelTheme, setLabelTheme] = useState<LabelTheme>(LABEL_THEMES[0])
  const [showSex, setShowSex] = useState(true)
  const [showSciName, setShowSciName] = useState(true)
  const [showCommonName, setShowCommonName] = useState(false)
  // Sheds default-off so a snake/lizard with a long history doesn't
  // overflow the small label without the keeper opting in.
  const [showSheds, setShowSheds] = useState(false)
  const [showDomain, setShowDomain] = useState(true)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Restore the keeper's last-used label config on mount.
  useEffect(() => {
    const prefs = loadPrefs()
    if (prefs.sizeId) {
      const s = LABEL_SIZES.find((x) => x.id === prefs.sizeId)
      if (s) setLabelSize(s)
    }
    if (prefs.fontId) {
      const f = LABEL_FONTS.find((x) => x.id === prefs.fontId)
      if (f) setLabelFont(f)
    }
    if (prefs.themeId) {
      const t = LABEL_THEMES.find((x) => x.id === prefs.themeId)
      if (t) setLabelTheme(t)
    }
    if (typeof prefs.showSex === 'boolean') setShowSex(prefs.showSex)
    if (typeof prefs.showSciName === 'boolean') setShowSciName(prefs.showSciName)
    if (typeof prefs.showCommonName === 'boolean')
      setShowCommonName(prefs.showCommonName)
    if (typeof prefs.showSheds === 'boolean') setShowSheds(prefs.showSheds)
    if (typeof prefs.showDomain === 'boolean') setShowDomain(prefs.showDomain)
    setPrefsLoaded(true)
  }, [])

  // Persist whenever a pref changes, but only after the initial restore
  // completes — otherwise we'd overwrite the saved prefs with defaults
  // on first render.
  useEffect(() => {
    if (!prefsLoaded) return
    savePrefs({
      sizeId: labelSize.id,
      fontId: labelFont.id,
      themeId: labelTheme.id,
      showSex,
      showSciName,
      showCommonName,
      showSheds,
      showDomain,
    })
  }, [
    prefsLoaded,
    labelSize,
    labelFont,
    labelTheme,
    showSex,
    showSciName,
    showCommonName,
    showSheds,
    showDomain,
  ])

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAllTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Tear down on unmount.
  useEffect(() => () => stopAllTimers(), [stopAllTimers])

  // ---------------------------------------------------------------------------
  // Generate a new session — also called by the "Generate new" CTA when
  // the previous session expires.
  // ---------------------------------------------------------------------------
  const generate = useCallback(async () => {
    stopAllTimers()
    setState({ kind: 'generating' })
    setCopied(false)

    let session: UploadSessionResponse
    try {
      session = await createUploadSession(taxon, animalId)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Couldn't create an upload session."
      setState({ kind: 'error', message })
      return
    }

    const expiresAt = new Date(session.expires_at).getTime()
    let receivedCount = 0
    let knownPhotoCount: number | null = null

    // Helper to seed the "known photo count" from the current gallery so
    // we can detect *new* uploads rather than counting pre-existing ones.
    const seedKnownCount = async () => {
      try {
        const photos =
          taxon === 'snake'
            ? await listSnakePhotos(animalId)
            : await listLizardPhotos(animalId)
        knownPhotoCount = photos.length
      } catch {
        // If the seed fails we just count any future state as new — minor
        // false-positive risk if photos already exist, no correctness
        // problem.
        knownPhotoCount = 0
      }
    }
    seedKnownCount()

    // Tick the countdown every second.
    timerRef.current = setInterval(() => {
      const secs = Math.floor((expiresAt - Date.now()) / 1000)
      if (secs <= 0) {
        stopAllTimers()
        setState({ kind: 'expired' })
        return
      }
      const m = Math.floor(secs / 60)
      const s = secs % 60
      const timeLeft = `${m}:${s.toString().padStart(2, '0')}`
      setState((prev) =>
        prev.kind === 'ready' ? { ...prev, timeLeft } : prev,
      )
    }, 1000)

    // Poll for new photos every 5s.
    pollRef.current = setInterval(async () => {
      try {
        const photos =
          taxon === 'snake'
            ? await listSnakePhotos(animalId)
            : await listLizardPhotos(animalId)
        if (knownPhotoCount == null) {
          knownPhotoCount = photos.length
          return
        }
        if (photos.length > knownPhotoCount) {
          const delta = photos.length - knownPhotoCount
          knownPhotoCount = photos.length
          receivedCount += delta
          setState((prev) =>
            prev.kind === 'ready' ? { ...prev, receivedCount } : prev,
          )
          onPhotoAdded?.()
        }
      } catch {
        // Polling errors are silent — a transient failure shouldn't kill
        // the modal. The next tick retries.
      }
    }, POLL_INTERVAL_MS)

    setState({
      kind: 'ready',
      session,
      timeLeft: '20:00',
      receivedCount: 0,
    })
  }, [taxon, animalId, onPhotoAdded, stopAllTimers])

  // Auto-generate on mount.
  useEffect(() => {
    generate()
    // generate() is stable enough for our needs — we intentionally
    // re-run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Copy URL
  // ---------------------------------------------------------------------------
  async function handleCopy() {
    if (state.kind !== 'ready') return
    try {
      await navigator.clipboard.writeText(state.session.upload_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Some browsers reject clipboard writes outside a secure context;
      // fall back to a manual prompt-style flow if needed in the future.
    }
  }

  // ---------------------------------------------------------------------------
  // Close on Escape — also gives us an a11y handle for screen readers.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ---------------------------------------------------------------------------
  // Label tab — print-ready enclosure label
  // ---------------------------------------------------------------------------
  const publicProfilePath =
    taxon === 'snake' ? `/s/${animalId}` : `/l/${animalId}`
  const publicProfileUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${publicProfilePath}`

  function handlePrint() {
    // Pull the rendered SVG out of the live preview rather than
    // re-rendering qrcode.react outside React. This guarantees the
    // printed QR matches what the keeper just confirmed visually —
    // same value, same fg color, same size.
    const qrSvgMarkup =
      labelPreviewRef.current?.querySelector('svg')?.outerHTML ?? ''

    const labelHtml = renderLabelHTML({
      animalName: animalName ?? (taxon === 'snake' ? 'Snake' : 'Lizard'),
      scientificName: scientificName ?? null,
      commonName: commonName ?? null,
      sex: sex ?? null,
      sheds,
      size: labelSize,
      font: labelFont,
      theme: labelTheme,
      showSex,
      showSciName,
      showCommonName,
      showSheds,
      showDomain,
      qrSvgMarkup,
    })

    const win = window.open(
      '',
      '_blank',
      'width=600,height=400,scrollbars=no,toolbar=no,menubar=no',
    )
    if (!win) {
      // Pop-up blocked — fall back to parent-window print() with a
      // print stylesheet hiding everything except the preview. Less
      // robust than the popup path but always available.
      window.print()
      return
    }
    const safeTitle = escapeHtml(animalName ?? 'Reptile')
    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Herpetoverse Label — ${safeTitle}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #fff; }
      /* @page sized to the chosen label so the printer treats
         the whole sheet as one label, no extra margins. */
      @page { size: ${labelSize.width} ${labelSize.height}; margin: 0; }
    </style>
  </head>
  <body>${labelHtml}</body>
</html>`)
    win.document.close()
    win.focus()
    // Brief delay lets the SVG layout before the print dialog opens
    // — without this, Chrome/macOS sometimes prints a blank label.
    setTimeout(() => {
      win.print()
      win.close()
    }, 500)
  }

  // Wrapper preserves layout space the transform: scale() doesn't.
  const previewWrapperStyle: React.CSSProperties = {
    width: `calc(${labelSize.width} * ${labelSize.previewScale})`,
    height: `calc(${labelSize.height} * ${labelSize.previewScale})`,
    position: 'relative',
  }
  const previewLabelStyle: React.CSSProperties = {
    width: labelSize.width,
    height: labelSize.height,
    border: `1.5px solid ${labelTheme.border}`,
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    padding: '6px',
    gap: '6px',
    background: '#fff',
    flexShrink: 0,
    fontFamily: labelFont.stack,
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `scale(${labelSize.previewScale})`,
    transformOrigin: 'top left',
  }

  const sexInfo = sex && SEX_LABEL[sex] ? SEX_LABEL[sex] : null
  // Same recent slice the print HTML uses — kept in sync so the
  // preview shows exactly what comes out of the printer.
  const recentSheds = topRecentSheds(sheds, 3)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const ready = state.kind === 'ready' ? state : null
  const expired = state.kind === 'expired'
  const generating = state.kind === 'generating' || state.kind === 'idle'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="QR upload session"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white tracking-wide">
              QR for{' '}
              <span className="text-neutral-300">
                {animalName || 'this reptile'}
              </span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              {tab === 'upload'
                ? 'Hand a phone a 20-minute upload link — no login needed.'
                : 'Print a permanent enclosure label that scans to the public profile.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-200 text-xl leading-none -mt-1"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="QR mode"
          className="flex border-b border-neutral-800"
        >
          {(
            [
              { id: 'upload' as const, label: 'Upload session' },
              { id: 'label' as const, label: 'Enclosure label' },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? 'text-herp-lime border-b-2 border-herp-teal'
                  : 'text-neutral-500 hover:text-neutral-300 border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        {tab === 'upload' && (
        <>
        <div className="px-5 py-6 flex flex-col items-center gap-4">
          {state.kind === 'error' && (
            <div
              role="alert"
              className="w-full p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
            >
              {state.message}
            </div>
          )}

          {generating && (
            <div className="h-[230px] w-[230px] rounded-md border border-dashed border-neutral-800 flex items-center justify-center text-xs text-neutral-500">
              Creating session…
            </div>
          )}

          {ready && (
            <>
              <div
                className={`p-3 rounded-md bg-white shadow-md transition-opacity ${
                  expired ? 'opacity-30' : 'opacity-100'
                }`}
              >
                <QRCodeSVG
                  value={ready.session.upload_url}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* URL — selectable, monospace */}
              <p
                className="w-full text-[11px] font-mono text-neutral-400 text-center break-all leading-relaxed select-all"
                aria-label="Upload URL"
              >
                {ready.session.upload_url}
              </p>

              {/* Countdown + received counter */}
              <div className="flex items-center gap-3 text-xs">
                <span
                  className="text-neutral-500 tabular-nums"
                  aria-live="polite"
                >
                  ⏱ {ready.timeLeft}
                </span>
                {ready.receivedCount > 0 && (
                  <span className="text-herp-lime font-medium">
                    📸 {ready.receivedCount} uploaded
                  </span>
                )}
              </div>
            </>
          )}

          {expired && (
            <div className="text-center text-xs text-neutral-500">
              Session expired. Generate a new one to keep going.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-2">
          {ready && !expired && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 px-3 py-2 text-xs font-semibold rounded-md border border-neutral-800 text-neutral-200 hover:text-herp-lime hover:border-herp-teal/40 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy URL'}
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={state.kind === 'generating'}
            className={`flex-1 px-3 py-2 text-xs font-semibold rounded-md transition-colors disabled:opacity-60 ${
              expired
                ? 'herp-gradient-bg text-herp-dark hover:opacity-90'
                : 'border border-neutral-800 text-neutral-200 hover:text-herp-lime hover:border-herp-teal/40'
            }`}
          >
            {state.kind === 'generating'
              ? 'Generating…'
              : expired
                ? 'Generate new'
                : 'Regenerate'}
          </button>
        </div>
        </>
        )}

        {tab === 'label' && (
        <>
          <div className="px-5 py-5 space-y-4">
            {/* Size */}
            <fieldset>
              <legend className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                Size
              </legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Label size">
                {LABEL_SIZES.map((s) => {
                  const selected = labelSize.id === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLabelSize(s)}
                      className={`flex-1 py-2 px-2 rounded-md border text-xs transition-colors ${
                        selected
                          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
                          : 'border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-semibold">{s.label}</div>
                      <div className="opacity-70 text-[10px]">{s.description}</div>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {/* Font */}
            <fieldset>
              <legend className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                Font
              </legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Label font">
                {LABEL_FONTS.map((f) => {
                  const selected = labelFont.id === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLabelFont(f)}
                      style={{ fontFamily: f.stack }}
                      className={`flex-1 py-1.5 rounded-md border text-xs transition-colors ${
                        selected
                          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
                          : 'border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {/* Color */}
            <fieldset>
              <legend className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                Color
              </legend>
              <div className="flex gap-3 items-center" role="radiogroup" aria-label="Label color theme">
                {LABEL_THEMES.map((t) => {
                  const selected = labelTheme.id === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${t.id} color theme`}
                      title={t.id}
                      onClick={() => setLabelTheme(t)}
                      style={{ backgroundColor: t.swatch }}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        selected
                          ? 'border-herp-teal ring-2 ring-herp-teal/40 scale-110'
                          : 'border-neutral-700 hover:scale-105'
                      }`}
                    />
                  )
                })}
              </div>
            </fieldset>

            {/* Field toggles — only show options whose underlying data
                exists, so a snake without a sex doesn't see a useless
                "Sex" toggle. */}
            <fieldset>
              <legend className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                Fields
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {[
                  {
                    label: 'Sex',
                    checked: showSex,
                    set: setShowSex,
                    show: !!sex && sex !== 'unknown',
                  },
                  {
                    label: 'Scientific name',
                    checked: showSciName,
                    set: setShowSciName,
                    show: !!scientificName,
                  },
                  {
                    label: 'Common name',
                    checked: showCommonName,
                    set: setShowCommonName,
                    show: !!commonName,
                  },
                  {
                    // Show count when there are sheds so the keeper
                    // knows what fits — printed label always uses
                    // the most recent 3.
                    label:
                      recentSheds.length > 0
                        ? `Sheds (last ${recentSheds.length})`
                        : 'Sheds',
                    checked: showSheds,
                    set: setShowSheds,
                    show: sheds.length > 0,
                  },
                  {
                    label: 'Domain',
                    checked: showDomain,
                    set: setShowDomain,
                    show: true,
                  },
                ]
                  .filter((f) => f.show)
                  .map((f) => (
                    <label
                      key={f.label}
                      className="inline-flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={f.checked}
                        onChange={(e) => f.set(e.target.checked)}
                        className="w-3.5 h-3.5 accent-herp-teal cursor-pointer"
                      />
                      <span className="text-xs text-neutral-300">{f.label}</span>
                    </label>
                  ))}
              </div>
            </fieldset>

            {/* Live preview — scaled with CSS transform for cross-browser
                fidelity (CSS zoom is non-standard). The wrapper reserves
                visual space the transform doesn't, so the preview block
                doesn't collapse. */}
            <div className="flex justify-center overflow-hidden rounded-lg bg-neutral-900/40 p-3 border border-neutral-800">
              <div style={previewWrapperStyle} aria-label="Label preview">
                <div
                  ref={labelPreviewRef}
                  style={previewLabelStyle}
                >
                  <QRCodeSVG
                    value={publicProfileUrl || publicProfilePath}
                    size={labelSize.qrSize}
                    level="M"
                    fgColor={labelTheme.border}
                  />

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {/* Name */}
                    <div
                      style={{
                        fontSize: labelSize.fontSize.name,
                        fontWeight: 700,
                        color: '#111',
                        lineHeight: 1.2,
                      }}
                    >
                      {animalName ||
                        (taxon === 'snake' ? 'Snake' : 'Lizard')}
                    </div>

                    {showSex && sexInfo && (
                      <div
                        style={{
                          fontSize: labelSize.fontSize.sci,
                          color: labelTheme.accent,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          letterSpacing: '0.01em',
                        }}
                      >
                        {sexInfo.symbol} {sexInfo.text}
                      </div>
                    )}

                    {showSciName && scientificName && (
                      <div
                        style={{
                          fontSize: labelSize.fontSize.sci,
                          fontStyle: 'italic',
                          color: '#555',
                          lineHeight: 1.2,
                        }}
                      >
                        {scientificName}
                      </div>
                    )}

                    {showCommonName && commonName && (
                      <div
                        style={{
                          fontSize: labelSize.fontSize.meta,
                          color: '#777',
                          lineHeight: 1.2,
                        }}
                      >
                        {commonName}
                      </div>
                    )}

                    {showSheds && recentSheds.length > 0 && (
                      <div
                        style={{
                          fontSize: labelSize.fontSize.tag,
                          color: '#777',
                          marginTop: 2,
                          lineHeight: 1.3,
                          borderTop: `0.5px solid ${labelTheme.border}22`,
                          paddingTop: 2,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: labelTheme.accent,
                          }}
                        >
                          Sheds:{' '}
                        </span>
                        {recentSheds.map((s, i) => {
                          const lenRaw = s.length_after_in
                            ? Number(s.length_after_in)
                            : null
                          const len =
                            lenRaw != null && Number.isFinite(lenRaw)
                              ? ` (${lenRaw.toString().replace(/\.0+$/, '')}")`
                              : ''
                          return (
                            <span key={s.id}>
                              {formatShedDate(s.shed_at)}
                              {len}
                              {i < recentSheds.length - 1 ? ' · ' : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {showDomain && (
                      <div
                        style={{
                          fontSize: labelSize.fontSize.tag,
                          color: labelTheme.accent,
                          opacity: 0.65,
                          marginTop: 2,
                        }}
                      >
                        herpetoverse
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
              QR links permanently to{' '}
              {animalName ?? 'this reptile'}&rsquo;s public profile.
              Owner scans jump to quick-action buttons; visitors see a
              read-only card.
            </p>
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicProfileUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                } catch {
                  // ignore
                }
              }}
              className="flex-1 px-3 py-2 text-xs font-semibold rounded-md border border-neutral-800 text-neutral-200 hover:text-herp-lime hover:border-herp-teal/40 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy URL'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 px-3 py-2 text-xs font-semibold rounded-md herp-gradient-bg text-herp-dark hover:opacity-90 transition-opacity"
            >
              🖨 Print label
            </button>
          </div>
        </>
        )}
      </div>
    </div>
  )
}
