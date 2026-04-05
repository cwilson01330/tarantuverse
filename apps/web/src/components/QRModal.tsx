'use client'

/**
 * QRModal — shown on a tarantula detail page.
 * Lets the owner:
 *  1. Generate a short-lived upload session and scan with their phone to add photos.
 *  2. View/print the permanent enclosure label (QR linking to /t/{id}).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

interface QRModalProps {
  tarantulaId: string
  tarantulaName: string
  scientificName: string | null
  sex: string | null
  onClose: () => void
  onPhotoAdded?: () => void
}

type Tab = 'upload' | 'label'
type UploadState = 'idle' | 'generating' | 'ready' | 'received' | 'expired'

interface LabelSize {
  id: string
  label: string
  description: string
  width: string
  height: string
  qrSize: number
  fontSize: { name: number; sci: number; meta: number }
}

const LABEL_SIZES: LabelSize[] = [
  { id: 'small', label: 'Small', description: 'Sling / dram cup', width: '2in', height: '1.25in', qrSize: 60, fontSize: { name: 9, sci: 7, meta: 6 } },
  { id: 'medium', label: 'Medium', description: 'Standard enclosure', width: '3in', height: '1.5in', qrSize: 80, fontSize: { name: 11, sci: 8, meta: 7 } },
  { id: 'large', label: 'Large', description: 'Display / XL tank', width: '4in', height: '2in', qrSize: 110, fontSize: { name: 14, sci: 10, meta: 8 } },
]

export default function QRModal({
  tarantulaId,
  tarantulaName,
  scientificName,
  sex,
  onClose,
  onPhotoAdded,
}: QRModalProps) {
  const [tab, setTab] = useState<Tab>('upload')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadToken, setUploadToken] = useState<string | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [timeLeft, setTimeLeft] = useState('')
  const [labelSize, setLabelSize] = useState<LabelSize>(LABEL_SIZES[1])
  const [photoCount, setPhotoCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  const profileUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://tarantuverse.com'}/t/${tarantulaId}`

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const generateSession = async () => {
    setUploadState('generating')
    try {
      const res = await fetch(`${API}/api/v1/tarantulas/${tarantulaId}/upload-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUploadToken(data.token)
      setUploadUrl(data.upload_url)
      const exp = new Date(data.expires_at)
      setExpiresAt(exp)
      setUploadState('ready')

      // Countdown timer
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

      // Poll for new photos every 3s
      let knownCount = photoCount
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${API}/api/v1/tarantulas/${tarantulaId}/photos`, {
            headers: { Authorization: `Bearer ${token}` },
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

    } catch {
      setUploadState('idle')
    }
  }

  const handlePrint = () => {
    const printContent = document.getElementById('qr-label-print')
    if (!printContent) return
    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>Tarantuverse Label — ${tarantulaName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, Arial, sans-serif; background: white; }
            @page { size: ${labelSize.width} ${labelSize.height}; margin: 0; }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const sexSymbol = sex === 'male' ? '♂' : sex === 'female' ? '♀' : sex === 'unknown' ? '?' : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">QR Identity</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[{ id: 'upload', label: '📸 Add Photo' }, { id: 'label', label: '🏷️ Print Label' }].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
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

        {/* Upload tab */}
        {tab === 'upload' && (
          <div className="p-5 text-center">
            {uploadState === 'idle' && (
              <>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  Generate a QR code, scan it with your phone, and upload photos directly to <strong>{tarantulaName}</strong>.
                  No app or login required on the phone.
                </p>
                <button
                  onClick={generateSession}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Generate Upload QR
                </button>
              </>
            )}

            {uploadState === 'generating' && (
              <div className="py-8">
                <div className="text-3xl mb-3 animate-pulse">⏳</div>
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
                  <div className="mb-3">
                    <p className="text-green-600 font-semibold text-sm">✅ Photo received!</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">The gallery has been updated.</p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">Scan with your phone camera</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                      Waiting for photo… expires in <span className="font-mono text-purple-500">{timeLeft}</span>
                    </p>
                  </div>
                )}
                <button
                  onClick={generateSession}
                  className="text-purple-600 text-sm hover:underline"
                >
                  Generate new QR
                </button>
              </>
            )}

            {uploadState === 'expired' && (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">QR code expired.</p>
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

        {/* Label tab */}
        {tab === 'label' && (
          <div className="p-5">
            {/* Size picker */}
            <div className="flex gap-2 mb-4">
              {LABEL_SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLabelSize(s)}
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

            {/* Label preview */}
            <div className="flex justify-center mb-4">
              <div
                id="qr-label-print"
                style={{
                  width: labelSize.width,
                  height: labelSize.height,
                  border: '1px solid #000',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px',
                  gap: '6px',
                  background: '#fff',
                  transform: 'scale(1.8)',
                  transformOrigin: 'top center',
                  marginBottom: '60px',
                }}
              >
                <QRCodeSVG value={profileUrl} size={labelSize.qrSize} level="M" />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: labelSize.fontSize.name, fontWeight: 700, color: '#111', lineHeight: 1.2 }}>
                    {tarantulaName}{sexSymbol ? ` ${sexSymbol}` : ''}
                  </div>
                  {scientificName && (
                    <div style={{ fontSize: labelSize.fontSize.sci, fontStyle: 'italic', color: '#555', lineHeight: 1.2 }}>
                      {scientificName}
                    </div>
                  )}
                  <div style={{ fontSize: labelSize.fontSize.meta, color: '#888', marginTop: 2 }}>
                    tarantuverse.com
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-3">
              QR links permanently to this spider's profile. Anyone who scans it can see their public info.
            </p>

            <button
              onClick={handlePrint}
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
