/**
 * Reptile collection — Sprint 8 Bundle 2.
 *
 * Displays every snake + lizard the keeper owns, merged into a single
 * scrollable list (matches the web /app/reptiles UX). Taxon stays on
 * each row so we can route to the right detail screen when a card is
 * tapped.
 *
 * Error handling is permissive: if one taxon fetch fails we still show
 * whatever loaded; the partial-failure state is surfaced via a banner
 * but the list remains usable.
 *
 * Notes for future bundles:
 *   - Bundle 3 will build /reptile/<id> snake detail and /lizard/<id>
 *     lizard detail. Until then the row tap routes to a placeholder
 *     screen that explains the screen's coming.
 *   - Bundle 4 wires the add-reptile flow that the empty-state CTA and
 *     the "+" FAB will navigate to (`/reptile/add`).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { apiClient } from '../../src/services/api';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { daysSince, relativeDays } from '../../src/utils/relative-days';

// ---------------------------------------------------------------------------
// Types — minimum subset of the Snake/Lizard schemas needed for the card.
// Full shapes live in the future detail screens; here we keep the surface
// small so the API contract is obvious.
// ---------------------------------------------------------------------------

type Sex = 'male' | 'female' | 'unknown' | null;
type Taxon = 'snake' | 'lizard';

interface ReptileBase {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex;
  photo_url: string | null;
  last_fed_at: string | null;
  created_at: string;
}

interface ReptileRow extends ReptileBase {
  taxon: Taxon;
}

function reptileTitle(r: ReptileBase): string {
  return (
    r.name ||
    r.common_name ||
    r.scientific_name ||
    'Unnamed'
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

function CollectionScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();

  const [rows, setRows] = useState<ReptileRow[] | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    // Fetch both taxa in parallel. allSettled so one failure doesn't
    // zero out the other — same pattern as the web list.
    const [snakesRes, lizardsRes] = await Promise.allSettled([
      apiClient.get<ReptileBase[]>('/snakes/'),
      apiClient.get<ReptileBase[]>('/lizards/'),
    ]);

    const merged: ReptileRow[] = [];
    const failures: string[] = [];

    if (snakesRes.status === 'fulfilled') {
      for (const s of snakesRes.value.data) {
        merged.push({ ...s, taxon: 'snake' });
      }
    } else {
      failures.push('snakes');
    }
    if (lizardsRes.status === 'fulfilled') {
      for (const l of lizardsRes.value.data) {
        merged.push({ ...l, taxon: 'lizard' });
      }
    } else {
      failures.push('lizards');
    }

    // Newest first.
    merged.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    setRows(merged);
    setPartialError(
      failures.length > 0
        ? `Couldn't load ${failures.join(' or ')}. Pull down to retry.`
        : null,
    );
  }, []);

  // useFocusEffect re-fetches when the keeper returns from another screen
  // (e.g. add-reptile in Bundle 4). For now it covers tab re-focus too.
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  // ---------- Loading skeleton ----------
  if (rows === null) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Empty state — single CTA, no fluff ----------
  if (rows.length === 0) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="snake"
            size={56}
            color={colors.textTertiary}
            style={{ marginBottom: 16 }}
          />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No reptiles yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Add your first snake or lizard to start tracking weights,
            feedings, and sheds.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/reptile/add' as never)}
            style={[
              styles.emptyButton,
              { backgroundColor: colors.primary, borderRadius: layout.radius.md },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add your first reptile"
          >
            <MaterialCommunityIcons name="plus" size={18} color="#0B0B0B" />
            <Text style={styles.emptyButtonText}>Add your first reptile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- List ----------
  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.taxon}:${r.id}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          partialError ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
              ]}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.errorBannerText}>{partialError}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ReptileCard
            row={item}
            onPress={() => {
              const path =
                item.taxon === 'snake'
                  ? `/reptile/${item.id}`
                  : `/lizard/${item.id}`;
              router.push(path as never);
            }}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
      {/* FAB — same destination as the empty-state CTA. Bundle 4 wires
          /reptile/add (a single form that lets the keeper pick taxon). */}
      <TouchableOpacity
        onPress={() => router.push('/reptile/add' as never)}
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add reptile"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#0B0B0B" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ReptileCard({
  row,
  onPress,
}: {
  row: ReptileRow;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  const lastFed = relativeDays(row.last_fed_at);
  const days = daysSince(row.last_fed_at);
  const taxonGlyph = row.taxon === 'snake' ? '🐍' : '🦎';

  // Color-coded last-fed indicator. Calibrated for snake/lizard cadence
  // (much longer than tarantulas) — green up to a week, yellow to two
  // weeks, orange to a month, red beyond. Tune per species in a future
  // pass when species-aware reminders land.
  let pillBg: string = colors.success;
  if (days != null) {
    if (days >= 30) pillBg = '#ef4444';
    else if (days >= 14) pillBg = '#f97316';
    else if (days >= 7) pillBg = '#eab308';
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${reptileTitle(row)}, ${row.taxon}, ${
        lastFed ? 'fed ' + lastFed.toLowerCase() : 'never fed'
      }`}
    >
      {/* Photo or placeholder */}
      <View style={styles.cardImageWrap}>
        {row.photo_url ? (
          <Image source={{ uri: row.photo_url }} style={styles.cardImage} />
        ) : (
          <View
            style={[styles.cardImage, { backgroundColor: colors.surfaceRaised }]}
          >
            <Text style={{ fontSize: 24 }}>{taxonGlyph}</Text>
          </View>
        )}
      </View>

      {/* Title + metadata */}
      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {reptileTitle(row)}
        </Text>
        {row.scientific_name && (
          <Text
            style={[styles.cardSubtitle, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {row.scientific_name}
          </Text>
        )}
      </View>

      {/* Right-side indicators — sex chip + last-fed pill, both sharing
          the same height so they align cleanly (same pattern we used for
          the Tarantuverse list view). */}
      <View style={styles.cardIndicators}>
        <View
          style={[
            styles.sexChip,
            {
              backgroundColor:
                row.sex === 'female'
                  ? '#ec489920'
                  : row.sex === 'male'
                    ? '#3b82f620'
                    : colors.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={
              row.sex === 'female'
                ? 'gender-female'
                : row.sex === 'male'
                  ? 'gender-male'
                  : 'help-circle-outline'
            }
            size={14}
            color={
              row.sex === 'female'
                ? '#ec4899'
                : row.sex === 'male'
                  ? '#3b82f6'
                  : colors.textTertiary
            }
          />
        </View>
        {days != null && (
          <View style={[styles.feedingPill, { backgroundColor: pillBg }]}>
            <Text style={styles.feedingPillText}>{days}d</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyButtonText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },

  // List
  listContent: { padding: 12, paddingBottom: 96 },
  errorBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: { color: '#dc2626', fontSize: 13 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
  },
  cardImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardImage: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSubtitle: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sexChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedingPill: {
    height: 22,
    minWidth: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedingPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default withErrorBoundary(CollectionScreen, 'collection');
