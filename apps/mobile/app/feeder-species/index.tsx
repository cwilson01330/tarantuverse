import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface FeederSpeciesListItem {
  id: string;
  scientific_name: string;
  common_names: string[] | null;
  category: string;
  care_level: string | null;
  image_url: string | null;
  supports_life_stages: boolean;
  default_life_stages: string[] | null;
}

const CATEGORY_FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'cricket', label: 'Crickets' },
  { key: 'roach', label: 'Roaches' },
  { key: 'larvae', label: 'Larvae' },
  { key: 'other', label: 'Other' },
];

const CARE_COLORS: Record<string, string> = {
  easy: '#16a34a',
  moderate: '#d97706',
  hard: '#dc2626',
};

export function categoryEmoji(category: string | null | undefined): string {
  switch ((category || '').toLowerCase()) {
    case 'cricket':
      return '🦗';
    case 'roach':
      return '🪳';
    case 'larvae':
      return '🐛';
    case 'other':
      return '🪱';
    default:
      return '🦗';
  }
}

export default function FeederSpeciesBrowseScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [items, setItems] = useState<FeederSpeciesListItem[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const reqId = useRef(0);

  const fetchSpecies = useCallback(
    async (q: string, cat: string | null) => {
      const myReq = ++reqId.current;
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (cat) params.set('category', cat);
        params.set('limit', '200');
        const res = await apiClient.get<FeederSpeciesListItem[]>(
          `/feeder-species/?${params.toString()}`
        );
        if (myReq !== reqId.current) return; // stale response
        setItems(res.data ?? []);
        setLoadError('');
      } catch (e: any) {
        if (myReq !== reqId.current) return;
        if (e?.response?.status === 401) return;
        setLoadError(
          e?.response?.data?.detail || e?.message || 'Failed to load feeder species'
        );
      } finally {
        if (myReq === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  // Debounced fetch on query/category change
  useEffect(() => {
    const t = setTimeout(() => {
      fetchSpecies(query, category);
    }, 300);
    return () => clearTimeout(t);
  }, [query, category, fetchSpecies]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSpecies(query, category);
  };

  const backAction = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityLabel="Back"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Feeder care sheets"
        subtitle="Browse feeder species"
        leftAction={backAction}
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search crickets, dubia, hornworms…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {query !== '' && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsInner}
      >
        {CATEGORY_FILTERS.map((f) => {
          const active = category === f.key;
          return (
            <TouchableOpacity
              key={f.label}
              onPress={() => setCategory(f.key)}
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
                  { color: active ? '#fff' : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
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
              { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.error ?? '#ef4444' },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchSpecies(query, category);
              }}
            >
              <Text style={[styles.retryText, { color: colors.error ?? '#b91c1c' }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🦗</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No feeder species found
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Try a different search or category.
            </Text>
          </View>
        )}

        {!loading && !loadError && items.length > 0 && (
          <View style={styles.cardsWrap}>
            {items.map((sp) => {
              const common =
                sp.common_names && sp.common_names.length > 0
                  ? sp.common_names.join(', ')
                  : null;
              const careColor = sp.care_level ? CARE_COLORS[sp.care_level] : undefined;
              return (
                <TouchableOpacity
                  key={sp.id}
                  onPress={() => router.push(`/feeder-species/${sp.id}` as any)}
                  activeOpacity={0.7}
                  accessibilityLabel={`${common || sp.scientific_name} care sheet`}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <Text style={styles.cardEmoji}>{categoryEmoji(sp.category)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.cardCommon, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {common || sp.scientific_name}
                    </Text>
                    <Text
                      style={[styles.cardSci, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {sp.scientific_name}
                    </Text>
                  </View>
                  {sp.care_level && careColor && (
                    <View
                      style={[
                        styles.careBadge,
                        { backgroundColor: `${careColor}22`, borderColor: careColor },
                      ]}
                    >
                      <Text style={[styles.careBadgeText, { color: careColor }]}>
                        {sp.care_level}
                      </Text>
                    </View>
                  )}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 4 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  chipsRow: { flexGrow: 0, paddingVertical: 12 },
  chipsInner: { paddingHorizontal: 16, gap: 8 },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  cardsWrap: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardEmoji: { fontSize: 26 },
  cardCommon: { fontSize: 15, fontWeight: '600' },
  cardSci: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  careBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  careBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
