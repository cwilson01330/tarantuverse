'use client'

/**
 * Mobile browser photo upload page.
 * Opened by scanning a QR code — no login required.
 * Designed to be used entirely on a phone screen.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

interface SessionInfo {
  valid: boolean
  tarantula_name: string
  common_name: string | null
  scientific_name: string | null
  photo_url: string | null
  expires_at: string
  uploads_so_far: number
}

type PageState = 'loading' | 'ready' | 'uploading' | 'success' | 'expired' | 'error'

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
      const res = await fetch(`${API}/api/v1/upload-sessions/${token}/photo`, {
        method: 'POST',
        body: form,
      })
      if (res.status === 410) { setPageState('expired'); return }
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
    setPageState('ready')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── styles (inline so this page is fully self-contained) ──────────────────
  const page: React.CSSProperties = {
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
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
  const spiderName: React.CSSProperties = {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '4px',
  }
  const spiderSci: React.CSSProperties = {
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
          <div style={logo}>🕷️</div>
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
            This QR code has expired. Go back to the web app and generate a new one.
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
            This upload link is invalid or has already been used. Please scan a fresh QR code.
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
          <h2 style={{ marginBottom: '8px', fontSize: '22px' }}>Photo Added!</h2>
          <p style={{ opacity: 0.7, fontSize: '15px', marginBottom: '24px' }}>
            {sessionInfo?.tarantula_name} now has {uploadCount} photo{uploadCount !== 1 ? 's' : ''} this session.
          </p>
          <button style={btn('linear-gradient(135deg,#a855f7,#ec4899)')} onClick={handleAnother}>
            📸 Add Another Photo
          </button>
          <p style={{ opacity: 0.4, fontSize: '13px', marginTop: '8px' }}>
            Photos appear in the web app instantly.
          </p>
        </div>
      </div>
    )
  }

  // ready / uploading
  return (
    <div style={page}>
      <div style={card}>
        <div style={logo}>🕷️</div>
        <p style={brand}>Tarantuverse</p>

        <p style={spiderName}>{sessionInfo?.tarantula_name}</p>
        {sessionInfo?.scientific_name && (
          <p style={spiderSci}>{sessionInfo.scientific_name}</p>
        )}

        {uploadCount > 0 && (
          <span style={badge}>
            {uploadCount} photo{uploadCount !== 1 ? 's' : ''} uploaded this session
          </span>
        )}

        {errorMsg && (
          <p style={{ color: '#ff6b6b', fontSize: '14px', marginBottom: '12px' }}>{errorMsg}</p>
        )}

        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" style={previewImg} />
            <button
              style={btn(pageState === 'uploading' ? '#666' : 'linear-gradient(135deg,#a855f7,#ec4899)')}
              onClick={handleUpload}
              disabled={pageState === 'uploading'}
            >
              {pageState === 'uploading' ? '⏳ Uploading…' : '⬆️ Upload This Photo'}
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
              style={btn('linear-gradient(135deg,#a855f7,#ec4899)')}
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
