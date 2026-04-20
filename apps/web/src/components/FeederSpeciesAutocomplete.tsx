'use client'

import { useState, useEffect, useRef } from 'react'

export interface FeederSpeciesOption {
  id: string
  scientific_name: string
  common_names: string[] | null
  category: 'cricket' | 'roach' | 'larvae' | 'other'
  care_level?: 'easy' | 'moderate' | 'hard' | null
  image_url?: string | null
  supports_life_stages: boolean
  default_life_stages?: string[] | null
}

interface FeederSpeciesAutocompleteProps {
  onSelect: (species: FeederSpeciesOption) => void
  onClear?: () => void
  initialValue?: string
  placeholder?: string
  categoryFilter?: 'cricket' | 'roach' | 'larvae' | 'other' | null
}

function categoryEmoji(category: string): string {
  switch (category) {
    case 'cricket':
      return '🦗'
    case 'roach':
      return '🪳'
    case 'larvae':
      return '🐛'
    default:
      return '🦗'
  }
}

export default function FeederSpeciesAutocomplete({
  onSelect,
  onClear,
  initialValue = '',
  placeholder = 'Search feeder species…',
  categoryFilter = null,
}: FeederSpeciesAutocompleteProps) {
  const [query, setQuery] = useState(initialValue)
  const [results, setResults] = useState<FeederSpeciesOption[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const search = async () => {
      if (query.trim().length < 2) {
        setResults([])
        return
      }
      setLoading(true)
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const params = new URLSearchParams({ q: query.trim(), limit: '10' })
        if (categoryFilter) params.set('category', categoryFilter)
        const res = await fetch(`${API_URL}/api/v1/feeder-species/?${params.toString()}`)
        if (res.ok) {
          const data = (await res.json()) as FeederSpeciesOption[]
          setResults(data)
          setIsOpen(true)
        }
      } catch {
        // silent fail — parent form will still work with manual entry
      } finally {
        setLoading(false)
      }
    }

    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [query, categoryFilter])

  const handleSelect = (sp: FeederSpeciesOption) => {
    setQuery(sp.scientific_name)
    setIsOpen(false)
    onSelect(sp)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    if (v.trim().length === 0 && onClear) {
      onClear()
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />

      {loading && (
        <div className="absolute right-3 top-3" aria-hidden="true">
          <div className="animate-spin h-4 w-4 border-2 border-primary-600 border-t-transparent rounded-full" />
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-surface border border-theme rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {results.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => handleSelect(sp)}
              className="w-full px-4 py-3 text-left hover:bg-surface-elevated border-b border-theme last:border-b-0 focus:outline-none focus:bg-surface-elevated"
            >
              <div className="flex items-center gap-3">
                {sp.image_url ? (
                  <img
                    src={sp.image_url}
                    alt=""
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div
                    className="w-10 h-10 bg-surface-elevated rounded flex items-center justify-center text-2xl"
                    aria-hidden="true"
                  >
                    {categoryEmoji(sp.category)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-theme-primary truncate">
                    {sp.scientific_name}
                  </p>
                  {sp.common_names && sp.common_names.length > 0 && (
                    <p className="text-sm text-theme-secondary truncate">
                      {sp.common_names[0]}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-elevated text-theme-tertiary">
                    {sp.category}
                  </span>
                  {sp.care_level && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        sp.care_level === 'easy'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : sp.care_level === 'moderate'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                      }`}
                    >
                      {sp.care_level}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.trim().length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-10 w-full mt-1 bg-surface border border-theme rounded-xl shadow-lg p-4 text-center text-theme-tertiary">
          No feeder species match that search.
        </div>
      )}
    </div>
  )
}
