/**
 * Feeder species catalog browser (ADR-012). Public catalog of feeder animals
 * — rodents, fish, insects, chicks, other — with category filter chips and a
 * debounced search. Tapping a row opens its care sheet.
 *
 * apiClient baseURL already includes /api/v1 — lib helpers start at the
 * resource. Theme is dark-first; on-primary text is #0B0B0B.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  FEEDER_CATEGORIES,
  FEEDER_CATEGORY_ORDER,
  feederCategoryGlyph,
  listFeederSpecies,
  type FeederCategory,
  type HvFeederSpecies,
} from '../../src/lib/feeders';

type CategoryFilter = FeederCategory | 'all';

function FeederSpeciesBrowser() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<HvFeederSpecies[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const fetchSpecies = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listFeederSpecies({
        q: query.trim() || undefined,
        category: category === 'all' ? undefined : category,
        limit: 200,
      });
      setItems(rows ?? []);
      setLoadError('');
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load catalog',
      );
    } finally {
      setLoading(false);
    }
  }, [query, category]);

  // Debounce search + category so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(fetchSpecies, 300);
    return () => clearTimeout(t);
  }, [fetchSpecies]);

  const chips: { key: CategoryFilter; label: string }[] = useMemo(
    () => [
      { key: 'all', label: 'All' },
      ...FEEDER_CATEGORY_ORDER.map((c) => ({
        key: c,
        label: `${FEEDER_CATEGORIES[c].glyph} ${FEEDER_CATEGORIES[c].plural}`,
      })),
    ],
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Feeder catalog"
        subtitle="Care guides for feeder animals"
        leftAction={<HeaderBackButton />}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search feeders…"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
      </AppHeader>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsInner}
      >
        {chips.map((c) => {
          const active = category === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setCategory(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  borderRadius: layout.radius.lg,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? '#0B0B0B' : colors.textSecondary },
                ]}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {loadError !== '' && !loading && (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.surface, borderColor: colors.danger },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
            <TouchableOpacity onPress={fetchSpecies}>
              <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No feeders found
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Try a different search or category.
            </Text>
          </View>
        )}

        {!loading &&
          items.map((sp) => (
            <TouchableOpacity
              key={sp.id}
              activeOpacity={0.8}
              onPress={() => router.push(`/feeder-species/${sp.id}` as never)}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={sp.common_names?.[0] ?? sp.scientific_name}
            >
              <Text style={styles.rowGlyph}>{feederCategoryGlyph(sp.category)}</Text>
              <View style={styles.rowText}>
                <Text
                  style={[styles.rowName, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {sp.common_names?.[0] ?? sp.scientific_name}
                </Text>
                <Text
                  style={[styles.rowSci, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {sp.scientific_name}
                </Text>
              </View>
              {sp.care_level ? (
                <View
                  style={[
                    styles.careBadge,
                    { backgroundColor: `${colors.info}22` },
                  ]}
                >
                  <Text style={[styles.careBadgeText, { color: colors.info }]}>
                    {sp.care_level}
                  </Text>
                </View>
              ) : null}
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

export default withErrorBoundary(FeederSpeciesBrowser, 'feeder-species');

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },
  chipsRow: { flexGrow: 0, paddingVertical: 10 },
  chipsInner: { paddingHorizontal: 16, gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  rowGlyph: { fontSize: 26 },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSci: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  careBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  careBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
