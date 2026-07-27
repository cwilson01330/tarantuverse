/**
 * Species browser — cross-taxon care-sheet catalog.
 *
 * REWRITTEN (design handoff, screen 5). What changed and why:
 *
 * 1. CROSS-TAXON BY DEFAULT. This used to load one taxon at a time behind a
 *    segment control that showed 3 of 10 options with no scroll affordance —
 *    a keeper looking for a mantis care sheet had no reason to believe one
 *    existed. Now the whole catalog loads once and the taxon becomes a
 *    narrowing chip carrying a real count, led by "All".
 *
 * 2. TWO SOURCES, DELIBERATELY. Tarantulas come from /species and everything
 *    else from /invert-species/. It would be tidier to read the unified
 *    invert_species catalog for all ten taxa — except all 197 mirrored
 *    tarantula rows have `venom_severity = NULL`. Tarantula danger lives in
 *    `species.medically_significant_venom`, which invert_species doesn't
 *    carry. Reading one source would silently drop "Hot venom" from
 *    Poecilotheria, Stromatopelma and Heteroscodra in the list. Merge the two
 *    until that data gap is backfilled.
 *
 * 3. ROWS, NOT A 2-UP GRID. 206 of 401 catalog entries have no photo, so the
 *    grid spent a 160pt image block on an empty frame for half the catalog.
 *    Rows fit more information in less height and give care level and venom
 *    tier room to be words.
 *
 * 4. CARE LEVEL IS A WORD. It was a coloured circle containing ✓ / ⚠ / ⚡ / ?
 *    with the word rendered nowhere. Nothing taught that mapping and colour
 *    alone fails for colour-blind keepers.
 *
 * 5. NO VANITY METRICS. The design called for "Kept by N keepers" on every
 *    row. 325 of 401 species have times_kept = 0 and the maximum is 15, so
 *    that line would read "Kept by 0 keepers" four times out of five and make
 *    a healthy catalog look abandoned. Gated at MIN_KEEPERS_TO_SHOW.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import { INVERT_TAXA, taxonMdiIcon } from '../../src/lib/inverts';
import { careLevelMeta } from '../../src/components/caresheet';

/** Below this, a keeper count is noise rather than social proof. */
const MIN_KEEPERS_TO_SHOW = 5;

/** One shape for every taxon. Both fetches normalise into this. */
interface SpeciesRow {
  id: string;
  taxon: string;
  scientific_name: string;
  common_names: string[];
  care_level: string | null;
  /** terrestrial / arboreal / fossorial */
  type: string | null;
  adult_size: string | null;
  native_region: string | null;
  image_url: string | null;
  is_verified: boolean;
  times_kept: number;
  hotVenom: boolean;
  mildVenom: boolean;
  communal: boolean;
}

type SortKey = 'az' | 'popular' | 'easiest';

const SORT_LABELS: Record<SortKey, string> = {
  az: 'A–Z',
  popular: 'Most kept',
  easiest: 'Easiest first',
};

const CARE_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Display label per taxon. INVERT_TAXA covers nine; tarantula is separate. */
function taxonLabel(taxon: string): string {
  if (taxon === 'tarantula') return 'Tarantulas';
  const meta = (INVERT_TAXA as any)[taxon];
  if (!meta) return taxon;
  // Registry labels are singular ("Whip spider"); the chips read as counts of
  // a group, so pluralise.
  return meta.label.endsWith('s') ? meta.label : `${meta.label}s`;
}

function titleCase(s?: string | null): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Terrestrial · 5–6" · South America" — only the parts we actually have. */
function factsLine(r: SpeciesRow): string | null {
  const parts = [titleCase(r.type), r.adult_size, r.native_region].filter(
    (p) => !!p && `${p}`.trim() !== '',
  );
  return parts.length ? parts.join(' · ') : null;
}

function SpeciesBrowserScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Deep links historically used plural keys (`?taxon=scorpions`). Accept both
  // so `/scorpion-species` and any saved links keep working.
  const { taxon: taxonParam } = useLocalSearchParams<{ taxon?: string }>();
  const initialTaxon = useMemo(() => {
    if (!taxonParam) return 'all';
    const singular = taxonParam.replace(/s$/, '');
    if (taxonParam === 'tarantulas' || singular === 'tarantula') return 'tarantula';
    if ((INVERT_TAXA as any)[taxonParam]) return taxonParam;
    if ((INVERT_TAXA as any)[singular]) return singular;
    return 'all';
  }, [taxonParam]);

  const [rows, setRows] = useState<SpeciesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taxon, setTaxon] = useState<string>(initialTaxon);
  const [search, setSearch] = useState('');
  const [careFilter, setCareFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('az');
  const [filterSheet, setFilterSheet] = useState(false);
  const [taxonSheet, setTaxonSheet] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Parallel, and each failure is isolated: if the invert catalog is down
      // we still show tarantulas rather than an empty screen.
      const [tRes, iRes] = await Promise.all([
        apiClient.get<any>('/species', { params: { limit: 1000 } }).catch(() => null),
        apiClient.get<any>('/invert-species/', { params: { limit: 1000 } }).catch(() => null),
      ]);

      const tItems: any[] = Array.isArray(tRes?.data) ? tRes.data : tRes?.data?.items ?? [];
      const tarantulas: SpeciesRow[] = tItems.map((s) => ({
        id: s.id,
        taxon: 'tarantula',
        scientific_name: s.scientific_name,
        common_names: s.common_names ?? [],
        care_level: s.care_level ?? null,
        type: s.type ?? null,
        adult_size: s.adult_size ?? null,
        native_region: s.native_region ?? null,
        image_url: s.image_url ?? null,
        is_verified: !!s.is_verified,
        times_kept: s.times_kept ?? 0,
        // Only /species carries these two.
        hotVenom: !!s.medically_significant_venom,
        mildVenom: false,
        communal: false,
      }));

      const iItems: any[] = Array.isArray(iRes?.data) ? iRes.data : iRes?.data?.items ?? [];
      const inverts: SpeciesRow[] = iItems
        // Drop mirrored tarantulas — they're already in the list above WITH
        // their venom flags, which the mirror lacks.
        .filter((s) => s.taxon !== 'tarantula')
        .map((s) => ({
          id: s.id,
          taxon: s.taxon,
          scientific_name: s.scientific_name,
          common_names: s.common_names ?? [],
          care_level: s.care_level ?? null,
          type: s.type ?? null,
          adult_size: s.adult_size ?? null,
          native_region: s.native_region ?? null,
          image_url: s.image_url ?? null,
          is_verified: !!s.is_verified,
          times_kept: s.times_kept ?? 0,
          hotVenom: s.venom_severity === 'medically_significant',
          mildVenom: s.venom_severity === 'mild' || s.venom_severity === 'moderate',
          communal: !!s.communal_suitable,
        }));

      if (!tRes && !iRes) {
        setError("Couldn't load the species catalog.");
        setRows([]);
      } else {
        setRows([...tarantulas, ...inverts]);
      }
    } catch {
      setError("Couldn't load the species catalog.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Per-taxon counts, computed once, driving the chips.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.taxon, (m.get(r.taxon) ?? 0) + 1);
    return m;
  }, [rows]);

  const taxaByCount = useMemo(
    () => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    [counts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (taxon !== 'all' && r.taxon !== taxon) return false;
      if (careFilter !== 'all' && r.care_level !== careFilter) return false;
      if (!q) return true;
      return (
        r.scientific_name.toLowerCase().includes(q) ||
        r.common_names.some((c) => c.toLowerCase().includes(q))
      );
    });
    out = [...out].sort((a, b) => {
      if (sort === 'popular') return b.times_kept - a.times_kept;
      if (sort === 'easiest') {
        const d = (CARE_ORDER[a.care_level ?? ''] ?? 9) - (CARE_ORDER[b.care_level ?? ''] ?? 9);
        if (d !== 0) return d;
      }
      return a.scientific_name.localeCompare(b.scientific_name);
    });
    return out;
  }, [rows, taxon, careFilter, search, sort]);

  /** Beginner-friendly shelf. Only on the unfiltered view — it's a browse
   *  affordance, not a search result. Ordered by how many keepers have one. */
  const beginners = useMemo(() => {
    if (taxon !== 'all' || careFilter !== 'all' || search.trim()) return [];
    return rows
      .filter((r) => r.care_level === 'beginner' && !r.hotVenom)
      .sort((a, b) => b.times_kept - a.times_kept)
      .slice(0, 12);
  }, [rows, taxon, careFilter, search]);

  const openSheet = (r: SpeciesRow) => {
    // Tarantulas keep their dedicated care sheet; the rest render through the
    // generic one (ADR-007).
    //
    // The row's own data rides along as params so the care sheet can paint its
    // header on the FIRST frame. Without this the sheet mounts, shows a
    // full-screen spinner while it fetches, and only then pops in content —
    // which reads as a janky transition even though the slide itself is fine.
    router.push({
      pathname: r.taxon === 'tarantula' ? `/species/${r.id}` : `/invert-species/${r.id}`,
      params: {
        pName: r.common_names?.[0] ?? '',
        pSci: r.scientific_name,
        pCare: r.care_level ?? '',
        pImg: r.image_url ?? '',
        pType: r.type ?? '',
        pVerified: r.is_verified ? '1' : '',
        pHot: r.hotVenom ? '1' : '',
      },
    } as any);
  };

  const styles = makeStyles(colors);
  const activeFilterCount = (careFilter !== 'all' ? 1 : 0) + (sort !== 'az' ? 1 : 0);

  const renderRow = ({ item }: { item: SpeciesRow }) => {
    const care = careLevelMeta(item.care_level, colors.textSecondary);
    const facts = factsLine(item);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => openSheet(item)}>
        <SpeciesThumb row={item} colors={colors} styles={styles} />
        <View style={styles.rowBody}>
          <View style={styles.rowNameLine}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.common_names?.[0] || item.scientific_name}
            </Text>
            {item.is_verified && (
              <MaterialCommunityIcons name="check-decagram" size={15} color="#22c55e" />
            )}
          </View>
          <Text style={styles.rowSci} numberOfLines={1}>
            {item.scientific_name}
          </Text>

          <View style={styles.pillRow}>
            {!!item.care_level && (
              <View style={[styles.pill, { backgroundColor: care.color + '24' }]}>
                <Text style={[styles.pillText, { color: care.color }]}>{care.text}</Text>
              </View>
            )}
            {item.hotVenom && (
              <View style={[styles.pill, { backgroundColor: '#ef444424' }]}>
                <MaterialCommunityIcons name="alert" size={11} color="#ef4444" />
                <Text style={[styles.pillText, { color: '#ef4444' }]}>Hot venom</Text>
              </View>
            )}
            {!item.hotVenom && item.communal && (
              <View style={[styles.pill, { backgroundColor: '#3b82f624' }]}>
                <MaterialCommunityIcons name="account-multiple" size={11} color="#3b82f6" />
                <Text style={[styles.pillText, { color: '#3b82f6' }]}>Communal</Text>
              </View>
            )}
          </View>

          {!!facts && (
            <Text style={styles.rowFacts} numberOfLines={1}>
              {facts}
            </Text>
          )}
          {/* Social proof only where it's actually proof. */}
          {item.times_kept >= MIN_KEEPERS_TO_SHOW && (
            <Text style={styles.rowKeepers}>Kept by {item.times_kept} keepers</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Species</Text>
            <Text style={styles.headerSubtitle}>
              {loading
                ? 'Loading catalog…'
                : `${rows.length} care sheets · ${counts.size} ${counts.size === 1 ? 'taxon' : 'taxa'}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setFilterSheet(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Filter and sort"
            style={styles.headerIcon}
          >
            <MaterialCommunityIcons name="tune-variant" size={22} color="#fff" />
            {activeFilterCount > 0 && <View style={styles.headerIconDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/shortlist' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Your shortlist"
            style={styles.headerIcon}
          >
            <MaterialCommunityIcons name="bookmark-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={19} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search all species…"
            placeholderTextColor="rgba(255,255,255,0.75)"
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={17} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Taxon chips with real counts, led by All. The trailing "···" opens a
          sheet listing every taxon — the scroller alone hid seven of ten
          options with no affordance that they existed. */}
      {!loading && rows.length > 0 && (
        <View style={styles.chipStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            <Chip
              label={`All ${rows.length}`}
              active={taxon === 'all'}
              onPress={() => setTaxon('all')}
              colors={colors}
              styles={styles}
            />
            {taxaByCount.map((t) => (
              <Chip
                key={t}
                icon={taxonMdiIcon(t)}
                label={`${taxonLabel(t)} ${counts.get(t)}`}
                active={taxon === t}
                onPress={() => setTaxon(t)}
                colors={colors}
                styles={styles}
              />
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => setTaxonSheet(true)}
            style={styles.chipMore}
            accessibilityRole="button"
            accessibilityLabel="See all animal types"
          >
            <MaterialCommunityIcons name="dots-horizontal" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => `${r.taxon}-${r.id}`}
          renderItem={renderRow}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: insets.bottom + 72,
            gap: 10,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            beginners.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.shelfLabel}>GOOD FOR BEGINNERS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingRight: 8 }}
                >
                  {beginners.map((r) => (
                    <TouchableOpacity
                      key={`shelf-${r.id}`}
                      style={styles.shelfTile}
                      activeOpacity={0.8}
                      onPress={() => openSheet(r)}
                    >
                      <SpeciesThumb row={r} colors={colors} styles={styles} shelf />
                      <Text style={styles.shelfName} numberOfLines={1}>
                        {r.common_names?.[0] || r.scientific_name}
                      </Text>
                      <Text style={styles.shelfSci} numberOfLines={1}>
                        {r.scientific_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={[styles.shelfLabel, { marginTop: 16 }]}>
                  ALL SPECIES{sort === 'az' ? ' · A–Z' : ` · ${SORT_LABELS[sort].toUpperCase()}`}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="magnify" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No species found</Text>
              <Text style={styles.emptyBody}>Try a different search or clear your filters.</Text>
              {(taxon !== 'all' || careFilter !== 'all' || !!search) && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setTaxon('all');
                    setCareFilter('all');
                    setSearch('');
                  }}
                >
                  <Text style={styles.retryText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Filter + sort sheet — care level moved off the main screen, which is
          what freed ~260pt of chrome above the first result. */}
      <Sheet visible={filterSheet} onClose={() => setFilterSheet(false)} title="Filter & sort" styles={styles}>
        <Text style={styles.sheetLabel}>CARE LEVEL</Text>
        <View style={styles.sheetOptions}>
          {['all', 'beginner', 'intermediate', 'advanced'].map((lvl) => (
            <Chip
              key={lvl}
              label={lvl === 'all' ? 'All' : careLevelMeta(lvl).text}
              active={careFilter === lvl}
              onPress={() => setCareFilter(lvl)}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>
        <Text style={[styles.sheetLabel, { marginTop: 18 }]}>SORT</Text>
        <View style={styles.sheetOptions}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <Chip
              key={k}
              label={SORT_LABELS[k]}
              active={sort === k}
              onPress={() => setSort(k)}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>
      </Sheet>

      <Sheet visible={taxonSheet} onClose={() => setTaxonSheet(false)} title="Animal type" styles={styles}>
        <TouchableOpacity
          style={styles.sheetRow}
          onPress={() => {
            setTaxon('all');
            setTaxonSheet(false);
          }}
        >
          <MaterialCommunityIcons name="paw-outline" size={20} color={colors.primary} />
          <Text style={styles.sheetRowText}>All species</Text>
          <Text style={styles.sheetRowCount}>{rows.length}</Text>
        </TouchableOpacity>
        {taxaByCount.map((t) => (
          <TouchableOpacity
            key={`sheet-${t}`}
            style={styles.sheetRow}
            onPress={() => {
              setTaxon(t);
              setTaxonSheet(false);
            }}
          >
            <MaterialCommunityIcons
              name={taxonMdiIcon(t) as any}
              size={20}
              color={colors.primary}
            />
            <Text style={styles.sheetRowText}>{taxonLabel(t)}</Text>
            <Text style={styles.sheetRowCount}>{counts.get(t)}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>
    </View>
  );
}

/**
 * Row/shelf thumbnail.
 *
 * Falls back to the taxon glyph both when there's no photo AND when one fails
 * to load — 12 catalog entries hotlink upload.wikimedia.org, which 403s
 * clients that don't send a browser User-Agent, so without onError those
 * render as blank frames.
 */
function SpeciesThumb({
  row,
  colors,
  styles,
  shelf,
}: {
  row: SpeciesRow;
  colors: any;
  styles: any;
  shelf?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = shelf ? styles.shelfThumb : styles.rowThumb;
  if (!row.image_url || failed) {
    return (
      <View style={[box, styles.thumbFallback]}>
        <MaterialCommunityIcons
          name={taxonMdiIcon(row.taxon) as any}
          size={shelf ? 26 : 28}
          color={colors.textTertiary}
        />
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri: getImageUrl(row.image_url) }}
        style={styles.thumbImage}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
  colors,
  styles,
}: {
  label: string;
  icon?: string;
  active: boolean;
  onPress: () => void;
  colors: any;
  styles: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {!!icon && (
        <MaterialCommunityIcons
          name={icon as any}
          size={13}
          color={active ? '#fff' : colors.textSecondary}
        />
      )}
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Sheet({
  visible,
  onClose,
  title,
  styles,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  styles: any;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    errorText: { color: colors.textPrimary, marginBottom: 10 },
    retryButton: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
      borderRadius: 10,
    },
    retryText: { color: '#fff', fontWeight: '700' },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
    emptyBody: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },

    header: { paddingHorizontal: 16, paddingBottom: 14 },
    headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
    headerIcon: { padding: 6, position: 'relative' },
    headerIconDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#fbbf24',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 12,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#fff', padding: 0 },

    chipStrip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    chipRow: { gap: 7, paddingHorizontal: 16 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
    },
    chipText: { fontSize: 12.5, fontWeight: '600' },
    chipMore: {
      marginHorizontal: 10,
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    shelfLabel: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1.1,
      color: colors.textTertiary,
      marginBottom: 8,
    },
    shelfTile: { width: 104 },
    shelfThumb: {
      width: 104,
      height: 74,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: colors.surfaceElevated,
    },
    shelfName: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginTop: 6 },
    shelfSci: { fontSize: 10.5, fontStyle: 'italic', color: colors.textTertiary },

    row: {
      flexDirection: 'row',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    // alignSelf:'stretch' so the image column matches whatever height the text
    // wraps to. The container itself must stay height-less, which is why the
    // image is absolutely positioned below rather than sized '100%'.
    rowThumb: {
      width: 88,
      alignSelf: 'stretch',
      minHeight: 88,
      backgroundColor: colors.surfaceElevated,
      overflow: 'hidden',
    },
    thumbFallback: { alignItems: 'center', justifyContent: 'center' },
    // absoluteFill, NOT width/height '100%'. In a container with no definite
    // height, '100%' resolves to nothing and React Native falls back to the
    // image's INTRINSIC size — which stretched a row to ~700pt tall for one
    // large photo. Absolute positioning takes the image out of layout flow so
    // it can never drive the row's height.
    thumbImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
    rowBody: { flex: 1, paddingVertical: 11, paddingLeft: 13, paddingRight: 12, gap: 3 },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
    rowSci: { fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
    },
    pillText: { fontSize: 11, fontWeight: '700' },
    rowFacts: { fontSize: 11.5, color: colors.textTertiary, marginTop: 3 },
    rowKeepers: { fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },

    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 34,
      maxHeight: '75%',
    },
    sheetGrabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
    sheetLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textTertiary,
      marginBottom: 8,
    },
    sheetOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    sheetRowText: { flex: 1, fontSize: 15, color: colors.textPrimary },
    sheetRowCount: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  });

export default withErrorBoundary(SpeciesBrowserScreen, 'species');
