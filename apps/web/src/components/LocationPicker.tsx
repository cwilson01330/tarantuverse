'use client'

/**
 * LocationPicker — pick-first, type-second.
 *
 * Lists the keeper's EXISTING locations so choosing one is the primary path;
 * typing a new one is possible but secondary, and the moment the typed text
 * matches an existing location case-insensitively the dialog says
 * "Use existing: …" and returns that spelling. Everything is still
 * canonicalised server-side; this is about making the near-duplicate hard to
 * create in the first place.
 *
 * `LocationField` is the form control; `LocationDialog` is the bare dialog for
 * bulk actions; `LocationRenameDialog` renames (or merges) from a group header.
 */
import { useEffect, useMemo, useState } from 'react'
import { listLocations, locationKey, type LocationItem } from '@/lib/locations'

const MAX_LEN = 40

interface DialogProps {
  open: boolean
  token: string | null
  title?: string
  value?: string | null
  /** Pre-fetched list; when omitted the dialog fetches on open. */
  locations?: LocationItem[]
  allowClear?: boolean
  confirmLabel?: string
  onClose: () => void
  onPick: (location: string | null) => void
}

export function LocationDialog({
  open,
  token,
  title = 'Location',
  value,
  locations: given,
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
    if (given || !token) return
    listLocations(token).then(setFetched).catch(() => setFetched([]))
  }, [open, given, token])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>

        {locations.length > 0 && (
          <ul className="mt-3 max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
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
                    className={`flex w-full items-center gap-3 px-2 py-2.5 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      active ? 'text-primary-600 dark:text-primary-400 font-semibold' : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <span aria-hidden>📍</span>
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{l.count}</span>
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
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <span aria-hidden>∅</span>
                  <span className="flex-1">No location</span>
                </button>
              </li>
            )}
          </ul>
        )}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {locations.length ? 'Or add a new one' : 'Name a place — a room, rack or shelf'}
        </label>
        <div className="mt-1 flex gap-2">
          <input
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
            placeholder="e.g. Back room, Rack 2"
            autoFocus={locations.length === 0}
            className="flex-1 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={commitTyped}
            disabled={!typedKey}
            className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            {existingMatch ? 'Use' : confirmLabel ?? 'Add'}
          </button>
        </div>
        {existingMatch && (
          <p className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400">Use existing: {existingMatch.name}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

interface FieldProps {
  token: string | null
  value: string | null | undefined
  onChange: (location: string | null) => void
  placeholder?: string
  id?: string
}

/** Field-shaped trigger for add/edit forms. */
export function LocationField({ token, value, onChange, placeholder = 'Room, rack or shelf (optional)', id }: FieldProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          id={id}
          onClick={() => setOpen(true)}
          className={`flex flex-1 items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-primary-600 ${
            value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
          }`}
          aria-label={value ? `Location, ${value}` : 'Location, not set'}
        >
          <span aria-hidden>📍</span>
          <span className="flex-1 truncate">{value || placeholder}</span>
          <span aria-hidden className="text-gray-400">▾</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg px-3 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Clear location"
          >
            Clear
          </button>
        )}
      </div>
      <LocationDialog open={open} token={token} value={value} onClose={() => setOpen(false)} onPick={onChange} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Rename location"
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rename location</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Everything at “{current}” moves with it.</p>
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
            className="flex-1 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={() => onSubmit(text)}
            disabled={!can}
            className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
