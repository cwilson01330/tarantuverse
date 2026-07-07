/**
 * Home — the Herpetoverse dashboard hub.
 *
 * The app opens here (first tab) instead of straight to the Collection
 * list, so a keeper lands on a glanceable overview: how big the
 * collection is, what needs feeding, and quick jumps to the common
 * flows. Ported from the proven Tarantuverse mobile dashboard
 * (apps/mobile/app/(tabs)/index.tsx), adapted for the HV unified
 * `animals` surface and reptile/amphibian conventions.
 *
 * Data (honesty-first — only endpoints that exist, no fabricated stats):
 *   GET /animals/                 → collection total + species variety
 *   GET /animals/feeding-status   → overdue count + the Feeding Alerts list
 *   GET /animals/limits           → the "X / 5" free-tier counter (hidden
 *                                    when premium)
 *   GET /notifications/unread-count (via NotificationBell) → bell badge
 *
 * apiClient baseURL already includes /api/v1 (see services/api.ts), so
 * the lib helpers here start at the resource. Theme is dark-first via
 * ThemeContext — HV has no `error` color (use `danger`); on-primary text
 * is #0B0B0B everywhere (matches the collection FAB + feeding-day CTA).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { NotificationBell } from '../../src/components/NotificationBell';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  ANIMAL_TAXA,
  getAnimalLimits,
  listAnimalFeedingStatus,
  listAnimals,
  type AnimalFeedingStatus,
  type AnimalLimits,
  type AnimalTaxon,
} from '../../src/lib/animals';

function taxonGlyph(taxon: string): string {
  return ANIMAL_TAXA[taxon as AnimalTaxon]?.glyph ?? '🦕';
}

function feedingName(a: AnimalFeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}

// Color for the "days overdue" line. Every row here is already overdue
// (the server's is_overdue gate), so we only need two tiers: warning for
// recently overdue, danger once it's dragged on (21+ days). Colors come
// from the theme, never literals.
function overdueColor(days: number, colors: { warning: string; danger: string }): string {
  return days >= 21 ? colors.danger : colors.warning;
}

function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  // null = not loaded yet. We keep loading/refreshing separate so pull-to-
  // refresh doesn't blank the screen.
  const [animalCount, setAnimalCount] = useState<number | null>(null);
  const [speciesCount, setSpeciesCount] = useState<number | null>(null);
  const [feedingStatus, setFeedingStatus] = useState<AnimalFeedingStatus[]>([]);
  const [limits, setLimits] = useState<AnimalLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fetchDashboard = useCallback(async () => {
    const tz = new Date().getTimezoneOffset();

    // Every call is best-effort and independent: a 404/500 on one widget
    // hides that widget gracefully rather than breaking the hub. Run them
    // in parallel — none depends on another.
    const [animalsRes, feedingRes, limitsRes] = await Promise.all([
      listAnimals().catch(() => null),
      listAnimalFeedingStatus(tz).catch(() => null),
      getAnimalLimits().catch(() => null),
    ]);

    if (Array.isArray(animalsRes)) {
      setAnimalCount(animalsRes.length);
      // Distinct species = unique non-null scientific names. Falls back to
      // counting animals with a linked species id would double-count
      // "Unnamed"; scientific name is the honest variety signal.
      const names = new Set(
        animalsRes
          .map((a) => (a.scientific_name || '').trim().toLowerCase())
          .filter((n) => n.length > 0),
      );
      setSpeciesCount(names.size);
    }
    if (Array.isArray(feedingRes)) setFeedingStatus(feedingRes);
    if (limitsRes) setLimits(limitsRes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await fetchDashboard();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [fetchDashboard]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboard();
    } finally {
      setRefreshing(false);
    }
  }, [fetchDashboard]);

  // Overdue = the server's species/life-stage-aware `is_overdue` (already
  // excludes paused + never-fed), across every taxon — the same source
  // Feeding Day and the daily digest read, so the three surfaces agree.
  // Most-overdue first.
  const overdue = useMemo(
    () =>
      feedingStatus
        .filter((a) => a.is_overdue)
        .sort(
          (a, b) =>
            (b.days_since_last_feeding ?? 0) - (a.days_since_last_feeding ?? 0),
        ),
    [feedingStatus],
  );

  // "X / 5 animals" counter — free keepers approaching/at the cap only.
  // Hidden for premium (limit === -1) and until limits load.
  const capSubtitle =
    limits && !limits.is_premium && limits.limit > 0
      ? `${limits.current_count} / ${limits.limit} animals`
      : undefined;

  const greeting = user?.display_name ? `Hi, ${user.display_name}` : 'Home';

  const headerRight = <NotificationBell color={colors.primary} size={22} />;

  const feedingRoute = (a: AnimalFeedingStatus) => `/reptile/${a.id}` as never;

  const quickActions: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    route: string;
  }[] = [
    { icon: 'plus-circle-outline', label: 'Add Animal', route: '/reptile/add' },
    { icon: 'silverware-fork-knife', label: 'Feeding Day', route: '/feeding-day' },
    { icon: 'fridge-outline', label: 'Feeders', route: '/feeders' },
    { icon: 'tray-arrow-down', label: 'Import', route: '/import' },
    { icon: 'book-open-variant', label: 'Species', route: '/(tabs)/species' },
  ];

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title={greeting} rightAction={headerRight} />
        <View style={styles.scrollContent}>
          <View style={styles.statsRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
          <View style={styles.skeletonSection} />
        </View>
      </View>
    );
  }

  const count = animalCount ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={greeting}
        subtitle={capSubtitle}
        rightAction={headerRight}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ---------- Stat cards ---------- */}
        <View style={styles.statsRow}>
          {/* Collection total (+ free-tier counter) */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Collection: ${count} animals${
              capSubtitle ? `, ${capSubtitle}` : ''
            }. View all.`}
          >
            <View style={styles.statIconRow}>
              <View style={[styles.statIconBox, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="snake" size={20} color="#0B0B0B" />
              </View>
              <Text style={styles.statLabel}>Collection</Text>
            </View>
            <Text style={styles.statValue}>{count}</Text>
            <Text style={styles.statFooter}>
              {capSubtitle ? `${capSubtitle} · View all →` : 'View all →'}
            </Text>
          </TouchableOpacity>

          {/* Needs feeding */}
          <TouchableOpacity
            style={[styles.statCard, overdue.length > 0 && styles.statCardAlert]}
            onPress={() => router.push('/feeding-day' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Needs feeding: ${overdue.length} animals overdue. ${
              overdue.length > 0 ? 'Opens Feeding Day.' : 'All on schedule.'
            }`}
          >
            <View style={styles.statIconRow}>
              <View
                style={[
                  styles.statIconBox,
                  { backgroundColor: overdue.length > 0 ? colors.danger : colors.primary },
                ]}
              >
                <MaterialCommunityIcons
                  name={overdue.length > 0 ? 'alert' : 'check'}
                  size={20}
                  color="#0B0B0B"
                />
              </View>
              <Text style={styles.statLabel}>Needs Feeding</Text>
            </View>
            <Text style={styles.statValue}>{overdue.length}</Text>
            <Text style={styles.statFooter}>
              {overdue.length > 0 ? 'Overdue for feeding' : 'All on schedule'}
            </Text>
          </TouchableOpacity>

          {/* Species variety — distinct scientific names in the collection */}
          <View
            style={styles.statCard}
            accessibilityLabel={`Species variety: ${speciesCount ?? 0} distinct species.`}
          >
            <View style={styles.statIconRow}>
              <View style={[styles.statIconBox, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="dna" size={20} color="#0B0B0B" />
              </View>
              <Text style={styles.statLabel}>Species</Text>
            </View>
            <Text style={styles.statValue}>{speciesCount ?? '—'}</Text>
            <Text style={styles.statFooter}>Distinct in collection</Text>
          </View>
        </View>

        {/* ---------- Feeding Day CTA ---------- */}
        <TouchableOpacity
          onPress={() => router.push('/feeding-day' as never)}
          style={[
            styles.feedingDayCta,
            { backgroundColor: colors.primary, borderRadius: layout.radius.lg },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            overdue.length > 0
              ? `Feeding Day: ${overdue.length} due. Log feedings in bulk.`
              : 'Feeding Day. Log feedings in bulk.'
          }
        >
          <MaterialCommunityIcons
            name="silverware-fork-knife"
            size={18}
            color="#0B0B0B"
          />
          <Text style={styles.feedingDayCtaText}>
            Feeding Day{overdue.length > 0 ? `  ·  ${overdue.length} due` : ''}
          </Text>
        </TouchableOpacity>

        {/* ---------- Feeding Alerts ---------- */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🍽️ Feeding Alerts
          </Text>
          {overdue.length === 0 ? (
            <View style={styles.allFedWrap}>
              <Text style={styles.allFedEmoji}>✅</Text>
              <Text style={[styles.allFedTitle, { color: colors.textSecondary }]}>
                {count === 0
                  ? 'No animals yet'
                  : 'Everyone is fed on schedule'}
              </Text>
              <Text style={[styles.allFedSub, { color: colors.textTertiary }]}>
                {count === 0
                  ? 'Add your first animal to start tracking feedings.'
                  : 'Nice work keeping up with feedings.'}
              </Text>
            </View>
          ) : (
            <>
              {overdue.slice(0, 10).map((a) => {
                const days = a.days_since_last_feeding ?? 0;
                const label = feedingName(a);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.alertRow, { backgroundColor: colors.background }]}
                    onPress={() => router.push(feedingRoute(a))}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${days} days since last feeding. Opens detail to log a feeding.`}
                  >
                    {a.photo_url ? (
                      <Image source={{ uri: a.photo_url }} style={styles.alertImage} />
                    ) : (
                      <View
                        style={[
                          styles.alertImagePlaceholder,
                          { backgroundColor: colors.surfaceRaised },
                        ]}
                      >
                        <Text style={styles.alertGlyph}>{taxonGlyph(a.taxon)}</Text>
                      </View>
                    )}
                    <View style={styles.alertInfo}>
                      <Text
                        style={[styles.alertName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[
                          styles.alertDays,
                          { color: overdueColor(days, colors) },
                        ]}
                      >
                        {days} days since last feeding
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.logBtn,
                        { backgroundColor: colors.primary, borderRadius: layout.radius.sm },
                      ]}
                    >
                      <Text style={styles.logBtnText}>Log</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {overdue.length > 10 && (
                <Text style={[styles.moreText, { color: colors.textTertiary }]}>
                  + {overdue.length - 10} more overdue
                </Text>
              )}
            </>
          )}
        </View>

        {/* ---------- Quick actions ---------- */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 14 }]}>
            Quick Actions
          </Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
                onPress={() => router.push(item.route as never)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View
                  style={[
                    styles.actionIconHalo,
                    { backgroundColor: colors.primary + '22' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <Text
                  style={[styles.actionLabel, { color: colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export default withErrorBoundary(DashboardScreen, 'dashboard');

// ---------------------------------------------------------------------------
// Styles — StyleSheet.create at module level (via a factory so theme colors
// bake in). Only layout/typography lives here; every color that varies with
// theme is applied inline at the call site.
// ---------------------------------------------------------------------------

function makeStyles(colors: {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  danger: string;
}) {
  return StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16 },

    // Skeleton
    skeletonCard: {
      flex: 1,
      minWidth: '45%',
      height: 96,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonSection: {
      height: 220,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 16,
    },

    // Stat cards
    statsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statCardAlert: {
      borderColor: colors.danger,
    },
    statIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4,
    },
    statIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
      flexShrink: 1,
    },
    statValue: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginLeft: 46,
    },
    statFooter: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
      marginLeft: 46,
    },

    // Feeding Day CTA
    feedingDayCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
      marginBottom: 16,
    },
    feedingDayCtaText: {
      color: '#0B0B0B',
      fontSize: 15,
      fontWeight: '700',
    },

    // Section card
    sectionCard: {
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
    },

    // Feeding alert row
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
    },
    alertImage: { width: 42, height: 42, borderRadius: 8 },
    alertImagePlaceholder: {
      width: 42,
      height: 42,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertGlyph: { fontSize: 22 },
    alertInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
    alertName: { fontSize: 15, fontWeight: '600' },
    alertDays: { fontSize: 13, fontWeight: '500', marginTop: 2 },
    logBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    logBtnText: { color: '#0B0B0B', fontSize: 13, fontWeight: '700' },
    moreText: { fontSize: 13, textAlign: 'center', marginTop: 4 },

    // All fed / empty state
    allFedWrap: { alignItems: 'center', paddingVertical: 20 },
    allFedEmoji: { fontSize: 40, marginBottom: 8 },
    allFedTitle: { fontSize: 15, fontWeight: '600' },
    allFedSub: {
      fontSize: 13,
      marginTop: 4,
      textAlign: 'center',
      maxWidth: 280,
    },

    // Quick actions grid
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    actionButton: {
      width: '47%',
      flexGrow: 1,
      borderWidth: 1,
      paddingVertical: 16,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 8,
    },
    actionIconHalo: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
