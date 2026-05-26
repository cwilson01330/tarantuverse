/**
 * Reptile collection.
 *
 * Displays every snake, lizard, and frog the keeper owns, merged into a
 * single scrollable list (matches the web /app/reptiles UX). Taxon
 * stays on each row to drive the per-taxon glyph; ADR-003 collapsed the
 * detail routes so every card opens the one /reptile/[id] screen.
 *
 * Error handling is permissive: if one taxon fetch fails we still show
 * whatever loaded; the partial-failure state is surfaced via a banner
 * but the list remains usable.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { type AnimalTaxon, createFeeding, listAnimals } from '../../src/lib/animals';
import { AppHeader } from '../../src/components/AppHeader';
import { AnimalActionSheet } from '../../src/components/AnimalActionSheet';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { daysSince, relativeDays } from '../../src/utils/relative-days';
import { DEFAULT_CGD_FOOD_TYPE, feedingPillColor } from '../../src/lib/cgd';

// ---------------------------------------------------------------------------
// Types — minimum subset of the Animal schema needed for the card.
// Full shapes live in the detail screens; here we keep the surface
// small so the API contract is obvious.
// ---------------------------------------------------------------------------

type Sex = 'male' | 'female' | 'unknown' | null;
// ADR-003: every taxon flows through the unified animals endpoint.
type Taxon = AnimalTaxon;

interface ReptileBase {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  sex: Sex;
  photo_url: string | null;
  last_fed_at: string | null;
  /** Resolved CGD flag — drives the tighter feeding-status ramp. */
  feeds_on_cgd: boolean;
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
  // Long-press quick-actions sheet. `actionTarget` holds the animal
  // whose sheet is open (null = closed); `actionBusy` gates the rows
  // while a write is in flight, and `actionBusyKey` says which row
  // should show the spinner.
  const [actionTarget, setActionTarget] = useState<ReptileRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<'fed' | 'cgd' | null>(
    null,
  );

  const fetchAll = useCallback(async () => {
    // ADR-003: one unified animals endpoint — every taxon in a single
    // call. The `taxon` discriminator rides on each row.
    try {
      const animals = await listAnimals();
      const merged: ReptileRow[] = animals.map((a) => ({
        id: a.id,
        name: a.name,
        common_name: a.common_name,
        scientific_name: a.scientific_name,
        sex: a.sex,
        photo_url: a.photo_url,
        last_fed_at: a.last_fed_at,
        feeds_on_cgd: a.feeds_on_cgd,
        created_at: a.created_at,
        taxon: a.taxon,
      }));
      // Newest first.
      merged.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRows(merged);
      setPartialError(null);
    } catch {
      // Keep whatever's already on screen rather than blanking it.
      setRows((prev) => prev ?? []);
      setPartialError(
        "Couldn't load your collection. Pull down to retry.",
      );
    }
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

  // "Mark fed today" — posts an accepted feeding dated now. food_type
  // is left null on purpose: this is the one-tap path, and the keeper
  // can open the full Log Feeding form later to add detail. A full
  // refetch picks up the animal's refreshed last_fed_at so the card's
  // feeding pill updates.
  const handleMarkFed = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionBusy(true);
    setActionBusyKey('fed');
    try {
      await createFeeding(target.id, {
        fed_at: new Date().toISOString(),
        accepted: true,
      });
      await fetchAll();
      setActionTarget(null);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          `Logged a feeding for ${reptileTitle(target)}`,
          ToastAndroid.SHORT,
        );
      }
    } catch {
      Alert.alert(
        'Could not log feeding',
        `Something went wrong logging a feeding for ${reptileTitle(
          target,
        )}. Please try again.`,
      );
    } finally {
      setActionBusy(false);
      setActionBusyKey(null);
    }
  };

  // "Refreshed CGD" — one-tap log of a CGD refresh with the default
  // Pangea brand. Only surfaced when the animal feeds on CGD. The
  // keeper can change the brand later via the full log-feeding form;
  // we just want the cadence pill to update with one tap when they
  // swap the dish.
  const handleRefreshCgd = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionBusy(true);
    setActionBusyKey('cgd');
    try {
      await createFeeding(target.id, {
        fed_at: new Date().toISOString(),
        food_type: DEFAULT_CGD_FOOD_TYPE,
        accepted: true,
      });
      await fetchAll();
      setActionTarget(null);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          `Refreshed CGD for ${reptileTitle(target)}`,
          ToastAndroid.SHORT,
        );
      }
    } catch {
      Alert.alert(
        'Could not log refresh',
        `Something went wrong logging a CGD refresh for ${reptileTitle(
          target,
        )}. Please try again.`,
      );
    } finally {
      setActionBusy(false);
      setActionBusyKey(null);
    }
  };

  const handleLogShed = () => {
    if (!actionTarget) return;
    const animalId = actionTarget.id;
    setActionTarget(null);
    router.push(`/reptile/log-shed/${animalId}` as never);
  };

  const handleEditFromSheet = () => {
    if (!actionTarget) return;
    const animalId = actionTarget.id;
    setActionTarget(null);
    router.push(`/reptile/edit/${animalId}` as never);
  };

  // ---------- Loading skeleton ----------
  if (rows === null) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Collection" />
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
        <AppHeader title="Collection" />
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
            Add your first snake, lizard, or frog to start tracking
            weights, feedings, and sheds.
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
      <AppHeader title="Collection" />
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
              // ADR-003: one taxon-agnostic /reptile/ detail route.
              router.push(`/reptile/${item.id}` as never);
            }}
            onLongPress={() => setActionTarget(item)}
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

      {/* Long-press quick actions. The Modal inside stays hidden until
          a card long-press sets actionTarget. */}
      <AnimalActionSheet
        target={
          actionTarget
            ? {
                id: actionTarget.id,
                name: reptileTitle(actionTarget),
                feedsOnCgd: actionTarget.feeds_on_cgd,
              }
            : null
        }
        busy={actionBusy}
        busyKey={actionBusyKey}
        onClose={() => {
          if (!actionBusy) setActionTarget(null);
        }}
        onMarkFed={handleMarkFed}
        onLogShed={handleLogShed}
        onEdit={handleEditFromSheet}
        onRefreshCgd={handleRefreshCgd}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ReptileCard({
  row,
  onPress,
  onLongPress,
}: {
  row: ReptileRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors, layout } = useTheme();
  const lastFed = relativeDays(row.last_fed_at);
  const days = daysSince(row.last_fed_at);
  const taxonGlyph =
    row.taxon === 'snake' ? '🐍' : row.taxon === 'frog' ? '🐸' : '🦎';

  // Color-coded last-fed indicator. Snake/lizard cadence is the
  // default; CGD-fed rhacodactylids get a tighter ramp (overdue at
  // day 4 instead of day 7) so a healthy crestie reads as green at
  // day 2, not yellow. See lib/cgd.ts.
  const pillBg = feedingPillColor(days, row.feeds_on_cgd, {
    green: colors.success,
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
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
      accessibilityHint="Opens the detail screen. Long press for quick actions."
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
