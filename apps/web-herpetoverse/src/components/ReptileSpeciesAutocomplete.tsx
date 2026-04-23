'use client'

/**
 * Reptile species autocomplete. Debounced 300ms against /reptile-species/search.
 *
 * Two pieces of state leave this component:
 *   - `speciesId`  → reptile_species_id on the snake record (links care sheet
 *                     + feeding intelligence — without this the prey-suggestion
 *                     endpoint can't compute stage/prey ranges).
 *   - `scientificName` → cached on the snake record too, so list/detail views
 *                         don't need a species round-trip.
 *
 * Keyboard: ArrowUp/Down move focus, Enter selects, Escape closes. Mouse: click
 * to select. Clicking outside closes the dropdown.
 */

import { useEffect, useRef, useState } from 'react'
import {
  CARE_LEVEL_LABELS,
  searchReptileSpecies,
  type ReptileSpeciesSearchResult,
} from '@/lib/reptileSpecies'

interface Props {
  /** The currently selected species id, if any. */
  speciesId: string | null
  /** The currently displayed text in the input (scientific name or free-text). */
  scientificName: string
  /**
   * Emitted on every input change. `id` is null when the user is typing a
   * free-text value that doesn't match a selected species.
   */
  onChange: (value: { id: string | null; scientificName: string }) => void
  /**
   * Emitted when the user picks a species from the dropdown. Parent uses this
   * to auto-fill common_name on the form.
   */
  onPick?: (species: ReptileSpeciesSearchResult) => void
  placeholder?: string
  autoFocus?: boolean
}

const DEBOUNCE_MS = 300

export default function ReptileSpeciesAutocomplete({
  speciesId,
  scientificName,
  onChange,
  onPick,
  placeholder = 'Python regius',
  autoFocus = false,
}: Props) {
  const [query, setQuery] = useState(scientificName)
  const [results, setResults] = useState<ReptileSpeciesSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the input synced if the parent resets scientificName.
  useEffect(() => {
    setQuery(scientificName)
  }, [scientificName])

  // Debounced search. The dependency on `query` + `speciesId` means picking
  // a result (which sets speciesId) cancels an in-flight search from the same
  // keystroke.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    // If the current query exactly equals the selected species name, don't
    // reopen the dropdown — that fights the user after a selection.
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const data = await searchReptileSpecies(trimmed, 8)
        setResults(data)
        setHighlight(data.length > 0 ? 0 : -1)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, speciesId])

  // Close on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setQuery(next)
    setOpen(true)
    // Once the user edits, the current selection is stale.
    onChange({ id: null, scientificName: next })
  }

  function pick(species: ReptileSpeciesSearchResult) {
    setQuery(species.scientific_name)
    setOpen(false)
    setResults([])
    onChange({
      id: species.id,
      scientificName: species.scientific_name,
    })
    onPick?.(species)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setOpen(true)
        setHighlight(0)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlight((h) => Math.min(h + 1, results.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlight((h) => Math.max(h - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < results.length) {
        pick(results[highlight])
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown =
    open && (loading || results.length > 0) && query.trim().length >= 2

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="reptile-species-listbox"
        className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600 italic"
      />
      {speciesId && query === scientificName && (
        <div className="mt-1.5 text-[11px] text-herp-teal/80 flex items-center gap-1">
          <span aria-hidden="true">✓</span>
          <span>Linked to care sheet — prey suggestions will use this species.</span>
        </div>
      )}
      {!speciesId && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="mt-1.5 text-[11px] text-neutral-500">
          No match in our library. You can still save — prey suggestions will be
          disabled until a matching species is picked.
        </div>
      )}
      {showDropdown && (
        <ul
          id="reptile-species-listbox"
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 shadow-xl"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-neutral-500">Searching…</li>
          )}
          {!loading &&
            results.map((s, i) => {
              const common = s.common_names[0] || null
              const isActive = i === highlight
              return (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    // mousedown fires before blur, preventing close-before-pick.
                    e.preventDefault()
                    pick(s)
                  }}
                  className={`px-3 py-2 cursor-pointer border-b border-neutral-900 last:border-b-0 ${
                    isActive
                      ? 'bg-neutral-900/80'
                      : 'hover:bg-neutral-900/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white italic truncate">
                        {s.scientific_name}
                      </div>
                      {common && (
                        <div className="text-xs text-neutral-400 truncate">
                          {common}
                        </div>
                      )}
                    </div>
                    {s.care_level && (
                      <span className="flex-shrink-0 text-[10px] uppercase tracking-widest text-neutral-400 px-2 py-0.5 rounded border border-neutral-800">
                        {CARE_LEVEL_LABELS[s.care_level]}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
