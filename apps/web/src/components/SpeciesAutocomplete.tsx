'use client'

import { useState, useEffect, useRef } from 'react'

interface Species {
  id: string
  scientific_name: string
  common_names: string[]
  genus?: string
  care_level?: string
  image_url?: string
}

interface SpeciesAutocompleteProps {
  onSelect: (species: Species) => void
  initialValue?: string
  placeholder?: string
}

export default function SpeciesAutocomplete({ onSelect, initialValue = '', placeholder = 'Search species...' }: SpeciesAutocompleteProps) {
  const [query, setQuery] = useState(initialValue)
  const [results, setResults] = useState<Species[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const searchSpecies = async () => {
      if (query.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const response = await fetch(`${API_URL}/api/v1/species/search?q=${encodeURIComponent(query)}&limit=10`)

        if (response.ok) {
          const data = await response.json()
          setResults(data)
          setIsOpen(true)
        }
      } catch (error) {
        console.error('Failed to search species:', error)
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(searchSpecies, 300)
    return () => clearTimeout(debounce)
  }, [query])

  const handleSelect = (species: Species) => {
    setQuery(species.scientific_name)
    setIsOpen(false)
    onSelect(species)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
        placeholder={placeholder}
      />

      {loading && (
        <div className="absolute right-3 top-3">
          <div className="animate-spin h-4 w-4 border-2 border-primary-600 border-t-transparent rounded-full"></div>
        </div>
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((species) => (
            <button
              key={species.id}
              onClick={() => handleSelect(species)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {species.image_url ? (
                  <img
                    src={species.image_url}
                    alt={species.scientific_name}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-2xl">
                    🕷️
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{species.scientific_name}</p>
                  {species.common_names.length > 0 && (
                    <p className="text-sm text-gray-600">{species.common_names[0]}</p>
                  )}
                </div>
                {species.care_level && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    species.care_level === 'beginner' ? 'bg-green-100 text-green-800' :
                    species.care_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {species.care_level}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
          No species found. Try a different search.
        </div>
      )}
    </div>
  )
}
