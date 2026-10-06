'use client'
/**
 * Share-card composer (spec §4.4). Live preview, shape chips, field toggles,
 * optional card link. Nothing here changes any app setting (spec §6).
 * HV is dark-only: palette copied from PauseFeedingDialog, no `dark:` variants.
 */
import { useEffect, useRef, useState } from 'react'
import {
  CardApp, CardFrame, CardKind, CardShape, FIELDS, FIELD_LABELS, FRAMES, SharePhoto,
  createShareCard, getShareDefaults, listSharePhotos, previewImageUrl, shareImageUrl,
} from '@/lib/shareCards'

const GENERIC_ERROR = "Couldn't make the card. Try again."
// Preview tokens last 15 minutes; reuse a cached preview for a bit less.
const PREVIEW_TTL_MS = 12 * 60 * 1000

/** A tiny abstract of each frame (handoff §4): fixed card colours, since it
 *  pictures the card itself, not the app around it. */
function FrameThumb({ frame }: { frame: CardFrame }) {
  if (frame === 'herbarium') {
    return (
      <div className="w-full h-full relative" style={{ background: '#EDE7D6' }}>
        <div className="absolute" style={{ left: 7, top: 6, width: 40, height: 32, background: '#444441', transform: 'rotate(-3deg)' }} />
        <div className="absolute" style={{ left: 6, right: 6, bottom: 6, height: 20, border: '1px solid #3B3528' }} />
      </div>
    )
  }
  if (frame === 'notes') {
    return (
      <div className="w-full h-full relative" style={{ background: '#F4F1E8' }}>
        <div className="absolute" style={{ left: 5, right: 5, top: 5, height: 38, background: '#444441' }} />
        <div className="absolute" style={{ left: 6, top: 50, width: 34, height: 3, borderRadius: 2, background: '#1F2A44', transform: 'rotate(-3deg)' }} />
        <div className="absolute" style={{ left: 8, top: 58, width: 24, height: 2, borderRadius: 2, background: '#1F2A44', transform: 'rotate(-2deg)' }} />
      </div>
    )
  }
  return (
    <div className="w-full h-full relative" style={{ background: '#F1EFE8' }}>
      <div className="absolute" style={{ left: 5, right: 5, top: 5, height: 34, background: '#444441', borderRadius: 2 }} />
      <div className="absolute" style={{ left: 6, top: 45, width: 26, height: 3, background: '#2C2C2A' }} />
      <div className="absolute" style={{ left: 6, right: 6, top: 54, height: 1, background: '#888780' }} />
      <div className="absolute" style={{ left: 6, right: 6, top: 59, height: 1, background: '#888780' }} />
    </div>
  )
}

