'use client'

/**
 * PhotoGallery — reptile photo management.
 *
 * Responsibilities:
 *   - List photos for a snake (polymorphic photos table, snake-scoped routes).
 *   - Upload new photos with drag-and-drop + click-to-select, multi-file.
 *   - Set a photo as the animal's main photo (updates Snake.photo_url).
 *   - Delete a photo (CASCADE cleans up storage on backend).
 *   - Minimal inline lightbox — no library, no dependencies.
 *
 * Notes on identifying "main":
 *   The Snake record carries `photo_url` as a denormalized copy of the main
 *   photo's URL. The backend's `PATCH /photos/{id}/set-main` endpoint copies
 *   the photo's URL onto the parent. We compare photo.url === snakeMainPhotoUrl
 *   to decide which thumb shows the "main" marker. This is a display-only
 *   check; the server is authoritative.
 *
 * Notes on uploads:
 *   apiClient leaves Content-Type unset when `json` isn't supplied, letting
 *   the browser set multipart/form-data + boundary. We track per-file state
 *   in a local queue so the user can see which files are uploading, failed,
 *   or done even when they drop many at once.
 */

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import {
  Photo,
  deletePhoto,
  listPhotos,
  setMainPhoto,
  updatePhotoCaption,
  uploadPhoto,
} from '@/lib/snakes'

// ---------------------------------------------------------------------------
// Upload queue types
// ---------------------------------------------------------------------------

type QueueItem = {
  id: string // local only — file.name + timestamp
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  // We keep a preview url so the ghost thumb has something to show while
  // the network round-trips. Revoked when the item leaves the queue.
  previewUrl: string
}

// Crude bound — keeps the UI honest about what we can actually send in one
// burst without hogging the main thread on image decode.
const MAX_PARALLEL_UPLOADS = 3
const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

