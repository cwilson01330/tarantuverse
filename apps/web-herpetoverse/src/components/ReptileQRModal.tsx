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

/** Tiny HTML-escape — only used for label text inserted into the print
 *  popup's <title>. Animal names that contain `<` or `&` would otherwise
 *  produce a malformed document title or, worst case, an injection
 *  vector into the popup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  /** Optional — italicized under the name on the printed label. */
  scientificName?: string | null
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
    const node = labelPreviewRef.current
    if (!node) return
    // Read the preview's exact outerHTML so the printed label matches
    // what the keeper saw in the modal — including the rendered QR SVG.
    // Stripping any zoom transform that exists for screen-size preview
    // would go here if we add a "fit-to-preview" scale; the v1 preview
    // is already at 1:1 print size.
    const labelHtml = node.outerHTML
    const win = window.open(
      '',
      '_blank',
      'width=420,height=320,scrollbars=no,toolbar=no,menubar=no',
    )
    if (!win) {
      // Pop-up blocked — fall back to the parent window's print dialog
      // with a print stylesheet that hides everything else. Less robust
      // (relies on the keeper's print settings) but always available.
      window.print()
      return
    }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Reptile label — ${escapeHtml(animalName ?? 'Reptile')}</title>
  <style>
    @page { size: auto; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
    }
    /* The label itself is sized inline — body padding gives the
       printer a small margin so adhesive labels don't crop content
       at the edge. */
  </style>
</head>
<body>${labelHtml}</body>
</html>`)
    win.document.close()
    // Wait for the document to layout before triggering print —
    // some browsers will print before the SVG renders otherwise.
    win.onload = () => {
      win.focus()
      win.print()
      // Don't auto-close: let the user use the browser's own
      // print preview UI (cancel, pick destination, save as PDF…).
      // Closing the window prematurely cancels the dialog on some
      // browsers (Chrome/macOS).
    }
  }

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
          <div className="px-5 py-6 flex flex-col items-center gap-4">
            {/* Label preview — rendered at print size (3" × 1.5") so the
                keeper sees exactly what comes out of the printer.
                Background pinned to white so it stays readable on dark
                modal styles AND prints cleanly. The DOM node is what
                handlePrint reads via outerHTML. */}
            <div
              ref={labelPreviewRef}
              style={{
                width: '288px', // 3 inches at 96 DPI
                height: '144px', // 1.5 inches at 96 DPI
                background: '#ffffff',
                color: '#111',
                border: '1.5px solid #2a2a2a',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <QRCodeSVG
                  value={publicProfileUrl || publicProfilePath}
                  size={120}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: '#111',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {animalName || (taxon === 'snake' ? 'Snake' : 'Lizard')}
                </div>
                {scientificName && (
                  <div
                    style={{
                      fontSize: '11px',
                      fontStyle: 'italic',
                      color: '#555',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {scientificName}
                  </div>
                )}
                <div
                  style={{
                    fontSize: '10px',
                    color: '#888',
                    marginTop: '4px',
                    lineHeight: 1.2,
                  }}
                >
                  Scan for care info
                </div>
                <div
                  style={{
                    fontSize: '9px',
                    color: '#10b981',
                    marginTop: '2px',
                    fontWeight: 600,
                  }}
                >
                  herpetoverse
                </div>
              </div>
            </div>

            {/* Hint copy */}
            <p className="text-xs text-neutral-400 text-center leading-relaxed max-w-xs">
              When you scan this you&rsquo;ll jump to quick log buttons.
              When a friend scans it, they see a read-only profile with
              the species, photos, and care basics — no login.
            </p>

            <p
              className="text-[11px] font-mono text-neutral-500 text-center break-all select-all"
              aria-label="Public profile URL"
            >
              {publicProfileUrl}
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
