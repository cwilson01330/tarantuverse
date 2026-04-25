import { useState, useEffect, useCallback, useRef } from 'react'
import { View, TextInput, SectionList, TouchableOpacity, Text, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../src/contexts/ThemeContext'
import { apiClient } from '../src/services/api'
import { toMobilePath } from '../src/utils/links'

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

interface SectionData {
  title: string
  icon: string
  data: SearchResult[]
}

const SECTION_ICONS = {
  tarantulas: '🕷️',
  species: '📚',
  keepers: '👥',
  forums: '💬',
}

export default function SearchScreen() {
  const router = useRouter()
  const { colors, layout } = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<SectionData[]>([])
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Build sections from results
  useEffect(() => {
    if (!results) {
      setSections([])
      return
    }

    const newSections: SectionData[] = []

    if (results.tarantulas.length > 0) {
      newSections.push({
        title: 'Tarantulas',
        icon: '🕷️',
        data: results.tarantulas,
      })
    }

    if (results.species.length > 0) {
      newSections.push({
        title: 'Species',
        icon: '📚',
        data: results.species,
      })
    }

    if (results.keepers.length > 0) {
      newSections.push({
        title: 'Keepers',
        icon: '👥',
        data: results.keepers,
      })
    }

    if (results.forums.length > 0) {
      newSections.push({
        title: 'Forums',
        icon: '💬',
        data: results.forums,
      })
    }

    setSections(newSections)
  }, [results])

  // Perform search
  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }

    setLoading(true)
    try {
      const response = await apiClient.get('/search', { params: { q } })
      setResults(response.data)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }, [])

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

  // toMobilePath now lives in src/utils/links.ts — the same normalizer is
  // needed by discover and could be by anything else that consumes a
  // server-issued URL. See that file for the full mapping list.
  const handleSelectResult = (result: SearchResult) => {
    router.push(toMobilePath(result.url) as any)
  }

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      onPress={() => handleSelectResult(item)}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
          {item.title}
        </Text>
        {item.subtitle && (
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {item.subtitle}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.surface }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>
        {section.icon} {section.title}
      </Text>
    </View>
  )

  const renderEmptyState = () => {
    if (query.length < 2) {
      return (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, color: colors.textSecondary }}>
            Type at least 2 characters to search
          </Text>
        </View>
      )
    }

    if (loading) {
      return (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>
            Searching...
          </Text>
        </View>
      )
    }

    if (results && results.total_results === 0) {
      return (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, color: colors.textSecondary }}>
            No results found for "{query}"
          </Text>
        </View>
      )
    }

    return null
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search input bar — sticky between the nav header and results */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: colors.surfaceElevated ?? colors.background,
          borderRadius: layout.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Search tarantulas, species, keepers..."
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            style={{
              flex: 1,
              fontSize: 16,
              color: colors.textPrimary,
              paddingVertical: 0,
            }}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ fontSize: 16, color: colors.textTertiary }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Results List */}
      {sections.length > 0 || loading || (query.length >= 2 && results) ? (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmptyState()}
          stickySectionHeadersEnabled={false}
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  )
}
