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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  acceptance_rate: number;
  // Pause flag — see migration pst_20260502. When true, the
  // collection grid renders a quiet "Paused" pill instead of the
  // red overdue treatment.
  is_feeding_paused?: boolean;
}

interface PremoltPrediction {
  tarantula_id: string;
  probability: number;
  confidence_level: string;
  status_text: string;
}

interface CollectionStats {
  total_tarantulas: number;
  unique_species: number;
  total_feedings: number;
  total_molts: number;
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
}

// Taxon discriminator drives the FlatList row dispatcher: tarantulas
// keep their full-featured card (feeding badge + premolt + action
// sheet), scorpions + centipedes render via a simpler card until
// those features ship for the additional surfaces. New taxa land
// here when added.
type TaxonFilter = 'all' | 'tarantulas' | 'scorpions' | 'centipedes';

type Row =
  | { kind: 'tarantula'; data: Tarantula }
  | { kind: 'scorpion'; data: Scorpion }
  | { kind: 'centipede'; data: Centipede };

function CollectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [scorpions, setScorpions] = useState<Scorpion[]>([]);
  const [centipedes, setCentipedes] = useState<Centipede[]>([]);
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map());
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map());
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'lastFed' | 'acquired'>('name');
  // Taxon filter — sits above search/sort. When 'tarantulas' or
  // 'scorpions', the other taxon is filtered out entirely.
  const [taxonFilter, setTaxonFilter] = useState<TaxonFilter>('all');
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
    fetchCollectionStats();
  }, []);

  const fetchCollectionStats = async () => {
    try {
      const response = await apiClient.get('/analytics/collection');
      setCollectionStats(response.data);
    } catch (error) {
      // Silently fail - stats are optional
    }
  };

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

  const fetchTarantulas = async () => {
    try {
      const response = await apiClient.get('/tarantulas/');
      setTarantulas(response.data);
      await fetchAllFeedingStatuses(response.data);
      await fetchAllPremoltPredictions(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantulas');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFeedingStatuses = async (tarantulasList: Tarantula[]) => {
    const statusMap = new Map<string, FeedingStatus>();
    // Pass tz offset so days_since_last_feeding reflects calendar days
    // in the user's zone (otherwise evening feedings flip from "0d" to
    // "1d" only at UTC midnight, not local midnight).
    const tzOffset = new Date().getTimezoneOffset();

    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(
            `/tarantulas/${t.id}/feeding-stats`,
            { params: { tz_offset_minutes: tzOffset } },
          );
          statusMap.set(t.id, {
            tarantula_id: t.id,
            days_since_last_feeding: response.data.days_since_last_feeding,
            acceptance_rate: response.data.acceptance_rate,
            is_feeding_paused: response.data.is_feeding_paused,
          });
        } catch (error) {
          // Silently fail for individual tarantulas
        }
      })
    );
    
    setFeedingStatuses(statusMap);
  };

  const fetchAllPremoltPredictions = async (tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>();

    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(`/tarantulas/${t.id}/premolt-prediction`);
          predictionMap.set(t.id, {
            tarantula_id: t.id,
            probability: response.data.probability,
            confidence_level: response.data.confidence_level,
            status_text: response.data.status_text,
          });
        } catch (error) {
          // Silently fail for individual tarantulas
        }
      })
    );

    setPremoltPredictions(predictionMap);
  };

  const getFeedingStatusBadge = (tarantulaId: string) => {
    const status = feedingStatuses.get(tarantulaId);
    if (!status) return null;

    // Paused trumps everything. A 7-month premolt sling shouldn't
    // see her tile flashing red every day.
    if (status.is_feeding_paused) {
      return (
        <View
          style={[styles.feedingBadge, styles.feedingBadgePaused]}
          accessibilityLabel="Feeding paused"
        >
          <Text style={styles.feedingBadgeText}>⏸ Paused</Text>
        </View>
      );
    }

    if (status.days_since_last_feeding === undefined) return null;

    const days = status.days_since_last_feeding;
    let badgeStyle = styles.feedingBadgeGreen;
    let label: string;
    // Screen-reader label — spells out the meaning the emoji carries visually.
    let a11yLabel: string;

    if (days === 0) {
      label = '✓ Fed today';
      a11yLabel = 'Fed today';
    } else if (days >= 21) {
      badgeStyle = styles.feedingBadgeRed;
      label = `⚠️ ${days}d ago`;
      a11yLabel = `Overdue, last fed ${days} days ago`;
    } else if (days >= 14) {
      badgeStyle = styles.feedingBadgeOrange;
      label = `⏰ ${days}d ago`;
      a11yLabel = `Feeding due soon, last fed ${days} days ago`;
    } else if (days >= 7) {
      badgeStyle = styles.feedingBadgeYellow;
      label = `📅 ${days}d ago`;
      a11yLabel = `Last fed ${days} days ago`;
    } else {
      label = `✓ ${days}d ago`;
      a11yLabel = `Last fed ${days} days ago`;
    }

    return (
      <View style={[styles.feedingBadge, badgeStyle]} accessibilityLabel={a11yLabel}>
        <Text style={styles.feedingBadgeText}>{label}</Text>
      </View>
    );
  };

  const getPremoltBadge = (tarantulaId: string) => {
    const prediction = premoltPredictions.get(tarantulaId);
    if (!prediction) return null;

    // Only show badge for medium or higher confidence
    if (prediction.confidence_level === 'low') return null;

    let badgeStyle = styles.premoltBadgeGray;

    if (prediction.confidence_level === 'very_high') {
      badgeStyle = styles.premoltBadgeRed;
    } else if (prediction.confidence_level === 'high') {
      badgeStyle = styles.premoltBadgeOrange;
    } else if (prediction.confidence_level === 'medium') {
      badgeStyle = styles.premoltBadgeYellow;
    }

    return (
      <View
        style={[styles.premoltBadge, badgeStyle]}
        accessibilityLabel={`Likely in premolt, ${prediction.probability}% probability`}
      >
        <Text style={styles.premoltBadgeText}>
          🦋 {prediction.probability}%
        </Text>
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
    return centipedeDisplayName(row.data);
  };

  // Filter and sort rows (tarantulas + scorpions + centipedes, gated
  // by taxonFilter). When a specific taxon is selected the other two
  // collapse out entirely so the keeper can focus.
  const getFilteredRows = (): Row[] => {
    const query = searchQuery.toLowerCase();

    const tarantulaRows: Row[] =
      taxonFilter === 'all' || taxonFilter === 'tarantulas'
        ? tarantulas.map((t) => ({ kind: 'tarantula' as const, data: t }))
        : [];
    const scorpionRows: Row[] =
      taxonFilter === 'all' || taxonFilter === 'scorpions'
        ? scorpions.map((s) => ({ kind: 'scorpion' as const, data: s }))
        : [];
    const centipedeRows: Row[] =
      taxonFilter === 'all' || taxonFilter === 'centipedes'
        ? centipedes.map((c) => ({ kind: 'centipede' as const, data: c }))
        : [];

    let rows: Row[] = [...tarantulaRows, ...scorpionRows, ...centipedeRows];

    // Search across name, common_name, and scientific_name regardless
    // of taxon. Empty query short-circuits.
    if (query) {
      rows = rows.filter((row) => {
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
        // Only tarantulas have feeding statuses today — scorpions sort
        // to the bottom by default. When scorpion feeding analytics
        // ship, generalize this to a per-row "lastFed" accessor.
        rows.sort((a, b) => {
          if (a.kind !== 'tarantula' && b.kind !== 'tarantula') return 0;
          if (a.kind !== 'tarantula') return 1;
          if (b.kind !== 'tarantula') return -1;
          const daysA =
            feedingStatuses.get(a.data.id)?.days_since_last_feeding ?? Infinity;
          const daysB =
            feedingStatuses.get(b.data.id)?.days_since_last_feeding ?? Infinity;
          return daysB - daysA;
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
      fetchCollectionStats(),
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
    const displayName = item.name || item.common_name || 'Unknown';
    const sexLabel = item.sex === 'female' ? 'female' : item.sex === 'male' ? 'male' : 'unknown sex';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/tarantula/${item.id}`)}
        onLongPress={() => setActionTarget(item)}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.scientific_name}, ${sexLabel}`}
        accessibilityHint="Opens this tarantula's detail page. Long press for quick actions."
      >
        <View style={styles.imageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.image}
              accessibilityLabel={`Photo of ${displayName}`}
            />
          ) : (
            <View
              style={styles.placeholderImage}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <MaterialCommunityIcons name="spider" size={40} color={colors.textTertiary} />
            </View>
          )}
          {item.sex && (
            <View
              style={[
                styles.sexBadge,
                item.sex === 'female'
                  ? styles.femaleBadge
                  : item.sex === 'male'
                    ? styles.maleBadge
                    : styles.unknownBadge,
              ]}
              accessibilityLabel={
                item.sex === 'female'
                  ? 'Female'
                  : item.sex === 'male'
                    ? 'Male'
                    : 'Unknown sex'
              }
            >
              <MaterialCommunityIcons
                name={
                  item.sex === 'female'
                    ? 'gender-female'
                    : item.sex === 'male'
                      ? 'gender-male'
                      : 'help-circle-outline'
                }
                size={16}
                color="#fff"
              />
            </View>
          )}
          {getFeedingStatusBadge(item.id)}
          {getPremoltBadge(item.id)}
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.scientificName}>{item.scientific_name}</Text>
          {item.common_name && (
            <Text style={styles.commonName}>{item.common_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Scorpion card — same visual frame as renderTarantula so the
  // unified grid reads as one collection. No feeding-status pill or
  // premolt badge (those features don't exist for scorpions yet); no
  // long-press action sheet either. Add taxon-specific affordances
  // here as the scorpion surface grows.
  const renderScorpion = ({ item }: { item: Scorpion }) => {
    const displayName =
      item.name || item.common_name || item.scientific_name || 'Unnamed';
    const sexLabel =
      item.sex === 'female'
        ? 'female'
        : item.sex === 'male'
          ? 'male'
          : 'unknown sex';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/scorpion/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.scientific_name ?? 'no scientific name'}, ${sexLabel}, scorpion`}
        accessibilityHint="Opens this scorpion's detail page."
      >
        <View style={styles.imageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.image}
              accessibilityLabel={`Photo of ${displayName}`}
            />
          ) : (
            <View
              style={styles.placeholderImage}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <MaterialCommunityIcons
                name="zodiac-scorpio"
                size={40}
                color={colors.textTertiary}
              />
            </View>
          )}
          {item.sex && item.sex !== 'unknown' && (
            <View
              style={[
                styles.sexBadge,
                item.sex === 'female' ? styles.femaleBadge : styles.maleBadge,
              ]}
              accessibilityLabel={item.sex === 'female' ? 'Female' : 'Male'}
            >
              <MaterialCommunityIcons
                name={item.sex === 'female' ? 'gender-female' : 'gender-male'}
                size={16}
                color="#fff"
              />
            </View>
          )}
          {/* Small taxon glyph in the bottom-left so scorpions are
              visually distinguishable from tarantulas at a glance. */}
          <View style={styles.taxonGlyph}>
            <Text style={{ fontSize: 14 }}>🦂</Text>
          </View>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.name}>{displayName}</Text>
          {item.scientific_name && (
            <Text style={styles.scientificName}>{item.scientific_name}</Text>
          )}
          {item.common_name && (
            <Text style={styles.commonName}>{item.common_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Centipede card mirrors the scorpion card. Same simple shape until
  // feeding-status + premolt indicators ship for the consolidated
  // taxa. Icon is `bug-outline` (closest MCI glyph to a centipede) +
  // a 🐛 taxon stamp in the bottom-left.
  const renderCentipede = ({ item }: { item: Centipede }) => {
    const displayName =
      item.name || item.common_name || item.scientific_name || 'Unnamed';
    const sexLabel =
      item.sex === 'female'
        ? 'female'
        : item.sex === 'male'
          ? 'male'
          : 'unknown sex';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/centipede/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.scientific_name ?? 'no scientific name'}, ${sexLabel}, centipede`}
        accessibilityHint="Opens this centipede's detail page."
      >
        <View style={styles.imageContainer}>
          {item.photo_url ? (
            <Image
              source={{ uri: getImageUrl(item.photo_url) }}
              style={styles.image}
              accessibilityLabel={`Photo of ${displayName}`}
            />
          ) : (
            <View
              style={styles.placeholderImage}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <MaterialCommunityIcons
                name="bug-outline"
                size={40}
                color={colors.textTertiary}
              />
            </View>
          )}
          {item.sex && item.sex !== 'unknown' && (
            <View
              style={[
                styles.sexBadge,
                item.sex === 'female' ? styles.femaleBadge : styles.maleBadge,
              ]}
              accessibilityLabel={item.sex === 'female' ? 'Female' : 'Male'}
            >
              <MaterialCommunityIcons
                name={item.sex === 'female' ? 'gender-female' : 'gender-male'}
                size={16}
                color="#fff"
              />
            </View>
          )}
          <View style={styles.taxonGlyph}>
            <Text style={{ fontSize: 14 }}>🐛</Text>
          </View>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.name}>{displayName}</Text>
          {item.scientific_name && (
            <Text style={styles.scientificName}>{item.scientific_name}</Text>
          )}
          {item.common_name && (
            <Text style={styles.commonName}>{item.common_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: Tarantula }) => {
    const feedingStatus = feedingStatuses.get(item.id);
    const premoltPrediction = premoltPredictions.get(item.id);
    const days = feedingStatus?.days_since_last_feeding;

    let feedingColor = colors.success;
    if (days !== undefined) {
      if (days >= 21) feedingColor = '#ef4444';
      else if (days >= 14) feedingColor = '#f97316';
      else if (days >= 7) feedingColor = '#eab308';
    }

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
                    ? '#ec489920' // pink tint
                    : item.sex === 'male'
                      ? '#3b82f620' // blue tint
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
                  ? '#ec4899'
                  : item.sex === 'male'
                    ? '#3b82f6'
                    : colors.textTertiary
              }
            />
          </View>
          {days !== undefined && (
            <View
              style={[styles.listBadge, { backgroundColor: feedingColor }]}
              accessibilityLabel={`Last fed ${days} days ago`}
            >
              <Text style={styles.listBadgeText}>{days}d</Text>
            </View>
          )}
          {premoltPrediction && premoltPrediction.confidence_level !== 'low' && (
            <View
              style={[styles.listBadge, { backgroundColor: '#f97316' }]}
              accessibilityLabel={`Likely in premolt, ${premoltPrediction.probability}% probability`}
            >
              <Text style={styles.listBadgeText}>🦋 {premoltPrediction.probability}%</Text>
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

  const ViewToggle = () => (
    <View style={styles.viewToggleContainer} accessibilityRole="radiogroup">
      <TouchableOpacity
        style={[styles.viewToggleButton, viewMode === 'card' && styles.viewToggleActive]}
        onPress={() => toggleViewMode('card')}
        accessibilityRole="radio"
        accessibilityState={{ selected: viewMode === 'card' }}
        accessibilityLabel="Grid view"
      >
        <MaterialCommunityIcons
          name="view-grid"
          size={20}
          color={viewMode === 'card' ? '#fff' : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
        onPress={() => toggleViewMode('list')}
        accessibilityRole="radio"
        accessibilityState={{ selected: viewMode === 'list' }}
        accessibilityLabel="List view"
      >
        <MaterialCommunityIcons
          name="view-list"
          size={20}
          color={viewMode === 'list' ? '#fff' : colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );

  // Search bar was previously a `const SearchBar = () => (...)`
  // component defined inside CollectionScreen, which caused React to
  // see a NEW component type on every parent render — so the inner
  // TextInput got unmounted after every keystroke and the keyboard
  // lost focus. Now inlined directly into the FlatList header below.
  // The other inline header components (SortChips, ViewToggle,
  // TaxonFilterChips) still follow the old pattern but have no input
  // state that suffers from unmount/remount; clean those up when
  // there's a reason to touch them again.

  const SortChips = () => (
    <View style={styles.sortContainer} accessibilityRole="radiogroup">
      <TouchableOpacity
        style={[styles.sortChip, sortBy === 'name' && styles.sortChipActive, { borderColor: colors.border }]}
        onPress={() => setSortBy('name')}
        accessibilityRole="radio"
        accessibilityState={{ selected: sortBy === 'name' }}
        accessibilityLabel="Sort alphabetically"
      >
        <Text style={[styles.sortChipText, sortBy === 'name' && styles.sortChipTextActive, { color: sortBy === 'name' ? '#fff' : colors.textSecondary }]}>
          A-Z
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.sortChip, sortBy === 'lastFed' && styles.sortChipActive, { borderColor: colors.border }]}
        onPress={() => setSortBy('lastFed')}
        accessibilityRole="radio"
        accessibilityState={{ selected: sortBy === 'lastFed' }}
        accessibilityLabel="Sort by last fed date"
      >
        <Text style={[styles.sortChipText, sortBy === 'lastFed' && styles.sortChipTextActive, { color: sortBy === 'lastFed' ? '#fff' : colors.textSecondary }]}>
          Last Fed
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.sortChip, sortBy === 'acquired' && styles.sortChipActive, { borderColor: colors.border }]}
        onPress={() => setSortBy('acquired')}
        accessibilityRole="radio"
        accessibilityState={{ selected: sortBy === 'acquired' }}
        accessibilityLabel="Sort by acquisition date"
      >
        <Text style={[styles.sortChipText, sortBy === 'acquired' && styles.sortChipTextActive, { color: sortBy === 'acquired' ? '#fff' : colors.textSecondary }]}>
          Acquired
        </Text>
      </TouchableOpacity>
    </View>
  );

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
    sexBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    maleBadge: {
      backgroundColor: '#3b82f6',
    },
    femaleBadge: {
      backgroundColor: '#ec4899',
    },
    unknownBadge: {
      backgroundColor: '#9ca3af',
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
    commonName: {
      fontSize: 12,
      color: colors.textSecondary,
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
  const openAddPicker = () => {
    setAddPickerOpen(true);
  };

  const handleAddPick = (taxon: AddPickerTaxon) => {
    setAddPickerOpen(false);
    if (taxon === 'tarantula') {
      router.push('/tarantula/add');
    } else if (taxon === 'scorpion') {
      router.push('/scorpion/add' as any);
    } else {
      router.push('/centipede/add' as any);
    }
  };

  // Renders the cross-taxon row using the discriminated union — the
  // FlatList itself stays homogeneous; renderItem dispatches.
  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'scorpion') {
      return renderScorpion({ item: item.data });
    }
    if (item.kind === 'centipede') {
      return renderCentipede({ item: item.data });
    }
    return viewMode === 'card'
      ? renderTarantula({ item: item.data })
      : renderListItem({ item: item.data });
  };

  // Inline three-chip taxon filter — sits at the top of the list
  // header so the keeper can switch focus without leaving the screen.
  const TaxonFilterChips = () => (
    <View style={styles.sortContainer}>
      {(
        [
          { value: 'all' as const, label: 'All' },
          { value: 'tarantulas' as const, label: '🕷 Tarantulas' },
          { value: 'scorpions' as const, label: '🦂 Scorpions' },
          { value: 'centipedes' as const, label: '🐛 Centipedes' },
        ]
      ).map((opt) => {
        const active = taxonFilter === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.sortChip,
              active && styles.sortChipActive,
              { borderColor: colors.border },
            ]}
            onPress={() => setTaxonFilter(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.sortChipText,
                active && styles.sortChipTextActive,
                { color: active ? '#fff' : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

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

  // Collection is empty across BOTH taxa — show the welcome flow that
  // offers either path.
  const collectionEmpty = tarantulas.length === 0 && scorpions.length === 0;

  return (
    <View style={styles.container}>
      {collectionEmpty ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="paw" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No animals yet</Text>
          <Text style={styles.emptyText}>
            Start building your collection — add a tarantula or a
            scorpion. Not sure which species? Browse the care sheets first.
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
                {/* Premolt Alert Card */}
                <PremoltAlertCard />

                {/* Search Bar — inlined (not a sub-component) so the
                    TextInput keeps its identity across re-renders.
                    Defining it as `const SearchBar = () => (...)` made
                    React see a new component type every keystroke,
                    which unmounted the input and dropped keyboard
                    focus after one character. */}
                <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <MaterialCommunityIcons
                    name="magnify"
                    size={20}
                    color={colors.textSecondary}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    placeholder="Search by name, species..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Search tarantulas by name or species"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                    >
                      <MaterialCommunityIcons name="close-circle" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Taxon filter — sits above the sort chips so it
                    reads as the primary axis (taxon first, then sort
                    inside that taxon). */}
                <TaxonFilterChips />

                {/* Sort Chips */}
                <SortChips />

                {/* View Toggle Row */}
                <View style={styles.statsHeaderRow}>
                  <Text style={styles.statsTitle}>🕷️ My Collection</Text>
                  <ViewToggle />
                </View>

                {/* Stats Card */}
                {collectionStats && (
                  <View style={styles.statsCard}>
                    <View style={styles.statsHeader}>
                      <Text style={styles.statsTitle}>📊 Collection Stats</Text>
                      <TouchableOpacity onPress={() => router.push('/analytics')}>
                        <Text style={styles.viewAllLink}>View All →</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.statsGrid}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_tarantulas}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.unique_species}</Text>
                        <Text style={styles.statLabel}>Species</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_feedings}</Text>
                        <Text style={styles.statLabel}>Feedings</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_molts}</Text>
                        <Text style={styles.statLabel}>Molts</Text>
                      </View>
                    </View>
                    <View style={styles.sexDistribution}>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="gender-male" size={16} color="#3b82f6" />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.male} ♂</Text>
                      </View>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="gender-female" size={16} color="#ec4899" />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.female} ♀</Text>
                      </View>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="help-circle" size={16} color={colors.textTertiary} />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.unknown} ?</Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
          />
          <PrimaryButton
            fab
            size={56}
            onPress={openAddPicker}
            outerStyle={styles.fab}
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
