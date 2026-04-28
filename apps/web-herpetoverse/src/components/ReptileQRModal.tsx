'use client'

/**
 * ReptileQRModal — generates a 20-minute photo-upload session and
 * renders a scannable QR code for a snake or lizard.
 *
 * Slim port of Tarantuverse's QRModal. v1 omits the printable enclosure-
 * label feature — keepers asked first for the upload flow, label printing
 * can land in v1.x as a separate tab.
 *
 * Flow:
 *   1. On open, POST to /<taxon>/<id>/upload-session
 *   2. Render the returned URL as a QR code + show the URL with a copy
 *      button + a live countdown to expiry.
 *   3. Poll /photos/<taxon>/<id> every 5s and detect new uploads — fire
 *      the optional `onPhotoAdded` callback so the parent gallery can
 *      refresh.
 *   4. Once expired, gray out the QR and surface a "Generate new" CTA.
 *
 * Why poll instead of stream: a websocket adds infrastructure for a
 * feature that's expected to be used for ~20 minutes max, by one
 * keeper at a time. Polling at 5s costs a few hundred ms of network
 * for the average session and works through any reverse proxy.
 */

import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  onClose: () => void
  /** Fires when a photo is detected as uploaded against the open session. */
  onPhotoAdded?: () => void
}

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
  onClose,
  onPhotoAdded,
}: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

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
              Hand off photo upload
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              Anyone with this QR can add photos to{' '}
              <span className="text-neutral-300">
                {animalName || 'this reptile'}
              </span>{' '}
              for the next 20 minutes — no login needed.
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

        {/* Body */}
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
      </div>
    </div>
  )
}
