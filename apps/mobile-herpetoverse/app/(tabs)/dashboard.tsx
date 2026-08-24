/**
 * Home — the Herpetoverse dashboard hub.
 *
 * Rebuilt to Screen 3 of the keeper-apps design handoff. The brief was
 * flow, consistency and discoverability — not a repaint.
 *
 * What changed from the previous version, and why:
 *
 *  1. ONE feeding card. The old screen had a "Needs Feeding" stat tile, a
 *     "Feeding Day" CTA button AND a "Feeding Alerts" list — three
 *     surfaces rendering the same /animals/feeding-status payload. They
 *     are now a single hero card with the count, the taxa breakdown, up
 *     to three rows, and a Start button.
 *  2. Inline one-tap mark-fed on each row (quickFeedAnimal), so the most
 *     common daily action doesn't require opening the animal.
 *  3. A tools grid. HV has shipped features — Morphs, Import, Feeders,
 *     Breeding — with no entry point from Home. Every tile below routes
 *     somewhere that exists (verified against app/).
 *  4. Gradient header band, matching Tarantuverse's redesigned Home so
 *     the two apps rhyme. See GradientBand for why it isn't
 *     expo-linear-gradient.
 *
 * Data — honesty-first, only endpoints that exist, nothing fabricated:
 *   GET /animals/                  → count, species variety, shed-30d stat
 *   GET /animals/feeding-status    → hero count, taxa breakdown, rows
 *   GET /animals/limits            → cap subtitle + upgrade row
 *   GET /hv-feeder-stocks/         → feeder stat (summed client-side)
 *   POST /animals/{id}/quick-feed  → the row check button
 *
 * Deliberately NOT built (from the handoff's Screen 3 tool list): Weigh-in,
 * Log shed and QR upload were specced as grid tiles, but all three need an
 * animal chosen first (`/reptile/qr/[id]`), and there is no global picker.
 * A tile that can't route is worse than no tile. Likewise the specced
 * "Sheds" stat had no collection-wide endpoint — `last_shed_at` on the
 * animals list gives an honest 30-day count instead, and the label says
 * exactly that.
 *
 * apiClient baseURL already includes /api/v1. Theme is dark-first: HV has
 * no `error` colour (use `danger`) and no `surfaceElevated` (use
 * `surfaceRaised`); on-primary text is #0B0B0B everywhere.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { GradientBand } from '../../src/components/GradientBand';
import { NotificationBell } from '../../src/components/NotificationBell';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { listFeederStocks } from '../../src/lib/feeders';
import {
  ANIMAL_TAXA,
  getAnimalLimits,
  listAnimalFeedingStatus,
  listAnimals,
  quickFeedAnimal,
  type AnimalFeedingStatus,
  type AnimalLimits,
  type AnimalTaxon,
} from '../../src/lib/animals';

/** Emerald → near-black, the HV header band. */
const BAND_COLORS = ['#065F46', '#0B0B0B'] as const;

/** Rows shown inline on the hero before it defers to Feeding Day. */
const HERO_ROWS = 3;

/**
 * Singular/plural both come from the taxon registry rather than appending
 * an "s" — "other" pluralises to "other", not "others", and the registry
 * is the single place that knows.
 */
function taxonCountLabel(taxon: string, n: number): string {
  const meta = ANIMAL_TAXA[taxon as AnimalTaxon];
  if (!meta) return `${n} other`;
  return `${n} ${(n === 1 ? meta.label : meta.plural).toLowerCase()}`;
}

function taxonGlyph(taxon: string): string {
  return ANIMAL_TAXA[taxon as AnimalTaxon]?.glyph ?? '🦕';
}

function feedingName(a: AnimalFeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}

// Every row on the hero is already overdue (the server's is_overdue gate),
// so two tiers are enough: warning while it's recent, danger once it has
// dragged on. Colours come from the theme, never literals.
function overdueColor(
  days: number,
  colors: { warning: string; danger: string },
): string {
  return days >= 21 ? colors.danger : colors.warning;
}

/**
 * "3 snakes · 1 gecko" — the taxa breakdown under the hero count. Sorted
 * by count desc so the biggest group leads, capped at three groups with a
 * "+N more" tail so a varied collection doesn't wrap the line.
 */
