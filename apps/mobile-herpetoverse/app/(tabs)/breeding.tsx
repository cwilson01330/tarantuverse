/**
 * Breeding overview tab — rebuilt to design handoff Screen 11.
 *
 * Lists the keeper's pairings. Each row opens the pairing detail, which
 * renders its clutches and offspring (those screens exist under
 * app/breeding/ — this tab is the index, not the whole feature).
 *
 * What changed:
 *  - The permanent onboarding block is gone. A `PAIRINGS` kicker, a
 *    "Breeding records" title that repeated the header, and a three-line
 *    privacy paragraph rendered on every visit forever. The privacy note
 *    now lives in the empty state, where it's actually new information.
 *  - Rows lead with STATE, not dates. A stage pill plus a milestone track
 *    answer "where is this pairing and what's next"; the dates moved to a
 *    quieter footer line.
 *  - The morph calculator is reachable. It exists at /morph-calculator and
 *    accepts a parent genotype, but nothing in this tab ever mentioned it,
 *    despite a pairing being two parents with known genes.
 *
 * Honesty-first: the milestone track has THREE stops, not the four in the
 * design spec. The pairing list payload has no ovulation field, and clutch
 * laid/hatch dates live on Clutch rows this endpoint doesn't return —
 * so "Ovulation" and "Hatch" stops would be permanently unfillable. Same
 * reason there's no "hatches in N days" hero. Adding either means putting
 * clutch dates on the pairing list response first.
 *
 * Hermes-prod safety: static JSX branches only. No dynamic component
 * variables — see feedback_dynamic_component_hermes_prod_crash memory.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientBand } from '../../src/components/GradientBand';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  PAIRING_OUTCOME_LABEL,
  type ReptilePairing,
  type ReptilePairingOutcome,
  listPairings,
} from '../../src/lib/breeding';
import { ANIMAL_TAXA } from '../../src/lib/animals';

/** Emerald → near-black, matching Home and Collection. */
const BAND_COLORS = ['#065F46', '#0B0B0B'] as const;

/**
 * "2 pairings · 1 clutch" — derived entirely from the list payload.
 * Deliberately NOT a season/year label: pairings carry paired_date but
 * nothing declares a breeding season, and inferring one from calendar
 * year would be wrong for southern-hemisphere keepers.
 */
function seasonSummary(pairings: ReptilePairing[]): string {
  const clutches = pairings.reduce((n, p) => n + (p.clutch_count ?? 0), 0);
  const parts = [
    `${pairings.length} pairing${pairings.length === 1 ? '' : 's'}`,
  ];
  if (clutches > 0) {
    parts.push(`${clutches} clutch${clutches === 1 ? '' : 'es'}`);
  }
  return parts.join(' · ');
}

