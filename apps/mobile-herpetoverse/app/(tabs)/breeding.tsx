/**
 * Breeding overview tab — Sprint 5a.
 *
 * Lists the keeper's pairings with parent names, taxon, outcome, and
 * clutch count. The "New pairing" CTA is wired to a placeholder route
 * for now — the create flow lands in Sprint 5b. Pairing detail screen
 * (also 5b) renders clutches + offspring.
 *
 * Mirrors apps/web-herpetoverse/.../breeding/page.tsx — same empty
 * state, same outcome chip colors, same "🐍 Snake" / "🦎 Lizard" hints.
 *
 * Honesty-first: when the pairing list is empty we say "No pairings
 * yet" plainly rather than rendering ghost rows or fake stats.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../src/components/AppHeader';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  PAIRING_OUTCOME_LABEL,
  type ReptilePairing,
  type ReptilePairingOutcome,
  listPairings,
} from '../../src/lib/breeding';
import { ANIMAL_TAXA } from '../../src/lib/animals';

function BreedingTab() {
  const router = useRouter();
  const { colors, layout } = useTheme();
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
      <AppHeader
        title="Breeding"
        rightAction={
          <TouchableOpacity
            onPress={() =>
              router.push('/breeding/pairings/new' as never)
            }
            accessibilityRole="button"
            accessibilityLabel="New pairing"
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name="plus"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
        }
      />
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
        <View>
          <Text style={[styles.kicker, { color: colors.primary }]}>
            PAIRINGS
          </Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Breeding records
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Track pairings, clutches, and offspring across the season.
            Pairings default to private — flip the switch when you&apos;re
            ready to share progress publicly.
          </Text>
        </View>

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
            <Text style={styles.emptyEmoji}>🥚</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No pairings yet
            </Text>
            <Text
              style={[styles.emptyBody, { color: colors.textSecondary }]}
            >
              Record your first pairing to start tracking clutches, hatch
              dates, and morph projections.
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
      <View style={{ flex: 1, minWidth: 0 }}>
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
        <Text
          style={[styles.rowMeta, { color: colors.textTertiary }]}
          numberOfLines={1}
        >
          Paired {fmtDate(pairing.paired_date)}
          {pairing.separated_date
            ? ` · separated ${fmtDate(pairing.separated_date)}`
            : ''}
          {' · '}
          {ANIMAL_TAXA[pairing.taxon]
            ? `${ANIMAL_TAXA[pairing.taxon].glyph} ${ANIMAL_TAXA[pairing.taxon].label}`
            : pairing.taxon}
        </Text>
      </View>
      <View style={styles.rowChips}>
        <OutcomeChip outcome={pairing.outcome} />
        {pairing.is_private && (
          <View
            style={[
              styles.privateChip,
              {
                borderColor: colors.border,
                backgroundColor: colors.surfaceRaised,
              },
            ]}
          >
            <Text
              style={[styles.privateChipText, { color: colors.textTertiary }]}
            >
              🔒 Private
            </Text>
          </View>
        )}
        {pairing.clutch_count > 0 && (
          <Text style={[styles.clutchCount, { color: colors.textSecondary }]}>
            {pairing.clutch_count}{' '}
            clutch{pairing.clutch_count === 1 ? '' : 'es'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
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
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    lineHeight: 19,
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
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
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
  rowChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 140,
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

  privateChip: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  privateChipText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  clutchCount: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

export default withErrorBoundary(BreedingTab, 'breeding-tab');
