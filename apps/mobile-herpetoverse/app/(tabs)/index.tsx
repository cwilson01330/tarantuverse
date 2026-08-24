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
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  type AnimalTaxon,
  type AnimalLimits,
  createFeeding,
  quickFeedAnimal,
  getAnimalLimits,
  listAnimals,
} from '../../src/lib/animals';
import { GradientBand } from '../../src/components/GradientBand';
import { AnimalActionSheet } from '../../src/components/AnimalActionSheet';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { daysSince, relativeDays } from '../../src/utils/relative-days';
import { DEFAULT_CGD_FOOD_TYPE, feedingPillColor } from '../../src/lib/cgd';

// ---------------------------------------------------------------------------
// Types — minimum subset of the Animal schema needed for the card.
// Full shapes live in the detail screens; here we keep the surface
// small so the API contract is obvious.
// ---------------------------------------------------------------------------

/** Emerald → near-black, matching the Home header band. */
const BAND_COLORS = ['#065F46', '#0B0B0B'] as const;

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
  /** Secondary fact on the card's status line. Server sends a string. */
  current_weight_g: string | null;
  /** Secondary fact — "shed 6d ago". */
  last_shed_at: string | null;
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
  const insets = useSafeAreaInsets();

  // Search is local-only: it filters the rows already loaded, so there is
  // no endpoint, no debounce and no loading state. `searching` toggles the
  // input; clearing the query collapses it again.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const [rows, setRows] = useState<ReptileRow[] | null>(null);
  // Free-tier cap status, for the subtle "X / 5" header counter. null =
  // not loaded yet or the call failed (we simply hide the counter then —
  // it's a nicety, never a blocker). Hidden entirely for premium keepers.
  const [limits, setLimits] = useState<AnimalLimits | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Taxon filter — null = "All". Only taxa the keeper actually owns get
  // a chip (see ownedTaxa below), so the bar never shows empty buckets.
  const [taxonFilter, setTaxonFilter] = useState<AnimalTaxon | null>(null);
  // Long-press quick-actions sheet. `actionTarget` holds the animal
  // whose sheet is open (null = closed); `actionBusy` gates the rows
  // while a write is in flight, and `actionBusyKey` says which row
  // should show the spinner.
  const [actionTarget, setActionTarget] = useState<ReptileRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<'fed' | 'cgd' | null>(
    null,
  );

  // Header counter subtitle — "3 / 5 animals" for free keepers who are
  // approaching or at the cap. Hidden entirely for premium (limit === -1)
  // and when limits haven't loaded. Undefined = no subtitle rendered.
  const capSubtitle =
    limits && !limits.is_premium && limits.limit > 0
      ? `${limits.current_count} of ${limits.limit} animals`
      : undefined;

  /**
   * Emerald header band, shared by the loading / empty / populated states.
   *
   * The four unlabeled 22px icons that used to live here (bell, Feeders,
   * Import, Feeding Day) are gone — every one of those destinations is now
   * a labelled tile or the bell on Home, so nothing became unreachable and
   * the header stopped being a row of unexplained glyphs.
   *
   * Only `magnify` is here, and it does real work: a local filter over the
   * rows already in memory. The handoff also specced `tune-variant` (sort
   * sheet) and `view-grid-outline` (layout toggle); both are deliberately
   * left out until they have behaviour behind them, because a header icon
   * that does nothing is worse than an absent one.
   */
  const collectionHeader = (
    <GradientBand colors={BAND_COLORS} style={{ paddingTop: insets.top + 10 }}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Collection
          </Text>
          {(capSubtitle || rows) && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {capSubtitle ??
                `${rows?.length ?? 0} ${
                  (rows?.length ?? 0) === 1 ? 'animal' : 'animals'
                }`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            // Closing search clears the query too, otherwise the list stays
            // filtered by an input the keeper can no longer see.
            setSearching((s) => {
              if (s) setQuery('');
              return !s;
            });
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={searching ? 'Close search' : 'Search your collection'}
        >
          <MaterialCommunityIcons
            name={searching ? 'close' : 'magnify'}
            size={22}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {searching && (
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={19} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or species"
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={styles.searchInput}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search your collection by name or species"
          />
        </View>
      )}
    </GradientBand>
  );

  const fetchAll = useCallback(async () => {
    // Cap status for the header counter — best-effort, never blocks the
    // collection. A failure just leaves the counter hidden.
    getAnimalLimits()
      .then(setLimits)
      .catch(() => setLimits(null));

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
        current_weight_g: a.current_weight_g,
        last_shed_at: a.last_shed_at,
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
      // quickFeedAnimal remembers the animal's last meal server-side.
      await quickFeedAnimal(target.id);
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

  // Visible one-tap "Fed" straight off the card (no long-press needed) — the
  // low-friction path for frequent feeders. Reuses the last meal server-side.
  const [quickFedId, setQuickFedId] = useState<string | null>(null);
  const handleQuickFeed = async (row: ReptileRow) => {
    if (quickFedId) return;
    setQuickFedId(row.id);
    try {
      await quickFeedAnimal(row.id);
      await fetchAll();
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Fed ${reptileTitle(row)}`, ToastAndroid.SHORT);
      }
    } catch {
      Alert.alert(
        'Could not log feeding',
        `Something went wrong logging a feeding for ${reptileTitle(row)}. Please try again.`,
      );
    } finally {
      setQuickFedId(null);
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

  // Taxa the keeper actually owns, in registry display order. Drives the
  // filter chips so we never render an empty bucket.
  const ownedTaxa = useMemo<AnimalTaxon[]>(() => {
    if (!rows) return [];
    const present = new Set(rows.map((r) => r.taxon));
    return ANIMAL_TAXON_ORDER.filter((t) => present.has(t));
  }, [rows]);

  // Rows after the active taxon filter. Null filter = show everything.
  const visibleRows = useMemo(() => {
    if (!rows) return rows;
    let out = taxonFilter ? rows.filter((r) => r.taxon === taxonFilter) : rows;

    // Local search across the fields the keeper actually sees on the card:
    // their own name for the animal, the common name and the scientific
    // name. Matching hidden fields would make results look arbitrary.
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        [r.name, r.common_name, r.scientific_name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, taxonFilter, query]);

  // If the keeper deletes their last animal of the filtered taxon, drop
  // back to "All" so we don't get stuck on an empty filtered view.
  if (taxonFilter && ownedTaxa.length > 0 && !ownedTaxa.includes(taxonFilter)) {
    setTaxonFilter(null);
  }

  // ---------- Loading skeleton ----------
  if (rows === null) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        {collectionHeader}
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
        {collectionHeader}
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
      {collectionHeader}
      <FlatList
        data={visibleRows ?? []}
        keyExtractor={(r) => `${r.taxon}:${r.id}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {partialError ? (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.errorBannerText}>{partialError}</Text>
              </View>
            ) : null}
            {/* Taxon filter — only when the keeper owns 2+ taxa. Chips are
                generated from the registry (glyph + plural) for the taxa
                actually present. */}
            {ownedTaxa.length > 1 && (
              <TaxonFilterBar
                ownedTaxa={ownedTaxa}
                active={taxonFilter}
                onChange={setTaxonFilter}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ReptileCard
            row={item}
            onPress={() => {
              // ADR-003: one taxon-agnostic /reptile/ detail route.
              router.push(`/reptile/${item.id}` as never);
            }}
            onLongPress={() => setActionTarget(item)}
            onFed={() => handleQuickFeed(item)}
            fedBusy={quickFedId === item.id}
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
// Taxon filter bar
// ---------------------------------------------------------------------------

function TaxonFilterBar({
  ownedTaxa,
  active,
  onChange,
}: {
  ownedTaxa: AnimalTaxon[];
  active: AnimalTaxon | null;
  onChange: (t: AnimalTaxon | null) => void;
}) {
  const { colors, layout } = useTheme();

  const chips: { key: string; taxon: AnimalTaxon | null; label: string }[] = [
    { key: 'all', taxon: null, label: 'All' },
    ...ownedTaxa.map((t) => ({
      key: t,
      taxon: t as AnimalTaxon | null,
      label: `${ANIMAL_TAXA[t].glyph} ${ANIMAL_TAXA[t].plural}`,
    })),
  ];

  return (
    <View style={styles.filterBar}>
      {chips.map((chip) => {
        const selected = active === chip.taxon;
        return (
          <TouchableOpacity
            key={chip.key}
            onPress={() => onChange(chip.taxon)}
            style={[
              styles.filterChip,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
                borderRadius: layout.radius.sm,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Filter by ${chip.label}`}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selected ? '#0B0B0B' : colors.textSecondary },
              ]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * Collection row — Screen 4 of the design handoff.
 *
 * The photo is a 96px full-bleed column rather than a 56px inset thumb:
 * this is a screen about animals, and the photo is how a keeper actually
 * recognises them.
 *
 * The three actions below (Fed / log shed / log weight) already existed —
 * behind an unadvertised long-press on the action sheet. Surfacing them on
 * the card is the single biggest discoverability win in this app. The
 * long-press sheet stays for Edit.
 *
 * Not implemented from the spec: appending the morph to the species line
 * ("Python regius · Pastel het Clown"). The animals list payload carries no
 * morph/genetics field — that data lives behind the detail screen's
 * Genetics section. Adding it needs a backend field on the list response,
 * so it's a separate change rather than something to fake here.
 */
function ReptileCard({
  row,
  onPress,
  onLongPress,
  onFed,
  fedBusy,
}: {
  row: ReptileRow;
  onPress: () => void;
  onLongPress: () => void;
  onFed: () => void;
  fedBusy: boolean;
}) {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const lastFed = relativeDays(row.last_fed_at);
  const days = daysSince(row.last_fed_at);
  // Glyph sourced from the registry; unknown/legacy taxa fall back to a
  // generic herp glyph rather than mislabeling as a lizard.
  const taxonGlyph = ANIMAL_TAXA[row.taxon]?.glyph ?? '🦕';

  // Colour-coded last-fed indicator. Snake/lizard cadence is the default;
  // CGD-fed rhacodactylids get a tighter ramp (overdue at day 4 instead of
  // day 7) so a healthy crestie reads as green at day 2, not yellow.
  const statusColor = feedingPillColor(days, row.feeds_on_cgd, {
    green: colors.success,
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
  });

  // Status line. `days` is null for an animal that has never been fed —
  // saying "0d" there would be a lie, and concatenating the null is what
  // produced the "nulld ago" bug on the Tarantuverse card.
  const statusText =
    days == null ? 'Not yet fed' : lastFed ? `Fed ${lastFed.toLowerCase()}` : `${days}d`;

  // Secondary facts, only when real. Weight arrives as a string from the
  // server, so it's parsed before formatting and dropped if unparseable.
  const secondary: string[] = [];
  if (row.feeds_on_cgd) secondary.push('CGD');
  const weight = row.current_weight_g ? Number(row.current_weight_g) : NaN;
  if (Number.isFinite(weight) && weight > 0) {
    secondary.push(`${Math.round(weight).toLocaleString()} g`);
  }
  const shedDays = daysSince(row.last_shed_at);
  if (shedDays != null) secondary.push(`shed ${shedDays}d ago`);

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
        days == null ? 'never fed' : statusText.toLowerCase()
      }`}
      accessibilityHint="Opens the detail screen. Long press for quick actions."
    >
      {/* Photo — full-bleed left column, no inset, no overlays. */}
      {row.photo_url ? (
        <Image source={{ uri: row.photo_url }} style={styles.cardImage} />
      ) : (
        <View
          style={[
            styles.cardImage,
            styles.cardImageEmpty,
            { backgroundColor: colors.surfaceRaised },
          ]}
        >
          <Text style={{ fontSize: 28 }}>{taxonGlyph}</Text>
        </View>
      )}

      <View style={styles.cardBody}>
        {/* Name + sex glyph */}
        <View style={styles.cardTitleRow}>
          <Text
            style={[styles.cardTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {reptileTitle(row)}
          </Text>
          <MaterialCommunityIcons
            name={
              row.sex === 'female'
                ? 'gender-female'
                : row.sex === 'male'
                  ? 'gender-male'
                  : 'help-circle-outline'
            }
            size={17}
            color={
              row.sex === 'female'
                ? '#ec4899'
                : row.sex === 'male'
                  ? '#3b82f6'
                  : colors.textTertiary
            }
          />
        </View>

        {row.scientific_name && (
          <Text
            style={[styles.cardSubtitle, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {row.scientific_name}
          </Text>
        )}

        {/* Status line — dot + feeding delta, then the secondary facts. */}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: days == null ? colors.textTertiary : statusColor },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: days == null ? colors.textTertiary : statusColor },
            ]}
            numberOfLines={1}
          >
            {statusText}
          </Text>
          {secondary.length > 0 && (
            <Text
              style={[styles.statusSecondary, { color: colors.textTertiary }]}
              numberOfLines={1}
            >
              {` · ${secondary.join(' · ')}`}
            </Text>
          )}
        </View>

        {/* Actions. These were long-press-only until now. */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={onFed}
            disabled={fedBusy}
            style={[
              styles.actionPrimary,
              { backgroundColor: colors.primary, opacity: fedBusy ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              row.feeds_on_cgd
                ? `Log a fresh CGD serving for ${reptileTitle(row)}`
                : `Log a feeding for ${reptileTitle(row)}`
            }
          >
            <Text style={styles.actionPrimaryText}>
              {fedBusy ? '…' : row.feeds_on_cgd ? 'Refresh CGD' : 'Fed'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push(`/reptile/log-shed/${row.id}` as never)}
            style={[styles.actionIconBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Log a shed for ${reptileTitle(row)}`}
          >
            <MaterialCommunityIcons
              name="weather-windy"
              size={15}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push(`/reptile/log-weight/${row.id}` as never)}
            style={[styles.actionIconBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Log a weight for ${reptileTitle(row)}`}
          >
            <MaterialCommunityIcons
              name="scale-bathroom"
              size={15}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
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

  // Taxon filter bar
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: { color: '#dc2626', fontSize: 13 },

  // Card
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    // Height is pinned so the band doesn't jump between platforms —
    // Android's TextInput carries extra intrinsic padding.
    padding: 0,
  },

  // Card — photo is a full-bleed column, so the card itself has no
  // padding and clips its children instead.
  card: {
    flexDirection: 'row',
    marginBottom: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: 96,
    // No fixed height: alignSelf stretch makes the photo match the body's
    // height, so the column stays full-bleed as the body grows.
    alignSelf: 'stretch',
  },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    gap: 7,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600' },
  cardSubtitle: {
    fontSize: 12,
    fontStyle: 'italic',
    // gap on cardBody handles the rhythm; a margin here would double it.
    marginTop: -3,
  },

  // Status line
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusSecondary: { flex: 1, minWidth: 0, fontSize: 12 },

  // Action row
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionPrimary: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: { color: '#0B0B0B', fontSize: 12, fontWeight: '700' },
  actionIconBtn: {
    width: 38,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
