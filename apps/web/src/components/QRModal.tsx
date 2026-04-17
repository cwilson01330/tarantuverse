'use client'

/**
 * QRModal — shown on a tarantula detail page.
 * Lets the owner:
 *  1. Generate a short-lived upload session and scan with their phone to add photos.
 *  2. View/print the permanent enclosure label (QR linking to /t/{id}).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getSession } from 'next-auth/react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'
const PREFS_STORAGE_KEY = 'qrmodal_label_prefs_v1'

/** Mirror the same two-source token lookup used in lib/api.ts */
async function getAuthToken(): Promise<string | null> {
  const local = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (local) return local
  const session = await getSession()
  return (session?.accessToken as string) ?? null
}

/** Escape HTML entities to prevent script injection via tarantula names or scientific names. */
function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface LabelMolt {
  id: string
  molted_at: string
  leg_span_after?: number
}

interface QRModalProps {
  tarantulaId: string
  tarantulaName: string
  scientificName: string | null
  sex: string | null
  molts?: LabelMolt[]
  onClose: () => void
  onPhotoAdded?: () => void
}

type Tab = 'upload' | 'label'
type UploadState = 'idle' | 'generating' | 'ready' | 'received' | 'expired'

interface LabelFont {
  id: string
  label: string
  stack: string
}

interface LabelTheme {
  id: string
  border: string
  accent: string   // sex badge, molt header, domain text
  swatch: string   // CSS color for the swatch button
}

const LABEL_FONTS: LabelFont[] = [
  { id: 'sans',    label: 'Clean',   stack: 'Arial, Helvetica, sans-serif' },
  { id: 'serif',   label: 'Classic', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono',    label: 'Mono',    stack: '"Courier New", Courier, monospace' },
  { id: 'rounded', label: 'Round',   stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
]

const LABEL_THEMES: LabelTheme[] = [
  { id: 'default', border: '#000',    accent: '#555',    swatch: '#111' },
  { id: 'purple',  border: '#7c3aed', accent: '#7c3aed', swatch: '#7c3aed' },
  { id: 'teal',    border: '#0d9488', accent: '#0d9488', swatch: '#0d9488' },
  { id: 'rose',    border: '#e11d48', accent: '#e11d48', swatch: '#e11d48' },
  { id: 'slate',   border: '#475569', accent: '#475569', swatch: '#475569' },
]

interface LabelSize {
  id: string
  label: string
  description: string
  width: string
  height: string
  qrSize: number
  /** Scale factor applied to the preview via CSS transform (cross-browser unlike CSS zoom) */
  previewScale: number
  fontSize: { name: number; sci: number; meta: number; molt: number }
}

const LABEL_SIZES: LabelSize[] = [
  {
    id: 'small',
    label: 'Small',
    description: 'Sling / dram cup',
    width: '2in',
    height: '1.25in',
    qrSize: 60,
    previewScale: 1.9,
    fontSize: { name: 9, sci: 7, meta: 6, molt: 5.5 },
  },
  {
    id: 'medium',
    label: 'Medium',
    description: 'Standard enclosure',
    width: '3in',
    height: '1.5in',
    qrSize: 80,
    previewScale: 1.3,
    fontSize: { name: 11, sci: 8, meta: 7, molt: 6.5 },
  },
  {
    id: 'large',
    label: 'Large',
    description: 'Display / XL tank',
    width: '4in',
    height: '2in',
    qrSize: 110,
    previewScale: 1.0,
    fontSize: { name: 14, sci: 10, meta: 8, molt: 7.5 },
  },
]

function formatMoltDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 7)
  }
}

const SEX_LABEL: Record<string, { symbol: string; text: string; color: string }> = {
  male:    { symbol: '♂', text: 'Male',    color: '#4a9eed' },
  female:  { symbol: '♀', text: 'Female',  color: '#d66ba0' },
  unknown: { symbol: '?', text: 'Unknown', color: '#999' },
}

// ---------------------------------------------------------------------------
// Pure label-HTML builder (used by print, can be unit-tested)
// ---------------------------------------------------------------------------

interface RenderLabelOptions {
  tarantulaName: string
  scientificName: string | null
  sex: string | null
  molts: LabelMolt[]
  size: LabelSize
  font: LabelFont
  theme: LabelTheme
  showSex: boolean
  showSciName: boolean
  showMolts: boolean
  showDomain: boolean
  profileUrl: string
  /** Pre-rendered inline QR SVG markup (from qrcode.react) */
  qrSvgMarkup: string
}

