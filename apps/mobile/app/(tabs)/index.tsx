import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CopilotProvider, CopilotStep, walkthroughable, useCopilot } from 'react-native-copilot';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import TourTooltip from '../../src/components/TourTooltip';
import AnnouncementBanner from '../../src/components/AnnouncementBanner';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { AddPickerSheet, type AddPickerTaxon } from '../../src/components/AddPickerSheet';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { getImageUrl } from '../../src/utils/image-url';
import { listColonies, formatColonyCount, type ColonyListItem } from '../../src/lib/colonies';
import { INVERT_TAXA } from '../../src/lib/inverts';

/** Emoji for a colony's taxon — INVERT_TAXA excludes tarantula, so map it here. */
function colonyGlyph(taxon: string): string {
  return (INVERT_TAXA as any)[taxon]?.glyph ?? (taxon === 'tarantula' ? '🕷️' : '👥');
}

const WalkthroughableView = walkthroughable(View);

const TOUR_KEY = 'dashboard_tour_completed';

interface Tarantula {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  photo_url?: string;
}

// One row from the all-taxa /inverts/feeding-status endpoint — the SAME
// source Feeding Day and the daily digest read, so the dashboard's overdue
// widget now agrees with them (was tarantula-only + flat-7-day before). The
// server's `is_overdue` is species/life-stage aware and already excludes
// paused animals and never-fed animals.
interface FeedingStatusItem {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon: string;
  photo_url: string | null;
  days_since_last_feeding: number | null;
  is_feeding_paused: boolean;
  is_overdue: boolean;
}

// Mirrors apps/api/app/schemas/premolt.py::PremoltPrediction. We
// previously hit the legacy /tarantulas/<id>/premolt-prediction
// endpoint (probability + confidence_level), but that's a DIFFERENT
// algorithm from the one PremoltAlertCard uses on the collection
// screen — they would disagree (e.g. dashboard "2 alerts" while
// collection card said "All Clear"). Both surfaces now read from the
// canonical /premolt/dashboard service so counts agree.
interface PremoltPrediction {
  tarantula_id: string;
  tarantula_name: string;
  is_premolt_likely: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  recent_refusal_streak: number;
  days_since_last_molt: number | null;
  data_quality: 'good' | 'fair' | 'insufficient';
}

interface Enclosure {
  id: string;
  name: string;
  is_communal: boolean;
  population_count: number | null;
  inhabitant_count: number;
  days_since_last_feeding: number | null;
  photo_url: string | null;
  species_name: string | null;
  enclosure_type: string | null;
}

// Mirrors apps/api/app/routers/analytics.py::get_collection_analytics().
// We only consume total_molts here; keeping the rest of the shape so any
// future stat we want to surface on the hub is a one-line change.
interface CollectionStats {
  total_tarantulas: number;
  unique_species: number;
  total_feedings: number;
  total_molts: number;
}

function DashboardHubWrapper() {
  const { colors } = useTheme();
  return (
    <CopilotProvider
      tooltipComponent={TourTooltip}
      stepNumberComponent={() => null}
      overlay="svg"
      animated
      backdropColor="rgba(0, 0, 0, 0.6)"
      verticalOffset={0}
      tooltipStyle={{
        borderRadius: 16,
        backgroundColor: 'transparent',
      }}
    >
      <DashboardHubScreen />
    </CopilotProvider>
  );
}

/**
 * One card in the Home stat strip (design handoff screen 1, step 4).
 *
 * Renders as a plain View when there's nowhere to go — a pressable that does
 * nothing reads as broken, and "Molts" has no destination today.
 *
 * `styles`/`colors` are passed in because the stylesheet is built inside the
 * screen from the active theme rather than at module scope.
 */
