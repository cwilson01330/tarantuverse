/**
 * Breeding overview — Sprint 6e (TV mobile scaffold).
 *
 * Mirror of the web TV breeding overview, adapted for mobile UX. Three
 * sections (Pairings / Egg Sacs / Offspring) rendered as collapsible
 * cards in a single scroll. Each section has a delete affordance on
 * row tap (matches the web fix we shipped earlier this week).
 *
 * Why a single scroll instead of in-screen tabs: mobile screens already
 * have the device's safe-area + status bar eating vertical space, and
 * keepers tend to glance at all three together when they're in
 * breeding mode (which pairing has eggs, which sac hatched, which
 * offspring sold). Stacked sections beat nested tabs for that
 * scan-and-recognize behavior.
 *
 * Entry point: Quick Actions tile on the Dashboard. Breeding is also
 * the natural follow-up to selecting a tarantula, but for v1 we keep
 * the entry at the dashboard level. Per-spider breeding history is a
 * future bundle.
 *
 * Inline types match TV mobile's existing convention (see
 * apps/mobile/app/tarantula/[id].tsx) rather than introducing a new
 * src/lib/ pattern.
 *
 * v1 scope: read-only list + delete. Creating new records still lives
 * on web — mobile create flows are a future bundle. Pairing detail
 * screen (next route file) lets you tap-to-edit outcome and follow the
 * egg-sac → offspring chain.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { apiClient } from '../../src/services/api';

// ─── Inline types — match the response_model shapes on the API ────────

interface Pairing {
  id: string;
  male_id: string;
  female_id: string;
  paired_date: string;
  separated_date: string | null;
  pairing_type: string;
  outcome: string;
  notes: string | null;
  created_at: string;
}

interface EggSac {
  id: string;
  pairing_id: string;
  laid_date: string;
  pulled_date: string | null;
  hatch_date: string | null;
  spiderling_count: number | null;
  viable_count: number | null;
  notes: string | null;
  created_at: string;
}

interface Offspring {
  id: string;
  egg_sac_id: string;
  tarantula_id: string | null;
  status: string;
  status_date: string | null;
  buyer_info: string | null;
  price_sold: number | null;
  notes: string | null;
  created_at: string;
}

// ─── Outcome / status color tokens — same logic as HV breeding ────────

const OUTCOME_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
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
  unknown: {
    fg: '#d4d4d4',
    bg: 'rgba(82,82,82,0.4)',
    border: 'rgba(115,115,115,1)',
  },
};

function fmtOutcome(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

function BreedingOverviewScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [eggSacs, setEggSacs] = useState<EggSac[] | null>(null);
  const [offspring, setOffspring] = useState<Offspring[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      // All three in parallel — independent of each other and the
      // overview always needs all three.
      const [p, s, o] = await Promise.all([
        apiClient.get<Pairing[]>('/pairings/').catch(() => ({ data: [] })),
        apiClient.get<EggSac[]>('/egg-sacs/').catch(() => ({ data: [] })),
        apiClient.get<Offspring[]>('/offspring/').catch(() => ({ data: [] })),
      ]);
      setPairings(p.data);
      setEggSacs(s.data);
      setOffspring(o.data);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load breeding records.",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await fetchAll();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [fetchAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  /**
   * Cascade-aware delete with native Alert confirm. Refetches all three
   * lists on success because the backend CASCADEs pairings → egg sacs
   * → offspring; stale local state on the other tabs would lie to the
   * keeper after a parent delete.
   */
  async function handleDelete(
    kind: 'pairing' | 'egg-sac' | 'offspring',
    id: string,
  ) {
    const copy = {
      pairing:
        'Any egg sacs and offspring records under it will also be deleted. This can’t be undone.',
      'egg-sac':
        'Any offspring records under it will also be deleted. This can’t be undone.',
      offspring: 'This can’t be undone.',
    } as const;
    const label = {
      pairing: 'Delete pairing?',
      'egg-sac': 'Delete egg sac?',
      offspring: 'Delete offspring?',
    } as const;
    const paths = {
      pairing: 'pairings',
      'egg-sac': 'egg-sacs',
      offspring: 'offspring',
    } as const;

    Alert.alert(label[kind], copy[kind], [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/${paths[kind]}/${id}`);
            await fetchAll();
          } catch (err: any) {
            Alert.alert(
              "Couldn't delete",
              err?.response?.data?.detail ||
                err?.message ||
                'Try again in a moment.',
            );
          }
        },
      },
    ]);
  }

  const allLoaded =
    pairings !== null && eggSacs !== null && offspring !== null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Breeding" leftAction={backButton} />

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
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Track pairings, egg sacs, and offspring. Creating new records
          lives on the web app for now — mobile create flows ship in a
          future update. Tap a pairing to see its egg sacs.
        </Text>

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

        {!allLoaded && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

        {allLoaded && (
          <>
            <Section
              title="PAIRINGS"
              emptyEmoji="💑"
              emptyText="No pairings yet. Record your first on the web app to see it here."
              rows={pairings.length}
            >
              {pairings.map((p) => {
                const outcomeC =
                  OUTCOME_COLORS[p.outcome] ?? OUTCOME_COLORS.unknown;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() =>
                      router.push(`/breeding/pairings/${p.id}` as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Pairing from ${fmtDate(p.paired_date)}`}
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
                      >
                        Paired {fmtDate(p.paired_date)}
                      </Text>
                      <Text
                        style={[styles.rowMeta, { color: colors.textTertiary }]}
                        numberOfLines={1}
                      >
                        {p.pairing_type.replace(/_/g, ' ')}
                        {p.separated_date
                          ? ` · separated ${fmtDate(p.separated_date)}`
                          : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.chip,
                        {
                          backgroundColor: outcomeC.bg,
                          borderColor: outcomeC.border,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: outcomeC.fg }]}>
                        {fmtOutcome(p.outcome)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete('pairing', p.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Delete pairing"
                      style={styles.trashButton}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </Section>

            <Section
              title="EGG SACS"
              emptyEmoji="🥚"
              emptyText="No egg sacs recorded. Log a sac on the web app to track laid dates, spiderling counts, and hatch outcomes."
              rows={eggSacs.length}
            >
              {eggSacs.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() =>
                    router.push(`/breeding/egg-sacs/${s.id}` as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Egg sac laid ${fmtDate(s.laid_date)}`}
                  style={[
                    styles.row,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="egg-easter"
                    size={18}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.rowTitle, { color: colors.textPrimary }]}
                    >
                      Laid {fmtDate(s.laid_date)}
                    </Text>
                    <Text
                      style={[styles.rowMeta, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {s.spiderling_count != null
                        ? `${s.spiderling_count} spiderlings`
                        : ''}
                      {s.spiderling_count != null && s.viable_count != null
                        ? ' · '
                        : ''}
                      {s.viable_count != null
                        ? `${s.viable_count} viable`
                        : ''}
                      {s.hatch_date
                        ? ` · hatched ${fmtDate(s.hatch_date)}`
                        : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete('egg-sac', s.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete egg sac"
                    style={styles.trashButton}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </Section>

            <Section
              title="OFFSPRING"
              emptyEmoji="🕷️"
              emptyText="No offspring recorded. Add hatchlings on the web app — status (available, sold, kept), sale prices, and buyer notes."
              rows={offspring.length}
            >
              {offspring.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() =>
                    router.push(`/breeding/offspring/${o.id}` as never)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Offspring — ${fmtOutcome(o.status)}`}
                  style={[
                    styles.row,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="paw"
                    size={18}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.rowTitle, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {fmtOutcome(o.status)}
                    </Text>
                    <Text
                      style={[styles.rowMeta, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {o.status_date ? fmtDate(o.status_date) : ''}
                      {o.price_sold != null ? ` · $${o.price_sold}` : ''}
                      {o.buyer_info ? ` · ${o.buyer_info}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete('offspring', o.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete offspring record"
                    style={styles.trashButton}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  emptyEmoji,
  emptyText,
  rows,
  children,
}: {
  title: string;
  emptyEmoji: string;
  emptyText: string;
  rows: number;
  children: React.ReactNode;
}) {
  const { colors, layout } = useTheme();
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
        {title}{' '}
        <Text style={{ color: colors.textTertiary, fontWeight: '400' }}>
          ({rows})
        </Text>
      </Text>
      {rows === 0 ? (
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
          <Text style={styles.emptyEmoji}>{emptyEmoji}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {emptyText}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  intro: {
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

  loading: { paddingVertical: 40, alignItems: 'center' },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  emptyCard: {
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 11, marginTop: 2 },

  chip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  trashButton: {
    padding: 4,
    marginLeft: 4,
  },
});

export default withErrorBoundary(BreedingOverviewScreen, 'tv-breeding-overview');
