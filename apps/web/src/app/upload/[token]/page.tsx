'use client'

/**
 * Mobile browser photo upload page.
 *
 * Opened by scanning a QR code from any of:
 *   - Tarantuverse mobile (tarantula sessions)
 *   - Herpetoverse mobile (snake / lizard sessions)
 *
 * No login required — the URL token is the credential. Page is designed
 * to be used entirely on a phone screen, so styles are inline + dense
 * to avoid render flashes from external CSS during cold starts.
 *
 * Why a single page handles all three taxa instead of separate routes
 * per brand: the QR session token is created against a single API +
 * single database. Routing by taxon would require either a backend
 * URL-resolution change or a bunch of redirect hops. This page reads
 * the taxon from the session-info response and switches glyph, brand
 * label, and gradient palette accordingly.
 *
 * Backend contract — `GET /upload-sessions/{token}` returns:
 *   {
 *     valid: true,
 *     taxon: 'tarantula' | 'snake' | 'lizard',
 *     display_name: string,        // server-formatted, name|common|sci
 *     common_name: string | null,
 *     scientific_name: string | null,
 *     photo_url: string | null,
 *     expires_at: string,
 *     uploads_so_far: number,
 *     tarantula_name?: string,     // back-compat, only for tarantula taxon
 *   }
 */

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

type Taxon = 'tarantula' | 'snake' | 'lizard'

interface SessionInfo {
  valid: boolean
  taxon?: Taxon
  display_name?: string
  /** Legacy field, only present for tarantula sessions. */
  tarantula_name?: string
  common_name: string | null
  scientific_name: string | null
  photo_url: string | null
  expires_at: string
  uploads_so_far: number
}

type PageState =
  | 'loading'
  | 'ready'
  | 'uploading'
  | 'success'
  | 'expired'
  | 'error'

// ---------------------------------------------------------------------------
// Branding — taxon-aware glyph, brand label, and gradient. Tarantuverse
// keeps the original purple/pink palette; snake + lizard adopt the
// Herpetoverse emerald palette so the upload page reads on-brand
// regardless of which mobile app generated the QR.
// ---------------------------------------------------------------------------

interface Branding {
  glyph: string
  brand: string
  pageGradient: string
  buttonGradient: string
}

function brandingFor(taxon: Taxon | undefined): Branding {
  switch (taxon) {
    case 'snake':
      return {
        glyph: '🐍',
        brand: 'Herpetoverse',
        pageGradient:
          'linear-gradient(135deg, #06140e 0%, #0f3325 50%, #06140e 100%)',
        buttonGradient: 'linear-gradient(135deg,#10b981,#34d399)',
      }
    case 'lizard':
      return {
        glyph: '🦎',
        brand: 'Herpetoverse',
        pageGradient:
          'linear-gradient(135deg, #06140e 0%, #0f3325 50%, #06140e 100%)',
        buttonGradient: 'linear-gradient(135deg,#10b981,#34d399)',
      }
    // Default: tarantula (also handles legacy/missing taxon field).
    default:
      return {
        glyph: '🕷️',
        brand: 'Tarantuverse',
        pageGradient:
          'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
        buttonGradient: 'linear-gradient(135deg,#a855f7,#ec4899)',
      }
  }
}

// Resolve a display name from any of the response shapes — `display_name`
// is the modern field, `tarantula_name` is the legacy one. Final fallback
// is "this animal" so we never render "undefined" in the success copy.
function displayNameFrom(info: SessionInfo | null): string {
  if (!info) return 'this animal'
  return info.display_name || info.tarantula_name || 'this animal'
}