/** Build an HTML string for the print window. All user content is escaped. */
export function renderLabelHTML(opts: RenderLabelOptions): string {
  const {
    tarantulaName, scientificName, sex, molts,
    size, font, theme,
    showSex, showSciName, showMolts, showDomain,
    qrSvgMarkup,
  } = opts

  const sexInfo = sex && SEX_LABEL[sex] ? SEX_LABEL[sex] : null
  const recentMolts = [...molts]
    .sort((a, b) => new Date(b.molted_at).getTime() - new Date(a.molted_at).getTime())
    .slice(0, 3)

  const moltsHtml = recentMolts
    .map((m, i) => {
      const date = escapeHtml(formatMoltDate(m.molted_at))
      const span = m.leg_span_after ? ` (${Number(m.leg_span_after)}")` : ''
      const sep = i < recentMolts.length - 1 ? ' · ' : ''
      return `${date}${escapeHtml(span)}${sep}`
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
          ${escapeHtml(tarantulaName)}
        </div>
        ${showSex && sexInfo ? `
          <div style="font-size: ${size.fontSize.sci}px; color: ${theme.accent}; font-weight: 600; line-height: 1.3; letter-spacing: 0.01em;">
            ${escapeHtml(sexInfo.symbol)} ${escapeHtml(sexInfo.text)}
          </div>
        ` : ''}
        ${showSciName && scientificName ? `
          <div style="font-size: ${size.fontSize.sci}px; font-style: italic; color: #555; line-height: 1.2;">
            ${escapeHtml(scientificName)}
          </div>
        ` : ''}
        ${showMolts && recentMolts.length > 0 ? `
          <div style="font-size: ${size.fontSize.molt}px; color: #777; margin-top: 2px; line-height: 1.3; border-top: 0.5px solid ${theme.border}22; padding-top: 2px;">
            <span style="font-weight: 600; color: ${theme.accent};">Molts: </span>${moltsHtml}
          </div>
        ` : ''}
        ${showDomain ? `
          <div style="font-size: ${size.fontSize.meta}px; color: ${theme.accent}; opacity: 0.6; margin-top: 2px;">
            tarantuverse.com
          </div>
        ` : ''}
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Persisted prefs
// ---------------------------------------------------------------------------

interface StoredPrefs {
  sizeId?: string
  fontId?: string
  themeId?: string
  showSex?: boolean
  showSciName?: boolean
  showMolts?: boolean
  showDomain?: boolean
}

function loadPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredPrefs) : {}
  } catch {
    return {}
  }
}

function savePrefs(prefs: StoredPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota errors
  }
}

