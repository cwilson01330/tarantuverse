'use client'

/**
 * LocationPicker — pick-first, type-second (HV web port of the Tarantuverse
 * picker).
 *
 * Lists the keeper's EXISTING locations so choosing one is the primary path;
 * typing a new one is possible but secondary, and the moment the typed text
 * matches an existing location case-insensitively the dialog says
 * "Use existing: …" and returns that spelling. Everything is still
 * canonicalised server-side; this is about making the near-duplicate hard to
 * create in the first place.
 *
 * `LocationField` is the form control; `LocationDialog` is the bare dialog;
 * `LocationRenameDialog` renames (or merges) from a group header.
 */

import { useEffect, useMemo, useState } from 'react'
import { listLocations, locationKey, type LocationItem } from '@/lib/locations'

const MAX_LEN = 40

const INPUT_CLS =
  'flex-1 min-w-0 px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:border-herp-teal'
const PRIMARY_BTN =
  'px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm font-medium text-herp-teal hover:bg-herp-teal/20 hover:border-herp-teal/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const GHOST_BTN =
  'w-full mt-4 px-4 py-2 rounded-md text-sm text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors'

interface DialogProps {
  open: boolean
  title?: string
  value?: string | null
  /** Pre-fetched list; when omitted the dialog fetches on open. */
  locations?: LocationItem[]
  /** Owner's user id when working inside a shared collection. */
  collection?: string | null
  allowClear?: boolean
  confirmLabel?: string
  onClose: () => void
  onPick: (location: string | null) => void
}

export function LocationDialog({
  open,
  title = 'Location',
  value,
  locations: given,
  collection,
  allowClear = true,
  confirmLabel,
  onClose,
  onPick,
}: DialogProps) {
  const [fetched, setFetched] = useState<LocationItem[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setText('')
    if (given) return
    let cancelled = false
    listLocations(collection)
      .then((l) => {
        if (!cancelled) setFetched(l)
      })
      .catch(() => {
        if (!cancelled) setFetched([])
      })
    return () => {
      cancelled = true
    }
  }, [open, given, collection])

  const locations = given ?? fetched
  const typedKey = locationKey(text)
  const existingMatch = useMemo(
    () => (typedKey ? locations.find((l) => locationKey(l.name) === typedKey) ?? null : null),
    [locations, typedKey],
  )
  const currentKey = locationKey(value)

  if (!open) return null

  const commitTyped = () => {
    if (!typedKey) return
    onPick(existingMatch ? existingMatch.name : text.replace(/\s+/g, ' ').trim())
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      >
        <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>

        {locations.length > 0 && (
          <ul className="mt-3 max-h-64 overflow-y-auto divide-y divide-neutral-800/70">
            {locations.map((l) => {
              const active = currentKey != null && locationKey(l.name) === currentKey
              return (
                <li key={l.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(l.name)
                      onClose()
                    }}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 px-2 py-2.5 text-left rounded-md hover:bg-neutral-900 transition-colors ${
                      active ? 'text-herp-lime font-semibold' : 'text-neutral-100'
                    }`}
                  >
                    <span aria-hidden="true">📍</span>
                    <span className="flex-1 truncate text-sm">{l.name}</span>
                    <span className="text-xs tabular-nums text-neutral-500">{l.count}</span>
                  </button>
                </li>
              )
            })}
            {allowClear && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onPick(null)
                    onClose()
                  }}
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors"
                >
                  <span aria-hidden="true">∅</span>
                  <span className="flex-1 text-sm">No location</span>
                </button>
              </li>
            )}
          </ul>
        )}

        <label
          htmlFor="location-new"
          className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-neutral-500"
        >
          {locations.length ? 'Or add a new one' : 'Name a place — a room, rack or shelf'}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="location-new"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTyped()
              }
            }}
            maxLength={MAX_LEN}
            placeholder="e.g. Reptile room, Rack 2"
            autoFocus={locations.length === 0}
            className={INPUT_CLS}
          />
          <button type="button" onClick={commitTyped} disabled={!typedKey} className={PRIMARY_BTN}>
            {existingMatch ? 'Use' : confirmLabel ?? 'Add'}
          </button>
        </div>
        {existingMatch && (
          <p className="mt-2 text-xs font-medium text-herp-teal">Use existing: {existingMatch.name}</p>
        )}

        <button type="button" onClick={onClose} className={GHOST_BTN}>
          Cancel
        </button>
      </div>
    </div>
  )
}

interface FieldProps {
  value: string | null | undefined
  onChange: (location: string | null) => void
  placeholder?: string
  id?: string
  /** Owner's user id when adding/editing inside a shared collection. */
  collection?: string | null
}

/** Field-shaped trigger for add/edit forms. */
export function LocationField({
  value,
  onChange,
  placeholder = 'Room, rack or shelf (optional)',
  id,
  collection,
}: FieldProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          id={id}
          onClick={() => setOpen(true)}
          className={`flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm text-left rounded-md bg-neutral-900 border border-neutral-800 focus:outline-none focus:border-herp-teal hover:border-neutral-700 transition-colors ${
            value ? 'text-white' : 'text-neutral-600'
          }`}
          aria-label={value ? `Location, ${value}` : 'Location, not set'}
        >
          <span aria-hidden="true">📍</span>
          <span className="flex-1 truncate">{value || placeholder}</span>
          <span aria-hidden="true" className="text-neutral-500">▾</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-3 rounded-md text-xs text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
            aria-label="Clear location"
          >
            Clear
          </button>
        )}
      </div>
      <LocationDialog open={open} value={value} collection={collection} onClose={() => setOpen(false)} onPick={onChange} />
    </>
  )
}

interface RenameProps {
  open: boolean
  current: string
  onClose: () => void
  onSubmit: (next: string) => void
}

/** Rename a location from its group header. Renaming onto a name that
 *  already exists is a merge — the caller confirms with the count first. */
export function LocationRenameDialog({ open, current, onClose, onSubmit }: RenameProps) {
  const [text, setText] = useState(current)
  useEffect(() => {
    if (open) setText(current)
  }, [open, current])
  if (!open) return null
  const key = locationKey(text)
  const unchanged = key === locationKey(current)
  const can = !!key && !unchanged
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rename location"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      >
        <h2 className="text-sm font-semibold text-white tracking-wide">Rename location</h2>
        <p className="mt-1 text-xs text-neutral-400">Everything at “{current}” moves with it.</p>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && can) {
                e.preventDefault()
                onSubmit(text)
              }
            }}
            maxLength={MAX_LEN}
            autoFocus
            aria-label="New location name"
            className={INPUT_CLS}
          />
          <button type="button" onClick={() => onSubmit(text)} disabled={!can} className={PRIMARY_BTN}>
            Save
          </button>
        </div>
        <button type="button" onClick={onClose} className={GHOST_BTN}>
          Cancel
        </button>
      </div>
    </div>
  )
}
