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
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import TarantulaCardSkeleton from '../../src/components/TarantulaCardSkeleton';
import PremoltAlertCard from '../../src/components/PremoltAlertCard';
import CollectionCapNotice from '../../src/components/CollectionCapNotice';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import { feedingStatusColor } from '../../src/utils/status-colors';
import { TarantulaActionSheet } from '../../src/components/TarantulaActionSheet';
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
  listDeceasedInverts,
  invertDisplayName,
  INVERT_TAXA,
  taxonMdiIcon,
  type Invert as GenericInvert,
  type InvertTaxon,
} from '../../src/lib/inverts';
import { AppHeader } from '../../src/components/AppHeader';
import DeceasedArchive from '../../src/components/DeceasedArchive';
import ArchivedColonies from '../../src/components/ArchivedColonies';
import {
  listColonies,
  listPastColonies,
  type ColonyListItem,
} from '../../src/lib/colonies';
import { groupByLocation, renameLocation, useLocations, locationKey } from '../../src/lib/locations';
import { LocationRenameSheet } from '../../src/components/LocationPicker';
// One card for every taxon — replaced five near-identical renderers that had
// already drifted apart (see AnimalCard's header comment).
import AnimalCard from '../../src/components/AnimalCard';
import ColonyRow from '../../src/components/ColonyRow';
import { TYPE } from '../../src/theme/tokens';

// Taxa that have no per-taxon list lib — fetched generically via /inverts/.
// (scorpion/centipede/whip_spider keep their existing per-taxon fetches.)
const GENERIC_TAXA: InvertTaxon[] = ['vinegaroon', 'true_spider', 'millipede', 'mantis', 'roach', 'isopod', 'other'];

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
  /** Room / rack / shelf — carried on feeding-status so every taxon gets it
   *  from the one call the grid already makes. */
  location?: string | null;
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
/** The Died chip's status mark (handoff §14.4: a dot, not a symbol). */
const CHIP_DOT = 7;

