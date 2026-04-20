import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface FeederColonyListItem {
  id: string;
  name: string;
  inventory_mode: 'count' | 'life_stage';
  total_count: number | null;
  is_low_stock: boolean;
  is_active: boolean;
  species_display_name: string | null;
  species_missing: boolean;
  last_fed_date: string | null;
  last_cleaned: string | null;
  last_restocked: string | null;
}

function categoryEmoji(name: string | null): string {
  if (!name) return '🦗';
  const n = name.toLowerCase();
  if (n.includes('cricket')) return '🦗';
  if (n.includes('roach') || n.includes('dubia') || n.includes('hisser')) return '🪳';
  if (n.includes('meal') || n.includes('super') || n.includes('worm') || n.includes('larva')) return '🐛';
  return '🦗';
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatDaysLabel(days: number | null, zeroLabel: string, neverLabel: string): string {
  if (days == null) return neverLabel;
  if (days === 0) return zeroLabel;
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export default function FeedersListScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [colonies, setColonies] = useState<FeederColonyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchColonies = useCallback(async () => {
    try {
      const res = await apiClient.get<FeederColonyListItem[]>('/feeder-colonies/');
      setColonies(res.data);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) {
        // auth interceptor handles logout
        return;
      }
      setLoadError(
        e?.response?.data?.detail ||
          e?.message ||
          'Failed to load feeder colonies'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + refetch on focus (so new colonies appear after add/edit)
  useFocusEffect(
    useCallback(() => {
      fetchColonies();
    }, [fetchColonies])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchColonies();
  };

  const lowStockCount = colonies.filter((c) => c.is_low_stock).length;

  const backAction = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityLabel="Back"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const addAction = (
    <TouchableOpacity
      onPress={() => router.push('/feeders/add')}
      accessibilityLabel="Add feeder colony"
      style={{ paddingHorizontal: 4 }}
    >
      <MaterialCommunityIcons name="plus" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Feeders"
        subtitle="Track your live feeder colonies"
        leftAction={backAction}
        rightAction={addAction}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Low-stock banner */}
        {!loading && lowStockCount > 0 && (
          <View
            style={[
              styles.lowBanner,
              {
                backgroundColor: colors.warningBg ?? 'rgba(245, 158, 11, 0.15)',
                borderColor: colors.warning ?? '#f59e0b',
              },
            ]}
            accessibilityRole="alert"
          >
            <Text style={styles.bannerEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: colors.warning ?? '#b45309' }]}>
                {lowStockCount}{' '}
                {lowStockCount === 1 ? 'colony is' : 'colonies are'} running low
              </Text>
              <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
                Tap a colony to log a restock or adjust the threshold.
              </Text>
            </View>
          </View>
        )}

        {/* Error */}
        {loadError !== '' && !loading && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderColor: colors.error ?? '#ef4444',
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchColonies();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.retryText, { color: colors.error ?? '#b91c1c' }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {/* Empty state */}
        {!loading && !loadError && colonies.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🦗</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No colonies yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Add your first feeder colony to start tracking feeds, cleanings, and restocks.
              Keepers typically keep crickets, dubia, hissers, or mealworms.
            </Text>
            <PrimaryButton
              onPress={() => router.push('/feeders/add')}
              style={styles.emptyCta}
              outerStyle={{ borderRadius: layout.radius.lg }}
            >
              <Text style={styles.emptyCtaText}>＋  Add Your First Colony</Text>
            </PrimaryButton>
          </View>
        )}

        {/* Colony cards */}
        {!loading && !loadError && colonies.length > 0 && (
          <View style={styles.cardsWrap}>
            {colonies.map((c) => {
              const fedDays = daysSince(c.last_fed_date);
              const cleanedDays = daysSince(c.last_cleaned);
              const speciesLabel = c.species_missing
                ? 'Species removed'
                : c.species_display_name || 'No species set';
              const totalCountLabel =
                c.total_count == null ? '—' : c.total_count.toLocaleString();
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: c.is_low_stock
                        ? colors.warning ?? '#f59e0b'
                        : colors.border,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                  onPress={() => router.push(`/feeders/${c.id}`)}
                  activeOpacity={0.7}
                  accessibilityLabel={`${c.name} — ${speciesLabel} — ${totalCountLabel}`}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardEmoji}>
                      {categoryEmoji(c.species_display_name)}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[styles.cardName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text
                        style={[
                          styles.cardSpecies,
                          {
                            color: c.species_missing
                              ? colors.textTertiary
                              : colors.textSecondary,
                            fontStyle: c.species_missing ? 'italic' : 'normal',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {speciesLabel}
                      </Text>
                    </View>
                    {c.is_low_stock && (
                      <View
                        style={[
                          styles.lowChip,
                          {
                            backgroundColor: 'rgba(245, 158, 11, 0.18)',
                          },
                        ]}
                        accessibilityLabel="Low stock"
                      >
                        <Text style={[styles.lowChipText, { color: '#92400e' }]}>
                          Low
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardMid}>
                    <Text style={[styles.cardCount, { color: colors.textPrimary }]}>
                      {totalCountLabel}
                    </Text>
                    <Text style={[styles.cardCountLabel, { color: colors.textTertiary }]}>
                      {c.inventory_mode === 'life_stage' ? 'across stages' : 'total'}
                    </Text>
                  </View>

                  <View style={styles.cardBottom}>
                    <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                      {fedDays == null
                        ? 'Never fed'
                        : fedDays === 0
                          ? 'Fed today'
                          : `Fed ${formatDaysLabel(fedDays, 'today', 'never')}`}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                      {cleanedDays == null
                        ? 'Not cleaned'
                        : cleanedDays === 0
                          ? 'Cleaned today'
                          : `Cleaned ${formatDaysLabel(cleanedDays, 'today', 'never')}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB — only when we have colonies */}
      {!loading && colonies.length > 0 && (
        <PrimaryButton
          fab
          size={56}
          onPress={() => router.push('/feeders/add')}
          outerStyle={styles.fab}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#fff" />
        </PrimaryButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  lowBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  bannerEmoji: { fontSize: 24 },
  bannerTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  bannerSub: { fontSize: 13 },
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
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 340,
  },
  emptyCta: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  emptyCtaText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cardsWrap: { gap: 12 },
  card: {
    borderWidth: 1,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  cardEmoji: { fontSize: 28 },
  cardName: { fontSize: 16, fontWeight: '600' },
  cardSpecies: { fontSize: 12, marginTop: 2 },
  lowChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  lowChipText: { fontSize: 11, fontWeight: '700' },
  cardMid: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 10,
  },
  cardCount: { fontSize: 22, fontWeight: '700' },
  cardCountLabel: { fontSize: 11 },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardMeta: { fontSize: 11 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
