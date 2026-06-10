/**
 * Unified species browser — taxon-switchable catalog.
 *
 * Top-of-screen segment toggles between the tarantula catalog
 * (`/species`) and the scorpion catalog (`/scorpion-species/` via the
 * scorpions lib). Tapping a row routes to the appropriate care sheet
 * — `/species/[id]` for tarantulas, `/scorpion-species/[id]` for
 * scorpions. The reptile catalog lives in Herpetoverse so it stays
 * out of this surface.
 *
 * The route is hidden from the tab bar (`href: null` in
 * `(tabs)/_layout.tsx`); entry points are header icons on the
 * Tarantulas and Scorpions tabs, plus deep-links from forms that
 * accept `?taxon=` to preselect.
 */
import {
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';
import { getImageUrl } from '../../src/utils/image-url';
import {
  listScorpionSpecies,
  type ScorpionSpecies,
  venomSeverityColor,
} from '../../src/lib/scorpions';
import {
  listCentipedeSpecies,
  type CentipedeSpecies,
} from '../../src/lib/centipedes';
import {
  listWhipSpiderSpecies,
} from '../../src/lib/whip-spiders';
import {
  listInvertSpecies,
  INVERT_TAXA,
  type InvertTaxon,
} from '../../src/lib/inverts';
import { Chip, Badge } from '../../src/components/ui';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

// ---------------------------------------------------------------------------
// Taxon-agnostic row type. The browser holds a discriminated union so
// the renderer can dispatch on `taxon` to show taxon-appropriate badges.
// ---------------------------------------------------------------------------

// The four "established" taxa keep their plural keys + dedicated libs.
// The ADR-006 expansion taxa use their singular `InvertTaxon` keys and
// all flow through the generic `/invert-species/?taxon=` endpoint, so
// adding another is a one-line edit to GENERIC_TAXA + the seed.
type GenericTaxon = 'vinegaroon' | 'true_spider' | 'millipede' | 'mantis' | 'roach' | 'other';
type Taxon = 'tarantulas' | 'scorpions' | 'centipedes' | 'whip_spiders' | GenericTaxon;

const GENERIC_TAXA: GenericTaxon[] = ['vinegaroon', 'true_spider', 'millipede', 'mantis', 'roach', 'other'];
const isGenericTaxon = (t: Taxon): t is GenericTaxon =>
  (GENERIC_TAXA as string[]).includes(t);

// Per-taxon display metadata. `tab` is the segment label (glyph + name),
// `noun` is the singular used in "{n} {noun} species" + search hints,
// `glyph` is the large loading/empty emoji. Established taxa keep their
// curated labels; the five expansion taxa pull glyph from the registry.
const TAXON_ORDER: Taxon[] = [
  'tarantulas', 'scorpions', 'centipedes', 'whip_spiders',
  'vinegaroon', 'true_spider', 'millipede', 'mantis', 'roach', 'other',
];
const TAXON_META: Record<Taxon, { tab: string; noun: string; glyph: string }> = {
  tarantulas: { tab: '🕷  Tarantulas', noun: 'tarantula', glyph: '🕷️' },
  scorpions: { tab: '🦂  Scorpions', noun: 'scorpion', glyph: '🦂' },
  centipedes: { tab: '🐛  Centipedes', noun: 'centipede', glyph: '🐛' },
  whip_spiders: { tab: '🕸️  Whip spiders', noun: 'whip spider', glyph: '🕸️' },
  vinegaroon: { tab: `${INVERT_TAXA.vinegaroon.glyph}  Vinegaroons`, noun: 'vinegaroon', glyph: INVERT_TAXA.vinegaroon.glyph },
  true_spider: { tab: `${INVERT_TAXA.true_spider.glyph}  True spiders`, noun: 'true spider', glyph: INVERT_TAXA.true_spider.glyph },
  millipede: { tab: `${INVERT_TAXA.millipede.glyph}  Millipedes`, noun: 'millipede', glyph: INVERT_TAXA.millipede.glyph },
  mantis: { tab: `${INVERT_TAXA.mantis.glyph}  Mantises`, noun: 'mantis', glyph: INVERT_TAXA.mantis.glyph },
  roach: { tab: `${INVERT_TAXA.roach.glyph}  Roaches`, noun: 'roach', glyph: INVERT_TAXA.roach.glyph },
  other: { tab: `${INVERT_TAXA.other.glyph}  Other`, noun: 'other invertebrate', glyph: INVERT_TAXA.other.glyph },
};

interface TarantulaRow {
  taxon: 'tarantulas';
  id: string;
  scientific_name: string;
  common_names: string[];
  type: string | null;
  care_level: string | null;
  adult_size: string | null;
  is_verified: boolean;
  image_url: string | null;
  urticating_hairs?: boolean;
  medically_significant_venom?: boolean;
}

interface ScorpionRow {
  taxon: 'scorpions';
  id: string;
  scientific_name: string;
  common_names: string[];
  type: string | null;
  care_level: string | null;
  adult_size: string | null;
  is_verified: boolean;
  image_url: string | null;
  venom_severity: ScorpionSpecies['venom_severity'];
  communal_suitable: boolean;
}

interface CentipedeRow {
  taxon: 'centipedes';
  id: string;
  scientific_name: string;
  common_names: string[];
  type: string | null;
  care_level: string | null;
  adult_size: string | null;
  is_verified: boolean;
  image_url: string | null;
  /** Centipedes share the scorpion venom tier shape — used to render
   * the same "Hot" pill on the card. */
  venom_severity: CentipedeSpecies['venom_severity'];
  /** Drives the small "anamorphic"/"epimorphic" hint on the card. */
  developmental_class: CentipedeSpecies['developmental_class'];
}

interface WhipSpiderRow {
  taxon: 'whip_spiders';
  id: string;
  scientific_name: string;
  common_names: string[];
  type: string | null;
  care_level: string | null;
  adult_size: string | null;
  is_verified: boolean;
  image_url: string | null;
  /** Whip spiders are harmless (no venom). communal_suitable drives a
   * "group-keepable" badge instead of a venom pill. */
  communal_suitable: boolean;
}

interface GenericInvertRow {
  taxon: GenericTaxon;
  id: string;
  scientific_name: string;
  common_names: string[];
  type: string | null;
  care_level: string | null;
  adult_size: string | null;
  is_verified: boolean;
  image_url: string | null;
  /** Generic venom tier string ('mild'|'moderate'|'medically_significant'|null).
   * Most expansion taxa are harmless (null). */
  venom_severity: string | null;
  communal_suitable: boolean;
  /** Drives a leaf glyph for detritivores (millipedes) on the card. */
  feeding_mode: string | null;
}

type Row = TarantulaRow | ScorpionRow | CentipedeRow | WhipSpiderRow | GenericInvertRow;

export default function UnifiedSpeciesScreen() {
  const { colors } = useTheme();
  // Allow deep-linking with `?taxon=scorpions` so the entry icons on
  // each collection tab preselect the right segment.
  const { taxon: taxonParam } = useLocalSearchParams<{ taxon?: string }>();
  const initialTaxon: Taxon =
    taxonParam === 'scorpions'
      ? 'scorpions'
      : taxonParam === 'centipedes'
        ? 'centipedes'
        : taxonParam === 'whip_spiders'
          ? 'whip_spiders'
          : taxonParam && (GENERIC_TAXA as string[]).includes(taxonParam)
            ? (taxonParam as GenericTaxon)
            : 'tarantulas';

  const [taxon, setTaxon] = useState<Taxon>(initialTaxon);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [careFilter, setCareFilter] = useState<
    'all' | 'beginner' | 'intermediate' | 'advanced'
  >('all');

  // Reset filters when switching taxon — care_level values match across
  // catalogs, but search results don't carry meaning between taxa.
  useEffect(() => {
    setSearchTerm('');
    setCareFilter('all');
    fetchRows(taxon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxon]);

  const fetchRows = async (which: Taxon) => {
    setLoading(true);
    try {
      if (which === 'tarantulas') {
        // Use apiClient (not raw fetch) for parity with the scorpion
        // path. apiClient's baseURL already includes /api/v1 and has a
        // fallback to the prod host, so the request works even when
        // EXPO_PUBLIC_API_URL isn't injected at runtime.
        //
        // NB: the species router caps limit at 100 (`le=100`). Asking
        // for more returns 422 and a silently-empty grid. Keep this
        // value at 100 until the backend cap is raised. The scorpion
        // catalog uses `le=200` so its fetch is unaffected.
        const { data } = await apiClient.get<any>('/species', {
          params: { limit: 100 },
        });
        // API has historically returned either a bare array or a
        // {items, total} envelope — handle both defensively.
        const items: any[] = Array.isArray(data) ? data : data?.items ?? [];
        setRows(
          items.map((s) => ({
            taxon: 'tarantulas' as const,
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names ?? [],
            type: s.type ?? null,
            care_level: s.care_level ?? null,
            adult_size: s.adult_size ?? null,
            is_verified: !!s.is_verified,
            image_url: s.image_url ?? null,
            urticating_hairs: s.urticating_hairs,
            medically_significant_venom: s.medically_significant_venom,
          })),
        );
      } else if (which === 'scorpions') {
        const items = await listScorpionSpecies({ limit: 200 });
        setRows(
          items.map((s) => ({
            taxon: 'scorpions' as const,
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names ?? [],
            type: s.type,
            care_level: s.care_level,
            adult_size: s.adult_size,
            is_verified: s.is_verified,
            image_url: s.image_url,
            venom_severity: s.venom_severity,
            communal_suitable: s.communal_suitable,
          })),
        );
      } else if (which === 'centipedes') {
        const items = await listCentipedeSpecies({ limit: 200 });
        setRows(
          items.map((c) => ({
            taxon: 'centipedes' as const,
            id: c.id,
            scientific_name: c.scientific_name,
            common_names: c.common_names ?? [],
            type: c.type,
            care_level: c.care_level,
            adult_size: c.adult_size,
            is_verified: c.is_verified,
            image_url: c.image_url,
            venom_severity: c.venom_severity,
            developmental_class: c.developmental_class,
          })),
        );
      } else if (which === 'whip_spiders') {
        const items = await listWhipSpiderSpecies({ limit: 200 });
        setRows(
          items.map((w) => ({
            taxon: 'whip_spiders' as const,
            id: w.id,
            scientific_name: w.scientific_name,
            common_names: w.common_names ?? [],
            type: w.type,
            care_level: w.care_level,
            adult_size: w.adult_size,
            is_verified: w.is_verified,
            image_url: w.image_url,
            communal_suitable: w.communal_suitable,
          })),
        );
      } else {
        // ADR-006 expansion taxa — all go through the generic species
        // endpoint. `which` IS the InvertTaxon key here.
        const items = await listInvertSpecies(which as InvertTaxon, 200);
        setRows(
          items.map((s) => ({
            taxon: which as GenericTaxon,
            id: s.id,
            scientific_name: s.scientific_name,
            common_names: s.common_names ?? [],
            type: s.type,
            care_level: s.care_level,
            adult_size: s.adult_size,
            is_verified: s.is_verified,
            image_url: s.image_url,
            venom_severity: s.venom_severity,
            communal_suitable: s.communal_suitable,
            feeding_mode: s.feeding_mode,
          })),
        );
      }
    } catch (err) {
      // Surface the failure so it's visible in `eas update:view` logs
      // and Expo dev tools rather than silently rendering an empty
      // grid the keeper can't diagnose.
      console.warn('[species] Failed to load', which, err);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRows(taxon);
  };

  // Client-side filter — both catalogs are small enough (≤200 rows
  // each) that a server round trip per keystroke is wasteful.
  const filtered = rows.filter((r) => {
    if (careFilter !== 'all' && r.care_level !== careFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const hit =
        r.scientific_name.toLowerCase().includes(q)
        || r.common_names.some((n) => n.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  const getCareLevel = (level: string | null) => {
    switch (level) {
      case 'beginner':
        return { color: '#22c55e', text: 'Beginner', icon: '✓' };
      case 'intermediate':
        return { color: '#eab308', text: 'Intermediate', icon: '⚠' };
      case 'advanced':
        return { color: '#f97316', text: 'Advanced', icon: '⚡' };
      default:
        return { color: colors.textSecondary, text: 'Unknown', icon: '?' };
    }
  };

  // Type-icon dispatcher — emoji glyphs that visually distinguish
  // body plan + biome at a glance on the card.
  const getTypeIcon = (which: Taxon, type: string | null) => {
    if (isGenericTaxon(which)) {
      // Body-plan biome glyphs where meaningful, else the taxon's
      // registry glyph (🦂/🕷/🪱/🦗/🐾).
      switch (type) {
        case 'arboreal': return '🌳';
        case 'terrestrial': return '🏜️';
        case 'fossorial': return '⛰️';
        default: return INVERT_TAXA[which].glyph;
      }
    }
    if (which === 'scorpions') {
      switch (type) {
        case 'terrestrial': return '🏜️';
        case 'scansorial': return '🌳';
        case 'fossorial': return '⛰️';
        case 'psammophile': return '🏖️';
        default: return '🦂';
      }
    }
    if (which === 'centipedes') {
      // Centipede `type` reuses the tarantula vocabulary
      // (terrestrial / fossorial). Most pet trade species are
      // fossorial, so that branch gets the mountain glyph.
      switch (type) {
        case 'terrestrial': return '🏜️';
        case 'fossorial': return '⛰️';
        default: return '🐛';
      }
    }
    if (which === 'whip_spiders') {
      // Whip spiders are arboreal vertical-surface dwellers.
      switch (type) {
        case 'arboreal': return '🌳';
        case 'terrestrial': return '🏜️';
        default: return '🕸️';
      }
    }
    switch (type) {
      case 'terrestrial': return '🏜️';
      case 'arboreal': return '🌳';
      case 'fossorial': return '⛰️';
      default: return '🕷️';
    }
  };

  const handleOpen = (row: Row) => {
    // Tarantulas keep their dedicated care sheet; all other taxa render
    // through the generic invert care sheet (ADR-007).
    const path =
      row.taxon === 'tarantulas'
        ? `/species/${row.id}`
        : `/invert-species/${row.id}`;
    router.push(path as any);
  };

  // Row-level guard (narrows `item` to GenericInvertRow, unlike
  // isGenericTaxon which only narrows the taxon string).
  const isGenericRow = (r: Row): r is GenericInvertRow =>
    (GENERIC_TAXA as string[]).includes(r.taxon);

  const renderCard = ({ item, index }: { item: Row; index: number }) => {
    const careLevel = getCareLevel(item.care_level);
    const typeIcon = getTypeIcon(item.taxon, item.type);
    // Scorpions + centipedes share the same venom-tier shape; render
    // the same pill so a keeper scans the whole catalog for hot
    // species the same way.
    const venom =
      item.taxon === 'scorpions' || item.taxon === 'centipedes'
        ? venomSeverityColor(item.venom_severity)
        : isGenericRow(item) && item.venom_severity
          ? venomSeverityColor(item.venom_severity as any)
          : null;
    const isHot =
      item.taxon === 'tarantulas'
        ? !!item.medically_significant_venom
        : item.taxon === 'scorpions' || item.taxon === 'centipedes'
          ? item.venom_severity === 'medically_significant'
          : isGenericRow(item)
            ? item.venom_severity === 'medically_significant'
            : false; // whip spiders are harmless

    return (
      <TouchableOpacity
        onPress={() => handleOpen(item)}
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          index % 2 === 0 ? { marginRight: 8 } : { marginLeft: 8 },
        ]}
        activeOpacity={0.8}
      >
        <View style={styles.imageContainer}>
          {item.image_url ? (
            // getImageUrl handles both absolute R2 URLs and legacy
            // server-relative paths (`/uploads/photos/...`). Without
            // it, relative paths render as broken images. See
            // src/utils/image-url.ts.
            <Image
              source={{ uri: getImageUrl(item.image_url) }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.placeholderImage, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={styles.placeholderEmoji}>{typeIcon}</Text>
            </View>
          )}

          <View style={styles.imageGradient} />

          <View style={styles.topBadges}>
            {item.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
              </View>
            )}
            {isHot && (
              <View style={[styles.warningBadge, { backgroundColor: '#ef4444' }]}>
                <MaterialCommunityIcons name="alert" size={14} color="#ffffff" />
              </View>
            )}
            {(item.taxon === 'scorpions' || item.taxon === 'whip_spiders' || isGenericRow(item)) && item.communal_suitable && (
              <View style={[styles.warningBadge, { backgroundColor: '#3b82f6' }]}>
                <MaterialCommunityIcons name="account-group" size={14} color="#ffffff" />
              </View>
            )}
          </View>

          <View style={[styles.careLevelBadge, { backgroundColor: careLevel.color }]}>
            <Text style={styles.careLevelText}>{careLevel.icon}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text style={[styles.commonName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.common_names?.[0] || item.scientific_name.split(' ')[1] || item.scientific_name}
          </Text>
          <Text style={[styles.scientificName, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.scientific_name}
          </Text>

          <View style={styles.quickInfo}>
            <Chip>{typeIcon}</Chip>
            {item.adult_size && <Chip>{item.adult_size}</Chip>}
            {venom && <Badge label={venom.label} bg={venom.bg} fg={venom.fg} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // NB: do not define these as React components inside the parent
  // (`const Foo = () => ...`). React treats each render's function as
  // a NEW component type, which unmounts/remounts on every state change.
  // For the FlatList header that's why the search TextInput kept losing
  // focus after one keystroke. Inlining the JSX directly keeps the
  // same element identity across renders.
  // Nine taxa no longer fit a fixed equal-width row, so the segment
  // control scrolls horizontally and each pill sizes to its label.
  const TaxonSegment = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.segmentWrap, { backgroundColor: colors.surfaceElevated }]}
    >
      {TAXON_ORDER.map((t) => {
        const active = t === taxon;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => setTaxon(t)}
            style={[
              styles.segmentButton,
              active && { backgroundColor: colors.primary },
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? '#fff' : colors.textPrimary },
              ]}
              numberOfLines={1}
            >
              {TAXON_META[t].tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const FilterChip = ({
    label,
    isActive,
    onPress,
  }: {
    label: string;
    isActive: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
          borderColor: isActive ? colors.primary : colors.border,
        },
      ]}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, { color: isActive ? '#fff' : colors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Header content rendered inline below — NOT as a FlatList
  // ListHeaderComponent function, because that path causes the
  // TextInput inside to unmount on every keystroke. As a side
  // benefit, hoisting it outside means the search + filters stay
  // visible while scrolling the result grid.
  const HeaderContent = (
    <>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Species Database</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {rows.length} {TAXON_META[taxon].noun} species
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <TaxonSegment />
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={`Search ${TAXON_META[taxon].noun} species…`}
          placeholderTextColor={colors.textTertiary}
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterContainer}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Care level</Text>
        <View style={styles.filterChips}>
          <FilterChip
            label="All"
            isActive={careFilter === 'all'}
            onPress={() => setCareFilter('all')}
          />
          <FilterChip
            label="Beginner"
            isActive={careFilter === 'beginner'}
            onPress={() => setCareFilter('beginner')}
          />
          <FilterChip
            label="Intermediate"
            isActive={careFilter === 'intermediate'}
            onPress={() => setCareFilter('intermediate')}
          />
          <FilterChip
            label="Advanced"
            isActive={careFilter === 'advanced'}
            onPress={() => setCareFilter('advanced')}
          />
        </View>
      </View>

      <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
        {filtered.length} species found
      </Text>
    </>
  );

  if (loading && rows.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        {HeaderContent}
        <View style={styles.loadingContainer}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>
            {TAXON_META[taxon].glyph}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Loading species…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {HeaderContent}
      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No species found
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Try adjusting your search or filters
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={(item) => `${item.taxon}-${item.id}`}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// Styles preserved from the prior tarantula-only browser plus a
// segment-control block for the taxon switcher.
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: { padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14 },

  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '600' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },

  filterContainer: { marginHorizontal: 16, marginTop: 16 },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  resultCount: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    fontSize: 13,
  },
  listContent: { paddingHorizontal: 8, paddingBottom: 24 },
  row: { justifyContent: 'flex-start' },

  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: { height: 160, position: 'relative' },
  image: { width: '100%', height: '100%' },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderEmoji: { fontSize: 48 },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  topBadges: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  careLevelBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  careLevelText: { fontSize: 14, color: '#ffffff' },

  cardContent: { padding: 12 },
  commonName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  scientificName: { fontSize: 12, fontStyle: 'italic', marginBottom: 8 },
  quickInfo: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  emptyContainer: { padding: 48, alignItems: 'center' },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