type TaxonFilter = 'all' | 'due' | 'died' | 'archived' | 'tarantulas' | 'scorpions' | 'centipedes' | 'whip_spiders' | InvertTaxon;

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
  { value: 'isopod', label: 'Isopods', taxon: 'isopod' },
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
  const [sortBy, setSortBy] = useState<'name' | 'lastFed' | 'acquired' | 'location'>('name');
  // Keeper-defined locations (room / rack / shelf). The 'location' sort only
  // appears in the sheet once at least one exists, so a keeper who never set
  // one sees the exact same sheet as before.
  const { locations: keeperLocations, refresh: refreshLocations } = useLocations();
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
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

  /** Show the one-tap "Fed" button on cards. Defaults ON — it was added
   *  because a keeper reported losing that path, so hiding it by default would
   *  reintroduce the same problem. Off is for keepers who'd rather keep the
   *  grid purely visual, or who log feedings in batches from Feeding Day.
   *
   *  Device-local (AsyncStorage), like collection_view_mode: it's a display
   *  preference for this screen on this phone, not account state. */
  const [showFedButton, setShowFedButton] = useState(true);

  // Load view + display preferences from AsyncStorage
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const [savedView, savedFed] = await Promise.all([
          AsyncStorage.getItem('collection_view_mode'),
          AsyncStorage.getItem('collection_show_fed_button'),
        ]);
        if (savedView === 'card' || savedView === 'list') {
          setViewMode(savedView);
        }
        // Only an explicit 'false' turns it off; a missing key means the
        // keeper has never chosen, which is the ON default.
        if (savedFed === 'false') setShowFedButton(false);
      } catch (error) {
        // Silently fail
      }
    };
    loadPrefs();
  }, []);

  const toggleFedButton = async (next: boolean) => {
    setShowFedButton(next);
    try {
      await AsyncStorage.setItem('collection_show_fed_button', next ? 'true' : 'false');
    } catch (error) {
      // Silently fail — the in-memory value still applies for this session.
    }
  };

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

  // On focus, not just on mount: coming back from a detail screen where an
  // animal was marked died (or revived) must move it between the grid and the
  // Died archive. Mount-only fetching left both stale until a manual pull.
  useFocusEffect(
    useCallback(() => {
      fetchTarantulas();
      fetchScorpions();
      fetchCentipedes();
      fetchWhipSpiders();
      fetchOtherInverts();
      fetchColonies();
      fetchArchivedColonies();
      fetchDeceased();
      loadFeedingStatuses();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

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
          location: row.location ?? null,
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

  // The "Died" archive (handoff §14.5). Fetched alongside the rest so the
  // chip can show its count; a failure just leaves the chip off — the living
  // collection is what this screen is for.
  const [deceased, setDeceased] = useState<GenericInvert[]>([]);
  const fetchDeceased = async () => {
    try {
      setDeceased(await listDeceasedInverts());
    } catch {
      /* keep whatever we had */
    }
  };

  // Last record revived (Undo on its detail) → the chip disappears; don't
  // leave the keeper on a filter they can no longer see or leave.
  useEffect(() => {
    if (taxonFilter === 'died' && deceased.length === 0) setTaxonFilter('all');
  }, [taxonFilter, deceased.length]);

  // Archived (is_active = false) and ended (ended_at set) colonies. Kept apart
  // from `colonies` so they can never reach the main list, the chip counts or
  // the plan-cap notice. A failure just leaves the chip off, like the Died
  // archive.
  const [archivedColonies, setArchivedColonies] = useState<ColonyListItem[]>([]);
  const fetchArchivedColonies = async () => {
    try {
      setArchivedColonies(await listPastColonies());
    } catch {
      /* keep whatever we had */
    }
  };

  // "Past colonies" once any has ended; "Archived colonies" while it's only
  // shelved ones. Ended colonies never reach the main list.
  const hasEndedColony = archivedColonies.some((c) => !!c.ended_at);
  const pastNoun = hasEndedColony ? 'past' : 'archived';

  // Last colony unarchived → the chip disappears; don't strand the keeper on
  // a filter they can no longer see.
  useEffect(() => {
    if (taxonFilter === 'archived' && archivedColonies.length === 0) setTaxonFilter('all');
  }, [taxonFilter, archivedColonies.length]);

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
      Alert.alert('Error', 'Failed to load your collection');
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

  /** Where a row lives. Animals come from feeding-status (one call, every
   *  taxon); colonies carry it on their own list item. */
  const rowLocation = (row: Row): string | null => {
    if (row.kind === 'colony') return row.data.location ?? null;
    return feedingStatuses.get(row.data.id)?.location ?? (row.data as any).location ?? null;
  };
  const hasAnyLocation =
    keeperLocations.length > 0
    || colonies.some((c) => !!c.location)
    || Array.from(feedingStatuses.values()).some((s: FeedingStatus) => !!s.location);
  // If the last location gets cleared while grouped, fall back quietly.
  const effectiveSort = sortBy === 'location' && !hasAnyLocation ? 'name' : sortBy;

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

    switch (effectiveSort) {
      case 'location': {
        // Grouped rendering happens below; here we just order by location
        // (unassigned last) then name so the groups come out contiguous.
        rows.sort((a, b) => {
          const la = locationKey(rowLocation(a));
          const lb = locationKey(rowLocation(b));
          if (la !== lb) {
            if (la === null) return 1;
            if (lb === null) return -1;
            return la.localeCompare(lb);
          }
          return getRowName(a).localeCompare(getRowName(b));
        });
        break;
      }
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
      fetchArchivedColonies(),
      fetchDeceased(),
      loadFeedingStatuses(),
      refreshLocations(),
    ]);
    setRefreshing(false);
  }, []);

  // Re-fetch one animal's feeding stats and patch it into the map, so a quick
  // "mark fed" flips that card's badge without a full collection reload.
  //
  // USE THE GENERIC ENDPOINT. This used to call `/tarantulas/{id}/feeding-stats`,
  // which broke twice over:
  //
  //   1. A mantis, jumper or isopod has no row in `tarantulas`, so the call
  //      404'd into the catch below and the card fell back to a fabricated
  //      "fed today" — the keeper saw a plausible badge built from nothing.
  //   2. Even for tarantulas it was wrong: that response has no `is_overdue`,
  //      so patching it in DROPPED the species-and-life-stage-aware flag that
  //      `loadFeedingStatuses` fetched. The card silently reverted to the flat
  //      day-count semantics this screen deliberately abandoned, and Home, the
  //      Feeding Day screen and the digest could then disagree about the same
  //      animal.
  //
  // `/inverts/{id}/feeding-stats` is taxon-agnostic (matched on invert_id) and
  // returns the same cadence fields as the bulk `/inverts/feeding-status`, so
  // the patched entry stays the same shape as the ones it sits beside.
  const refreshFeedingStatus = async (animalId: string) => {
    const tzOffset = new Date().getTimezoneOffset();
    try {
      const response = await apiClient.get(
        `/inverts/${animalId}/feeding-stats`,
        { params: { tz_offset_minutes: tzOffset } },
      );
      setFeedingStatuses((prev) => {
        const next = new Map(prev);
        next.set(animalId, {
          tarantula_id: animalId,
          days_since_last_feeding: response.data.days_since_last_feeding,
          acceptance_rate: response.data.acceptance_rate,
          is_feeding_paused: response.data.is_feeding_paused,
          is_overdue: response.data.is_overdue ?? false,
          interval_days: response.data.interval_days ?? null,
        });
        return next;
      });
    } catch (error) {
      // The feeding itself already succeeded — only the badge refresh failed.
      // Keep the animal's known cadence rather than blanking it, and clear
      // `is_overdue`, which is the one thing we can assert: it was just fed.
      setFeedingStatuses((prev) => {
        const next = new Map(prev);
        const existing = next.get(animalId);
        next.set(animalId, {
          tarantula_id: animalId,
          days_since_last_feeding: 0,
          acceptance_rate: existing?.acceptance_rate ?? 0,
          is_feeding_paused: existing?.is_feeding_paused,
          is_overdue: false,
          interval_days: existing?.interval_days ?? null,
        });
        return next;
      });
    }
  };

  // Long-press sheet: "Mark fed today" / "Mark refused today". Posts a feeding
  // dated now with the given outcome. food_type is left null on purpose — this
  // is the one-tap path, and the detail screen renders a null type as "Unknown
  // food" the keeper can edit later. Endpoint has no trailing slash (named
  // sub-resource).
  const markOutcome = async (accepted: boolean) => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionBusy(true);
    try {
      await apiClient.post(`/tarantulas/${target.id}/feedings`, {
        fed_at: new Date().toISOString(),
        accepted,
      });
      await refreshFeedingStatus(target.id);
      setActionTarget(null);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          accepted
            ? `Logged a feeding for ${getDisplayName(target)}`
            : `Logged a refusal for ${getDisplayName(target)}`,
          ToastAndroid.SHORT,
        );
      }
    } catch (error) {
      Alert.alert(
        accepted ? 'Could not log feeding' : 'Could not log refusal',
        `Something went wrong logging for ${getDisplayName(
          target,
        )}. Please try again.`,
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkFed = () => markOutcome(true);
  const handleMarkRefused = () => markOutcome(false);

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

  /**
   * One write for both outcomes. `accepted` used to be hardcoded true here and
   * in handleMarkFed, which meant the two cheapest paths in the app could only
   * ever record the outcome the premolt model doesn't read.
   *
   * A refusal is not a failed feeding — it's an observation, and for most of
   * the collection it's the ONLY observation premolt has. 91% of live
   * tarantulas have no molt history, so the refusal-streak branch is the only
   * one that can fire for them.
   */
  const logQuickFeeding = async (
    id: string,
    taxon: string,
    displayName: string,
    accepted: boolean,
  ) => {
    if (quickFeedingIds.has(id)) return;
    setQuickFeedingIds((prev) => new Set(prev).add(id));
    try {
      const path =
        taxon === 'tarantula' ? `/tarantulas/${id}/feedings` : `/inverts/${id}/feedings`;
      await apiClient.post(path, {
        fed_at: new Date().toISOString(),
        accepted,
      });
      await refreshFeedingStatus(id);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          accepted
            ? `Logged a feeding for ${displayName}`
            : `Logged a refusal for ${displayName}`,
          ToastAndroid.SHORT,
        );
      }
    } catch (error) {
      Alert.alert(
        accepted ? 'Could not log feeding' : 'Could not log refusal',
        `Something went wrong logging for ${displayName}. Please try again.`,
      );
    } finally {
      setQuickFeedingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleQuickFeed = (id: string, taxon: string, displayName: string) =>
    logQuickFeeding(id, taxon, displayName, true);

  const handleQuickRefuse = (id: string, taxon: string, displayName: string) =>
    logQuickFeeding(id, taxon, displayName, false);

  const handleLogMolt = () => {
    if (!actionTarget) return;
    const tarantulaId = actionTarget.id;
    setActionTarget(null);
    // The generic molt form — same one the detail screen uses (outcome,
    // final molt, measurements, and the §14.9 offer after a fatal molt).
    // Tarantulas share their id with the inverts row, so this is the same animal.
    router.push(`/invert/add-molt?id=${tarantulaId}` as any);
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
        onQuickFeed={
          showFedButton
            ? () => handleQuickFeed(item.id, 'tarantula', getDisplayName(item))
            : undefined
        }
        onQuickRefuse={
          showFedButton
            ? () => handleQuickRefuse(item.id, 'tarantula', getDisplayName(item))
            : undefined
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
          status && showFedButton
            ? () =>
                handleQuickFeed(
                  item.id,
                  taxon,
                  item.name || item.common_name || item.scientific_name || 'this animal',
                )
            : undefined
        }
        onQuickRefuse={
          status && showFedButton
            ? () =>
                handleQuickRefuse(
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
        accessibilityHint="Opens this animal's detail page. Long press for quick actions."
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
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingTop: 14,
      paddingBottom: 4,
    },
    groupTitle: { flex: 1, ...TYPE.label, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    groupCount: { ...TYPE.label, fontVariant: ['tabular-nums'], marginRight: 6 },
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
    emptyArchiveLink: { marginTop: 16, minHeight: 44, justifyContent: 'center' },
    filterChipDot: { width: CHIP_DOT, height: CHIP_DOT, borderRadius: CHIP_DOT / 2 },
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
    colonySection: { gap: 10, marginBottom: 12 },
    colonySectionLabel: { ...TYPE.caption, letterSpacing: 1.1 },
    animalsLabel: { marginTop: 6 },
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
    // Separates the sort options from the display preferences below them.
    sheetDivider: {
      height: StyleSheet.hairlineWidth,
      marginTop: 8,
      marginBottom: 16,
      marginHorizontal: 4,
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

  // One entry point: the FAB goes straight to the unified add screen.
  //
  // The taxon picker sheet it replaced (design handoff, screen 7) stayed
  // mounted-but-unreachable in this file and in the dashboard for a while
  // after the rework, which is its own small hazard — reading the source
  // suggested a Colony row existed that no user could ever tap. Removed
  // 2026-09-08. `src/components/AddPickerSheet.tsx` now has no importers.
  const openAddPicker = () => {
    router.push('/add' as any);
  };

  // Renders the cross-taxon row using the discriminated union — the
  // FlatList itself stays homogeneous; renderItem dispatches.
  /** One location group: header, its colonies (full width), then its
   *  animals in the same card grid / list the flat view uses. Two-up in card
   *  mode is done by hand here because the FlatList's numColumns can't wrap
   *  headers. */
  const renderGroup = ({ item: g }: { item: { key: string; label: string; rows: Row[] } }) => {
    const groupColonies = g.rows.flatMap((r) => (r.kind === 'colony' ? [r.data] : []));
    const animals = g.rows.filter((r) => r.kind !== 'colony');
    const isUnassigned = g.key === '__unassigned__';
    const pairs: Row[][] = [];
    if (viewMode === 'card') {
      for (let i = 0; i < animals.length; i += 2) pairs.push(animals.slice(i, i + 2));
    }
    return (
      <View>
        <View style={styles.groupHeader}>
          <MaterialCommunityIcons
            name={isUnassigned ? 'map-marker-off-outline' : 'map-marker-outline'}
            size={16}
            color={colors.textTertiary}
          />
          <Text style={[styles.groupTitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {g.label}
          </Text>
          <Text style={[styles.groupCount, { color: colors.textTertiary }]}>{g.rows.length}</Text>
          {!isUnassigned && (
            <TouchableOpacity
              onPress={() => setRenameTarget(g.label)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Rename ${g.label}`}
            >
              <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        {groupColonies.map((c) => (
          <ColonyRow key={c.id} item={c} onPress={() => router.push(`/colony/${c.id}` as any)} />
        ))}
        {viewMode === 'card'
          ? pairs.map((pair, i) => (
              <View key={i} style={{ flexDirection: 'row' }}>
                {pair.map((r) => (
                  <React.Fragment key={`${r.kind}-${r.data.id}`}>{renderRow({ item: r })}</React.Fragment>
                ))}
                {pair.length === 1 && <View style={{ flex: 1, margin: 8 }} />}
              </View>
            ))
          : animals.map((r) => (
              <React.Fragment key={`${r.kind}-${r.data.id}`}>{renderRow({ item: r })}</React.Fragment>
            ))}
      </View>
    );
  };

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
    // Colonies never reach here — they render as full-width ColonyRows above
    // the grid (see ListHeaderComponent).
    if (item.kind === 'colony') return null;
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
      opts?: { icon?: string; iconColor?: string; dot?: boolean },
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
          {opts?.dot ? (
            <View style={[styles.filterChipDot, { backgroundColor: active ? '#fff' : colors.textTertiary }]} />
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
        {/* Last, after the living taxa: a status, not a kind of animal. */}
        {deceased.length > 0 ? chip('died', 'Died', deceased.length, { dot: true }) : null}
        {/* Also a status, and also only when there's something in it. */}
        {archivedColonies.length > 0
          ? chip('archived', hasEndedColony ? 'Past colonies' : 'Archived colonies', archivedColonies.length, { dot: true })
          : null}
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
  const filteredRows = getFilteredRows();
  const grouped = effectiveSort === 'location';
  const colonyRowsShown = grouped
    ? []
    : filteredRows.flatMap((row) => (row.kind === 'colony' ? [row.data] : []));
  const locationGroups = grouped ? groupByLocation<Row>(filteredRows, rowLocation) : [];

  /** Rename (or merge) a location from its group header. Merging is
   *  confirmed with the count, because it's the one action here that can't
   *  be undone with a single tap. */
  const submitRename = async (oldName: string, newName: string) => {
    const targetKey = locationKey(newName);
    if (!targetKey || targetKey === locationKey(oldName)) {
      setRenameTarget(null);
      return;
    }
    const existing = keeperLocations.find((l) => locationKey(l.name) === targetKey);
    const run = async () => {
      try {
        await renameLocation(oldName, newName);
        setRenameTarget(null);
        await Promise.all([loadFeedingStatuses(), fetchColonies(), refreshLocations()]);
      } catch (e: any) {
        Alert.alert('Could not rename', e?.response?.data?.detail || e?.message || 'Something went wrong.');
      }
    };
    if (existing) {
      const moving = keeperLocations.find((l) => locationKey(l.name) === locationKey(oldName))?.count ?? 0;
      Alert.alert(
        `Merge into ${existing.name}?`,
        `${moving} ${moving === 1 ? 'entry' : 'entries'} from “${oldName}” will move to “${existing.name}”.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: run },
        ],
      );
      return;
    }
    await run();
  };
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

      {taxonFilter === 'archived' ? (
        <ArchivedColonies
          items={archivedColonies}
          search={searchQuery}
          header={<TaxonFilterChips />}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpen={(c) => router.push(`/colony/${c.id}` as any)}
        />
      ) : taxonFilter === 'died' ? (
        <DeceasedArchive
          items={deceased}
          search={searchQuery}
          header={<TaxonFilterChips />}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpen={(a) => router.push(`/invert/${a.id}` as any)}
        />
      ) : collectionEmpty ? (
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
          {/* A keeper whose last animal died lands here, and the Died chip
              lives in a row this state doesn't render. Without this link
              the records we promised to keep would be unreachable. */}
          {deceased.length > 0 && (
            <TouchableOpacity
              onPress={() => setTaxonFilter('died')}
              style={styles.emptyArchiveLink}
              accessibilityRole="button"
            >
              <Text style={[styles.filteredEmptyAction, { color: colors.accent }]}>
                {deceased.length} {deceased.length === 1 ? 'record' : 'records'} kept — view
              </Text>
            </TouchableOpacity>
          )}
          {/* Same for a keeper whose only colony is archived. */}
          {archivedColonies.length > 0 && (
            <TouchableOpacity
              onPress={() => setTaxonFilter('archived')}
              style={styles.emptyArchiveLink}
              accessibilityRole="button"
            >
              <Text style={[styles.filteredEmptyAction, { color: colors.accent }]}>
                {archivedColonies.length} {pastNoun} {archivedColonies.length === 1 ? 'colony' : 'colonies'} — view
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <FlatList
            key={`${viewMode}-${grouped ? 'grouped' : 'flat'}`} // numColumns can't change on a mounted list
            // Colonies render above the grid as full-width rows (design
            // handoff, screen 8) — a population isn't an animal card.
            data={(grouped ? locationGroups : filteredRows.filter((row) => row.kind !== 'colony')) as any[]}
            renderItem={(grouped ? renderGroup : renderRow) as any}
            keyExtractor={(item: any) => (grouped ? `group-${item.key}` : `${item.kind}-${item.data.id}`)}
            numColumns={viewMode === 'card' && !grouped ? 2 : 1}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <>
                {/* The cap notice lives here rather than only on the
                    subscription screen, which is the one place a lapsed
                    keeper has no reason to open. Renders nothing for premium
                    keepers and for anyone comfortably under the cap. */}
                {/* `totalAnimals`, not the filtered rows — the cap counts
                    the whole collection including colonies, and filtering to
                    one taxon must not make the notice disappear. */}
                <CollectionCapNotice count={totalAnimals} />
                <PremoltAlertCard />
                {/* The only chrome left in the body. Search moved into the
                    header, sort into the ⚙ sheet, layout into the header
                    toggle, and the stats card was a duplicate of Home's. */}
                <TaxonFilterChips />
                {colonyRowsShown.length > 0 && (
                  <View style={styles.colonySection}>
                    <Text style={[styles.colonySectionLabel, { color: colors.textSecondary }]}>
                      COLONIES
                    </Text>
                    {colonyRowsShown.map((c) => (
                      <ColonyRow key={c.id} item={c} onPress={() => router.push(`/colony/${c.id}` as any)} />
                    ))}
                    {filteredRows.some((row) => row.kind !== 'colony') && (
                      <Text style={[styles.colonySectionLabel, styles.animalsLabel, { color: colors.textSecondary }]}>
                        ANIMALS
                      </Text>
                    )}
                  </View>
                )}
              </>
            }
            ListEmptyComponent={colonyRowsShown.length > 0 ? null : 
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
          <LocationRenameSheet
            visible={renameTarget !== null}
            current={renameTarget ?? ''}
            onClose={() => setRenameTarget(null)}
            onSubmit={(next) => submitRename(renameTarget ?? '', next)}
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
        onMarkRefused={handleMarkRefused}
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
                // Only once a location exists — otherwise the sheet is unchanged.
                ...(hasAnyLocation
                  ? [{ value: 'location' as const, label: 'By location', icon: 'map-marker-outline' }]
                  : []),
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

            {/* Display preferences. Lives in this sheet rather than Settings
                because it's about THIS screen and the keeper is already here
                deciding how the grid should look. */}
            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Display</Text>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => toggleFedButton(!showFedButton)}
              accessibilityRole="switch"
              accessibilityState={{ checked: showFedButton }}
              accessibilityLabel="Show Fed button on cards"
              accessibilityHint="Adds a one tap feeding button to every card in the collection"
            >
              <MaterialCommunityIcons
                name="silverware-fork-knife"
                size={20}
                color={showFedButton ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[
                  styles.sheetRowText,
                  { color: showFedButton ? colors.accent : colors.textPrimary },
                ]}
              >
                Show Fed button
              </Text>
              <MaterialCommunityIcons
                name={showFedButton ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={26}
                color={showFedButton ? colors.accent : colors.textTertiary}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

export default withErrorBoundary(CollectionScreen, 'collection');