export default function UploadPage() {
  const { token } = useParams<{ token: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/v1/upload-sessions/${token}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 410) {
          setPageState('expired')
          return
        }
        if (!res.ok) throw new Error('Failed to load session')
        const data: SessionInfo = await res.json()
        setSessionInfo(data)
        setUploadCount(data.uploads_so_far)
        setPageState('ready')
      })
      .catch(() => setPageState('error'))
  }, [token])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !token) return
    setPageState('uploading')

    const form = new FormData()
    form.append('file', selectedFile)

    try {
      const res = await fetch(
        `${API}/api/v1/upload-sessions/${token}/photo`,
        {
          method: 'POST',
          body: form,
        },
      )
      if (res.status === 410) {
        setPageState('expired')
        return
      }
      if (res.status === 429) {
        // Per-session upload cap reached — surface honestly, the keeper
        // can generate a new session if they need more.
        setErrorMsg('This QR session has hit its upload limit. Generate a new QR to keep going.')
        setPageState('ready')
        return
      }
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setUploadCount(data.uploads_this_session)
      setPageState('success')
    } catch {
      setErrorMsg('Upload failed — please try again.')
      setPageState('ready')
    }
  }

  const handleAnother = () => {
    setSelectedFile(null)
    setPreview(null)
    setErrorMsg('')
    setPageState('ready')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Resolve branding once per render — `sessionInfo?.taxon` is undefined
  // during loading/error states; `brandingFor` defaults to Tarantuverse
  // for those, which is fine because the loading screen only shows the
  // glyph for ~200ms.
  const branding = brandingFor(sessionInfo?.taxon)
  const animalName = displayNameFrom(sessionInfo)

  // ── styles (inline so this page is fully self-contained) ──────────────────
  const page: React.CSSProperties = {
    minHeight: '100dvh',
    background: branding.pageGradient,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#fff',
  }
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '20px',
    padding: '32px 24px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  }
  const logo: React.CSSProperties = {
    fontSize: '40px',
    marginBottom: '8px',
  }
  const brand: React.CSSProperties = {
    fontSize: '14px',
    opacity: 0.5,
    marginBottom: '24px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  }
  const animalNameStyle: React.CSSProperties = {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '4px',
  }
  const animalSci: React.CSSProperties = {
    fontSize: '14px',
    fontStyle: 'italic',
    opacity: 0.6,
    marginBottom: '24px',
  }
  const btn = (color: string): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    background: color,
    color: '#fff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '12px',
  })
  const previewImg: React.CSSProperties = {
    width: '100%',
    maxHeight: '260px',
    objectFit: 'cover',
    borderRadius: '12px',
    marginBottom: '16px',
  }
  const badge: React.CSSProperties = {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '4px 12px',
    fontSize: '13px',
    marginBottom: '20px',
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={logo}>{branding.glyph}</div>
          <p style={{ opacity: 0.6 }}>Loading session…</p>
        </div>
      </div>
    )
  }

  if (pageState === 'expired') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏱️</div>
          <h2 style={{ marginBottom: '8px' }}>Session Expired</h2>
          <p style={{ opacity: 0.6, fontSize: '15px' }}>
            This QR code has expired. Go back to the app and generate a new
            one — sessions last 20 minutes.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h2 style={{ marginBottom: '8px' }}>Invalid Link</h2>
          <p style={{ opacity: 0.6, fontSize: '15px' }}>
            This upload link is invalid or has already been used. Please scan
            a fresh QR code.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'success') {
    return (
      <div style={page}>
        <div style={card}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ marginBottom: '8px', fontSize: '22px' }}>
            Photo Added!
          </h2>
          <p style={{ opacity: 0.7, fontSize: '15px', marginBottom: '24px' }}>
            {animalName} now has {uploadCount} photo
            {uploadCount !== 1 ? 's' : ''} this session.
          </p>
          <button
            style={btn(branding.buttonGradient)}
            onClick={handleAnother}
          >
            📸 Add Another Photo
          </button>
          <p style={{ opacity: 0.4, fontSize: '13px', marginTop: '8px' }}>
            Photos appear in the app instantly.
          </p>
        </div>
      </div>
    )
  }

  // ready / uploading
  return (
    <div style={page}>
      <div style={card}>
        <div style={logo}>{branding.glyph}</div>
        <p style={brand}>{branding.brand}</p>

        <p style={animalNameStyle}>{animalName}</p>
        {sessionInfo?.scientific_name && (
          <p style={animalSci}>{sessionInfo.scientific_name}</p>
        )}

        {uploadCount > 0 && (
          <span style={badge}>
            {uploadCount} photo{uploadCount !== 1 ? 's' : ''} uploaded this
            session
          </span>
        )}

        {errorMsg && (
          <p
            style={{
              color: '#ff6b6b',
              fontSize: '14px',
              marginBottom: '12px',
            }}
          >
            {errorMsg}
          </p>
        )}

        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" style={previewImg} />
            <button
              style={btn(
                pageState === 'uploading' ? '#666' : branding.buttonGradient,
              )}
              onClick={handleUpload}
              disabled={pageState === 'uploading'}
            >
              {pageState === 'uploading'
                ? '⏳ Uploading…'
                : '⬆️ Upload This Photo'}
            </button>
            <button
              style={{ ...btn('rgba(255,255,255,0.1)'), marginBottom: 0 }}
              onClick={handleAnother}
              disabled={pageState === 'uploading'}
            >
              Choose Different Photo
            </button>
          </>
        ) : (
          <>
            <button
              style={btn(branding.buttonGradient)}
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Take or Choose Photo
            </button>
            <p style={{ opacity: 0.4, fontSize: '13px' }}>
              Opens your camera or photo library
            </p>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