export default function ShareCardModal({
  open, onClose, app, animalId, kind, moltId, token,
}: {
  open: boolean; onClose: () => void; app: CardApp; animalId: string; kind: CardKind; moltId?: string; token: string
}) {
  const [shape, setShape] = useState<CardShape>('post')
  const [frame, setFrame] = useState<CardFrame>('specimen')
  const [fields, setFields] = useState<string[] | null>(null)
  const [link, setLink] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  // True from a change until the new image has loaded: the server takes a
  // few seconds to draw a card, and the old one stays up (dimmed) meanwhile.
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<SharePhoto[]>([])
  // null = the animal's main photo.
  const [photoId, setPhotoId] = useState<string | null>(null)
  // Previews already drawn while the modal is open: going back is instant.
  const cache = useRef(new Map<string, { url: string; at: number }>())
  const prefetched = useRef<string | null>(null)
  const loadedUrl = useRef<string | null>(null)
  const [cardLink, setCardLink] = useState<{ url: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const keyFor = (f: string[], s: CardShape, fr: CardFrame, ph: string | null) => `${fr}|${s}|${[...f].sort().join(',')}|${ph ?? 'main'}`
  const key = fields ? keyFor(fields, shape, frame, photoId) : ''

  // Reset per open / per molt so nothing stale from a previous card shows.
  useEffect(() => {
    if (!open) return
    setPreview(null)
    setPhotoId(null)
    cache.current.clear()
    prefetched.current = null
    setCardLink(null)
    setCopied(false)
    setError(null)
  }, [open, moltId])

  // Invalidate any in-flight preview when the modal closes.
  useEffect(() => {
    if (!open) reqId.current += 1
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getShareDefaults(token, app, kind)
      .then((d) => { if (!cancelled) { setFields(d.fields); setFrame(d.frame) } })
      .catch(() => { if (!cancelled) setFields(FIELDS[`${app}:${kind}`]) })
    listSharePhotos(token, app, animalId)
      .then((ps) => { if (!cancelled) setPhotos(ps) })
      .catch(() => { if (!cancelled) setPhotos([]) })
    return () => { cancelled = true }
  }, [open, token, app, kind, moltId, animalId])

  // A link belongs to one frame+fields+shape+photo combination; changing any clears it.
  useEffect(() => {
    setCardLink((cur) => (cur && cur.key !== key ? null : cur))
  }, [key])

  const cachedUrl = (k: string) => {
    const hit = cache.current.get(k)
    return hit && Date.now() - hit.at < PREVIEW_TTL_MS ? hit.url : null
  }
  const requestPreview = async (f: string[], s: CardShape, fr: CardFrame, ph: string | null) => {
    const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields: f, shape: s, frame: fr, photo_id: ph, link: false, preview: true })
    return previewImageUrl(r.image_url)
  }

  // Debounced live preview: each toggle re-requests a token-signed image,
  // unless that exact card was already drawn this session.
  useEffect(() => {
    if (!open || !fields) return
    if (timer.current) clearTimeout(timer.current)
    if (fields.length === 0) {
      reqId.current += 1
      setPreview(null)
      setLoading(false)
      setError(null)
      return
    }
    const k = keyFor(fields, shape, frame, photoId)
    const hit = cachedUrl(k)
    setError(null)
    setLoading(true)
    if (hit) {
      reqId.current += 1
      setPreview(hit)
      if (hit === loadedUrl.current) setLoading(false)
      return
    }
    timer.current = setTimeout(async () => {
      const id = ++reqId.current
      try {
        const url = await requestPreview(fields, shape, frame, photoId)
        cache.current.set(k, { url, at: Date.now() })
        if (id !== reqId.current) return
        setPreview(url)
      } catch (e) {
        if (id !== reqId.current) return
        setLoading(false)
        setError(e instanceof Error ? e.message : GENERIC_ERROR)
      }
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fields, shape, frame, photoId, token, app, animalId, kind, moltId])

  /** Once the current preview shows, quietly draw the other two frames so
   *  switching frame is instant. Once per fields/shape/photo combination. */
  const prefetchOtherFrames = () => {
    if (!fields || fields.length === 0) return
    const combo = keyFor(fields, shape, 'specimen', photoId)
    if (prefetched.current === combo) return
    prefetched.current = combo
    const f = fields, s = shape, ph = photoId
    FRAMES.filter((x) => x.key !== frame).forEach(async ({ key: fr }) => {
      const k = keyFor(f, s, fr, ph)
      if (cachedUrl(k)) return
      try {
        const url = await requestPreview(f, s, fr, ph)
        cache.current.set(k, { url, at: Date.now() })
        const img = new window.Image()
        img.src = url
      } catch { /* best effort */ }
    })
  }

  // Dialog behaviour: focus in, Escape closes, body scroll locked, focus restored.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  if (!open) return null
  const all = FIELDS[`${app}:${kind}`] ?? []
  const noFields = !!fields && fields.length === 0
  const toggle = (f: string) => setFields((cur) => (cur ?? []).includes(f) ? (cur ?? []).filter((x) => x !== f) : [...(cur ?? []), f])
  const shownLink = cardLink && cardLink.key === key ? cardLink.url : null

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const copyLink = async () => {
    if (!shownLink) return
    try {
      await navigator.clipboard.writeText(shownLink)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the link stays visible to copy by hand */
    }
  }

  const finish = async () => {
    if (!fields || fields.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const reuse = link && !!shownLink
      const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, frame, photo_id: photoId, link: reuse ? false : link })
      const url = reuse ? shownLink : r.card_link
      if (!reuse && r.card_link) setCardLink({ url: r.card_link, key })
      // Full-size JPEG: ~10x smaller than the PNG, indistinguishable on a feed.
      const blob = await fetch(shareImageUrl(r.image_url)).then((x) => {
        if (!x.ok) throw new Error(GENERIC_ERROR)
        return x.blob()
      })
      const file = new File([blob], `${kind}-card.jpg`, { type: 'image/jpeg' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], ...(url ? { url } : {}) })
        } catch (e) {
          // Lost user activation (the awaits above outlasted it): download instead.
          if ((e as Error)?.name === 'NotAllowedError') download(blob, file.name)
          else throw e
        }
      } else {
        download(blob, file.name)
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog" aria-modal="true" aria-label={kind === 'molt' ? 'Share molt' : 'Share card'}
      onClick={onClose}
    >
      <div
        ref={panelRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl p-6 grid md:grid-cols-2 gap-6 outline-none"
      >
        <div className="flex items-center justify-center bg-neutral-900 rounded-lg min-h-[320px]">
          {noFields
            ? <span className="text-neutral-500 text-sm px-4 text-center">Pick at least one thing to show.</span>
            : preview
              ? (
                <div className="relative flex items-center justify-center" aria-busy={loading}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview} alt={loading ? 'Updating card preview' : 'Card preview'}
                    onLoad={() => { loadedUrl.current = preview; setLoading(false); prefetchOtherFrames() }} onError={() => setLoading(false)}
                    className={`max-h-[480px] rounded transition-opacity ${loading ? 'opacity-40' : 'opacity-100'}`}
                  />
                  {loading ? (
                    <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                      <span className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    </span>
                  ) : null}
                </div>
              )
              : (
                <span className="flex flex-col items-center gap-3 text-neutral-500" role="status">
                  <span className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" aria-hidden="true" />
                  Drawing your card…
                </span>
              )}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white tracking-wide">{kind === 'molt' ? 'Share molt' : 'Share card'}</h2>
          <div className="flex gap-3" role="group" aria-label="Frame">
            {FRAMES.map((f) => (
              <button key={f.key} onClick={() => setFrame(f.key)} aria-pressed={frame === f.key} className="flex flex-col items-center gap-1">
                <span
                  className={`block overflow-hidden rounded ${frame === f.key ? 'border-[1.5px] border-emerald-500' : 'border border-neutral-700'}`}
                  style={{ width: 56, height: 70 }}
                >
                  <FrameThumb frame={f.key} />
                </span>
                <span className={`text-[10px] ${frame === f.key ? 'text-neutral-100' : 'text-neutral-400'}`}>{f.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['story', 'post', 'square'] as CardShape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} aria-pressed={shape === s}
                className={`px-3 py-1 rounded-full text-sm border transition ${shape === s ? 'bg-emerald-600 text-white border-emerald-600' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'}`}>
                {s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}
              </button>
            ))}
          </div>
          {photos.length > 1 && fields?.includes('photo') ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Photo</span>
              <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Photo for this card">
                {photos.map((ph, i) => {
                  const on = ph.id === (photoId ?? photos.find((x) => x.is_main)?.id)
                  return (
                    <button
                      key={ph.id} onClick={() => setPhotoId(ph.is_main ? null : ph.id)} aria-pressed={on}
                      aria-label={ph.is_main ? 'Main photo' : `Photo ${i + 1}`}
                      className={`shrink-0 w-14 h-14 rounded-md overflow-hidden ${on ? 'border-2 border-emerald-500' : 'border border-neutral-700'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.thumbnail_url || ph.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          <fieldset className="border border-neutral-800 rounded-lg divide-y divide-neutral-800">
            <legend className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider px-1">On this card</legend>
            {all.map((f) => (
              <label key={f} className="flex items-center justify-between px-3 py-2 text-sm text-white">
                {FIELD_LABELS[f]}
                <input type="checkbox" className="accent-emerald-600" checked={!!fields?.includes(f)} onChange={() => toggle(f)} />
              </label>
            ))}
          </fieldset>
          <label className="flex items-start justify-between gap-3 text-sm text-white border border-neutral-800 rounded-lg px-3 py-2">
            <span>
              Make a link to this card
              <span className="block text-xs text-neutral-400">Shows only this card. Doesn&apos;t change who can see your animals. You can turn it off later.</span>
            </span>
            <input type="checkbox" className="accent-emerald-600" checked={link} onChange={(e) => setLink(e.target.checked)} />
          </label>
          {shownLink ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-neutral-300 break-all">{shownLink}</p>
              <button onClick={copyLink} className="shrink-0 px-2 py-1 rounded-md border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-300 hover:text-white transition">
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ) : null}
          {error ? <p className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200" role="alert">{error}</p> : null}
          <div className="flex gap-2 mt-auto">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 transition">Close</button>
            <button onClick={finish} disabled={busy || !fields || noFields} className="flex-1 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? 'Preparing…' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
