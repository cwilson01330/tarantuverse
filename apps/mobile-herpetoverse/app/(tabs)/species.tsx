/**
 * Species tab — Sprint 8 Bundle 6.
 *
 * Browses the reptile species catalog. Search field at top runs against
 * /reptile-species/search (debounced); blank query falls back to the
 * paginated /reptile-species/ list, alphabetized by scientific name.
 *
 * Tapping a row routes to /species/<id> (the care-sheet viewer).
 *
 * v1 keeps it simple — no per-care-level filter chips, no scrolling
 * pagination beyond the first 100. Catalog is small (~30 species at
 * launch) and growing slowly. When the catalog crosses 100 entries we
 * can add infinite scroll + filters in a follow-up.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { ThemedInput } from '../../src/components/forms/FormPrimitives';
import {
  CARE_LEVEL_LABELS,
  type ReptileSpeciesSearchResult,
  listReptileSpecies,
  searchReptileSpecies,
} from '../../src/lib/reptile-species';

const DEBOUNCE_MS = 300;

function SpeciesScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<ReptileSpeciesSearchResult[] | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Debounce typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(query.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const fetchSpecies = useCallback(async (q: string) => {
    try {
      if (q.length >= 2) {
        const items = await searchReptileSpecies(q, 25);
        setResults(items);
      } else {
        const page = await listReptileSpecies({ skip: 0, limit: 100 });
        setResults(page.items);
      }
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load species. Pull down to retry.");
      setResults((prev) => prev ?? []);
    }
  }, []);

  // Re-fetch on focus (covers tab re-entry after a detail view).
  useFocusEffect(
    useCallback(() => {
      fetchSpecies(debounced);
    }, [fetchSpecies, debounced]),
  );

  // Re-fetch on debounced query change while still on this screen.
  useEffect(() => {
    fetchSpecies(debounced);
  }, [debounced, fetchSpecies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSpecies(debounced);
    } finally {
      setRefreshing(false);
    }
  }, [debounced, fetchSpecies]);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      {/* Search bar */}
      <View
        style={[styles.searchBarWrap, { borderBottomColor: colors.border }]}
      >
        <View style={{ position: 'relative' }}>
          <ThemedInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search species — e.g. Python, gecko"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={{ paddingLeft: 38 }}
          />
          <MaterialCommunityIcons
            name="magnify"
            size={18}
            color={colors.textTertiary}
            style={styles.searchIcon}
            pointerEvents="none"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.searchClear}
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {results === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons
            name="book-open-variant"
            size={56}
            color={colors.textTertiary}
            style={{ marginBottom: 12 }}
          />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {debounced ? 'No matches' : 'No species in catalog yet'}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
            {debounced
              ? `Nothing matched "${debounced}". Try a different spelling or scientific name.`
              : 'Pull down to retry.'}
          </Text>
          {loadError && (
            <Text
              style={[styles.errorText, { color: colors.danger }]}
              accessibilityLiveRegion="polite"
            >
              {loadError}
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            loadError ? (
              <View
                style={[
                  styles.errorBannerWrap,
                  { borderColor: colors.danger },
                ]}
              >
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {loadError}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <SpeciesRow
              species={item}
              onPress={() => router.push(`/species/${item.id}` as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function SpeciesRow({
  species,
  onPress,
}: {
  species: ReptileSpeciesSearchResult;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  const common = species.common_names[0];

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open care sheet for ${species.scientific_name}`}
    >
      <View style={styles.rowImageWrap}>
        {species.image_url ? (
          <Image source={{ uri: species.image_url }} style={styles.rowImage} />
        ) : (
          <View
            style={[styles.rowImage, { backgroundColor: colors.surfaceRaised }]}
          >
            <MaterialCommunityIcons
              name="leaf"
              size={20}
              color={colors.textTertiary}
            />
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowSci, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {species.scientific_name}
        </Text>
        {common && (
          <Text
            style={[styles.rowCommon, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {common}
          </Text>
        )}
      </View>
      {species.care_level && (
        <Text
          style={[
            styles.careLevel,
            { color: colors.textSecondary, borderColor: colors.border },
          ]}
        >
          {CARE_LEVEL_LABELS[species.care_level]}
        </Text>
      )}
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 320,
  },
  errorText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 12,
  },
  errorBannerWrap: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },

  // Search bar
  searchBarWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 13,
  },
  searchClear: {
    position: 'absolute',
    right: 10,
    top: 11,
    padding: 2,
  },

  // List
  listContent: {
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    gap: 12,
  },
  rowImageWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
  },
  rowImage: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowSci: {
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  rowCommon: {
    fontSize: 12,
    marginTop: 2,
  },
  careLevel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    textTransform: 'uppercase',
  },
});

export default withErrorBoundary(SpeciesScreen, 'species');