function taxaBreakdown(rows: AnimalFeedingStatus[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.taxon, (counts.get(r.taxon) ?? 0) + 1);

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([taxon, n]) => taxonCountLabel(taxon, n));

  if (parts.length <= 3) return parts.join(' · ');
  return `${parts.slice(0, 3).join(' · ')} · +${parts.length - 3} more`;
}

function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  // `layout` is intentionally not read here: this screen's radii come from
  // the design handoff's exact values (hero 18, cards 14), which sit
  // between the theme's md/lg steps.
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // null = not loaded yet. loading/refreshing stay separate so
  // pull-to-refresh doesn't blank the screen.
  const [animalCount, setAnimalCount] = useState<number | null>(null);
  const [speciesCount, setSpeciesCount] = useState<number | null>(null);
  const [shed30d, setShed30d] = useState<number | null>(null);
  const [feederCount, setFeederCount] = useState<number | null>(null);
  const [lowStock, setLowStock] = useState(0);
  const [feedingStatus, setFeedingStatus] = useState<AnimalFeedingStatus[]>([]);
  const [limits, setLimits] = useState<AnimalLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Ids currently being marked fed — disables the row's check button and
  // shows a spinner, so a double tap can't post two feedings.
  const [feeding, setFeeding] = useState<Set<string>>(new Set());

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fetchDashboard = useCallback(async () => {
    const tz = new Date().getTimezoneOffset();

    // Every call is best-effort and independent: a failure on one widget
    // hides that widget rather than breaking the hub. None depends on
    // another, so they run in parallel.
    const [animalsRes, feedingRes, limitsRes, feedersRes] = await Promise.all([
      listAnimals().catch(() => null),
      listAnimalFeedingStatus(tz).catch(() => null),
      getAnimalLimits().catch(() => null),
      listFeederStocks().catch(() => null),
    ]);

    if (Array.isArray(animalsRes)) {
      setAnimalCount(animalsRes.length);

      // Distinct species = unique non-empty scientific names. Counting
      // linked species ids instead would fold every unlinked animal into
      // one bucket; the scientific name is the honest variety signal.
      const names = new Set(
        animalsRes
          .map((a) => (a.scientific_name || '').trim().toLowerCase())
          .filter((n) => n.length > 0),
      );
      setSpeciesCount(names.size);

      // There is no collection-wide sheds endpoint, but `last_shed_at`
      // rides along on the animals list. That supports exactly one honest
      // claim: how many animals shed in the last 30 days. It is NOT a
      // count of sheds — an animal that shed twice counts once — which is
      // why the label reads "animals shed".
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setShed30d(
        animalsRes.filter((a) => {
          if (!a.last_shed_at) return false;
          const t = new Date(a.last_shed_at).getTime();
          return Number.isFinite(t) && t >= cutoff;
        }).length,
      );
    }

    if (Array.isArray(feedingRes)) setFeedingStatus(feedingRes);
    if (limitsRes) setLimits(limitsRes);

    if (Array.isArray(feedersRes)) {
      // total_count is server-computed and null for stocks tracked without
      // a count, so those contribute 0 rather than NaN.
      setFeederCount(
        feedersRes.reduce((sum, s) => sum + (s.total_count ?? 0), 0),
      );
      setLowStock(feedersRes.filter((s) => s.is_low_stock).length);
    }
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
  // Feeding Day and the daily digest read, so all three surfaces agree.
  // Most overdue first.
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

  /**
   * One-tap mark-fed. Optimistic: the row leaves the list immediately and
   * the count drops, because waiting on a round-trip to remove a row the
   * keeper just actioned feels broken. On failure we restore the row —
   * the refetch below is what makes the optimistic state honest.
   */
  const handleMarkFed = useCallback(
    async (animal: AnimalFeedingStatus) => {
      if (feeding.has(animal.id)) return;

      setFeeding((prev) => new Set(prev).add(animal.id));
      const snapshot = feedingStatus;

      // Drop it from the local list right away.
      setFeedingStatus((prev) => prev.filter((a) => a.id !== animal.id));

      try {
        await quickFeedAnimal(animal.id);
        // Settle against the server so interval_days / is_overdue reflect
        // the feeding we just logged.
        await fetchDashboard();
      } catch {
        // Put it back. No alert — the row reappearing IS the error signal,
        // and a modal over a one-tap action is disproportionate.
        setFeedingStatus(snapshot);
      } finally {
        setFeeding((prev) => {
          const next = new Set(prev);
          next.delete(animal.id);
          return next;
        });
      }
    },
    [feeding, feedingStatus, fetchDashboard],
  );

  const count = animalCount ?? 0;
  const isFree = !!limits && !limits.is_premium && limits.limit > 0;

  // Header subtitle. Free keepers see the cap (it's the number that
  // governs what they can do next); premium keepers see the collection
  // shape instead. The old screen showed the cap in the header AND on the
  // collection stat card.
  // "species" is its own plural, so it takes no branch.
  const headerSubtitle = isFree
    ? `${limits!.current_count} of ${limits!.limit} animals · Free plan`
    : `${count} ${count === 1 ? 'animal' : 'animals'} · ${speciesCount ?? 0} species`;

  const greeting = user?.display_name ? `Hi, ${user.display_name}` : 'Home';

  // Every route here was checked against app/ — see the header note about
  // why Weigh-in / Log shed / QR upload are absent.
  const tools: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    route: string;
  }[] = [
    { icon: 'plus-circle-outline', label: 'Add', route: '/reptile/add' },
    { icon: 'silverware-fork-knife', label: 'Feeding Day', route: '/feeding-day' },
    { icon: 'fridge-outline', label: 'Feeders', route: '/feeders' },
    { icon: 'calculator-variant-outline', label: 'Morphs', route: '/morph-calculator' },
    { icon: 'book-open-variant', label: 'Species', route: '/(tabs)/species' },
    // heart-multiple (not the -outline variant) — this is the glyph the
    // Breeding tab bar already uses, so the tile matches its destination,
    // and it's proven to resolve in this app. An unknown MDI name renders
    // an empty box silently, so prefer names already shipping here.
    { icon: 'heart-multiple', label: 'Breeding', route: '/(tabs)/breeding' },
    { icon: 'tray-arrow-down', label: 'Import', route: '/import' },
    { icon: 'cog-outline', label: 'Settings', route: '/settings' },
  ];

  const header = (
    <GradientBand colors={BAND_COLORS} style={{ paddingTop: insets.top + 10 }}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {greeting}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/species' as never)}
            accessibilityRole="button"
            accessibilityLabel="Search species"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="magnify" size={22} color="#fff" />
          </TouchableOpacity>
          <NotificationBell color="#fff" size={22} />
        </View>
      </View>
    </GradientBand>
  );

  // ---------- Loading ----------
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {header}
        <View style={styles.body}>
          <View style={styles.skeletonHero} />
          <View style={styles.statStrip}>
            <View style={styles.skeletonStat} />
            <View style={styles.skeletonStat} />
            <View style={styles.skeletonStat} />
          </View>
        </View>
      </View>
    );
  }

  const heroRows = overdue.slice(0, HERO_ROWS);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ---------- Feeding hero ---------- */}
        <View
          style={[
            styles.hero,
            overdue.length > 0 && { borderColor: colors.danger + '55' },
          ]}
        >
          <View style={styles.heroHead}>
            <View
              style={[
                styles.heroIconWell,
                {
                  backgroundColor:
                    overdue.length > 0 ? colors.danger + '24' : colors.primary + '24',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={overdue.length > 0 ? 'silverware-fork-knife' : 'check'}
                size={24}
                color={overdue.length > 0 ? colors.danger : colors.primary}
              />
            </View>

            <View style={styles.heroHeadText}>
              {overdue.length > 0 ? (
                <>
                  <View style={styles.heroCountRow}>
                    <Text style={styles.heroCount}>{overdue.length}</Text>
                    <Text style={styles.heroCountLabel}>due today</Text>
                  </View>
                  <Text style={styles.heroSub} numberOfLines={1}>
                    {taxaBreakdown(overdue)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.heroClearTitle}>
                    {count === 0 ? 'No animals yet' : 'Everyone is fed'}
                  </Text>
                  <Text style={styles.heroSub} numberOfLines={2}>
                    {count === 0
                      ? 'Add your first animal to start tracking feedings.'
                      : 'Nothing is overdue right now.'}
                  </Text>
                </>
              )}
            </View>

            {overdue.length > 0 && (
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/feeding-day' as never)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Start feeding day. ${overdue.length} animals due.`}
              >
                <Text style={styles.startBtnText}>Start</Text>
              </TouchableOpacity>
            )}
          </View>

          {overdue.length > 0 && (
            <View style={styles.heroList}>
              {heroRows.map((a) => {
                const days = a.days_since_last_feeding;
                const busy = feeding.has(a.id);
                const label = feedingName(a);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.heroRow}
                    onPress={() => router.push(`/reptile/${a.id}` as never)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${
                      days == null ? 'not yet fed' : `${days} days since last feeding`
                    }. Opens detail.`}
                  >
                    {a.photo_url ? (
                      <Image source={{ uri: a.photo_url }} style={styles.heroThumb} />
                    ) : (
                      <View
                        style={[
                          styles.heroThumb,
                          styles.heroThumbEmpty,
                          { backgroundColor: colors.surfaceRaised },
                        ]}
                      >
                        <Text style={styles.heroThumbGlyph}>{taxonGlyph(a.taxon)}</Text>
                      </View>
                    )}

                    <View style={styles.heroRowText}>
                      <Text style={styles.heroRowName} numberOfLines={1}>
                        {label}
                      </Text>
                      {/* days can be null for an animal that has never been
                          fed. Concatenating it produced the "nulld ago" bug
                          on the TV collection card — guard it here too. */}
                      <Text
                        style={[
                          styles.heroRowMeta,
                          {
                            color:
                              days == null
                                ? colors.textTertiary
                                : overdueColor(days, colors),
                          },
                        ]}
                      >
                        {days == null ? 'Not yet fed' : `${days}d overdue`}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.heroCheck, busy && { opacity: 0.5 }]}
                      onPress={() => handleMarkFed(a)}
                      disabled={busy}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${label} as fed`}
                      hitSlop={6}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <MaterialCommunityIcons
                          name="check"
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}

              {overdue.length > HERO_ROWS && (
                <TouchableOpacity
                  onPress={() => router.push('/feeding-day' as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`See all ${overdue.length} animals due`}
                  style={styles.heroFooter}
                >
                  <Text style={[styles.heroFooterText, { color: colors.accent }]}>
                    See all {overdue.length} →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ---------- Stat strip ---------- */}
        <View style={styles.statStrip}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/species' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${speciesCount ?? 0} distinct species in your collection. Browse species.`}
          >
            <View style={styles.statLabelRow}>
              <MaterialCommunityIcons name="dna" size={14} color={colors.accent} />
              <Text style={styles.statLabel}>Species</Text>
            </View>
            <Text style={styles.statValue}>{speciesCount ?? '—'}</Text>
            <Text style={styles.statFooter}>in collection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/feeders' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Feeders: ${feederCount ?? 0} in stock${
              lowStock > 0 ? `, ${lowStock} running low` : ''
            }.`}
          >
            <View style={styles.statLabelRow}>
              <MaterialCommunityIcons name="snowflake" size={14} color={colors.info} />
              <Text style={styles.statLabel}>Feeders</Text>
            </View>
            <Text style={styles.statValue}>{feederCount ?? '—'}</Text>
            <Text
              style={[
                styles.statFooter,
                lowStock > 0 && { color: colors.warning },
              ]}
            >
              {lowStock > 0 ? `${lowStock} running low` : 'in stock'}
            </Text>
          </TouchableOpacity>

          <View
            style={styles.statCard}
            accessibilityLabel={`${shed30d ?? 0} animals shed in the last 30 days.`}
          >
            <View style={styles.statLabelRow}>
              <MaterialCommunityIcons
                name="weather-windy"
                size={14}
                color={colors.warning}
              />
              <Text style={styles.statLabel}>Shed</Text>
            </View>
            <Text style={styles.statValue}>{shed30d ?? '—'}</Text>
            {/* "animals shed", not "sheds" — last_shed_at gives one date per
                animal, so this cannot count repeat sheds. */}
            <Text style={styles.statFooter}>animals · 30d</Text>
          </View>
        </View>

        {/* ---------- Everything else ---------- */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>EVERYTHING ELSE</Text>
        </View>

        <View style={styles.toolsGrid}>
          {tools.map((t) => (
            <TouchableOpacity
              key={t.label}
              style={styles.toolTile}
              onPress={() => router.push(t.route as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <View
                style={[styles.toolHalo, { backgroundColor: colors.primary + '1F' }]}
              >
                <MaterialCommunityIcons name={t.icon} size={20} color={colors.accent} />
              </View>
              <Text style={styles.toolLabel} numberOfLines={2}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ---------- Upgrade ---------- */}
        {isFree && (
          <TouchableOpacity
            style={styles.upgradeRow}
            onPress={() => router.push('/settings' as never)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Upgrade. Using ${limits!.current_count} of ${
              limits!.limit
            } animals on the free plan.`}
          >
            <MaterialCommunityIcons
              name="arrow-up-circle-outline"
              size={22}
              color={colors.accent}
            />
            <View style={styles.upgradeText}>
              <Text style={styles.upgradeTitle}>Unlimited animals</Text>
              <Text style={styles.upgradeSub}>
                You&rsquo;re using {limits!.current_count} of {limits!.limit} on the free
                plan.
              </Text>
            </View>
            <Text style={[styles.upgradeCta, { color: colors.accent }]}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

export default withErrorBoundary(DashboardScreen, 'dashboard');

// ---------------------------------------------------------------------------
// Styles — StyleSheet.create at module level (via a factory so theme colours
// bake in). A StyleSheet.create inside the component would re-run on every
// render and breaks with early returns.
// ---------------------------------------------------------------------------

function makeStyles(colors: {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  accent: string;
  danger: string;
  warning: string;
  info: string;
}) {
  return StyleSheet.create({
    container: { flex: 1 },
    body: { padding: 16, gap: 12 },

    // Header band
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 12,
    },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    headerSubtitle: {
      fontSize: 12,
      fontWeight: '400',
      color: 'rgba(255,255,255,0.72)',
      marginTop: 2,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },

    // Skeletons
    skeletonHero: {
      height: 190,
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skeletonStat: {
      flex: 1,
      height: 78,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },

    // Feeding hero
    hero: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      flexShrink: 0,
      overflow: 'hidden',
    },
    heroHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
    },
    heroIconWell: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroHeadText: { flex: 1, minWidth: 0 },
    heroCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    heroCount: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
    heroCountLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    heroClearTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    heroSub: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
    startBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
    startBtnText: { fontSize: 14, fontWeight: '700', color: '#0B0B0B' },

    // Hero rows
    heroList: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      padding: 8,
      gap: 4,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 8,
      borderRadius: 12,
    },
    heroThumb: { width: 38, height: 38, borderRadius: 10 },
    heroThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    heroThumbGlyph: { fontSize: 19 },
    heroRowText: { flex: 1, minWidth: 0 },
    heroRowName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    heroRowMeta: { fontSize: 12, marginTop: 1 },
    heroCheck: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroFooter: { paddingVertical: 8, paddingHorizontal: 8 },
    heroFooterText: { fontSize: 13, fontWeight: '600' },

    // Stat strip
    statStrip: { flexDirection: 'row', gap: 8 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 4,
    },
    statFooter: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },

    // Section label
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1.2,
      color: colors.textTertiary,
    },

    // Tools grid
    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    toolTile: {
      // Four columns: (100% - 3 gaps of 8) / 4. Expressed as a percentage
      // so it tracks the container rather than a hardcoded device width.
      width: '23.5%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 4,
      alignItems: 'center',
      gap: 6,
    },
    toolHalo: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 13,
    },

    // Upgrade
    upgradeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginTop: 4,
    },
    upgradeText: { flex: 1, minWidth: 0 },
    upgradeTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    upgradeSub: { fontSize: 11.5, color: colors.textTertiary, marginTop: 1 },
    upgradeCta: { fontSize: 12, fontWeight: '700' },
  });
}
