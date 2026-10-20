'use client'

/**
 * "Care sheet for a sitter" — pick animals (all, a whole location, or one by
 * one), add an optional note, and open a print-ready page in a new tab.
 * API: routers/care_sheets.py. Used on the collection page and Feeding Day.
 */
import { useEffect, useMemo, useState } from 'react'
import { useUnits } from '@/components/UnitsProvider'
import { INVERT_TAXA, isInvertTaxon } from '@/lib/inverts'
import { groupByLocation } from '@/lib/locations'
import {
  CARE_SHEET_MAX_ANIMALS,
  CARE_SHEET_NOTE_MAX,
  createCareSheet,
  listCareSheetCandidates,
  openPlaceholderTab,
  type CareSheetCandidate,
} from '@/lib/care-sheet'

interface Props {
  open: boolean
  token: string | null
  onClose: () => void
}

const keyOf = (c: CareSheetCandidate) => `${c.kind}:${c.id}`

function title(c: CareSheetCandidate): string {
  return (
    c.name ||
    c.common_name ||
    c.scientific_name ||
    (isInvertTaxon(c.taxon) ? INVERT_TAXA[c.taxon].label : 'Unnamed')
  )
}

function glyph(c: CareSheetCandidate): string {
  if (c.kind === 'colony') return '👥'
  return isInvertTaxon(c.taxon) ? INVERT_TAXA[c.taxon].glyph : '🐛'
}

export default function CareSheetDialog({ open, token, onClose }: Props) {
  const { units } = useUnits()
  const [candidates, setCandidates] = useState<CareSheetCandidate[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ url: string; opened: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !token) return
    setCandidates(null)
    setLoadError(null)
    setSelected(new Set())
    setNote('')
    setError(null)
    setMade(null)
    setCopied(false)
    listCareSheetCandidates(token, 'tarantuverse')
      .then(setCandidates)
      .catch((e: Error) => setLoadError(e.message))
  }, [open, token])

  const groups = useMemo(
    () => (candidates ? groupByLocation(candidates, (c) => c.location) : []),
    [candidates],
  )
  const hasLocations = groups.some((g) => g.rows.some((c) => !!c.location))

  if (!open) return null

  const all = candidates ?? []
  const allSelected = all.length > 0 && all.every((c) => selected.has(keyOf(c)))
  const tooMany = selected.size > CARE_SHEET_MAX_ANIMALS

  const toggle = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)))
      return next
    })

  const submit = async () => {
    if (!token || selected.size === 0 || tooMany) return
    // Opened inside the click so pop-up blockers let it through.
    const tab = openPlaceholderTab()
    setBusy(true)
    setError(null)
    try {
      const picked = all.filter((c) => selected.has(keyOf(c)))
      const out = await createCareSheet(token, {
        app: 'tarantuverse',
        animal_ids: picked.filter((c) => c.kind === 'invert').map((c) => c.id),
        colony_ids: picked.filter((c) => c.kind === 'colony').map((c) => c.id),
        note: note.trim() || null,
        units,
      })
      let opened = false
      if (tab && !tab.closed) {
        tab.opener = null
        tab.location.href = out.url
        opened = true
      }
      setMade({ url: out.url, opened })
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : 'Could not make the care sheet')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!made) return
    try {
      await navigator.clipboard.writeText(made.url)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Care sheet for a sitter"
      >
        <div className="p-6 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Care sheet for a sitter</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Pick the animals your sitter looks after. You&apos;ll get a printable page with feeding, safety and
            enclosure details. The link works for 24 hours.
          </p>
        </div>

        {made ? (
          <div className="px-6 pb-6">
            <p className="text-sm text-gray-900 dark:text-white">
              {made.opened ? 'Your care sheet is open in a new tab — print it from there.' : 'Your care sheet is ready.'}
            </p>
            <a
              href={made.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700"
            >
              Open care sheet
            </a>
            <button
              type="button"
              onClick={copy}
              className="ml-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Anyone with the link can see this sheet until it expires. It shows no prices, sources or private notes.
            </p>
            <div className="mt-4 text-right">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 flex items-center justify-between gap-2 text-sm">
              <span className={tooMany ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}>
                {selected.size} selected{tooMany ? ` — up to ${CARE_SHEET_MAX_ANIMALS} per sheet` : ''}
              </span>
              {all.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(all.map(keyOf), !allSelected)}
                  className="font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>

            <div className="mt-2 mx-6 flex-1 min-h-[8rem] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              {loadError ? (
                <p className="p-4 text-sm text-red-600 dark:text-red-400">{loadError}</p>
              ) : candidates == null ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading your animals…</p>
              ) : all.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No active animals to put on a sheet.</p>
              ) : (
                groups.map((g) => {
                  const keys = g.rows.map(keyOf)
                  const groupAll = keys.every((k) => selected.has(k))
                  return (
                    <div key={g.key}>
                      {hasLocations && (
                        <div className="sticky top-0 flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                            📍 {g.label} ({g.rows.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(keys, !groupAll)}
                            className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            {groupAll ? 'Clear' : `Select all in ${g.label}`}
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {g.rows.map((c) => {
                          const k = keyOf(c)
                          return (
                            <li key={k}>
                              <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <input
                                  type="checkbox"
                                  checked={selected.has(k)}
                                  onChange={(e) => toggle([k], e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                                />
                                <span aria-hidden>{glyph(c)}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate font-medium text-gray-900 dark:text-white">{title(c)}</span>
                                  {c.scientific_name && c.scientific_name !== title(c) && (
                                    <span className="block truncate text-xs italic text-gray-500 dark:text-gray-400">{c.scientific_name}</span>
                                  )}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-6 pt-4">
              <label htmlFor="care-sheet-note" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Note for your sitter (optional)
              </label>
              <textarea
                id="care-sheet-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, CARE_SHEET_NOTE_MAX))}
                rows={3}
                placeholder="e.g. Back Sunday evening. Feeders are in the garage."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              />
              <p className="text-right text-xs text-gray-500 dark:text-gray-400">
                {note.length}/{CARE_SHEET_NOTE_MAX}
              </p>
              {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>

            <div className="p-6 pt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || selected.size === 0 || tooMany}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
              >
                {busy ? 'Making sheet…' : 'Make care sheet'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
