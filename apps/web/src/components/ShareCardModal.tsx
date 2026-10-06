'use client'
/**
 * Share-card composer (spec §4.4). Live preview, shape chips, field toggles,
 * optional card link. Nothing here changes any app setting (spec §6).
 */
import { useEffect, useRef, useState } from 'react'
import { CardApp, CardFrame, CardKind, CardShape, FIELDS, FIELD_LABELS, FRAMES, createShareCard, getShareDefaults } from '@/lib/shareCards'

const GENERIC_ERROR = "Couldn't make the card. Try again."

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

  const key = fields ? `${frame}|${shape}|${[...fields].sort().join(',')}` : ''

  // Reset per open / per molt so nothing stale from a previous card shows.
  useEffect(() => {
    if (!open) return
    setPreview(null)
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
    return () => { cancelled = true }
  }, [open, token, app, kind, moltId])

  // A link belongs to one frame+fields+shape combination; changing any clears it.
  useEffect(() => {
    setCardLink((cur) => (cur && cur.key !== key ? null : cur))
  }, [key])

  // Debounced live preview: each toggle re-requests a token-signed image.
  useEffect(() => {
    if (!open || !fields) return
    if (timer.current) clearTimeout(timer.current)
    if (fields.length === 0) {
      reqId.current += 1
      setPreview(null)
      setError(null)
      return
    }
    timer.current = setTimeout(async () => {
      const id = ++reqId.current
      try {
        setError(null)
        const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, frame, link: false, preview: true })
        if (id !== reqId.current) return
        setPreview(r.image_url)
      } catch (e) {
        if (id !== reqId.current) return
        setError(e instanceof Error ? e.message : GENERIC_ERROR)
      }
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [open, fields, shape, frame, token, app, animalId, kind, moltId])

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
      const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, frame, link: reuse ? false : link })
      const url = reuse ? shownLink : r.card_link
      if (!reuse && r.card_link) setCardLink({ url: r.card_link, key })
      const blob = await fetch(r.image_url).then((x) => {
        if (!x.ok) throw new Error(GENERIC_ERROR)
        return x.blob()
      })
      const file = new File([blob], `${kind}-card.png`, { type: 'image/png' })
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
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={kind === 'molt' ? 'Share molt' : 'Share card'}
      onClick={onClose}
    >
      <div
        ref={panelRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 grid md:grid-cols-2 gap-6 border border-gray-200 dark:border-gray-700 outline-none"
      >
        <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg min-h-[320px]">
          {noFields
            ? <span className="text-gray-500 dark:text-gray-400 text-sm px-4 text-center">Pick at least one thing to show.</span>
            : preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="Card preview" className="max-h-[480px] rounded" />
              : <span className="text-gray-500 dark:text-gray-400">Preparing preview…</span>}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{kind === 'molt' ? 'Share molt' : 'Share card'}</h2>
          <div className="flex gap-3" role="group" aria-label="Frame">
            {FRAMES.map((f) => (
              <button key={f.key} onClick={() => setFrame(f.key)} aria-pressed={frame === f.key} className="flex flex-col items-center gap-1">
                <span
                  className={`block overflow-hidden rounded ${frame === f.key ? 'border-[1.5px] border-gray-900 dark:border-white' : 'border border-gray-300 dark:border-gray-600'}`}
                  style={{ width: 56, height: 70 }}
                >
                  <FrameThumb frame={f.key} />
                </span>
                <span className={`text-[10px] ${frame === f.key ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{f.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['story', 'post', 'square'] as CardShape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} aria-pressed={shape === s}
                className={`px-3 py-1 rounded-full text-sm border ${shape === s ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                {s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}
              </button>
            ))}
          </div>
          <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            <legend className="text-xs text-gray-500 dark:text-gray-400 px-1">On this card</legend>
            {all.map((f) => (
              <label key={f} className="flex items-center justify-between px-3 py-2 text-sm text-gray-900 dark:text-white">
                {FIELD_LABELS[f]}
                <input type="checkbox" checked={!!fields?.includes(f)} onChange={() => toggle(f)} />
              </label>
            ))}
          </fieldset>
          <label className="flex items-start justify-between gap-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <span>
              Make a link to this card
              <span className="block text-xs text-gray-500 dark:text-gray-400">Shows only this card. Doesn&apos;t change who can see your animals. You can turn it off later.</span>
            </span>
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
          </label>
          {shownLink ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-gray-600 dark:text-gray-300 break-all">{shownLink}</p>
              <button onClick={copyLink} className="shrink-0 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-300">
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p> : null}
          <div className="flex gap-2 mt-auto">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Close</button>
            <button onClick={finish} disabled={busy || !fields || noFields} className="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-60">
              {busy ? 'Preparing…' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
