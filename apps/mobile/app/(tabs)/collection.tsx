import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  ToastAndroid,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import TarantulaCardSkeleton from '../../src/components/TarantulaCardSkeleton';
import PremoltAlertCard from '../../src/components/PremoltAlertCard';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import { feedingStatusColor } from '../../src/utils/status-colors';
import { TarantulaActionSheet } from '../../src/components/TarantulaActionSheet';
import {
  AddPickerSheet,
  type AddPickerTaxon,
} from '../../src/components/AddPickerSheet';
import {
  listScorpions,
  scorpionDisplayName,
  type Scorpion,
} from '../../src/lib/scorpions';
import {
  listCentipedes,
  centipedeDisplayName,
  type Centipede,
} from '../../src/lib/centipedes';
import {
  listWhipSpiders,
  whipSpiderDisplayName,
  type WhipSpider,
} from '../../src/lib/whip-spiders';
import {
  listInverts,
  invertDisplayName,
  INVERT_TAXA,
  taxonMdiIcon,
  type Invert as GenericInvert,
  type InvertTaxon,
} from '../../src/lib/inverts';
import { AppHeader } from '../../src/components/AppHeader';
import {
  listColonies,
  formatColonyCount,
  type ColonyListItem,
} from '../../src/lib/colonies';
// One card for every taxon — replaced five near-identical renderers that had
// already drifted apart (see AnimalCard's header comment).
import AnimalCard from '../../src/components/AnimalCard';

// Taxa that have no per-taxon list lib — fetched generically via /inverts/.
// (scorpion/centipede/whip_spider keep their existing per-taxon fetches.)
const GENERIC_TAXA: InvertTaxon[] = ['vinegaroon', 'true_spider', 'millipede', 'mantis', 'roach', 'other'];

interface Tarantula {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  photo_url?: string;
}

interface FeedingStatus {
  tarantula_id: string;
  days_since_last_feeding?: number;
  acceptance_rate?: number;
  // Pause flag — see migration pst_20260502. When true, the
  // collection grid renders a quiet "Paused" pill instead of the
  // red overdue treatment.
  is_feeding_paused?: boolean;
  // Species + life-stage aware, computed server-side. NOT a day threshold:
  // a sling eating every 5 days and an adult Grammostola eating every 30 are
  // both "overdue" at their own interval. This screen used to infer overdue
  // from a flat day count, so it disagreed with Home and the daily digest
  // about the same animal.
  is_overdue?: boolean;
  /** Recommended days between feedings for this animal. Lets the card report
   *  how far PAST DUE it is rather than how long since it last ate — those
   *  differ by the whole interval. */
  interval_days?: number | null;
}

/**
 * Mirrors apps/api/app/schemas/premolt.py::PremoltPrediction.
 *
 * This deliberately has NO `probability`. The retired legacy endpoint
 * returned an additive 0–100 score that was never calibrated against recorded
 * molt outcomes — a number that looked like a measurement and wasn't. The
 * canonical service reports a boolean plus the observations behind it, which
 * is what we can actually stand behind.
 *
 * `confidence` describes how much DATA supports the call (interval history,
 * refusal streak length), not predictive accuracy. Don't render it as a
 * likelihood.
 */
interface PremoltPrediction {
  tarantula_id: string;
  is_premolt_likely: boolean;
  confidence: 'high' | 'medium' | 'low' | string;
  data_quality: 'good' | 'fair' | 'insufficient' | string;
  recent_refusal_streak?: number;
  days_since_last_molt?: number | null;
}

// Taxon discriminator drives the FlatList row dispatcher: tarantulas
// keep their full-featured card (feeding badge + premolt + action
// sheet), scorpions + centipedes render via a simpler card until
// those features ship for the additional surfaces. New taxa land
// here when added.
// 'due' is a cross-taxon slice (everything overdue), not a taxon.
type TaxonFilter = 'all' | 'due' | 'tarantulas' | 'scorpions' | 'centipedes' | 'whip_spiders' | InvertTaxon;

/**
 * Chip key for a taxon.
 *
 * The four oldest taxa have PLURAL chip keys ('scorpions') for historical
 * reasons while their taxon strings are singular ('scorpion'); newer taxa use
 * the taxon string as-is. This function is the single place that knows.
 */
function taxonFilterKey(taxon: string): TaxonFilter {
  switch (taxon) {
    case 'tarantula': return 'tarantulas';
    case 'scorpion': return 'scorpions';
    case 'centipede': return 'centipedes';
    case 'whip_spider': return 'whip_spiders';
    default: return taxon as TaxonFilter;
  }
}

/** Chip order + labels. Only chips with a non-zero count are rendered. */
const TAXON_CHIPS: { value: TaxonFilter; label: string; taxon: string }[] = [
  { value: 'tarantulas', label: 'Tarantulas', taxon: 'tarantula' },
  { value: 'scorpions', label: 'Scorpions', taxon: 'scorpion' },
  { value: 'centipedes', label: 'Centipedes', taxon: 'centipede' },
  { value: 'whip_spiders', label: 'Whip spiders', taxon: 'whip_spider' },
  { value: 'vinegaroon', label: 'Vinegaroons', taxon: 'vinegaroon' },
  { value: 'true_spider', label: 'True spiders', taxon: 'true_spider' },
  { value: 'millipede', label: 'Millipedes', taxon: 'millipede' },
  { value: 'mantis', label: 'Mantises', taxon: 'mantis' },
  { value: 'roach', label: 'Roaches', taxon: 'roach' },
  { value: 'other', label: 'Other', taxon: 'other' },
];

type Row =
  | { kind: 'tarantula'; data: Tarantula }
  | { kind: 'scorpion'; data: Scorpion }
  | { kind: 'centipede'; data: Centipede }
  | { kind: 'whip_spider'; data: WhipSpider }
  | { kind: 'invert'; data: GenericInvert }
  // Colony mode (ADR-010) — a population entry, merged into the same list.
  | { kind: 'colony'; data: ColonyListItem };

function CollectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [scorpions, setScorpions] = useState<Scorpion[]>([]);
  const [centipedes, setCentipedes] = useState<Centipede[]>([]);
  const [whipSpiders, setWhipSpiders] = useState<WhipSpider[]>([]);
  const [otherInverts, setOtherInverts] = useState<GenericInvert[]>([]);
  const [colonies, setColonies] = useState<ColonyListItem[]>([]);
  // ONE map for every taxon, filled by a single /inverts/feeding-status call.
  // There used to be two (one per fetcher) purely to stop the tarantula fetch
  // from clobbering the invert one — a race that only existed because each
  // taxon fetched separately.
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map());
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'lastFed' | 'acquired'>('name');
  // Taxon filter — sits above search/sort. When 'tarantulas' or
  // 'scorpions', the other taxon is filtered out entirely.
  const [taxonFilter, setTaxonFilter] = useState<TaxonFilter>('all');
  // Search and sort moved off the list body and behind header actions — the
  // body used to open with a search field, a sort row, a title row and a stats
  // card before the first animal appeared.
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  // Long-press quick-actions sheet. `actionTarget` holds the tarantula
  // whose sheet is open (null = closed); `actionBusy` gates the rows
  // while the mark-fed POST is in flight.
  const [actionTarget, setActionTarget] = useState<Tarantula | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  // Add-to-collection taxon picker — replaces the native Alert.alert
  // dialog so the options render left-aligned with their glyphs.
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  // Load view preference from AsyncStorage
  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const savedView = await AsyncStorage.getItem('collection_view_mode');
        if (savedView === 'card' || savedView === 'list') {
          setViewMode(savedView);
        }
      } catch (error) {
        // Silently fail
      }
    };
    loadViewMode();
  }, []);

  const toggleViewMode = async (mode: 'card' | 'list') => {
    setViewMode(mode);
    try {
      await AsyncStorage.setItem('collection_view_mode', mode);
    } catch (error) {
      // Silently fail
    }
  };

  // Helper function to handle both R2 (absolute) and local (relative) URLs
  // getImageUrl now lives in src/utils/image-url.ts so dev/staging
  // builds use EXPO_PUBLIC_API_URL instead of the hardcoded prod host.

  useEffect(() => {
    fetchTarantulas();
    fetchScorpions();
    fetchCentipedes();
    fetchWhipSpiders();
    fetchOtherInverts();
    fetchColonies();
    loadFeedingStatuses();
  }, []);

  /**
   * Feeding status for EVERY animal in one request.
   *
   * This replaces two fetchers that between them fired one HTTP request per
   * animal (`/tarantulas/{id}/feeding-stats` for tarantulas, `/inverts/{id}/
   * feeding-stats` for the rest) — a 60-animal collection opened 60 requests
   * on every mount. `/inverts/feeding-status` answers for the whole
   * collection with one grouped query.
   *
   * It also fixes a correctness problem, which matters more: that endpoint
   * returns a species + life-stage aware `is_overdue`. This screen previously
   * inferred "overdue" from a flat day count, so Home, the Feeding Day screen
   * and the daily digest could each call the same animal something different.
   */
  const loadFeedingStatuses = async () => {
    try {
      // Calendar days in the keeper's zone — a UTC delta flips "0d" to "1d"
      // at UTC midnight rather than theirs.
      const tzOffset = new Date().getTimezoneOffset();
      const res = await apiClient.get('/inverts/feeding-status', {
        params: { tz_offset_minutes: tzOffset },
      });
      const next = new Map<string, FeedingStatus>();
      for (const row of res.data ?? []) {
        next.set(row.id, {
          tarantula_id: row.id,
          days_since_last_feeding: row.days_since_last_feeding ?? undefined,
          is_feeding_paused: row.is_feeding_paused ?? false,
          is_overdue: row.is_overdue ?? false,
        });
      }
      setFeedingStatuses(next);
    } catch {
      // Non-fatal: cards fall back to no status line rather than blanking.
    }
  };

  // NB: the collection-stats fetch was removed with the stats card. It read
  // /analytics/collection purely to fill a card that duplicated Home's stat
  // strip, and that endpoint counts only the legacy tarantula table — so on a
  // mixed collection it was both redundant AND wrong. Total/species counts in
  // the header are computed from the loaded lists instead.

  const fetchScorpions = async () => {
    // Failure here is non-fatal — scorpions are an additive surface;
    // a load error shouldn't blank the whole collection. Keep silent.
    try {
      const rows = await listScorpions();
      setScorpions(rows);
    } catch {
      setScorpions([]);
    }
  };

  const fetchCentipedes = async () => {
    // Same non-fatal pattern as scorpions — centipedes are the third
    // additive taxon (ADR-005 C2). Older mobile builds running pre-C2
    // never hit this endpoint; this build silently handles a 404 if
    // someone's API instance lags behind.
    try {
      const rows = await listCentipedes();
      setCentipedes(rows);
    } catch {
      setCentipedes([]);
    }
  };

  const fetchWhipSpiders = async () => {
    // Same non-fatal pattern — whip spiders are the fourth additive
    // taxon (ADR-006). A 404 on an API instance that lags behind is
    // handled silently.
    try {
      const rows = await listWhipSpiders();
      setWhipSpiders(rows);
    } catch {
      setWhipSpiders([]);
    }
  };

  const fetchOtherInverts = async () => {
    // The newer taxa (vinegaroon/true_spider/millipede/mantis/other) have no
    // per-taxon list lib — pull the unified collection and keep just those.
    try {
      const all = await listInverts();
      const others = all.filter((i) => GENERIC_TAXA.includes(i.taxon));
      setOtherInverts(others);
    } catch {
      setOtherInverts([]);
    }
  };

  const fetchColonies = async () => {
    // Colony mode (ADR-010) — a separate first-class collection source merged
    // into the same list. Non-fatal: an API instance that predates colonies
    // just shows none instead of blanking the collection.
    try {
      const rows = await listColonies();
      setColonies(rows);
    } catch {
      setColonies([]);
    }
  };

  const fetchTarantulas = async () => {
    try {
      const response = await apiClient.get('/tarantulas/');
      setTarantulas(response.data);
      await fetchAllPremoltPredictions(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantulas');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Premolt signals for the whole collection, from the canonical service.
   *
   * This was the LAST caller of `/tarantulas/{id}/premolt-prediction` on
   * mobile. That endpoint ran a different algorithm from `/premolt/dashboard`
   * — additive "probability" points versus refusal-streak + molt-interval
   * analysis — so the same animal could be flagged on one screen and not the
   * other. Home already moved; this screen was still on the legacy one, which
   * is why the collection grid and the dashboard could disagree.
   *
   * Also collapses N requests into one.
   */
  const fetchAllPremoltPredictions = async (_tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>();
    try {
      const response = await apiClient.get('/premolt/dashboard');
      const predictions: PremoltPrediction[] = response.data?.predictions ?? [];
      for (const p of predictions) {
        predictionMap.set(p.tarantula_id, p);
      }
    } catch {
      // NB: an empty map currently renders as "no premolt signals", which
      // conflates a failed request with a confirmed negative. That's the
      // loading ≠ unavailable ≠ verified-zero problem and it is NOT fixed
      // here — it needs the shared {status, data, checkedAt} contract, which
      // is its own change across every operational widget.
    }
    setPremoltPredictions(predictionMap);
  };

  /**
   * Feeding status for a row, whatever its taxon.
   *
   * Detritivores and omnivores (millipedes, roaches) are deliberately excluded:
   * they graze on standing food rather than taking live prey on a cadence, so
   * "12d since fed" would be a number with no meaning attached to it.
   */
  const statusFor = (id: string, taxon?: string): FeedingStatus | undefined => {
    // The registry now covers every taxon including tarantula (ADR-013), so
    // this lookup resolves for all of them. The `meta &&` guard remains for
    // an unrecognised taxon string off the wire.
    const meta = taxon ? INVERT_TAXA[taxon as InvertTaxon] : undefined;
    if (meta && meta.feedingMode !== 'predator') return undefined;
    return feedingStatuses.get(id);
  };

  // NB: `getFeedingStatusBadge` was deleted here. It rendered the photo-overlay
  // feeding pill with a hardcoded 7/14/21-day colour ramp — the flat threshold
  // that made this screen disagree with Home. AnimalCard's status footer
  // replaced it, and it reads the server's per-species `is_overdue`.

  /**
   * Whether to show the premolt marker for an animal.
   *
   * Two conditions, both required: the service says premolt is likely, AND it
   * had enough data to say so. `data_quality === 'insufficient'` means the
   * animal has too little molt/feeding history for the signal to mean
   * anything, and surfacing it anyway is how a guess becomes a claim.
   */
  const showsPremolt = (tarantulaId: string): boolean => {
    const prediction = premoltPredictions.get(tarantulaId);
    if (!prediction) return false;
    return prediction.is_premolt_likely && prediction.data_quality !== 'insufficient';
  };

  const getPremoltBadge = (tarantulaId: string) => {
    if (!showsPremolt(tarantulaId)) return null;

    // No percentage. The number this used to print came from an uncalibrated
    // additive score on an endpoint that no longer exists; the canonical
    // service reports a boolean and the observations behind it. A word is an
    // honest summary of a boolean — "84%" was not.
    return (
      <View
        style={[styles.premoltBadge, styles.premoltBadgeYellow]}
        accessibilityLabel="Premolt signals detected"
      >
        <Text style={styles.premoltBadgeText}>🦋 Premolt</Text>
      </View>
    );
  };

  // Helper: get best display name for a tarantula
  const getDisplayName = (t: Tarantula) => t.name || t.common_name || 'Unknown';

  // Unified row name lookup — drives the search and the name sort
  // across taxa. Scorpion + centipede display names reuse their lib
  // helpers for consistency with the per-taxon detail screens.
  const getRowName = (row: Row): string => {
    if (row.kind === 'tarantula') return getDisplayName(row.data);
    if (row.kind === 'scorpion') return scorpionDisplayName(row.data);
    if (row.kind === 'whip_spider') return whipSpiderDisplayName(row.data);
    if (row.kind === 'invert') return invertDisplayName(row.data);
    if (row.kind === 'colony') return row.data.name;
    return centipedeDisplayName(row.data);
  };

  // Filter and sort rows, gated by taxonFilter. Selecting one taxon collapses
  // the others out entirely so the keeper can focus. 'due' cuts across taxa.
  const getFilteredRows = (): Row[] => {
    const query = searchQuery.toLowerCase();
    // 'due' is a cross-taxon slice, so every taxon stays in and the overdue
    // filter is applied to the merged list further down.
    const wide = taxonFilter === 'all' || taxonFilter === 'due';

    const tarantulaRows: Row[] =
      wide || taxonFilter === 'tarantulas'
        ? tarantulas.map((t) => ({ kind: 'tarantula' as const, data: t }))
        : [];
    const scorpionRows: Row[] =
      wide || taxonFilter === 'scorpions'
        ? scorpions.map((s) => ({ kind: 'scorpion' as const, data: s }))
        : [];
    const centipedeRows: Row[] =
      wide || taxonFilter === 'centipedes'
        ? centipedes.map((c) => ({ kind: 'centipede' as const, data: c }))
        : [];
    const whipSpiderRows: Row[] =
      wide || taxonFilter === 'whip_spiders'
        ? whipSpiders.map((w) => ({ kind: 'whip_spider' as const, data: w }))
        : [];
    // Newer generic taxa — included under 'all' or when their own chip is active.
    const otherInvertRows: Row[] = otherInverts
      .filter((i) => wide || taxonFilter === i.taxon)
      .map((i) => ({ kind: 'invert' as const, data: i }));

    // Colonies (ADR-010) — a colony shows under 'all' or under its taxon's chip.
    // Note the key mapping: the four oldest chips are PLURAL ('scorpions'),
    // while a colony's taxon is singular ('scorpion'). Comparing them directly
    // meant a scorpion colony vanished when you filtered to Scorpions.
    const colonyRows: Row[] = colonies
      .filter((c) => wide || taxonFilter === taxonFilterKey(c.taxon))
      .map((c) => ({ kind: 'colony' as const, data: c }));

    let rows: Row[] = [
      ...tarantulaRows,
      ...scorpionRows,
      ...centipedeRows,
      ...whipSpiderRows,
      ...otherInvertRows,
      ...colonyRows,
    ];

    // 'due' — everything the server flagged overdue. Colonies are excluded:
    // they have no per-animal feeding cadence (ADR-010 deferred colony feeding
    // entirely), so they'd otherwise sit in a list of things to go feed.
    if (taxonFilter === 'due') {
      rows = rows.filter(
        (row) => row.kind !== 'colony' && feedingStatuses.get(row.data.id)?.is_overdue,
      );
    }

    // Search across name, common_name, and scientific_name regardless
    // of taxon. Empty query short-circuits. Colonies have no common_name /
    // scientific_name fields — match their name + species labels instead.
    if (query) {
      rows = rows.filter((row) => {
        if (row.kind === 'colony') {
          const c = row.data;
          return (
            c.name.toLowerCase().includes(query)
            || (c.species_display_name || '').toLowerCase().includes(query)
            || (c.species_scientific_name || '').toLowerCase().includes(query)
          );
        }
        const d = row.data;
        return (
          (d.name || '').toLowerCase().includes(query)
          || (d.common_name || '').toLowerCase().includes(query)
          || (d.scientific_name || '').toLowerCase().includes(query)
        );
      });
    }

    switch (sortBy) {
      case 'lastFed': {
        // Now cross-taxon: one feeding-status call covers every animal, so a
        // hungry scorpion sorts alongside a hungry tarantula instead of being
        // pinned below every tarantula regardless of how long it's been.
        // Colonies have no feeding cadence and sort last.
        rows.sort((a, b) => {
          const daysOf = (r: Row) =>
            r.kind === 'colony'
              ? -1
              : feedingStatuses.get(r.data.id)?.days_since_last_feeding ?? Infinity;
          return daysOf(b) - daysOf(a);
        });
        break;
      }
      case 'acquired':
      case 'name':
      default: {
        rows.sort((a, b) => getRowName(a).localeCompare(getRowName(b)));
      }
    }

    return rows;
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTarantulas(),
      fetchScorpions(),
      fetchCentipedes(),
      fetchWhipSpiders(),
      fetchOtherInverts(),
      fetchColonies(),
      loadFeedingStatuses(),
    ]);
    setRefreshing(false);
  }, []);

  // Re-fetch one tarantula's feeding stats and patch it into the map,
  // so a quick "mark fed" flips that card's badge without a full
  // collection reload. Falls back to an optimistic "fed today" if the
  // stats call itself fails.
  const refreshFeedingStatus = async (tarantulaId: string) => {
    const tzOffset = new Date().getTimezoneOffset();
    try {
      const response = await apiClient.get(
        `/tarantulas/${tarantulaId}/feeding-stats`,
        { params: { tz_offset_minutes: tzOffset } },
      );
      setFeedingStatuses((prev) => {
        const next = new Map(prev);
        next.set(tarantulaId, {
          tarantula_id: tarantulaId,
          days_since_last_feeding: response.data.days_since_last_feeding,
          acceptance_rate: response.data.acceptance_rate,
          is_feeding_paused: response.data.is_feeding_paused,
        });
        return next;
      });
    } catch (error) {
      setFeedingStatuses((prev) => {
        const next = new Map(prev);
        const existing = next.get(tarantulaId);
        next.set(tarantulaId, {
          tarantula_id: tarantulaId,
          days_since_last_feeding: 0,
          acceptance_rate: existing?.acceptance_rate ?? 0,
          is_feeding_paused: existing?.is_feeding_paused,
        });
        return next;
      });
    }
  };

  // "Mark fed today" — posts an accepted feeding dated now. food_type
  // is left null on purpose: this is the one-tap path, and the detail
  // screen renders a null type as "Unknown food" the keeper can edit
  // later. Endpoint has no trailing slash (named sub-resource).
  const handleMarkFed = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionBusy(true);
    try {
      await apiClient.post(`/tarantulas/${target.id}/feedings`, {
        fed_at: new Date().toISOString(),
        accepted: true,
      });
      await refreshFeedingStatus(target.id);
      setActionTarget(null);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          `Logged a feeding for ${getDisplayName(target)}`,
          ToastAndroid.SHORT,
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not log feeding',
        `Something went wrong logging a feeding for ${getDisplayName(
          target,
        )}. Please try again.`,
      );
    } finally {
      setActionBusy(false);
    }
  };

  /** One-tap feed straight from a collection card, for any taxon.
   *
   *  A keeper reported (2026-07-28) that she'd lost the ability to "go to the
   *  collection and log feedings that way" — the capability was still there,
   *  but only behind a long press, which nothing advertises. This is the same
   *  write as `handleMarkFed`, reachable without knowing the gesture.
   *
   *  Tarantulas still post to the legacy per-taxon route because the ADR-005
   *  read cutover hasn't happened; everything else uses the generic invert
   *  route. Keep this in step with handleMarkFed above.
   */
  const [quickFeedingIds, setQuickFeedingIds] = useState<Set<string>>(new Set());

  const handleQuickFeed = async (id: string, taxon: string, displayName: string) => {
    if (quickFeedingIds.has(id)) return;
    setQuickFeedingIds((prev) => new Set(prev).add(id));
    try {
      const path =
        taxon === 'tarantula' ? `/tarantulas/${id}/feedings` : `/inverts/${id}/feedings`;
      await apiClient.post(path, {
        fed_at: new Date().toISOString(),
        accepted: true,
      });
      await refreshFeedingStatus(id);
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Logged a feeding for ${displayName}`, ToastAndroid.SHORT);
      }
    } catch (error) {
      Alert.alert(
        'Could not log feeding',
        `Something went wrong logging a feeding for ${displayName}. Please try again.`,
      );
    } finally {
      setQuickFeedingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleLogMolt = () => {
    if (!actionTarget) return;
    const tarantulaId = actionTarget.id;
    setActionTarget(null);
    router.push(`/tarantula/add-molt?id=${tarantulaId}`);
  };

  const handleEditFromSheet = () => {
    if (!actionTarget) return;
    const tarantulaId = actionTarget.id;
    setActionTarget(null);
    router.push(`/tarantula/edit?id=${tarantulaId}`);
  };

  const renderTarantula = ({ item }: { item: Tarantula }) => {
    const status = feedingStatuses.get(item.id);
    const prediction = premoltPredictions.get(item.id);
    return (
      <AnimalCard
        displayName={item.name || item.common_name || 'Unknown'}
        scientificName={item.scientific_name}
        photoUrl={item.photo_url}
        sex={item.sex}
        taxon="tarantula"
        feeding={{
          daysSince: status?.days_since_last_feeding,
          isPaused: status?.is_feeding_paused,
          // Server-computed, per species + life stage — see loadFeedingStatuses.
          isOverdue: status?.is_overdue,
          // Lets the card say how far past due, not just days since fed.
          intervalDays: status?.interval_days,
        }}
        premolt={showsPremolt(item.id)}
        onPress={() => router.push(`/tarantula/${item.id}`)}
        onLongPress={() => setActionTarget(item)}
        onQuickFeed={() =>
          handleQuickFeed(item.id, 'tarantula', getDisplayName(item))
        }
        quickFeedBusy={quickFeedingIds.has(item.id)}
        colors={colors}
      />
    );
  };


  // Scorpion card — same visual frame as renderTarantula so the
  // unified grid reads as one collection. No feeding-status pill or
  // premolt badge (those features don't exist for scorpions yet); no
  // long-press action sheet either. Add taxon-specific affordances
  // here as the scorpion surface grows.
  // Scorpion / centipede / whip spider / generic-invert cards were four
  // near-identical copies of the same JSX that had already drifted apart.
  // They all route to /invert/[id] and differ only in taxon, so they're one
  // renderer now. AnimalCard owns the visual treatment for every taxon.
  const renderInvertCard = (item: any, taxon: string) => {
    // Non-tarantula taxa now get the same status footer the tarantula card
    // has — one feeding-status call covers the whole collection, so there's
    // no longer a cost reason to leave them blank. statusFor() still returns
    // nothing for detritivores/omnivores.
    const status = statusFor(item.id, taxon);
    return (
      <AnimalCard
        key={item.id}
        displayName={item.name || item.common_name || item.scientific_name || 'Unnamed'}
        scientificName={item.scientific_name}
        photoUrl={item.photo_url}
        sex={item.sex}
        taxon={taxon}
        feeding={
          status
            ? {
                daysSince: status.days_since_last_feeding,
                isPaused: status.is_feeding_paused,
                isOverdue: status.is_overdue,
                intervalDays: status.interval_days,
              }
            : undefined
        }
        onPress={() => router.push(`/invert/${item.id}` as any)}
        // Only offer the button where a feeding cadence is meaningful. statusFor
        // returns nothing for detritivores/omnivores, and a "Fed" button on a
        // millipede would imply a live-prey schedule it doesn't have.
        onQuickFeed={
          status
            ? () =>
                handleQuickFeed(
                  item.id,
                  taxon,
                  item.name || item.common_name || item.scientific_name || 'this animal',
                )
            : undefined
        }
        quickFeedBusy={quickFeedingIds.has(item.id)}
        colors={colors}
      />
    );
  };

  const renderScorpion = ({ item }: { item: Scorpion }) => renderInvertCard(item, 'scorpion');
  const renderCentipede = ({ item }: { item: Centipede }) => renderInvertCard(item, 'centipede');
  const renderWhipSpider = ({ item }: { item: WhipSpider }) => renderInvertCard(item, 'whip_spider');
  const renderInvert = ({ item }: { item: GenericInvert }) => renderInvertCard(item, item.taxon);


  // Colony card (ADR-010). Same card frame, but tagged as a "Colony" with the
  // population count (≈N when estimated) instead of a sex badge. Taxon glyph in
  // the bottom-left, same as the other invert cards. Routes to /colony/[id].
  const renderColony = ({ item }: { item: ColonyListItem }) => {
    const meta = INVERT_TAXA[item.taxon];
    const countLabel = formatColonyCount(item.total_count, item.count_is_estimated);
    const speciesLabel = item.species_missing
      ? 'Species removed'
      : item.species_display_name || item.species_scientific_name || `${meta?.label ?? 'Colony'} colony`;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/colony/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, colony, ${countLabel} animals, ${speciesLabel}`}
        accessibilityHint="Opens this colony's detail page."
      >
        <View style={styles.imageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.image}
              accessibilityLabel={`Photo of ${item.name}`}
            />
          ) : (
            <View style={styles.placeholderImage} accessibilityElementsHidden importantForAccessibility="no">
              <Text style={{ fontSize: 40 }}>{meta?.glyph ?? '🐜'}</Text>
            </View>
          )}
          {/* Colony tag — top-right, where the sex badge sits on animal cards. */}
          <View style={styles.colonyTag} accessibilityLabel="Colony">
            <Text style={styles.colonyTagText}>Colony</Text>
          </View>
          {/* Population count — top-left. */}
          <View style={styles.colonyCountBadge} accessibilityLabel={`${countLabel} animals`}>
            <Text style={styles.colonyCountText}>{countLabel}</Text>
          </View>
          <View style={styles.taxonGlyph}>
            <Text style={{ fontSize: 14 }}>{meta?.glyph ?? '🐜'}</Text>
          </View>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.scientificName}>{speciesLabel}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: Tarantula }) => {
    const feedingStatus = feedingStatuses.get(item.id);
    const premoltPrediction = premoltPredictions.get(item.id);
    const days = feedingStatus?.days_since_last_feeding;
    const feedingColor = feedingStatusColor(days, colors);

    const displayName = item.name || item.common_name || 'Unknown';
    const sexLabel = item.sex === 'female' ? 'female' : item.sex === 'male' ? 'male' : 'unknown sex';
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => router.push(`/tarantula/${item.id}`)}
        onLongPress={() => setActionTarget(item)}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.scientific_name}, ${sexLabel}`}
        accessibilityHint="Opens this tarantula's detail page. Long press for quick actions."
      >
        <View style={styles.listImageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.listImage}
              accessibilityLabel={`Photo of ${displayName}`}
            />
          ) : (
            <View
              style={styles.listPlaceholder}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <MaterialCommunityIcons name="spider" size={24} color={colors.textTertiary} />
            </View>
          )}
        </View>
        <View style={styles.listContent}>
          {/* Text-only column. The sex indicator used to live here, which
              put it at the name's vertical center (line 1 of 2) while the
              feeding pill was centered against the whole 50pt row —
              that mismatch was the "wonky alignment" that made the cards
              read unprofessional. Now the right-side column owns every
              indicator so they all land on the same horizontal line. */}
          <Text style={styles.listName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.listScientificName} numberOfLines={1}>{item.scientific_name}</Text>
        </View>
        <View style={styles.listBadges}>
          {/* Sex chip — always rendered so the right edge of every row
              has a consistent indicator. Same pill chrome as the feeding
              badge (circular, same height) so they visually rhyme. */}
          <View
            style={[
              styles.sexChip,
              {
                backgroundColor:
                  item.sex === 'female'
                    ? colors.female + '20' // pink tint
                    : item.sex === 'male'
                      ? colors.male + '20' // blue tint
                      : colors.border,
              },
            ]}
            accessibilityLabel={sexLabel}
          >
            <MaterialCommunityIcons
              name={
                item.sex === 'female'
                  ? 'gender-female'
                  : item.sex === 'male'
                    ? 'gender-male'
                    : 'help-circle-outline'
              }
              size={14}
              color={
                item.sex === 'female'
                  ? colors.female
                  : item.sex === 'male'
                    ? colors.male
                    : colors.textTertiary
              }
            />
          </View>
          {days !== undefined && days !== null && (
            <View
              style={[styles.listBadge, { backgroundColor: feedingColor }]}
              accessibilityLabel={days === 0 ? 'Fed today' : `Last fed ${days} days ago`}
            >
              <Text style={styles.listBadgeText}>{days === 0 ? 'Today' : `${days}d`}</Text>
            </View>
          )}
          {premoltPrediction
            && premoltPrediction.is_premolt_likely
            && premoltPrediction.data_quality !== 'insufficient' && (
            <View
              style={[styles.listBadge, { backgroundColor: '#f97316' }]}
              accessibilityLabel="Premolt signals detected"
            >
              <Text style={styles.listBadgeText}>🦋 Premolt</Text>
            </View>
          )}
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={colors.textTertiary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    );
  };

  // Compact list row for every non-tarantula taxon. Mirrors the tarantula
  // renderListItem chrome (same styles.listItem / listImage / listContent /
  // sexChip) so list view reads as one collection. Feeding-status + premolt
  // badges are tarantula-only today, so this row omits them. The placeholder
  // shows the taxon emoji glyph instead of the spider icon. Without this, the
  // taxon cards fell through to renderRow's card branch and rendered as big
  // cards even in list view (the "scorpions look larger in list view" bug).
  const renderInvertListItem = (
    item: {
      id: string;
      name?: string | null;
      common_name?: string | null;
      scientific_name?: string | null;
      sex?: string | null;
      photo_url?: string | null;
    },
    glyph: string,
    taxonLabel: string,
    feedingStatus?: FeedingStatus,
  ) => {
    const displayName =
      item.name || item.common_name || item.scientific_name || 'Unnamed';
    const sexLabel =
      item.sex === 'female' ? 'female' : item.sex === 'male' ? 'male' : 'unknown sex';

    // Feeding badge (predator taxa only — see statusFor).
    // Paused trumps the days-since treatment, same as the tarantula row.
    const feedingDays = feedingStatus?.days_since_last_feeding;
    const feedingColor = feedingStatusColor(feedingDays, colors);
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => router.push(`/invert/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.scientific_name ?? 'no scientific name'}, ${sexLabel}, ${taxonLabel}`}
        accessibilityHint="Opens this animal's detail page."
      >
        <View style={styles.listImageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.listImage}
              accessibilityLabel={`Photo of ${displayName}`}
            />
          ) : (
            <View
              style={styles.listPlaceholder}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Text style={{ fontSize: 22 }}>{glyph}</Text>
            </View>
          )}
        </View>
        <View style={styles.listContent}>
          <Text style={styles.listName} numberOfLines={1}>{displayName}</Text>
          {!!item.scientific_name && (
            <Text style={styles.listScientificName} numberOfLines={1}>
              {item.scientific_name}
            </Text>
          )}
        </View>
        <View style={styles.listBadges}>
          <View
            style={[
              styles.sexChip,
              {
                backgroundColor:
                  item.sex === 'female'
                    ? colors.female + '20'
                    : item.sex === 'male'
                      ? colors.male + '20'
                      : colors.border,
              },
            ]}
            accessibilityLabel={sexLabel}
          >
            <MaterialCommunityIcons
              name={
                item.sex === 'female'
                  ? 'gender-female'
                  : item.sex === 'male'
                    ? 'gender-male'
                    : 'help-circle-outline'
              }
              size={14}
              color={
                item.sex === 'female'
                  ? colors.female
                  : item.sex === 'male'
                    ? colors.male
                    : colors.textTertiary
              }
            />
          </View>
          {feedingStatus?.is_feeding_paused ? (
            <View
              style={[styles.listBadge, { backgroundColor: colors.textTertiary }]}
              accessibilityLabel="Feeding paused"
            >
              <Text style={styles.listBadgeText}>⏸</Text>
            </View>
          ) : feedingDays !== undefined && feedingDays !== null ? (
            <View
              style={[styles.listBadge, { backgroundColor: feedingColor }]}
              accessibilityLabel={
                feedingDays === 0 ? 'Fed today' : `Last fed ${feedingDays} days ago`
              }
            >
              <Text style={styles.listBadgeText}>
                {feedingDays === 0 ? 'Today' : `${feedingDays}d`}
              </Text>
            </View>
          ) : null}
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={colors.textTertiary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    );
  };

  // Colony list row (ADR-010). Mirrors renderInvertListItem chrome but shows
  // the population count pill + a "Colony" tag instead of a sex chip.
  const renderColonyListItem = (item: ColonyListItem) => {
    const meta = INVERT_TAXA[item.taxon];
    const glyph = meta?.glyph ?? '🐜';
    const countLabel = formatColonyCount(item.total_count, item.count_is_estimated);
    const speciesLabel = item.species_missing
      ? 'Species removed'
      : item.species_display_name || item.species_scientific_name || `${meta?.label ?? 'Colony'} colony`;
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => router.push(`/colony/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, colony, ${countLabel} animals, ${speciesLabel}`}
        accessibilityHint="Opens this colony's detail page."
      >
        <View style={styles.listImageContainer}>
          {item.photo_url ? (
            <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.listImage} accessibilityLabel={`Photo of ${item.name}`} />
          ) : (
            <View style={styles.listPlaceholder} accessibilityElementsHidden importantForAccessibility="no">
              <Text style={{ fontSize: 22 }}>{glyph}</Text>
            </View>
          )}
        </View>
        <View style={styles.listContent}>
          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.listScientificName} numberOfLines={1}>{speciesLabel}</Text>
        </View>
        <View style={styles.listBadges}>
          <View style={[styles.colonyListTag, { backgroundColor: colors.primary + '20' }]} accessibilityLabel="Colony">
            <Text style={[styles.colonyListTagText, { color: colors.primary }]}>Colony</Text>
          </View>
          <View style={[styles.listBadge, { backgroundColor: colors.primary }]} accessibilityLabel={`${countLabel} animals`}>
            <Text style={styles.listBadgeText}>{countLabel}</Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={colors.textTertiary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </TouchableOpacity>
    );
  };

  // The old inline `ViewToggle` and `SortChips` components are gone — the view
  // toggle is a header icon now and sort lives in the ⚙ sheet. (Historical
  // note worth keeping: a `SearchBar` component defined inside this screen
  // once made React see a NEW component type on every parent render, which
  // unmounted the TextInput and dropped keyboard focus after one character.
  // That's why the search field is written inline in the header rather than
  // extracted, and why any future extraction has to be hoisted out of the
  // screen function.)

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    list: {
      padding: 8,
      paddingBottom: 88, // FAB height (56) + 16pt clearance + 16pt base
    },
    statsCard: {
      margin: 8,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    statsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    viewAllLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    sexDistribution: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sexItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    sexText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    card: {
      flex: 1,
      margin: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imageContainer: {
      position: 'relative',
    },
    image: {
      width: '100%',
      height: 150,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    placeholderImage: {
      width: '100%',
      height: 150,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    // Small taxon glyph in the card's bottom-left corner. Sits where
    // the feeding badge would land on a tarantula card, but the slot
    // is taxon-specific so they don't collide (scorpions have no
    // feeding badge yet).
    taxonGlyph: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Colony card overlays (ADR-010). "Colony" tag top-right (where the sex
    // badge sits), population count top-left (where the feeding badge sits).
    colonyTag: {
      position: 'absolute',
      top: 8,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(139, 92, 246, 0.9)',
    },
    colonyTagText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    colonyCountBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    colonyCountText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    colonyListTag: {
      height: 22,
      paddingHorizontal: 8,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colonyListTagText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    feedingBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    feedingBadgeGreen: {
      backgroundColor: 'rgba(34, 197, 94, 0.9)',
    },
    feedingBadgeYellow: {
      backgroundColor: 'rgba(234, 179, 8, 0.9)',
    },
    feedingBadgeOrange: {
      backgroundColor: 'rgba(249, 115, 22, 0.9)',
    },
    feedingBadgeRed: {
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    feedingBadgePaused: {
      backgroundColor: 'rgba(99, 102, 241, 0.9)',
    },
    feedingBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    premoltBadge: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    premoltBadgeRed: {
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    premoltBadgeOrange: {
      backgroundColor: 'rgba(249, 115, 22, 0.9)',
    },
    premoltBadgeYellow: {
      backgroundColor: 'rgba(234, 179, 8, 0.9)',
    },
    premoltBadgeGray: {
      backgroundColor: 'rgba(107, 114, 128, 0.9)',
    },
    premoltBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    cardContent: {
      padding: 12,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    scientificName: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
      marginBottom: 2,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
      marginBottom: 24,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      overflow: 'hidden',
    },
    fabGradient: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // View toggle styles
    viewToggleContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewToggleButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    viewToggleActive: {
      backgroundColor: colors.primary,
    },
    // List view styles
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 8,
      marginVertical: 4,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    listImageContainer: {
      width: 50,
      height: 50,
      borderRadius: 8,
      overflow: 'hidden',
      marginRight: 12,
    },
    listImage: {
      width: 50,
      height: 50,
    },
    listPlaceholder: {
      width: 50,
      height: 50,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      flex: 1,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    listName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    listScientificName: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
      marginTop: 2,
    },
    listBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginRight: 8,
    },
    // Shared pill dimensions so the sex chip, feeding pill, and any
    // future badges line up at the same baseline and height. Any badge
    // in this row should set height:22 to stay on the line.
    listBadge: {
      height: 22,
      minWidth: 22,
      paddingHorizontal: 8,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 13,
    },
    // Sex chip has the same footprint as listBadge but a tinted
    // background (rather than saturated) so the saturated feeding pill
    // stays the attention-grabber. Icon inside is 14pt to read as a
    // companion, not a peer.
    sexChip: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Stats header with toggle
    statsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 8,
      marginBottom: 8,
    },
    // Get Started Card styles
    getStartedCard: {
      margin: 8,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    getStartedContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    getStartedEmoji: {
      fontSize: 32,
      marginTop: 2,
    },
    getStartedTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    getStartedText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    getStartedButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    getStartedButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    // Search bar styles
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 8,
      marginVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      height: 44,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: '400',
    },
    // Sort chips styles
    sortContainer: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 8,
      marginBottom: 12,
    },

    // --- Header actions + search (gradient band) ---
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    headerSearch: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 10,
    },
    headerSearchInput: {
      flex: 1,
      color: '#fff',
      fontSize: 15,
      // Android centres text oddly in a fixed-height row without this.
      paddingVertical: 0,
    },

    // --- Filter chips ---
    filterChipRow: {
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 8,
      paddingTop: 12,
      paddingBottom: 4,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
    },
    filterChipText: {
      fontSize: 12.5,
      fontWeight: '600',
    },

    // --- Empty result state (filter/search matched nothing) ---
    filteredEmpty: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 56,
      paddingHorizontal: 32,
    },
    filteredEmptyText: {
      fontSize: 15,
      textAlign: 'center',
    },
    filteredEmptyAction: {
      fontSize: 14,
      fontWeight: '700',
    },

    // --- Sort bottom sheet ---
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheetBody: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingTop: 18,
      paddingHorizontal: 16,
    },
    sheetTitle: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    sheetRowText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
    },
    sortChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    sortChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sortChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    sortChipTextActive: {
      color: '#fff',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
        </View>
      </View>
    );
  }

  // Add-flow disambiguator. Mirrors HV's ADR-003 pattern: one entry
  // point on the bottom bar, taxon picked inside the add flow.
  //
  // Originally this used `Alert.alert` for cross-platform consistency,
  // but Android's Material AlertDialog right-justifies its options —
  // with three taxa + a leading emoji glyph, that read awkwardly. The
  // dedicated AddPickerSheet renders rows left-aligned matching the
  // existing TarantulaActionSheet shape.
  // The taxon picker is retired (design handoff, screen 7). Species selection
  // now sets the taxon, so there's nothing to pick up front — and Colony,
  // which was row 11 of a sheet with no ScrollView, is a toggle on the add
  // screen instead of a row people couldn't reach.
  const openAddPicker = () => {
    router.push('/add' as any);
  };

  const handleAddPick = (taxon: AddPickerTaxon) => {
    setAddPickerOpen(false);
    if (taxon === 'tarantula') {
      router.push('/tarantula/add');
    } else if (taxon === 'colony') {
      // Colony mode (ADR-010) — taxon is chosen inside the colony add form.
      router.push('/colony/add' as any);
    } else {
      // All non-tarantula taxa share the generic invert add screen (ADR-007).
      router.push(`/invert/add?taxon=${taxon}` as any);
    }
  };

  // Renders the cross-taxon row using the discriminated union — the
  // FlatList itself stays homogeneous; renderItem dispatches.
  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'scorpion') {
      return viewMode === 'card'
        ? renderScorpion({ item: item.data })
        : renderInvertListItem(item.data, '🦂', 'scorpion', statusFor(item.data.id, 'scorpion'));
    }
    if (item.kind === 'centipede') {
      return viewMode === 'card'
        ? renderCentipede({ item: item.data })
        : renderInvertListItem(item.data, '🐛', 'centipede', statusFor(item.data.id, 'centipede'));
    }
    if (item.kind === 'whip_spider') {
      return viewMode === 'card'
        ? renderWhipSpider({ item: item.data })
        : renderInvertListItem(item.data, '🕸️', 'whip spider', statusFor(item.data.id, 'whip_spider'));
    }
    if (item.kind === 'invert') {
      const meta = INVERT_TAXA[item.data.taxon];
      return viewMode === 'card'
        ? renderInvert({ item: item.data })
        : renderInvertListItem(
            item.data,
            meta?.glyph ?? '🐾',
            meta?.label ?? 'invert',
            statusFor(item.data.id, item.data.taxon),
          );
    }
    if (item.kind === 'colony') {
      return viewMode === 'card'
        ? renderColony({ item: item.data })
        : renderColonyListItem(item.data);
    }
    return viewMode === 'card'
      ? renderTarantula({ item: item.data })
      : renderListItem({ item: item.data });
  };

  /**
   * Taxon filter chips.
   *
   * Two changes from the old row: chips carry counts, and only taxa the keeper
   * ACTUALLY OWNS are rendered. Previously all eleven rendered regardless, so
   * a keeper with four tarantulas scrolled past Vinegaroons, Millipedes and
   * Mantises to reach an empty list — the row advertised the catalog instead
   * of describing the collection. (Pattern ported from Herpetoverse's
   * `ownedTaxa` in `apps/mobile-herpetoverse/app/(tabs)/index.tsx`.)
   */
  const TaxonFilterChips = () => {
    const chip = (
      value: TaxonFilter,
      label: string,
      count: number,
      opts?: { icon?: string; iconColor?: string },
    ) => {
      const active = taxonFilter === value;
      return (
        <TouchableOpacity
          key={value}
          style={[
            styles.filterChip,
            { borderColor: colors.border, backgroundColor: colors.surface },
            active && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          onPress={() => setTaxonFilter(value)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`${label}, ${count}`}
        >
          {opts?.icon ? (
            <MaterialCommunityIcons
              name={opts.icon as any}
              size={14}
              color={active ? '#fff' : opts.iconColor ?? colors.textSecondary}
            />
          ) : null}
          <Text
            style={[
              styles.filterChipText,
              { color: active ? '#fff' : colors.textSecondary },
            ]}
          >
            {label} {count}
          </Text>
        </TouchableOpacity>
      );
    };

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipRow}
      >
        {chip('all', 'All', totalAnimals)}
        {/* Only offered when something is actually due — a permanent "Due 0"
            chip is a filter that leads to an empty screen. */}
        {dueCount > 0
          ? chip('due', 'Due', dueCount, { icon: 'alert-circle', iconColor: colors.error })
          : null}
        {TAXON_CHIPS.map(({ value, label, taxon }) => {
          const count = countsByFilter.get(value) ?? 0;
          if (count === 0) return null;
          return chip(value, label, count, { icon: taxonMdiIcon(taxon) });
        })}
      </ScrollView>
    );
  };

  // Empty state card component for when collection is empty.
  // NB: currently unused since the empty-state branch below renders
  // the full welcome flow directly; kept around as a smaller inline
  // nudge variant if a future iteration wants it back. Routes through
  // openAddPicker so the taxon disambiguator stays the single entry.
  const GetStartedCard = () => (
    <View style={[styles.getStartedCard, { borderColor: colors.primary }]}>
      <View style={styles.getStartedContent}>
        <Text style={styles.getStartedEmoji}>🎯</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.getStartedTitle}>Add your first animal</Text>
          <Text style={styles.getStartedText}>
            Start building your collection — tarantulas or scorpions both supported.
          </Text>
        </View>
      </View>
      <PrimaryButton
        onPress={openAddPicker}
        style={styles.getStartedButton}
      >
        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
        <Text style={styles.getStartedButtonText}>Add</Text>
      </PrimaryButton>
    </View>
  );

  // Collection is empty across ALL taxa — show the welcome flow.
  // NB: must include otherInverts (vinegaroon/true_spider/millipede/mantis/
  // roach/other) or a keeper whose only animals are those taxa wrongly sees
  // the "No animals yet" welcome screen.
  const collectionEmpty =
    tarantulas.length === 0
    && scorpions.length === 0
    && centipedes.length === 0
    && whipSpiders.length === 0
    && otherInverts.length === 0
    && colonies.length === 0;

  // Cross-taxon Total + Species for the stats card. The /analytics/collection
  // endpoint counts ONLY the legacy tarantula table, so its total_tarantulas /
  // unique_species reflect tarantulas alone — which is what made a keeper report
  // "the app only recognizes tarantulas as species." Compute both here from the
  // loaded lists so every taxon counts. (Feedings/Molts/sex on the card still
  // come from the tarantula-only endpoint — a backend follow-up.)
  const allCollectionAnimals: any[] = [
    ...tarantulas, ...scorpions, ...centipedes, ...whipSpiders, ...otherInverts,
  ];
  // Colonies count as ONE entry each toward the collection Total (ADR-010:
  // 1 toward the cap regardless of headcount).
  const totalAnimals = allCollectionAnimals.length + colonies.length;
  const uniqueSpeciesCount = new Set(
    [
      ...allCollectionAnimals.map((a) => (a.scientific_name || a.common_name || '').trim().toLowerCase()),
      ...colonies.map((c) => (c.species_scientific_name || c.species_display_name || '').trim().toLowerCase()),
    ].filter((s) => s.length > 0),
  ).size;

  // Per-chip counts. Built from the same sources getFilteredRows() draws on, so
  // a chip's number always matches what tapping it shows.
  const countsByFilter = new Map<TaxonFilter, number>();
  const bump = (key: TaxonFilter) =>
    countsByFilter.set(key, (countsByFilter.get(key) ?? 0) + 1);
  tarantulas.forEach(() => bump('tarantulas'));
  scorpions.forEach(() => bump('scorpions'));
  centipedes.forEach(() => bump('centipedes'));
  whipSpiders.forEach(() => bump('whip_spiders'));
  otherInverts.forEach((i) => bump(taxonFilterKey(i.taxon)));
  colonies.forEach((c) => bump(taxonFilterKey(c.taxon)));

  // Overdue count for the Due chip. Counted from the same map the cards read,
  // so the chip can't claim 7 while six cards say "overdue".
  const dueCount = [
    ...tarantulas, ...scorpions, ...centipedes, ...whipSpiders, ...otherInverts,
  ].filter((a: any) => feedingStatuses.get(a.id)?.is_overdue).length;

  const headerIcon = (
    name: string,
    label: string,
    onPress: () => void,
    active?: boolean,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialCommunityIcons
        name={name as any}
        size={22}
        color={active ? '#fff' : 'rgba(255,255,255,0.82)'}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Gradient header owning the screen's identity, counts and actions.
          Replaces the navigator's "My Collection" title bar AND the four
          stacked rows the list body used to open with (search field, sort
          chips, title + view toggle, stats card) — that was most of a screen
          of chrome before the first animal. */}
      <AppHeader
        title="Collection"
        subtitle={`${totalAnimals} ${totalAnimals === 1 ? 'animal' : 'animals'} · ${uniqueSpeciesCount} ${uniqueSpeciesCount === 1 ? 'species' : 'species'}`}
        paddingBottom={searchOpen ? 12 : 16}
        rightAction={
          <View style={styles.headerActions}>
            {headerIcon('magnify', searchOpen ? 'Close search' : 'Search collection', () => {
              // Clearing on close keeps the visible list honest: leaving a
              // stale query filtering a collapsed search box hides animals
              // with no on-screen explanation.
              if (searchOpen) setSearchQuery('');
              setSearchOpen((v) => !v);
            }, searchOpen)}
            {headerIcon('tune-variant', 'Sort options', () => setSortSheetOpen(true))}
            {headerIcon(
              viewMode === 'card' ? 'view-grid-outline' : 'view-list-outline',
              viewMode === 'card' ? 'Switch to list view' : 'Switch to grid view',
              () => toggleViewMode(viewMode === 'card' ? 'list' : 'card'),
            )}
          </View>
        }
      >
        {searchOpen ? (
          <View style={[styles.headerSearch, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
            <MaterialCommunityIcons
              name="magnify"
              size={18}
              color="rgba(255,255,255,0.8)"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <TextInput
              style={styles.headerSearchInput}
              placeholder="Search by name or species…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search collection by name or species"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </AppHeader>

      {collectionEmpty ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="paw" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No animals yet</Text>
          <Text style={styles.emptyText}>
            Start building your collection — tarantulas, scorpions, centipedes,
            mantises, millipedes, roaches and more are all supported. Not sure
            which species? Browse the care sheets first.
          </Text>
          <PrimaryButton
            onPress={openAddPicker}
            style={styles.addButton}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add to collection</Text>
          </PrimaryButton>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/species')}
            style={[
              styles.addButton,
              {
                marginTop: 12,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Browse species care sheets"
          >
            <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.textPrimary} />
            <Text style={[styles.addButtonText, { color: colors.textPrimary }]}>
              Browse Species
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            key={viewMode} // Force re-render when viewMode changes (needed for numColumns)
            data={getFilteredRows()}
            renderItem={renderRow}
            keyExtractor={(item) => `${item.kind}-${item.data.id}`}
            numColumns={viewMode === 'card' ? 2 : 1}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <>
                <PremoltAlertCard />
                {/* The only chrome left in the body. Search moved into the
                    header, sort into the ⚙ sheet, layout into the header
                    toggle, and the stats card was a duplicate of Home's. */}
                <TaxonFilterChips />
              </>
            }
            ListEmptyComponent={
              // A filter that matches nothing used to leave a blank screen
              // with the chips still lit — indistinguishable from a failed
              // load.
              <View style={styles.filteredEmpty}>
                <MaterialCommunityIcons name="filter-remove-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.filteredEmptyText, { color: colors.textSecondary }]}>
                  {searchQuery
                    ? `Nothing matches “${searchQuery}”`
                    : taxonFilter === 'due'
                      ? 'Nothing is overdue right now'
                      : 'Nothing here yet'}
                </Text>
                {(searchQuery || taxonFilter !== 'all') && (
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery('');
                      setTaxonFilter('all');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.filteredEmptyAction, { color: colors.accent }]}>
                      Show everything
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
          />
          <PrimaryButton
            fab
            size={56}
            onPress={openAddPicker}
            outerStyle={[styles.fab, { bottom: insets.bottom + 20 }]}
          >
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </PrimaryButton>
        </>
      )}

      {/* Long-press quick actions. Always mounted — the Modal inside
          stays hidden until a card/row long-press sets actionTarget. */}
      <TarantulaActionSheet
        target={
          actionTarget
            ? { id: actionTarget.id, name: getDisplayName(actionTarget) }
            : null
        }
        busy={actionBusy}
        onClose={() => {
          if (!actionBusy) setActionTarget(null);
        }}
        onMarkFed={handleMarkFed}
        onLogMolt={handleLogMolt}
        onEdit={handleEditFromSheet}
      />

      {/* Sort sheet — reached from the header's tune-variant icon. The sort
          chips used to occupy a permanent row in the list body; sort order is
          something a keeper sets occasionally, not something they need
          on-screen at all times. */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setSortSheetOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close sort options"
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.sheetBody,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Sort by</Text>
            {(
              [
                { value: 'name' as const, label: 'Name', icon: 'sort-alphabetical-ascending' },
                { value: 'lastFed' as const, label: 'Longest since fed', icon: 'silverware-fork-knife' },
                { value: 'acquired' as const, label: 'Date acquired', icon: 'calendar-blank-outline' },
              ]
            ).map((opt) => {
              const active = sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSortBy(opt.value);
                    setSortSheetOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <MaterialCommunityIcons
                    name={opt.icon as any}
                    size={20}
                    color={active ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.sheetRowText,
                      { color: active ? colors.accent : colors.textPrimary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {active ? (
                    <MaterialCommunityIcons name="check" size={20} color={colors.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Add-to-collection taxon picker. Same always-mounted pattern. */}
      <AddPickerSheet
        visible={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onPick={handleAddPick}
      />
    </View>
  );
}

export default withErrorBoundary(CollectionScreen, 'collection');
