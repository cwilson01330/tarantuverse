'use client'
/**
 * Share-card composer (spec §4.4). Live preview, shape chips, field toggles,
 * optional card link. Nothing here changes any app setting (spec §6).
 * HV is dark-only: palette copied from PauseFeedingDialog, no `dark:` variants.
 */
import { useEffect, useRef, useState } from 'react'
import { CardApp, CardKind, CardShape, FIELDS, FIELD_LABELS, createShareCard, getShareDefaults } from '@/lib/shareCards'

const GENERIC_ERROR = "Couldn't make the card. Try again."

export default function ShareCardModal({
  open, onClose, app, animalId, kind, moltId, token,
}: {
  open: boolean; onClose: () => void; app: CardApp; animalId: string; kind: CardKind; moltId?: string; token: string
}) {
  const [shape, setShape] = useState<CardShape>('post')
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

  const key = fields ? `${shape}|${[...fields].sort().join(',')}` : ''

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
      .then((f) => { if (!cancelled) setFields(f) })
      .catch(() => { if (!cancelled) setFields(FIELDS[`${app}:${kind}`]) })
    return () => { cancelled = true }
  }, [open, token, app, kind, moltId])

  // A link belongs to one fields+shape combination; changing either clears it.
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
        const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, link: false, preview: true })
        if (id !== reqId.current) return
        setPreview(r.image_url)
      } catch (e) {
        if (id !== reqId.current) return
        setError(e instanceof Error ? e.message : GENERIC_ERROR)
      }
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [open, fields, shape, token, app, animalId, kind, moltId])

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
      const r = await createShareCard(token, { app, animal_id: animalId, kind, molt_id: moltId, fields, shape, link: reuse ? false : link })
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
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="Card preview" className="max-h-[480px] rounded" />
              : <span className="text-neutral-500">Preparing preview…</span>}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white tracking-wide">{kind === 'molt' ? 'Share molt' : 'Share card'}</h2>
          <div className="flex gap-2">
            {(['story', 'post', 'square'] as CardShape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} aria-pressed={shape === s}
                className={`px-3 py-1 rounded-full text-sm border transition ${shape === s ? 'bg-emerald-600 text-white border-emerald-600' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'}`}>
                {s === 'story' ? 'Story' : s === 'post' ? 'Post' : 'Square'}
              </button>
            ))}
          </div>
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