function StatChip({
  icon,
  tint,
  label,
  value,
  footer,
  onPress,
  styles,
  colors,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tint: string;
  label: string;
  value: number | string;
  footer: string;
  onPress?: () => void;
  styles: any;
  colors: any;
}) {
  const body = (
    <>
      <View style={styles.statChipLabelRow}>
        <MaterialCommunityIcons name={icon} size={14} color={tint} />
        <Text style={styles.statChipLabel}>{label}</Text>
      </View>
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipFooter} numberOfLines={1}>
        {footer}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.statChip} accessibilityLabel={`${label}: ${value}. ${footer}.`}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.statChip}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${footer}.`}
    >
      {body}
    </TouchableOpacity>
  );
}

function DashboardHubScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();
  const { start: startTour } = useCopilot();
  const { breakpoint } = useBreakpoint();

  // Quick Actions grid column width. sm (every iPhone and folded phone)
  // keeps the existing layout — no override, the base style's '31.5%'
  // wins. Wider Android forms get explicit widths so the grid fills the
  // extra real estate (4 cols on a large phone or folded foldable, 5 on
  // unfolded foldable, 6 on a tablet).
  const quickActionWidth =
    breakpoint === 'xl' ? '15.5%' :
    breakpoint === 'lg' ? '18.5%' :
    breakpoint === 'md' ? '23.5%' :
    undefined;
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [feedingStatusItems, setFeedingStatusItems] = useState<FeedingStatusItem[]>([]);
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map());
  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [colonies, setColonies] = useState<ColonyListItem[]>([]);
  // null = not loaded / request failed → the chip renders '—', never a fake 0.
  const [feederStockTotal, setFeederStockTotal] = useState<number | null>(null);
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);
  // Cross-taxon collection total (from /inverts/). null until loaded;
  // falls back to tarantulas.length if the call fails.
  const [totalAnimals, setTotalAnimals] = useState<number | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tourChecked, setTourChecked] = useState(false);

  // getImageUrl moved to src/utils/image-url.ts so dev/staging builds
  // honor EXPO_PUBLIC_API_URL instead of always hitting prod.

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Re-check tour state when screen regains focus (e.g. after "Replay Tutorial")
  useFocusEffect(
    useCallback(() => {
      setTourChecked(false);
    }, [])
  );

  // Start tour on first visit (after data loads)
  useEffect(() => {
    if (loading) return;

    const checkTour = async () => {
      try {
        const completed = await AsyncStorage.getItem(TOUR_KEY);
        if (!completed && tarantulas.length > 0) {
          // Mark as completed before starting (covers both skip and finish)
          await AsyncStorage.setItem(TOUR_KEY, 'true');
          setTourChecked(true);
          setTimeout(() => {
            startTour();
          }, 800);
        }
      } catch {
        // skip
      }
    };

    if (!tourChecked) {
      checkTour();
    }
  }, [loading, tourChecked, tarantulas.length]);

  const fetchDashboardData = async () => {
    try {
      // /analytics/collection returns total_molts (and other aggregate
      // stats) computed server-side. Previously the dashboard derived
      // a "Total Molts" value from premolt predictions, which is a
      // completely different quantity — that's what the user reported
      // as the bug. Now we read the real count.
      // Send the device's TZ offset to endpoints that compute
      // calendar-day metrics (days_since_last_feeding). Cheap to send
      // even to endpoints that ignore it.
      const tzOffset = new Date().getTimezoneOffset();
      const [tarantulasRes, enclosuresRes, statsRes, invertsRes, coloniesRes, feedersRes] = await Promise.all([
        apiClient.get('/tarantulas/').catch(() => null),
        apiClient.get('/enclosures/', { params: { tz_offset_minutes: tzOffset } }).catch(() => null),
        apiClient.get('/analytics/collection').catch(() => null),
        // Unified inverts list = the whole cross-taxon collection
        // (tarantulas are mirrored in, plus scorpions / centipedes /
        // whip spiders). Drives the true "My Collection" total.
        apiClient.get('/inverts/').catch(() => null),
        // Colony mode (ADR-010) — population entries for the Colonies card.
        listColonies().catch(() => [] as ColonyListItem[]),
        // Feeder stock for the stat strip. No dedicated total endpoint —
        // the handoff calls for summing the existing list client-side.
        apiClient.get('/feeder-colonies/').catch(() => null),
      ]);

      if (tarantulasRes?.data) {
        setTarantulas(tarantulasRes.data);
        fetchAllPremoltPredictions(tarantulasRes.data);
      }
      // Feeding status is cross-taxon (one all-taxa call), independent of the
      // tarantulas list — so scorpions/centipedes/etc. show in the widget too.
      fetchAllFeedingStatuses();

      if (enclosuresRes?.data) {
        setEnclosures(enclosuresRes.data);
      }

      if (statsRes?.data) {
        setCollectionStats(statsRes.data);
      }

      if (Array.isArray(invertsRes?.data)) {
        setTotalAnimals(invertsRes.data.length);
      }

      if (Array.isArray(coloniesRes)) {
        setColonies(coloniesRes);
      }

      // Sum every ACTIVE feeder colony's population. `total_count` is null
      // for life-stage colonies that haven't been counted, so those simply
      // don't contribute. Left null on request failure so the chip shows '—'
      // rather than a confident 0 we haven't actually verified.
      if (Array.isArray(feedersRes?.data)) {
        setFeederStockTotal(
          feedersRes.data
            .filter((c: any) => c?.is_active !== false)
            .reduce((sum: number, c: any) => sum + (c?.total_count ?? 0), 0),
        );
      }
    } catch {
      // Dashboard data fetch failed
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFeedingStatuses = async () => {
    // ONE all-taxa call — the same endpoint Feeding Day + the daily digest
    // read, so all three surfaces agree. `is_overdue` is species/life-stage
    // aware and already excludes paused + never-fed animals. Pass the device's
    // local offset so days_since_last_feeding is a calendar-day diff in the
    // user's timezone, not a UTC delta.
    const tzOffset = new Date().getTimezoneOffset();
    try {
      const response = await apiClient.get<FeedingStatusItem[]>(
        `/inverts/feeding-status`,
        { params: { tz_offset_minutes: tzOffset } },
      );
      setFeedingStatusItems(response.data ?? []);
    } catch {
      // leave prior items in place on transient failure
    }
  };

  const fetchAllPremoltPredictions = async (_tarantulasList: Tarantula[]) => {
    // Single batch call to /premolt/dashboard — the canonical predictor
    // shared with PremoltAlertCard on the collection screen. Replaces N
    // calls to the legacy /tarantulas/<id>/premolt-prediction endpoint
    // (which used a different algorithm and produced disagreeing counts
    // between the two surfaces — the "All Clear vs 2 alerts" bug).
    const predictionMap = new Map<string, PremoltPrediction>();
    try {
      const response = await apiClient.get('/premolt/dashboard');
      const predictions: PremoltPrediction[] = response.data?.predictions ?? [];
      for (const p of predictions) {
        predictionMap.set(p.tarantula_id, p);
      }
    } catch {
      // Leave map empty on error; UI gracefully renders zero alerts.
    }
    setPremoltPredictions(predictionMap);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  }, []);

  // Overdue = the server's species/life-stage-aware `is_overdue` (already
  // excludes paused + never-fed), across ALL taxa — matches Feeding Day and
  // the daily digest exactly. Sorted most-overdue first.
  const overdueFeedings = feedingStatusItems
    .filter((i) => i.is_overdue)
    .sort(
      (a, b) =>
        (b.days_since_last_feeding ?? 0) - (a.days_since_last_feeding ?? 0),
    );

  // Source of truth: the canonical `is_premolt_likely` boolean from
  // the premolt service. PremoltAlertCard on the collection screen uses
  // the same flag, so the two surfaces agree (was the original bug:
  // dashboard "2 alerts" while collection card said "All Clear").
  const premoltAlerts = tarantulas.filter((t) => {
    const prediction = premoltPredictions.get(t.id);
    return prediction?.is_premolt_likely === true;
  });

  const communalEnclosures = enclosures.filter(e => e.is_communal);

  const getFeedingDaysColor = (days: number) => {
    if (days >= 21) return '#ef4444';
    if (days >= 14) return '#f97316';
    return '#eab308';
  };

  // Detail route for a feeding-status row. Tarantulas keep their bespoke
  // screen; every other taxon renders through the generic invert detail.
  const detailHref = (item: FeedingStatusItem) =>
    item.taxon === 'tarantula' ? `/tarantula/${item.id}` : `/invert/${item.id}`;

  // Sub-line under the hero count, e.g. "5 tarantulas · 2 scorpions".
  // Built from the same rows, so it can never disagree with the number.
  const overdueTaxaBreakdown = (() => {
    const counts = new Map<string, number>();
    for (const i of overdueFeedings) {
      counts.set(i.taxon, (counts.get(i.taxon) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([taxon, n]) => `${n} ${n === 1 ? taxon : `${taxon}s`}`)
      .join(' · ');
  })();

  // One-tap "fed" from the hero card.
  //
  // NOTE: collection.tsx has a `handleMarkFed`, but it is tarantula-only
  // (`/tarantulas/{id}/feedings`) and bound to the action-sheet target.
  // /inverts/feeding-status returns EVERY taxon, so the hero needs the
  // taxon-aware path — same branch the row's detail link already uses.
  const [heroFedBusy, setHeroFedBusy] = useState<string | null>(null);

  const markFedFromHero = async (item: FeedingStatusItem) => {
    if (heroFedBusy) return;
    setHeroFedBusy(item.id);
    // Optimistic: drop the row immediately so the count and list agree.
    const previous = feedingStatusItems;
    setFeedingStatusItems((rows) => rows.filter((r) => r.id !== item.id));
    try {
      const base = item.taxon === 'tarantula' ? 'tarantulas' : 'inverts';
      await apiClient.post(`/${base}/${item.id}/feedings`, {
        fed_at: new Date().toISOString(),
        accepted: true,
      });
    } catch {
      setFeedingStatusItems(previous); // roll back
      Alert.alert(
        'Could not log feeding',
        'Something went wrong logging that feeding. Please try again.',
      );
    } finally {
      setHeroFedBusy(null);
    }
  };

  // Maps the new 'high' | 'medium' | 'low' | 'none' confidence to the
  // existing badge palette. We stopped using 'very_high' when we
  // switched to /premolt/dashboard; treat 'high' as the most urgent.
  const getPremoltBadgeColor = (confidence: string) => {
    if (confidence === 'high') return '#ef4444';
    if (confidence === 'medium') return '#f97316';
    return '#eab308';
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    // Loading skeleton
    skeletonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    skeletonCard: {
      flex: 1,
      minWidth: '45%',
      height: 90,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonSection: {
      height: 200,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    // Stats row
    // Section cards
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 3,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sectionLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    // Feeding alert row
    // --- Stat strip (design handoff screen 1, step 4) ---
    statStrip: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statChip: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statChipLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statChipLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
    statChipValue: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
    statChipFooter: { fontSize: 11, fontWeight: '400', color: colors.textTertiary },

    // --- Feeding hero (design handoff screen 1, step 3) ---
    heroHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 14,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    heroIconWell: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      // Tinted well rather than a solid fill — the count is the loud element.
      backgroundColor: 'rgba(239,68,68,0.14)',
    },
    heroCount: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
    heroCountSuffix: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    heroBreakdown: { fontSize: 13, fontWeight: '400', color: colors.textTertiary, marginTop: 2 },
    heroStartButton: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12 },
    heroStartText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    heroCheckButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroSeeAll: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
      paddingVertical: 8,
      textAlign: 'center',
    },
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    alertImage: {
      width: 40,
      height: 40,
      borderRadius: 8,
    },
    alertImagePlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertInfo: {
      flex: 1,
      marginLeft: 12,
    },
    alertName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    alertDays: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    alertButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      overflow: 'hidden',
    },
    alertButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
    // Communal row
    communalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    communalIcon: {
      width: 40,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    communalInfo: {
      flex: 1,
      marginLeft: 12,
    },
    communalName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    communalMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    // Premolt row
    premoltRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: 8,
    },
    premoltInfo: {
      flex: 1,
      marginLeft: 12,
    },
    premoltName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    premoltSpecies: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textSecondary,
      marginTop: 2,
    },
    premoltBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    premoltBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    // Quick actions grid
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    actionButton: {
      // 2-col base with flexGrow so an odd trailing button fills its row
      // instead of sitting orphaned at half width (matches Herpetoverse).
      // Responsive overrides below bump to 4/5/6 cols on large screens.
      width: '47%',
      flexGrow: 1,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 20,
      paddingHorizontal: 6,
      gap: 8,
    },
    actionIconHalo: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + '1A', // 10% tint of the accent color
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      minHeight: 32, // reserves 2 lines so every tile is the same height
      lineHeight: 15,
    },
    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    emptyButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    emptyButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    emptySecondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptySecondaryText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    // All fed message
    allFedContainer: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    allFedTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    allFedSubtitle: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 4,
    },
    moreText: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 4,
    },
  });

  // Loading skeleton
  if (loading) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
          <View style={styles.skeletonSection} />
          <View style={styles.skeletonSection} />
        </ScrollView>
      </View>
    );
  }

  // Cross-taxon collection total — falls back to tarantulas.length if the
  // /inverts/ count failed to load.
  const animalCount = totalAnimals ?? tarantulas.length;

  // Route an add-picker choice to the right per-taxon add screen.
  const handleAddPick = (taxon: AddPickerTaxon) => {
    setAddPickerOpen(false);
    if (taxon === 'tarantula') router.push('/tarantula/add');
    // All non-tarantula taxa go through the generic invert add screen
    // (ADR-007) — matches the collection tab's picker.
    else router.push(`/invert/add?taxon=${taxon}` as any);
  };

  // Empty state — gated on the whole collection, not just tarantulas, so
  // a keeper who owns only scorpions/centipedes/whip spiders doesn't get
  // told to add their "first tarantula."
  if (animalCount === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyEmoji}>🕷️</Text>
        <Text style={styles.emptyTitle}>Welcome to Tarantuverse!</Text>
        <Text style={styles.emptyText}>
          Start your journey by adding your first animal to the collection.
        </Text>
        <View style={styles.emptyButtons}>
          <PrimaryButton
            onPress={() => setAddPickerOpen(true)}
            style={styles.emptyButton}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.emptyButtonText}>Add Animal</Text>
          </PrimaryButton>
          <TouchableOpacity
            style={styles.emptySecondaryButton}
            onPress={() => router.push('/species')}
          >
            <Text style={styles.emptySecondaryText}>📖 Species</Text>
          </TouchableOpacity>
        </View>
        <AddPickerSheet
          visible={addPickerOpen}
          onClose={() => setAddPickerOpen(false)}
          onPick={handleAddPick}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Announcement Banner */}
        <AnnouncementBanner />

        {/* Stat strip — handoff screen 1, step 4. Three equal cards, compact.
            Collection moved out (it's the header subtitle now) and Needs
            Feeding moved out (the hero owns it), leaving the three numbers
            that aren't surfaced anywhere else on this screen.

            The standalone "Feeding Day" gradient CTA that used to sit here is
            gone too: with the hero's Start button directly below it, the same
            count and the same destination appeared twice in a row. */}
        <CopilotStep
          text="Molt tracking, premolt predictions and feeder stock at a glance."
          order={1}
          name="Your Dashboard"
        >
        <WalkthroughableView style={styles.statStrip}>
          <StatChip
            icon="butterfly-outline"
            tint="#8b5cf6"
            label="Premolt"
            value={premoltAlerts.length}
            footer={premoltAlerts.length > 0 ? 'Medium+ confidence' : 'No alerts'}
            onPress={() => router.push('/(tabs)/collection')}
            styles={styles}
            colors={colors}
          />
          <StatChip
            icon="arrow-expand-vertical"
            tint={colors.accent}
            label="Molts"
            // '—' rather than 0 until stats land, so first paint doesn't
            // read as "you've logged zero molts".
            value={collectionStats ? collectionStats.total_molts : '—'}
            footer="Logged all-time"
            styles={styles}
            colors={colors}
          />
          <StatChip
            icon="fridge-outline"
            tint="#22c55e"
            label="Feeders"
            value={feederStockTotal ?? '—'}
            footer="In stock"
            onPress={() => router.push('/feeders')}
            styles={styles}
            colors={colors}
          />
        </WalkthroughableView>
        </CopilotStep>

        {/* Feeding hero — design handoff screen 1, step 3.
            Replaces BOTH the "Needs Feeding" stat tile and the old "Feeding
            Alerts" section: they rendered the same /inverts/feeding-status
            data twice. Head row = count + taxa breakdown + Start; then up to
            three rows with one-tap mark-fed; then "See all". */}
        <CopilotStep
          text="Animals overdue for feeding show up here, most urgent first. Tap the check to log a feeding, or Start to work through them all."
          order={2}
          name="Feeding Alerts"
        >
        <WalkthroughableView style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.textPrimary} />
            {'  '}Feeding
          </Text>
          {overdueFeedings.length === 0 ? (
            <View style={styles.allFedContainer}>
              <MaterialCommunityIcons name="check-circle-outline" size={32} color={colors.success} />
              <Text style={styles.allFedTitle}>All animals are fed on schedule!</Text>
              <Text style={styles.allFedSubtitle}>Great job keeping up with feedings.</Text>
            </View>
          ) : (
            <>
              {/* Head row: count, taxa breakdown, Start */}
              <View style={styles.heroHead}>
                <View style={styles.heroIconWell}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={24} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroCount}>
                    {overdueFeedings.length}
                    <Text style={styles.heroCountSuffix}> due today</Text>
                  </Text>
                  <Text style={styles.heroBreakdown}>{overdueTaxaBreakdown}</Text>
                </View>
                <PrimaryButton
                  onPress={() => router.push('/feeding-day')}
                  style={styles.heroStartButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Start Feeding Day. ${overdueFeedings.length} animals due.`}
                >
                  <Text style={styles.heroStartText}>Start</Text>
                </PrimaryButton>
              </View>

              {overdueFeedings.slice(0, 3).map(item => {
                const days = item.days_since_last_feeding ?? 0;
                const label = item.common_name || item.name || item.scientific_name || 'Unnamed';
                const href = detailHref(item);
                const busy = heroFedBusy === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.alertRow}
                    onPress={() => router.push(href as any)}
                    activeOpacity={0.7}
                  >
                    {item.photo_url ? (
                      <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.alertImage} />
                    ) : (
                      <View style={styles.alertImagePlaceholder}>
                        {item.taxon === 'tarantula' ? (
                          <MaterialCommunityIcons name="spider" size={20} color={colors.textTertiary} />
                        ) : (
                          <Text style={{ fontSize: 18 }}>{colonyGlyph(item.taxon)}</Text>
                        )}
                      </View>
                    )}
                    <View style={styles.alertInfo}>
                      <Text style={styles.alertName}>{label}</Text>
                      <Text style={[styles.alertDays, { color: getFeedingDaysColor(days) }]}>
                        {days} days since last feeding
                      </Text>
                    </View>
                    {/* One-tap mark-fed. stopPropagation via a separate
                        Touchable so the row tap still opens the detail. */}
                    <TouchableOpacity
                      onPress={() => markFedFromHero(item)}
                      disabled={busy}
                      style={styles.heroCheckButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${label} as fed today`}
                      accessibilityState={{ disabled: busy, busy }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <MaterialCommunityIcons name="check" size={18} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              {overdueFeedings.length > 3 && (
                <TouchableOpacity
                  onPress={() => router.push('/feeding-day')}
                  accessibilityRole="button"
                  accessibilityLabel={`See all ${overdueFeedings.length} animals due for feeding`}
                >
                  <Text style={styles.heroSeeAll}>
                    See all {overdueFeedings.length} →
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </WalkthroughableView>
        </CopilotStep>

        {/* Colonies (ADR-010) — population entries, taxon-aware. Replaces the
            legacy enclosure-based "Communal Setups" section. */}
        {colonies.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>👥 Colonies</Text>
              <TouchableOpacity onPress={() => router.push('/collection')}>
                <Text style={styles.sectionLink}>View all →</Text>
              </TouchableOpacity>
            </View>
            {colonies.map(col => {
              const species = col.species_display_name || col.species_scientific_name;
              const photo = getImageUrl(col.photo_url);
              return (
                <TouchableOpacity
                  key={col.id}
                  style={styles.communalRow}
                  onPress={() => router.push(`/colony/${col.id}`)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${col.name} colony, ${formatColonyCount(col.total_count, col.count_is_estimated)} individuals`}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.communalIcon} />
                  ) : (
                    <View style={[styles.communalIcon, { backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 20 }}>{colonyGlyph(col.taxon)}</Text>
                    </View>
                  )}
                  <View style={styles.communalInfo}>
                    <Text style={styles.communalName} numberOfLines={1}>{col.name}</Text>
                    <Text style={styles.communalMeta} numberOfLines={1}>
                      👥 {formatColonyCount(col.total_count, col.count_is_estimated)}
                      {species ? ` · ${species}` : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Premolt Watch List (conditional) */}
        {premoltAlerts.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔮 Premolt Watch List</Text>
            {premoltAlerts.slice(0, 5).map(t => {
              const prediction = premoltPredictions.get(t.id)!;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.premoltRow}
                  onPress={() => router.push(`/tarantula/${t.id}`)}
                  activeOpacity={0.7}
                >
                  {t.photo_url ? (
                    <Image source={{ uri: getImageUrl(t.photo_url) }} style={styles.alertImage} />
                  ) : (
                    <View style={styles.alertImagePlaceholder}>
                      <MaterialCommunityIcons name="spider" size={20} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.premoltInfo}>
                    <Text style={styles.premoltName}>{t.common_name || t.name}</Text>
                    <Text style={styles.premoltSpecies}>{t.scientific_name}</Text>
                  </View>
                  <View style={[
                    styles.premoltBadge,
                    { backgroundColor: getPremoltBadgeColor(prediction.confidence) },
                  ]}>
                    {/* The canonical predictor doesn't expose a 0-100
                        probability, just the confidence tier. Render the
                        tier capitalized + indicator counts so the badge
                        still conveys "how sure are we?" at a glance. */}
                    <Text style={styles.premoltBadgeText}>
                      🦋 {prediction.confidence.charAt(0).toUpperCase() + prediction.confidence.slice(1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick Actions Grid */}
        <CopilotStep
          text="Jump to common tasks — add a tarantula, view your collection, check analytics, browse species, and more."
          order={3}
          name="Quick Actions"
        >
        <WalkthroughableView style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {([
              { icon: 'plus-circle-outline', label: 'Add Animal', picker: true },
              { icon: 'spider', label: 'My Collection', route: '/(tabs)/collection' },
              { icon: 'bug-outline', label: 'Feeders', route: '/feeders' },
              { icon: 'chart-line', label: 'Analytics', route: '/analytics' },
              { icon: 'book-open-variant', label: 'Species DB', route: '/(tabs)/species' },
              { icon: 'account-group-outline', label: 'Community', route: '/(tabs)/community' },
              { icon: 'heart-multiple', label: 'Breeding', route: '/breeding' },
            ] as const).map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.actionButton,
                  quickActionWidth ? { width: quickActionWidth } : null,
                ]}
                onPress={() =>
                  'route' in item
                    ? router.push(item.route as any)
                    : setAddPickerOpen(true)
                }
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.actionIconHalo}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={26}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.actionLabel} numberOfLines={2}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </WalkthroughableView>
        </CopilotStep>
      </ScrollView>

      {/* Add-to-collection taxon picker — shared with the collection tab. */}
      <AddPickerSheet
        visible={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onPick={handleAddPick}
      />
    </View>
  );
}

export default withErrorBoundary(DashboardHubWrapper, 'dashboard');