export default function QRModal({
  tarantulaId,
  tarantulaName,
  scientificName,
  sex,
  molts = [],
  onClose,
  onPhotoAdded,
}: QRModalProps) {
  const [tab, setTab] = useState<Tab>('upload')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadToken, setUploadToken] = useState<string | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState('')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [labelSize, setLabelSize] = useState<LabelSize>(LABEL_SIZES[1])
  const [showMolts, setShowMolts] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)
  const [labelFont, setLabelFont] = useState<LabelFont>(LABEL_FONTS[0])
  const [labelTheme, setLabelTheme] = useState<LabelTheme>(LABEL_THEMES[0])
  // Field visibility toggles
  const [showSex, setShowSex] = useState(true)
  const [showSciName, setShowSciName] = useState(true)
  const [showDomain, setShowDomain] = useState(true)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://tarantuverse.com'}/t/${tarantulaId}`

  // Restore saved label preferences on mount
  useEffect(() => {
    const prefs = loadPrefs()
    if (prefs.sizeId) {
      const found = LABEL_SIZES.find((s) => s.id === prefs.sizeId)
      if (found) setLabelSize(found)
    }
    if (prefs.fontId) {
      const found = LABEL_FONTS.find((f) => f.id === prefs.fontId)
      if (found) setLabelFont(found)
    }
    if (prefs.themeId) {
      const found = LABEL_THEMES.find((t) => t.id === prefs.themeId)
      if (found) setLabelTheme(found)
    }
    if (typeof prefs.showSex === 'boolean') setShowSex(prefs.showSex)
    if (typeof prefs.showSciName === 'boolean') setShowSciName(prefs.showSciName)
    if (typeof prefs.showMolts === 'boolean') setShowMolts(prefs.showMolts)
    if (typeof prefs.showDomain === 'boolean') setShowDomain(prefs.showDomain)
    setPrefsLoaded(true)
  }, [])

  // Persist whenever a pref changes (only after initial restore completes)
  useEffect(() => {
    if (!prefsLoaded) return
    savePrefs({
      sizeId: labelSize.id,
      fontId: labelFont.id,
      themeId: labelTheme.id,
      showSex,
      showSciName,
      showMolts,
      showDomain,
    })
  }, [prefsLoaded, labelSize, labelFont, labelTheme, showSex, showSciName, showMolts, showDomain])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const generateSession = async () => {
    setUploadState('generating')
    setGenerateError(null)
    try {
      const token = await getAuthToken()
      const res = await fetch(`${API}/api/v1/tarantulas/${tarantulaId}/upload-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.detail || `Server error (${res.status})`)
      }
      const data = await res.json()
      setUploadToken(data.token)
      setUploadUrl(data.upload_url)
      const exp = new Date(data.expires_at)
      setUploadState('ready')

      timerRef.current = setInterval(() => {
        const secs = Math.floor((exp.getTime() - Date.now()) / 1000)
        if (secs <= 0) {
          setUploadState('expired')
          stopPolling()
        } else {
          const m = Math.floor(secs / 60)
          const s = secs % 60
          setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
        }
      }, 1000)

      let knownCount = photoCount
      pollRef.current = setInterval(async () => {
        try {
          const pollToken = await getAuthToken()
          const pr = await fetch(`${API}/api/v1/tarantulas/${tarantulaId}/photos`, {
            headers: { Authorization: `Bearer ${pollToken}` },
          })
          if (!pr.ok) return
          const photos = await pr.json()
          if (photos.length > knownCount) {
            knownCount = photos.length
            setPhotoCount(photos.length)
            setUploadState('received')
            stopPolling()
            onPhotoAdded?.()
          }
        } catch { /* ignore */ }
      }, 3000)
    } catch (err: unknown) {
      setUploadState('idle')
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate QR code. Please try again.')
    }
  }

  const handlePrint = () => {
    // Extract the QR SVG from the rendered preview so we don't re-render
    // qrcode.react outside React. Fall back to empty string if not available.
    const qrSvg = previewRef.current?.querySelector('svg')?.outerHTML ?? ''

    const labelHTML = renderLabelHTML({
      tarantulaName,
      scientificName,
      sex,
      molts,
      size: labelSize,
      font: labelFont,
      theme: labelTheme,
      showSex,
      showSciName,
      showMolts,
      showDomain,
      profileUrl,
      qrSvgMarkup: qrSvg,
    })

    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    const safeTitle = escapeHtml(tarantulaName)
    win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Tarantuverse Label — ${safeTitle}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: white; }
      @page { size: ${labelSize.width} ${labelSize.height}; margin: 0; }
    </style>
  </head>
  <body>${labelHTML}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const sexInfo = sex && SEX_LABEL[sex] ? SEX_LABEL[sex] : null
  const recentMolts = [...molts]
    .sort((a, b) => new Date(b.molted_at).getTime() - new Date(a.molted_at).getTime())
    .slice(0, 3)

  // Compute preview container size so transform:scale (which doesn't affect layout) still
  // reserves appropriate space around the scaled label. The previewScale applies to both
  // width and height, and a wrapper div with matching dimensions absorbs the transform.
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="QR Identity">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">QR Identity</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700" role="tablist">
          {[{ id: 'upload', label: '📸 Add Photo' }, { id: 'label', label: '🏷️ Print Label' }].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              role="tab"
              aria-selected={tab === t.id}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Upload tab ── */}
        {tab === 'upload' && (
          <div className="p-5 text-center">
            {uploadState === 'idle' && (
              <>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  Generate a QR code, scan it with your phone, and upload photos directly to{' '}
                  <strong>{tarantulaName}</strong>. No app or login required on the phone.
                </p>
                {generateError && (
                  <div
                    role="alert"
                    className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs text-left"
                  >
                    ⚠️ {generateError}
                  </div>
                )}
                <button
                  onClick={generateSession}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Generate Upload QR
                </button>
              </>
            )}

            {uploadState === 'generating' && (
              <div className="py-8" role="status" aria-live="polite">
                <div className="text-3xl mb-3 animate-pulse" aria-hidden="true">⏳</div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Generating QR code…</p>
              </div>
            )}

            {(uploadState === 'ready' || uploadState === 'received') && uploadUrl && (
              <>
                <div className="flex justify-center mb-3">
                  <div className="p-3 bg-white rounded-xl border-2 border-purple-100 dark:border-purple-900 shadow-sm">
                    <QRCodeSVG value={uploadUrl} size={180} level="M" />
                  </div>
                </div>
                {uploadState === 'received' ? (
                  <div className="mb-3" role="status" aria-live="polite">
                    <p className="text-green-600 font-semibold text-sm">✅ Photo received!</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">The gallery has been updated.</p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">Scan with your phone camera</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                      Waiting for photo… expires in{' '}
                      <span className="font-mono text-purple-500">{timeLeft}</span>
                    </p>
                  </div>
                )}
                <button onClick={generateSession} className="text-purple-600 text-sm hover:underline">
                  Generate new QR
                </button>
              </>
            )}

            {uploadState === 'expired' && (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4" role="status">QR code expired.</p>
                <button
                  onClick={() => { setUploadState('idle'); setUploadToken(null); setUploadUrl(null) }}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Generate New QR
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Label tab ── */}
        {tab === 'label' && (
          <div className="p-5 space-y-3">

            {/* Size picker */}
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Size</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Label size">
                {LABEL_SIZES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setLabelSize(s)}
                    role="radio"
                    aria-checked={labelSize.id === s.id}
                    aria-label={`${s.label} label: ${s.description}`}
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                      labelSize.id === s.id
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="font-semibold">{s.label}</div>
                    <div className="opacity-60">{s.description}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Font picker */}
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Font</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Label font">
                {LABEL_FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setLabelFont(f)}
                    role="radio"
                    aria-checked={labelFont.id === f.id}
                    aria-label={`${f.label} font`}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      labelFont.id === f.id
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                    style={{ fontFamily: f.stack }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Color picker */}
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Color</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Label color theme">
                {LABEL_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setLabelTheme(t)}
                    role="radio"
                    aria-checked={labelTheme.id === t.id}
                    aria-label={`${t.id} color theme`}
                    title={t.id}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      labelTheme.id === t.id ? 'ring-2 ring-offset-2 ring-purple-500 scale-110' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={{ backgroundColor: t.swatch }}
                  />
                ))}
              </div>
            </fieldset>

            {/* Field toggles */}
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Fields</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Sex',             checked: showSex,     set: setShowSex,     show: !!sex },
                  { label: 'Scientific name', checked: showSciName, set: setShowSciName, show: !!scientificName },
                  { label: `Molts (last ${Math.min(recentMolts.length, 3)})`, checked: showMolts, set: setShowMolts, show: molts.length > 0 },
                  { label: 'Domain',          checked: showDomain,  set: setShowDomain,  show: true },
                ].filter(f => f.show).map((f) => (
                  <label key={f.label} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={f.checked}
                      onChange={(e) => f.set(e.target.checked)}
                      className="w-3.5 h-3.5 accent-purple-600"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{f.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Label preview — uses transform:scale (cross-browser) instead of CSS zoom */}
            <div className="flex justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
              <div style={previewWrapperStyle} aria-label="Label preview">
                <div id="qr-label-print" ref={previewRef} style={previewLabelStyle}>
                  <QRCodeSVG value={profileUrl} size={labelSize.qrSize} level="M" fgColor={labelTheme.border} />

                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {/* Name */}
                    <div style={{ fontSize: labelSize.fontSize.name, fontWeight: 700, color: '#111', lineHeight: 1.2 }}>
                      {tarantulaName}
                    </div>

                    {/* Sex badge */}
                    {showSex && sexInfo && (
                      <div style={{
                        fontSize: labelSize.fontSize.sci,
                        color: labelTheme.accent,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        letterSpacing: '0.01em',
                      }}>
                        {sexInfo.symbol} {sexInfo.text}
                      </div>
                    )}

                    {/* Scientific name */}
                    {showSciName && scientificName && (
                      <div style={{ fontSize: labelSize.fontSize.sci, fontStyle: 'italic', color: '#555', lineHeight: 1.2 }}>
                        {scientificName}
                      </div>
                    )}

                    {/* Molt history */}
                    {showMolts && recentMolts.length > 0 && (
                      <div style={{
                        fontSize: labelSize.fontSize.molt,
                        color: '#777',
                        marginTop: 2,
                        lineHeight: 1.3,
                        borderTop: `0.5px solid ${labelTheme.border}22`,
                        paddingTop: 2,
                      }}>
                        <span style={{ fontWeight: 600, color: labelTheme.accent }}>Molts: </span>
                        {recentMolts.map((m, i) => (
                          <span key={m.id}>
                            {formatMoltDate(m.molted_at)}
                            {m.leg_span_after ? ` (${m.leg_span_after}")` : ''}
                            {i < recentMolts.length - 1 ? ' · ' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Domain */}
                    {showDomain && (
                      <div style={{ fontSize: labelSize.fontSize.meta, color: labelTheme.accent, opacity: 0.6, marginTop: 2 }}>
                        tarantuverse.com
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              QR links permanently to this spider&apos;s profile.
            </p>

            <button
              onClick={handlePrint}
              aria-label="Print label"
              className="w-full py-3 bg-gray-900 dark:bg-white hover:bg-gray-700 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl transition-colors"
            >
              🖨️ Print Label
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
