'use client'

/**
 * Add photo for a colony (web). Mirrors dashboard/inverts/[id]/add-photo:
 * multipart upload, then back to the detail page, which refetches so the
 * photo strip and (for a first photo) the colony hero update.
 *
 * Colony photos are uncapped by design, so there is no limit handling here.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import { uploadColonyPhoto } from '@/lib/colonies'

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-theme-tertiary mb-1.5'

export default function AddColonyPhotoPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) router.push('/login')
  }, [token, isAuthenticated, isLoading, router])

  // Release the object URL when the preview changes or the page unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onPick = (f: File | null) => {
    setFile(f)
    setError('')
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const upload = async () => {
    if (!token || !file) {
      if (!file) setError('Choose a photo first.')
      return
    }
    setUploading(true)
    setError('')
    try {
      await uploadColonyPhoto(token, id, file, caption)
      router.push(`/dashboard/colonies/${id}`)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <DashboardLayout userName={user?.name ?? undefined} userEmail={user?.email ?? undefined} userAvatar={user?.image ?? undefined}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-4"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-theme-primary mb-6">Add photo</h1>
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            >
              {error}
            </div>
          )}
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
          <div>
            <label htmlFor="colony-photo-caption" className={labelCls}>Caption (optional)</label>
            <textarea
              id="colony-photo-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              maxLength={500}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={upload}
            disabled={uploading || !file}
            className="w-full py-3 bg-gradient-brand text-white rounded-xl font-semibold disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Upload photo'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
