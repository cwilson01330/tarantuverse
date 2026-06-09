'use client'

/**
 * Add photo for an invert (web) — ADR-006 web parity B3.
 * Multipart upload to the per-taxon /photos endpoint.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const inputCls = 'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

export default function AddInvertPhotoPage() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [prefix, setPrefix] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) { router.push('/login'); return }
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/inverts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setPrefix(isInvertTaxon(data.taxon) ? INVERT_TAXA[data.taxon].prefix : null)
      } catch { /* leave null */ }
    })()
  }, [id, token, isAuthenticated, isLoading, router])

  const onPick = (f: File | null) => {
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const upload = async () => {
    if (!token || !prefix || !file) { if (!file) alert('Choose a photo first.'); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (caption.trim()) form.append('caption', caption.trim())
      const res = await fetch(`${API_URL}/api/v1/${prefix}/${id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets multipart boundary
        body: form,
      })
      if (!res.ok) throw new Error()
      router.push(`/dashboard/inverts/${id}`)
    } catch {
      alert('Could not upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => router.back()} className="text-sm text-primary-600 hover:underline mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">Add photo</h1>
        <div className="space-y-5">
          <div
            onClick={() => fileRef.current?.click()}
            className="h-64 rounded-2xl border-2 border-dashed border-theme bg-surface flex items-center justify-center cursor-pointer overflow-hidden"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-theme-tertiary text-sm">Click to choose a photo</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <div><label className={labelCls}>Caption (optional)</label><textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} maxLength={500} className={inputCls} /></div>
          <button onClick={upload} disabled={uploading || !prefix || !file} className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60">{uploading ? 'Uploading…' : 'Upload photo'}</button>
        </div>
      </div>
    </DashboardLayout>
  )
}
