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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { ThemedInput } from '../../src/components/forms/FormPrimitives';
import {
  CARE_LEVEL_LABELS,
  type CareLevel,
  type HerpTaxon,
  listReptileSpecies,
  searchReptileSpecies,
} from '../../src/lib/reptile-species';
import { ANIMAL_TAXA, ANIMAL_TAXON_ORDER } from '../../src/lib/animals';
import {
  FEEDER_CATEGORIES,
  FEEDER_CATEGORY_ORDER,
  type FeederCategory,
  listFeederSpecies,
  titleize,
} from '../../src/lib/feeders';

const DEBOUNCE_MS = 300;

/**
 * Unified row shape so one renderer handles both the reptile/amphibian
 * catalog and the feeder catalog. `isFeeder` picks the route + the
 * care-level label path (feeder care levels are easy|moderate|hard, not
 * the reptile beginner|intermediate|advanced).
 */
interface SpeciesRowData {
  id: string;
  scientific_name: string;
  common_names: string[];
  care_level: string | null;
  image_url: string | null;
  isFeeder: boolean;
}

/** Human label for a care level, tolerant of both taxonomies. */
function careLevelLabel(value: string, isFeeder: boolean): string {
  if (!isFeeder && value in CARE_LEVEL_LABELS) {
    return CARE_LEVEL_LABELS[value as CareLevel];
  }
  // Feeder levels (easy|moderate|hard) or any unknown value → capitalize raw.
  return titleize(value);
}

function SpeciesScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [taxon, setTaxon] = useState<HerpTaxon | null>(null);
  const [feederCat, setFeederCat] = useState<FeederCategory | null>(null);
  const [results, setResults] = useState<SpeciesRowData[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Debounce typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebounced(query.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const fetchSpecies = useCallback(
    async (q: string, tx: HerpTaxon | null, fc: FeederCategory | null) => {
      try {
        let rows: SpeciesRowData[];
        if (fc) {
          // Feeder catalog mode.
          const items = await listFeederSpecies({
            q: q.length >= 2 ? q : undefined,
            category: fc,
          });
          rows = items.map((s) => ({
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names ?? [],
            care_level: s.care_level,
            image_url: s.image_url,
            isFeeder: true,
          }));
        } else if (q.length >= 2) {
          const items = await searchReptileSpecies(q, 25, tx ?? undefined);
          rows = items.map((s) => ({
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names,
            care_level: s.care_level,
            image_url: s.image_url,
            isFeeder: false,
          }));
        } else {
          const page = await listReptileSpecies({
            skip: 0,
            limit: 100,
            ...(tx ? { taxon: tx } : {}),
          });
          rows = page.items.map((s) => ({
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names,
            care_level: s.care_level,
            image_url: s.image_url,
            isFeeder: false,
          }));
        }
        setResults(rows);
        setLoadError(null);
      } catch {
        setLoadError("Couldn't load species. Pull down to retry.");
        setResults((prev) => prev ?? []);
      }
    },
    [],
  );

  // Re-fetch on focus (covers tab re-entry after a detail view).
  useFocusEffect(
    useCallback(() => {
      fetchSpecies(debounced, taxon, feederCat);
    }, [fetchSpecies, debounced, taxon, feederCat]),
  );

  // Re-fetch on debounced query / taxon / feeder-category change.
  useEffect(() => {
    fetchSpecies(debounced, taxon, feederCat);
  }, [debounced, taxon, feederCat, fetchSpecies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSpecies(debounced, taxon, feederCat);
    } finally {
      setRefreshing(false);
    }
  }, [debounced, taxon, feederCat, fetchSpecies]);

  // Mutually exclusive selection: taxon/All chips clear feederCat;
  // feeder chips clear taxon.
  const selectTaxon = useCallback((t: HerpTaxon | null) => {
    setFeederCat(null);
    setTaxon(t);
  }, []);
  const selectFeeder = useCallback((c: FeederCategory) => {
    setTaxon(null);
    setFeederCat(c);
  }, []);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Species" />
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

      {/* Taxon filter chips — divide the catalog by taxon (ADR-011) */}
      <View style={{ paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {([null, ...ANIMAL_TAXON_ORDER] as (HerpTaxon | null)[]).map((t) => {
            const active = feederCat === null && taxon === t;
            const meta = t ? ANIMAL_TAXA[t] : null;
            return (
              <TouchableOpacity
                key={t ?? 'all'}
                onPress={() => selectTaxon(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={meta ? meta.plural : 'All taxa'}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? '700' : '500',
                    color: active ? '#0B0B0B' : colors.textSecondary,
                  }}
                >
                  {meta ? `${meta.glyph} ${meta.plural}` : 'All'}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Divider between animal taxa and feeder categories */}
          <View
            style={[styles.chipDivider, { backgroundColor: colors.border }]}
          />

          {/* Feeder category chips — browse the feeder catalog (ADR-012) */}
          {FEEDER_CATEGORY_ORDER.map((c) => {
            const active = feederCat === c;
            const meta = FEEDER_CATEGORIES[c];
            return (
              <TouchableOpacity
                key={`feeder-${c}`}
                onPress={() => selectFeeder(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Feeder ${meta.plural}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? '700' : '500',
                    color: active ? '#0B0B0B' : colors.textSecondary,
                  }}
                >
                  {`${meta.glyph} ${meta.plural}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
            {debounced
              ? 'No matches'
              : feederCat
                ? 'No feeders in this category yet'
                : 'No species in catalog yet'}
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
              onPress={() =>
                router.push(
                  (item.isFeeder
                    ? `/feeder-species/${item.id}`
                    : `/species/${item.id}`) as never,
                )
              }
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
  species: SpeciesRowData;
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
              name={species.isFeeder ? 'food-drumstick' : 'leaf'}
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
          {careLevelLabel(species.care_level, species.isFeeder)}
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

  // Taxon chips
  chipRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 4,
    marginHorizontal: 2,
    opacity: 0.6,
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
