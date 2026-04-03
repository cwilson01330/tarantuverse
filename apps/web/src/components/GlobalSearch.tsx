'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

interface SearchResult {
  id: string
  type: string
  title: string
  subtitle?: string
  image_url?: string
  url: string
}

interface SearchResponse {
  query: string
  total_results: number
  tarantulas: SearchResult[]
  species: SearchResult[]
  keepers: SearchResult[]
  forums: SearchResult[]
}

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
}

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const router = useRouter()
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Flatten results for keyboard navigation
  const allResults = results ? [
    ...results.tarantulas,
    ...results.species,
    ...results.keepers,
    ...results.forums,
  ] : []

  // Fetch search results
  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      setSelectedIndex(0)
      return
    }

    setLoading(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(q)}`, {
        headers,
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data)
        setSelectedIndex(0)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(query)
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, performSearch])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setResults(null)
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % (allResults.length || 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + (allResults.length || 1)) % (allResults.length || 1))
          break
        case 'Enter':
          e.preventDefault()
          if (allResults[selectedIndex]) {
            handleSelectResult(allResults[selectedIndex])
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, allResults, selectedIndex, onClose])

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onClose() // Toggle
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSelectResult = (result: SearchResult) => {
    router.push(result.url)
    onClose()
    setQuery('')
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'tarantula':
        return '🕷️'
      case 'species':
        return '📚'
      case 'keeper':
        return '👥'
      case 'forum':
        return '💬'
      default:
        return '🔍'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Search Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
        <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="text-xl text-gray-400">🔍</span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search tarantulas, species, keepers, forums..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-lg outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Use arrow keys to navigate, Enter to select, Esc to close
            </p>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {query.length < 2 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <p>Type at least 2 characters to search</p>
              </div>
            ) : loading ? (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20m10-10H2" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Searching...</p>
              </div>
            ) : allResults.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <p>No results found for "{query}"</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {/* Tarantulas Section */}
                {results?.tarantulas && results.tarantulas.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">🕷️ Tarantulas</p>
                    {results.tarantulas.map((result) => (
                      <ResultItem
                        key={result.id}
                        result={result}
                        isSelected={allResults[selectedIndex]?.id === result.id}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                )}

                {/* Species Section */}
                {results?.species && results.species.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">📚 Species</p>
                    {results.species.map((result) => (
                      <ResultItem
                        key={result.id}
                        result={result}
                        isSelected={allResults[selectedIndex]?.id === result.id}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                )}

                {/* Keepers Section */}
                {results?.keepers && results.keepers.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">👥 Keepers</p>
                    {results.keepers.map((result) => (
                      <ResultItem
                        key={result.id}
                        result={result}
                        isSelected={allResults[selectedIndex]?.id === result.id}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                )}

                {/* Forums Section */}
                {results?.forums && results.forums.length > 0 && (
                  <div className="p-4">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">💬 Forums</p>
                    {results.forums.map((result) => (
                      <ResultItem
                        key={result.id}
                        result={result}
                        isSelected={allResults[selectedIndex]?.id === result.id}
                        onSelect={handleSelectResult}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {results && results.total_results > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              Showing {allResults.length} of {results.total_results} results
            </div>
          )}
        </div>
      </div>
    </>
  )
}

interface ResultItemProps {
  result: SearchResult
  isSelected: boolean
  onSelect: (result: SearchResult) => void
}

function ResultItem({ result, isSelected, onSelect }: ResultItemProps) {
  return (
    <button
      onClick={() => onSelect(result)}
      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
        isSelected
          ? 'bg-blue-600 dark:bg-blue-700 text-white'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white'
      }`}
    >
      {/* Icon/Image */}
      {result.image_url ? (
        <img
          src={result.image_url}
          alt={result.title}
          className="w-8 h-8 rounded object-cover flex-shrink-0"
        />
      ) : (
        <span className="text-lg flex-shrink-0">
          {result.type === 'tarantula' && '🕷️'}
          {result.type === 'species' && '📚'}
          {result.type === 'keeper' && '👥'}
          {result.type === 'forum' && '💬'}
        </span>
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${isSelected ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
          {result.title}
        </p>
        {result.subtitle && (
          <p className={`text-xs truncate ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {result.subtitle}
          </p>
        )}
      </div>
    </button>
  )
}
