import { useState, useEffect, useCallback, useRef } from 'react'
import { View, TextInput, SectionList, TouchableOpacity, Text, ActivityIndicator, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../src/contexts/ThemeContext'
import { useAuth } from '../src/contexts/AuthContext'
import axios from 'axios'

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
  const { colors } = useTheme()
  const { token } = useAuth()
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
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
      const headers: any = {
        'Content-Type': 'application/json',
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await axios.get(
        `${API_URL}/api/v1/search?q=${encodeURIComponent(q)}`,
        { headers }
      )

      setResults(response.data)
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

  const handleSelectResult = (result: SearchResult) => {
    router.push(result.url as any)
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
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search Input */}
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.background,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Search tarantulas, species, keepers..."
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            style={{
              flex: 1,
              fontSize: 16,
              color: colors.text,
              paddingVertical: 0,
            }}
          />
          {query && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          )}
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
    </SafeAreaView>
  )
}