// Backend enforces 15MB. We re-check on the client to fail fast with a nicer
// message than a 413.
const MAX_BYTES = 15 * 1024 * 1024

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoGallery({
  snakeId,
  snakeMainPhotoUrl,
  onMainChanged,
}: {
  snakeId: string
  snakeMainPhotoUrl: string | null
  onMainChanged?: () => void
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Upload queue — keyed by local id.
  const [queue, setQueue] = useState<QueueItem[]>([])

  // Lightbox — index into photos[]. null = closed.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  // Drag-hover state for the drop zone. Tracks how many nested enter events
  // are active so we don't flicker when the cursor moves over a child.
  const [dragDepth, setDragDepth] = useState(0)
  const dragging = dragDepth > 0

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const refetch = useCallback(async () => {
    try {
      const next = await listPhotos(snakeId)
      // Sort by created_at descending — newest first feels right for a log,
      // but the main photo (if any) always wins the top slot below.
      next.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      )
      setPhotos(next)
      setLoadError(null)
    } catch (err) {
      setLoadError(errMsg(err, 'Could not load photos.'))
    }
  }, [snakeId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  // Revoke preview urls on unmount so we don't leak blob: handles.
  useEffect(() => {
    return () => {
      queue.forEach((q) => {
        try {
          URL.revokeObjectURL(q.previewUrl)
        } catch {
          // Ignore — browser may have already revoked it.
        }
      })
    }
    // We intentionally don't depend on `queue`; this is an unmount cleanup
    // only. Per-item cleanup happens when items transition to `done`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------------------------------------------------------
  // Upload queue processor
  // -------------------------------------------------------------------------

  // Whenever the queue changes, try to pump up to MAX_PARALLEL pending items
  // into the uploading state. We keep the actual fetch in an effect so the
  // setState that adds new items triggers this check naturally.
  useEffect(() => {
    const inflight = queue.filter((q) => q.status === 'uploading').length
    if (inflight >= MAX_PARALLEL_UPLOADS) return
    const next = queue.find((q) => q.status === 'pending')
    if (!next) return

    // Mark as uploading synchronously so the next effect pass sees it. If
    // we do this inline with the await below, two effects can race and the
    // same file can upload twice.
    setQueue((prev) =>
      prev.map((q) => (q.id === next.id ? { ...q, status: 'uploading' } : q)),
    )

    uploadPhoto(snakeId, next.file)
      .then((created) => {
        // Optimistic insert — prepend so it shows up immediately even before
        // the refetch lands.
        setPhotos((prev) => [created, ...prev])
        setQueue((prev) => prev.filter((q) => q.id !== next.id))
        try {
          URL.revokeObjectURL(next.previewUrl)
        } catch {
          // ignore
        }
        // If this was the first photo ever uploaded, the backend auto-
        // promotes it to main. Nudge the parent so Snake.photo_url reflects.
        if (photos.length === 0) {
          onMainChanged?.()
        }
      })
      .catch((err) => {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === next.id
              ? {
                  ...q,
                  status: 'error',
                  error: errMsg(err, 'Upload failed.'),
                }
              : q,
          ),
        )
      })
  }, [queue, snakeId, photos.length, onMainChanged])

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  const enqueueFiles = useCallback((files: FileList | File[]) => {
    const toAdd: QueueItem[] = []
    const arr = Array.from(files)
    for (const file of arr) {
      // Defensive: some drops include non-file items (e.g. directories). The
      // browser typically filters for us, but we re-check type + size.
      if (!ACCEPTED_MIME.has(file.type)) {
        toAdd.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: 'error',
          error: 'Only JPEG, PNG, GIF, or WebP images are supported.',
          previewUrl: '',
        })
        continue
      }
      if (file.size > MAX_BYTES) {
        toAdd.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: 'error',
          error: 'Files over 15 MB aren\u2019t supported.',
          previewUrl: '',
        })
        continue
      }
      toAdd.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: 'pending',
        previewUrl: URL.createObjectURL(file),
      })
    }
    if (toAdd.length > 0) {
      setQueue((prev) => [...prev, ...toAdd])
    }
  }, [])

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    enqueueFiles(e.target.files)
    // Reset so selecting the same file twice in a row still fires.
    e.target.value = ''
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    // Keep "copy" cursor on most OSes; default might be "move".
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragDepth(0)
    if (!e.dataTransfer) return
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      enqueueFiles(files)
    }
  }

  // -------------------------------------------------------------------------
  // Per-photo actions
  // -------------------------------------------------------------------------

  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null)

  async function handleSetMain(photo: Photo) {
    if (busyPhotoId) return
    setBusyPhotoId(photo.id)
    try {
      await setMainPhoto(photo.id)
      // Parent refetches Snake so photo_url updates. We don't mutate the
      // photos list itself; order doesn't change here.
      onMainChanged?.()
    } catch (err) {
      // Surface inline — no toast system yet in the spike.
      setLoadError(errMsg(err, 'Could not set main photo.'))
    } finally {
      setBusyPhotoId(null)
    }
  }

  async function handleDelete(photo: Photo) {
    if (busyPhotoId) return
    if (!window.confirm('Delete this photo? This can\u2019t be undone.')) return
    setBusyPhotoId(photo.id)
    try {
      await deletePhoto(photo.id)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
      // If we just deleted the main photo, Snake.photo_url is now stale. The
      // backend doesn't auto-promote a replacement on delete, so we just
      // tell the parent to refetch — Snake.photo_url will be null.
      if (photo.url === snakeMainPhotoUrl) {
        onMainChanged?.()
      }
      // If the lightbox was showing this photo, close it.
      setLightboxIdx((idx) => {
        if (idx == null) return idx
        const current = photos[idx]
        if (current?.id === photo.id) return null
        return idx
      })
    } catch (err) {
      setLoadError(errMsg(err, 'Could not delete photo.'))
    } finally {
      setBusyPhotoId(null)
    }
  }

  /**
   * Persist a caption change to the backend, then patch the local list so the
   * change shows up immediately (the lightbox reads from photos[idx]).
   *
   * Returns void on success, throws on failure so the lightbox can show an
   * inline error without us having to pipe state all the way back.
   */
  const handleSaveCaption = useCallback(
    async (photoId: string, nextCaption: string | null) => {
      const updated = await updatePhotoCaption(photoId, nextCaption)
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, caption: updated.caption } : p,
        ),
      )
    },
    [],
  )

  function dismissQueueItem(id: string) {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id)
      if (item) {
        try {
          URL.revokeObjectURL(item.previewUrl)
        } catch {
          // ignore
        }
      }
      return prev.filter((q) => q.id !== id)
    })
  }

  // -------------------------------------------------------------------------
  // Lightbox keyboard nav
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (lightboxIdx == null) return
    function onKey(e: KeyboardEvent) {
      // Don't steal arrows / Escape from the caption textarea. The editor
      // handles its own Escape → cancel, and arrow keys should move the
      // cursor inside the field, not navigate photos.
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      if (e.key === 'Escape') {
        setLightboxIdx(null)
      } else if (e.key === 'ArrowRight') {
        setLightboxIdx((idx) => {
          if (idx == null) return idx
          return idx + 1 >= photos.length ? idx : idx + 1
        })
      } else if (e.key === 'ArrowLeft') {
        setLightboxIdx((idx) => {
          if (idx == null) return idx
          return idx - 1 < 0 ? idx : idx - 1
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, photos.length])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading && photos.length === 0) {
    return (
      <div
        className="h-48 rounded-md border border-dashed border-neutral-800 bg-neutral-900/20 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      />
    )
  }

  const mainPhoto: Photo | null =
    photos.find((p) => p.url === snakeMainPhotoUrl) ?? photos[0] ?? null

  return (
    <div className="space-y-3">
      {loadError && (
        <div
          role="alert"
          className="p-2.5 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {loadError}
        </div>
      )}

      {/* Main photo / empty state */}
      <div
        className={`relative overflow-hidden rounded-lg border transition-colors ${
          dragging
            ? 'border-herp-teal/60 bg-herp-teal/5'
            : 'border-neutral-800 bg-neutral-900/40'
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {mainPhoto ? (
          <button
            type="button"
            onClick={() => {
              const idx = photos.findIndex((p) => p.id === mainPhoto.id)
              setLightboxIdx(idx >= 0 ? idx : 0)
            }}
            className="relative block w-full aspect-[4/3] sm:aspect-[16/9] bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-herp-teal/60"
            aria-label="Open main photo in full view"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mainPhoto.url}
              alt={mainPhoto.caption || 'Main photo'}
              className="w-full h-full object-cover"
              draggable={false}
            />
            {mainPhoto.caption && (
              <span className="absolute bottom-2 left-2 right-2 text-xs text-neutral-100 bg-black/60 backdrop-blur-sm px-2 py-1 rounded truncate">
                {mainPhoto.caption}
              </span>
            )}
          </button>
        ) : (
          <EmptyState onPick={() => fileInputRef.current?.click()} />
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-herp-teal/10 border-2 border-dashed border-herp-teal/60 rounded-lg">
            <p className="text-sm text-herp-lime font-medium">
              Drop to upload
            </p>
          </div>
        )}
      </div>

      {/* Hidden file input — shared by the empty state button and the + tile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleFilePick}
      />

      {/* Thumbnail strip + upload tile */}
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, idx) => {
          const isMain = photo.url === snakeMainPhotoUrl
          const isBusy = busyPhotoId === photo.id
          return (
            <div
              key={photo.id}
              className={`group relative w-20 h-20 rounded-md overflow-hidden border transition-colors ${
                isMain
                  ? 'border-herp-teal/70'
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <button
                type="button"
                onClick={() => setLightboxIdx(idx)}
                className="absolute inset-0 focus:outline-none focus:ring-2 focus:ring-herp-teal/60"
                aria-label={`Open photo ${idx + 1} of ${photos.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnail_url || photo.url}
                  alt={photo.caption || `Photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>

              {isMain && (
                <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-herp-teal text-herp-dark font-semibold">
                  Main
                </span>
              )}

              {/* Action overlay: set-main + delete. On touch devices
                  group-hover never fires, so we show the bar by default at
                  the smallest breakpoint and gate it behind hover/focus only
                  from `sm:` up, where hovering actually means something. */}
              <div className="absolute inset-x-0 bottom-0 flex items-stretch bg-black/70 backdrop-blur-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                {!isMain && (
                  <button
                    type="button"
                    onClick={() => handleSetMain(photo)}
                    disabled={isBusy}
                    title="Set as main photo"
                    aria-label="Set as main photo"
                    className="flex-1 py-1 text-[11px] text-neutral-100 hover:text-herp-lime disabled:opacity-40"
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  disabled={isBusy}
                  title="Delete photo"
                  aria-label="Delete photo"
                  className="flex-1 py-1 text-[11px] text-neutral-100 hover:text-red-300 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}

        {/* Queue ghosts — render pending/uploading/error items as thumbs so
            the user can see what's happening to each file. */}
        {queue.map((item) => (
          <QueueGhost
            key={item.id}
            item={item}
            onDismiss={() => dismissQueueItem(item.id)}
          />
        ))}

        {/* "+ Add" tile — always last, clickable and keyboard-focusable. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-md border border-dashed border-neutral-700 hover:border-herp-teal/60 text-neutral-500 hover:text-herp-lime transition-colors flex flex-col items-center justify-center gap-1 focus:outline-none focus:ring-2 focus:ring-herp-teal/60"
          aria-label="Add photos"
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            ＋
          </span>
          <span className="text-[10px] uppercase tracking-wider">
            {photos.length === 0 ? 'Upload' : 'Add'}
          </span>
        </button>
      </div>

      {/* Hint copy — only when there's no photos yet so we don't clutter. */}
      {photos.length === 0 && queue.length === 0 && (
        <p className="text-xs text-neutral-500">
          Drag photos onto the tile above, or tap Upload. JPEG, PNG, GIF, or
          WebP up to 15 MB each.
        </p>
      )}

      {/* Lightbox */}
      {lightboxIdx != null && photos[lightboxIdx] && (
        <Lightbox
          photo={photos[lightboxIdx]}
          index={lightboxIdx}
          total={photos.length}
          onClose={() => setLightboxIdx(null)}
          onPrev={
            lightboxIdx > 0
              ? () => setLightboxIdx(lightboxIdx - 1)
              : undefined
          }
          onNext={
            lightboxIdx < photos.length - 1
              ? () => setLightboxIdx(lightboxIdx + 1)
              : undefined
          }
          onSaveCaption={handleSaveCaption}
        />
      )}

      {/* Next/Image is imported but not used — kept available for future
          optimization. Keep this empty element so tree-shaking doesn't warn
          when the import is dropped from the bundle. */}
      <NextImageProbe />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full aspect-[16/9] flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-herp-lime transition-colors focus:outline-none focus:ring-2 focus:ring-herp-teal/60 rounded-lg"
      aria-label="Upload first photo"
    >
      <span className="text-4xl" aria-hidden="true">
        🐍
      </span>
      <span className="text-sm font-medium text-neutral-300">
        No photos yet
      </span>
      <span className="text-xs text-neutral-500">
        Drag &amp; drop, or click to upload
      </span>
    </button>
  )
}

function QueueGhost({
  item,
  onDismiss,
}: {
  item: QueueItem
  onDismiss: () => void
}) {
  const isError = item.status === 'error'
  const isUploading = item.status === 'uploading' || item.status === 'pending'
  return (
    <div
      className={`relative w-20 h-20 rounded-md overflow-hidden border ${
        isError ? 'border-red-500/60' : 'border-neutral-800'
      }`}
      role="status"
      aria-live="polite"
    >
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.previewUrl}
          alt={item.file.name}
          className="w-full h-full object-cover opacity-60"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-neutral-950" />
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="text-[10px] uppercase tracking-wider text-herp-lime animate-pulse">
            {item.status === 'pending' ? 'Queued' : 'Uploading'}
          </span>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 px-1 text-center">
          <span
            className="text-[9px] leading-tight text-red-300 line-clamp-3"
            title={item.error}
          >
            {item.error}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-[9px] uppercase tracking-wider text-neutral-400 hover:text-neutral-100"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

function Lightbox({
  photo,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onSaveCaption,
}: {
  photo: Photo
  index: number
  total: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  /** Throws on failure; caller already updates the photos list on success. */
  onSaveCaption: (photoId: string, caption: string | null) => Promise<void>
}) {
  // Caption editor state. Keyed on photo.id so navigating between photos
  // resets the draft and cancels any in-flight editing.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(photo.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    // Reset editor state when the user navigates to a different photo.
    setEditing(false)
    setDraft(photo.caption ?? '')
    setSaving(false)
    setEditError(null)
  }, [photo.id, photo.caption])

  async function commitCaption() {
    if (saving) return
    const trimmed = draft.trim()
    const nextCaption = trimmed === '' ? null : trimmed
    // No-op if nothing changed — don't bother the server.
    if (nextCaption === (photo.caption ?? null)) {
      setEditing(false)
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      await onSaveCaption(photo.id, nextCaption)
      setEditing(false)
    } catch (err) {
      setEditError(errMsg(err, 'Could not save caption.'))
    } finally {
      setSaving(false)
    }
  }

  function cancelCaption() {
    setDraft(photo.caption ?? '')
    setEditing(false)
    setEditError(null)
  }

  // Click on the backdrop (not the image / controls) dismisses. We stop
  // propagation on the image wrapper so zoom + caption editing don't leak.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || `Photo ${index + 1} of ${total}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 flex items-center justify-center"
      >
        ✕
      </button>

      {onPrev && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          aria-label="Previous photo"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 flex items-center justify-center"
        >
          ‹
        </button>
      )}
      {onNext && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          aria-label="Next photo"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 flex items-center justify-center"
        >
          ›
        </button>
      )}

      <div
        className="max-w-full max-h-full flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || `Photo ${index + 1}`}
          className="max-w-full max-h-[75vh] sm:max-h-[80vh] object-contain rounded-md"
          draggable={false}
        />

        <div className="w-full max-w-xl flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span>
              {index + 1} / {total}
            </span>
          </div>

          {/* Caption editor — always rendered so there's a consistent affordance
              for adding one when empty. Pencil click (or tap on the caption
              text) enters edit mode. Enter commits, Escape cancels. */}
          {editing ? (
            <div className="w-full flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void commitCaption()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelCaption()
                  }
                }}
                rows={2}
                maxLength={500}
                placeholder="Add a caption (optional)…"
                autoFocus
                disabled={saving}
                className="w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-700 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-500 resize-y disabled:opacity-60"
              />
              {editError && (
                <p role="alert" className="text-xs text-red-300">
                  {editError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-neutral-500">
                  {draft.length}/500 · Enter saves · Esc cancels
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelCaption}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void commitCaption()}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs rounded-md bg-herp-teal text-herp-dark font-medium hover:bg-herp-lime disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={photo.caption ? 'Edit caption' : 'Add caption'}
              className="w-full text-left px-3 py-2 rounded-md border border-transparent hover:border-neutral-700 hover:bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-herp-teal/50 transition-colors"
            >
              <span className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-neutral-500 shrink-0"
                >
                  ✎
                </span>
                <span
                  className={
                    photo.caption
                      ? 'text-sm text-neutral-200 break-words'
                      : 'text-sm text-neutral-500 italic'
                  }
                >
                  {photo.caption || 'Add a caption…'}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Keeps the next/image import reachable for future use (e.g. swapping the
// main photo for a responsive <Image />). The `as const` + noop render
// costs nothing at runtime.
function NextImageProbe(): null {
  const _ = Image
  void _
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message || fallback
  return fallback
}
