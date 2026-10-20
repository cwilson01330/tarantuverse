'use client'

/**
 * "Care sheet for a sitter" — pick animals (all, a whole location, or one by
 * one), add an optional note, and open a print-ready page in a new tab.
 * API: routers/care_sheets.py. Used on the collection page.
 * Copy of apps/web/src/components/CareSheetDialog.tsx in Herpetoverse's
 * dark styling.
 */
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { ANIMAL_TAXA, type AnimalTaxon } from '@/lib/animals'
import { groupByLocation } from '@/lib/locations'
import { useUnits } from '@/components/UnitsProvider'
import {
  CARE_SHEET_MAX_ANIMALS,
  CARE_SHEET_NOTE_MAX,
  openPlaceholderTab,
  type CareSheetCandidate,
} from '@/lib/careSheet'

interface Props {
  open: boolean
  onClose: () => void
}

function title(c: CareSheetCandidate): string {
  const meta = c.taxon ? ANIMAL_TAXA[c.taxon as AnimalTaxon] : undefined
  return c.name || c.common_name || c.scientific_name || meta?.label || 'Unnamed'
}

function glyph(c: CareSheetCandidate): string {
  const meta = c.taxon ? ANIMAL_TAXA[c.taxon as AnimalTaxon] : undefined
  return meta?.glyph ?? '🦎'
}

export default function CareSheetDialog({ open, onClose }: Props) {
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
    if (!open) return
    setCandidates(null)
    setLoadError(null)
    setSelected(new Set())
    setNote('')
    setError(null)
    setMade(null)
    setCopied(false)
    apiFetch<CareSheetCandidate[]>('/api/v1/sitter-passes/candidates?app=herpetoverse')
      .then(setCandidates)
      .catch((e: Error) => setLoadError(e.message || 'Could not load your animals'))
  }, [open])

  const groups = useMemo(
    () => (candidates ? groupByLocation(candidates, (c) => c.location) : []),
    [candidates],
  )
  const hasLocations = groups.some((g) => g.rows.some((c) => !!c.location))

  if (!open) return null

  const all = candidates ?? []
  const allSelected = all.length > 0 && all.every((c) => selected.has(c.id))
  const tooMany = selected.size > CARE_SHEET_MAX_ANIMALS

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((k) => (on ? next.add(k) : next.delete(k)))
      return next
    })

  const submit = async () => {
    if (selected.size === 0 || tooMany) return
    const tab = openPlaceholderTab()
    setBusy(true)
    setError(null)
    try {
      const out = await apiFetch<{ url: string; expires_at: string }>('/api/v1/care-sheets/', {
        method: 'POST',
        json: {
          app: 'herpetoverse',
          animal_ids: all.filter((c) => selected.has(c.id)).map((c) => c.id),
          note: note.trim() || null,
          units,
          tz_offset_minutes: new Date().getTimezoneOffset(),
        },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Care sheet for a sitter"
      >
        <div className="p-6 pb-3">
          <h2 className="text-lg font-semibold text-white">Care sheet for a sitter</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Pick the animals your sitter looks after. You&apos;ll get a printable page with feeding, safety and
            enclosure details. The link works for 24 hours.
          </p>
        </div>

        {made ? (
          <div className="px-6 pb-6">
            <p className="text-sm text-neutral-200">
              {made.opened ? 'Your care sheet is open in a new tab — print it from there.' : 'Your care sheet is ready.'}
            </p>
            <a
              href={made.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20"
            >
              Open care sheet
            </a>
            <button
              type="button"
              onClick={copy}
              className="ml-2 px-4 py-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:text-white hover:border-neutral-700"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Anyone with the link can see this sheet until it expires. It shows no prices, sources or private notes.
            </p>
            <div className="mt-4 text-right">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm text-neutral-300 hover:text-white">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 flex items-center justify-between gap-2 text-sm">
              <span className={tooMany ? 'text-red-400 font-semibold' : 'text-neutral-400'}>
                {selected.size} selected{tooMany ? ` — up to ${CARE_SHEET_MAX_ANIMALS} per sheet` : ''}
              </span>
              {all.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(all.map((c) => c.id), !allSelected)}
                  className="font-medium text-herp-teal hover:underline"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>

            <div className="mt-2 mx-6 flex-1 min-h-[8rem] overflow-y-auto rounded-md border border-neutral-800">
              {loadError ? (
                <p className="p-4 text-sm text-red-400">{loadError}</p>
              ) : candidates == null ? (
                <p className="p-4 text-sm text-neutral-500">Loading your animals…</p>
              ) : all.length === 0 ? (
                <p className="p-4 text-sm text-neutral-500">No active animals to put on a sheet.</p>
              ) : (
                groups.map((g) => {
                  const ids = g.rows.map((c) => c.id)
                  const groupAll = ids.every((k) => selected.has(k))
                  return (
                    <div key={g.key}>
                      {hasLocations && (
                        <div className="sticky top-0 flex items-center justify-between gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800">
                          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                            📍 {g.label} ({g.rows.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(ids, !groupAll)}
                            className="text-xs font-medium text-herp-teal hover:underline"
                          >
                            {groupAll ? 'Clear' : `Select all in ${g.label}`}
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-neutral-900">
                        {g.rows.map((c) => (
                          <li key={c.id}>
                            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-900/60">
                              <input
                                type="checkbox"
                                checked={selected.has(c.id)}
                                onChange={(e) => toggle([c.id], e.target.checked)}
                                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-herp-teal"
                              />
                              <span aria-hidden>{glyph(c)}</span>
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-neutral-100">{title(c)}</span>
                                {c.scientific_name && c.scientific_name !== title(c) && (
                                  <span className="block truncate text-xs italic text-neutral-500">{c.scientific_name}</span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-6 pt-4">
              <label htmlFor="hv-care-sheet-note" className="block text-sm font-medium mb-1 text-neutral-300">
                Note for your sitter (optional)
              </label>
              <textarea
                id="hv-care-sheet-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, CARE_SHEET_NOTE_MAX))}
                rows={3}
                placeholder="e.g. Back Sunday evening. Frozen rodents are in the garage freezer."
                className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-herp-teal"
              />
              <p className="text-right text-xs text-neutral-500">
                {note.length}/{CARE_SHEET_NOTE_MAX}
              </p>
              {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
            </div>

            <div className="p-6 pt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm text-neutral-300 hover:text-white">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || selected.size === 0 || tooMany}
                className="px-4 py-2 rounded-md border border-herp-teal/40 bg-herp-teal/10 text-sm text-herp-teal hover:bg-herp-teal/20 disabled:opacity-50"
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