function BreedingTab() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const [pairings, setPairings] = useState<ReptilePairing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPairings = useCallback(async () => {
    try {
      const data = await listPairings();
      setPairings(data);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load your pairings.",
      );
    }
  }, []);

  // Refetch every time the tab gets focus — covers the case where the
  // keeper just created a pairing in 5b's flow and returns to this list.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await fetchPairings();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [fetchPairings]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPairings();
    setRefreshing(false);
  }, [fetchPairings]);

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <GradientBand
        colors={BAND_COLORS}
        style={{ paddingTop: insets.top + 10 }}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Breeding
            </Text>
            {/* Season summary from the list payload only — pairing count
                and clutch count are both on it. Anything richer (hatch
                dates, egg counts) lives on Clutch records this endpoint
                doesn't return, and guessing them would be fiction. */}
            {pairings !== null && pairings.length > 0 && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {seasonSummary(pairings)}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/morph-calculator' as never)}
            accessibilityRole="button"
            accessibilityLabel="Open the morph calculator"
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name="calculator-variant-outline"
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/breeding/pairings/new' as never)}
            accessibilityRole="button"
            accessibilityLabel="New pairing"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </GradientBand>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* The PAIRINGS kicker, the "Breeding records" title (which
            repeated the header) and the three-line privacy paragraph used
            to render here on every visit, forever — about 110px of
            onboarding a returning keeper had already read. The privacy
            note moved to the empty state and belongs in the new-pairing
            form, which is where the switch actually is. */}

        {loadError && (
          <View
            style={[
              styles.errorBlock,
              {
                borderColor: 'rgba(239,68,68,0.4)',
                backgroundColor: 'rgba(239,68,68,0.12)',
                borderRadius: layout.radius.md,
              },
            ]}
          >
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        )}

        {pairings === null && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

        {pairings !== null && pairings.length === 0 && !loadError && (
          <View
            style={[
              styles.emptyCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: layout.radius.md,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="egg-outline"
              size={34}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No pairings yet
            </Text>
            <Text
              style={[styles.emptyBody, { color: colors.textSecondary }]}
            >
              Record your first pairing to start tracking clutches, hatch
              dates, and morph projections. Pairings are private by default —
              you choose when to share progress.
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.push('/breeding/pairings/new' as never)
              }
              style={[
                styles.emptyCta,
                {
                  backgroundColor: colors.primary,
                  borderRadius: layout.radius.sm,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="plus-circle"
                size={16}
                color="#0B0B0B"
              />
              <Text style={styles.emptyCtaText}>Record a pairing</Text>
            </TouchableOpacity>
          </View>
        )}

        {pairings && pairings.length > 0 && (
          <View style={{ gap: 8 }}>
            {pairings.map((p) => (
              <PairingRow
                key={p.id}
                pairing={p}
                onPress={() =>
                  router.push(`/breeding/pairings/${p.id}` as never)
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// PairingRow — one card per pairing. Mirrors web's PairingRow visually.
// ---------------------------------------------------------------------------

function PairingRow({
  pairing,
  onPress,
}: {
  pairing: ReptilePairing;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pairing: ${pairing.male_display_name ?? 'Male'} × ${pairing.female_display_name ?? 'Female'}`}
      style={[
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      {/* Title row — parents, with the stage pill right-aligned. The pill
          answers "where is this pairing" at a glance; the dates below say
          when. Previously the row led with dates and the keeper had to
          infer the stage. */}
      <View style={styles.rowHead}>
        <Text
          style={[styles.rowTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          <Text style={styles.male}>♂ </Text>
          {pairing.male_display_name ?? 'Male'}
          <Text style={styles.dim}>  ×  </Text>
          <Text style={styles.female}>♀ </Text>
          {pairing.female_display_name ?? 'Female'}
        </Text>
        <OutcomeChip outcome={pairing.outcome} />
      </View>

      {/* Milestone track.
          Only three stops, not the four in the design spec: the pairing
          list payload carries paired_date, separated_date and clutch_count
          — there is no ovulation field on the record at all, and clutch
          laid/hatch dates live on Clutch rows this endpoint doesn't
          return. Rendering an "Ovulation" or "Hatch" stop we can never
          fill would be a promise the data can't keep. */}
      <MilestoneTrack pairing={pairing} />

      <View style={styles.rowFooter}>
        <Text
          style={[styles.rowMeta, { color: colors.textTertiary }]}
          numberOfLines={1}
        >
          {ANIMAL_TAXA[pairing.taxon]
            ? `${ANIMAL_TAXA[pairing.taxon].glyph} ${ANIMAL_TAXA[pairing.taxon].label}`
            : pairing.taxon}
          {' · paired '}
          {fmtDate(pairing.paired_date)}
          {pairing.clutch_count > 0
            ? ` · ${pairing.clutch_count} clutch${
                pairing.clutch_count === 1 ? '' : 'es'
              }`
            : ''}
        </Text>
        {pairing.is_private && (
          <MaterialCommunityIcons
            name="lock-outline"
            size={13}
            color={colors.textTertiary}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// MilestoneTrack — dots joined by connectors, one per stop we can prove.
// ---------------------------------------------------------------------------

function MilestoneTrack({ pairing }: { pairing: ReptilePairing }) {
  const { colors } = useTheme();

  // A stop is "done" only when a real date (or a real clutch) backs it.
  const stops = [
    { label: 'Paired', done: !!pairing.paired_date },
    { label: 'Separated', done: !!pairing.separated_date },
    { label: 'Clutch', done: pairing.clutch_count > 0 },
  ];

  // Current = the first not-yet-done stop, unless the pairing is closed
  // out. An unsuccessful or abandoned pairing has no "next" — highlighting
  // one would imply it's still running.
  const isClosed =
    pairing.outcome === 'unsuccessful' || pairing.outcome === 'abandoned';
  const currentIndex = isClosed ? -1 : stops.findIndex((s) => !s.done);

  return (
    <View
      style={styles.track}
      accessibilityLabel={`Progress: ${stops
        .filter((s) => s.done)
        .map((s) => s.label)
        .join(', ') || 'not started'}`}
    >
      {stops.map((s, i) => {
        const tone = s.done
          ? colors.primary
          : i === currentIndex
            ? colors.warning
            : colors.border;
        return (
          <View key={s.label} style={styles.trackStop}>
            <View style={styles.trackDotRow}>
              <View style={[styles.trackDot, { backgroundColor: tone }]} />
              {i < stops.length - 1 && (
                <View
                  style={[
                    styles.trackLine,
                    {
                      backgroundColor: stops[i + 1].done
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.trackLabel,
                { color: s.done ? colors.textSecondary : colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// OutcomeChip — pill colored by outcome.
// ---------------------------------------------------------------------------

const OUTCOME_COLORS: Record<
  ReptilePairingOutcome,
  { fg: string; bg: string; border: string }
> = {
  in_progress: {
    fg: '#fbbf24',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.4)',
  },
  successful: {
    fg: '#86efac',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
  },
  unsuccessful: {
    fg: '#fca5a5',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.4)',
  },
  abandoned: {
    fg: '#d4d4d4',
    bg: 'rgba(82,82,82,0.4)',
    border: 'rgba(115,115,115,1)',
  },
  unknown: {
    fg: '#d4d4d4',
    bg: 'rgba(82,82,82,0.4)',
    border: 'rgba(115,115,115,1)',
  },
};

function OutcomeChip({ outcome }: { outcome: ReptilePairingOutcome }) {
  const c = OUTCOME_COLORS[outcome];
  return (
    <View
      style={[
        styles.outcomeChip,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <Text style={[styles.outcomeChipText, { color: c.fg }]}>
        {PAIRING_OUTCOME_LABEL[outcome]}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers + styles
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  // Header band
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 14,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },

  // Pairing card
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  // Milestone track
  track: { flexDirection: 'row', marginVertical: 4 },
  trackStop: { flex: 1 },
  trackDotRow: { flexDirection: 'row', alignItems: 'center' },
  trackDot: { width: 9, height: 9, borderRadius: 5 },
  trackLine: { flex: 1, height: 2, marginHorizontal: 3 },
  trackLabel: { fontSize: 9.5, marginTop: 4 },

  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },

  errorBlock: {
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 17,
  },

  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },

  emptyCard: {
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyCtaText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 13,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    padding: 12,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 11,
    marginTop: 4,
  },

  male: { color: '#38bdf8' },
  female: { color: '#f472b6' },
  dim: { color: '#525252' },

  outcomeChip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  outcomeChipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },


});

export default withErrorBoundary(BreedingTab, 'breeding-tab');
