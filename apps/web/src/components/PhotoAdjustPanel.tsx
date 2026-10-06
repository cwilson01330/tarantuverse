'use client'
/**
 * "Adjust photo" for share cards (web): drag to move, scroll / pinch / slider
 * to zoom, inside a window shaped like the card's photo slot. Returns a
 * focus point and zoom; the renderer crops around them for every frame and
 * shape. Mirrors the mobile PhotoAdjuster maths.
 */
import { useEffect, useRef, useState } from 'react'
import type { PhotoFocus } from '@/lib/shareCards'

const CENTRE: PhotoFocus = { x: 0.5, y: 0.5, zoom: 1 }
const clampZoom = (z: number) => Math.min(4, Math.max(1, z))

export const ADJUST_THEME = {
  window: 'bg-gray-200 dark:bg-gray-900',
  muted: 'text-gray-500 dark:text-gray-400',
  text: 'text-gray-900 dark:text-white',
  outline: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
  primary: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
}

export default function PhotoAdjustPanel({
  url, aspect, value, onCancel, onDone, theme = ADJUST_THEME,
}: {
  url: string
  aspect: number
  value: PhotoFocus | null
  onCancel: () => void
  /** null = automatic framing */
  onDone: (f: PhotoFocus | null) => void
  theme?: typeof ADJUST_THEME
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [focus, setFocus] = useState<PhotoFocus>(value ?? CENTRE)
  useEffect(() => { setSize(null) }, [url])

  const maxW = 340
  const maxH = 440
  let winW = maxW
  let winH = maxW / aspect
  if (winH > maxH) { winH = maxH; winW = maxH * aspect }

  const clamp = (f: PhotoFocus): PhotoFocus => {
    if (!size) return f
    const zoom = clampZoom(f.zoom)
    const s = Math.max(winW / size.w, winH / size.h) * zoom
    const hx = Math.min(0.5, winW / (2 * size.w * s))
    const hy = Math.min(0.5, winH / (2 * size.h * s))
    return { zoom, x: Math.min(1 - hx, Math.max(hx, f.x)), y: Math.min(1 - hy, Math.max(hy, f.y)) }
  }

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const anchor = useRef({ focus: CENTRE, cx: 0, cy: 0, dist: 0 })
  const centroid = () => {
    const ps = [...pointers.current.values()]
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length
    const cy = ps.reduce((a, p) => a + p.y, 0) / ps.length
    const dist = ps.length >= 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0
    return { cx, cy, dist }
  }
  const reanchor = (f: PhotoFocus) => { if (pointers.current.size) anchor.current = { focus: f, ...centroid() } }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    reanchor(focus)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !size) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const a = anchor.current
    const c = centroid()
    const zoom = a.dist > 0 && c.dist > 0 ? a.focus.zoom * (c.dist / a.dist) : a.focus.zoom
    const s = Math.max(winW / size.w, winH / size.h) * a.focus.zoom
    setFocus(clamp({ zoom, x: a.focus.x - (c.cx - a.cx) / (size.w * s), y: a.focus.y - (c.cy - a.cy) / (size.h * s) }))
  }
  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    reanchor(focus)
  }

  const f = clamp(focus)
  const s = size ? Math.max(winW / size.w, winH / size.h) * f.zoom : 1
  const dispW = (size?.w ?? 0) * s
  const dispH = (size?.h ?? 0) * s

  return (
    <div className="flex flex-col items-center gap-3 w-full py-4">
      <div
        className={`relative overflow-hidden rounded select-none cursor-grab active:cursor-grabbing ${theme.window}`}
        style={{ width: winW, height: winH, touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onWheel={(e) => setFocus((cur) => clamp({ ...cur, zoom: clampZoom(cur.zoom - e.deltaY * 0.002) }))}
        role="img" aria-label="Photo. Drag to move, scroll or pinch to zoom."
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt="" draggable={false}
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="absolute max-w-none pointer-events-none"
          style={size ? { width: dispW, height: dispH, left: winW / 2 - f.x * dispW, top: winH / 2 - f.y * dispH } : { opacity: 0 }}
        />
      </div>
      <span className={`text-xs ${theme.muted}`}>Drag to move · scroll or pinch to zoom</span>
      <label className={`flex items-center gap-2 text-sm ${theme.text}`}>
        Zoom
        <input
          type="range" min={1} max={4} step={0.05} value={f.zoom}
          onChange={(e) => setFocus((cur) => clamp({ ...cur, zoom: Number(e.target.value) }))}
          aria-label="Zoom"
        />
        <span className={`w-10 text-right ${theme.muted}`}>{f.zoom.toFixed(1)}×</span>
      </label>
      <div className="flex gap-2">
        <button onClick={onCancel} className={`px-3 py-1.5 rounded-lg text-sm ${theme.outline}`}>Cancel</button>
        <button onClick={() => onDone(null)} className={`px-3 py-1.5 rounded-lg text-sm ${theme.outline}`}>Automatic</button>
        <button onClick={() => onDone(f)} disabled={!size} className={`px-3 py-1.5 rounded-lg text-sm disabled:opacity-60 ${theme.primary}`}>Done</button>
      </div>
    </div>
  )
}
