/**
 * TV egg sac detail — Sprint 6f.
 *
 * Mirror of HV clutch detail, adapted for tarantula data:
 *   - Hero with laid date + lifecycle status pill (laid / incubating /
 *     hatched)
 *   - Survival rate when viable + spiderling counts are both present
 *     (TV's equivalent of HV's hatch-rate display)
 *   - KV grid for laid/pulled/hatch dates + counts
 *   - Offspring list filtered to this sac (read-only rows tap into
 *     /breeding/offspring/{id})
 *   - Delete in header with cascade-aware confirm — server CASCADEs
 *     offspring rows
 *
 * Backend's `EggSacResponse` is leaner than HV's `Clutch` (no
 * incubation temp/humidity, no fertile/slug split), so the KV grid is
 * shorter and the survival math uses spiderling vs viable count as
 * the cleanest available denominator.
 *
 * Inline types match the existing TV mobile pattern (per-screen,
 * no src/lib layer).
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { apiClient } from '../../../src/services/api';

// ─── Inline types ─────────────────────────────────────────────────────

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

// TV's OffspringStatus enum: kept / sold / traded / given_away / died /
// unknown. Subset of HV's, no 'hatched' default.
const STATUS_LABEL: Record<string, string> = {
  kept: 'Kept',
  sold: 'Sold',
  traded: 'Traded',
  given_away: 'Given away',
  died: 'Died',
  unknown: 'Unknown',
};

function EggSacDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [sac, setSac] = useState<EggSac | null>(null);
  const [offspring, setOffspring] = useState<Offspring[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const [sRes, oRes] = await Promise.all([
        apiClient.get<EggSac>(`/egg-sacs/${id}`),
        apiClient
          .get<Offspring[]>('/offspring/')
          .catch(() => ({ data: [] as Offspring[] })),
      ]);
      setSac(sRes.data);
      setOffspring(oRes.data.filter((o) => o.egg_sac_id === id));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load this egg sac.",
      );
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function handleDelete() {
    if (!sac || deleting) return;
    const oCount = offspring?.length ?? 0;
    const suffix =
      oCount > 0
        ? `\n\nThis will also delete ${oCount} offspring record${
            oCount === 1 ? '' : 's'
          } under it. This can't be undone.`
        : "\n\nThis can't be undone.";
    Alert.alert(
      'Delete egg sac?',
      `Laid ${fmtDate(sac.laid_date)}${suffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiClient.delete(`/egg-sacs/${sac.id}`);
              router.back();
            } catch (err: any) {
              setDeleting(false);
              Alert.alert(
                "Couldn't delete",
                err?.response?.data?.detail ||
                  err?.message ||
                  'Try again in a moment.',
              );
            }
          },
        },
      ],
    );
  }

  // Lifecycle status — purely visual. Same heuristic as HV clutch:
  // hatch_date set → hatched; pulled_date set OR counts present →
  // incubating; otherwise → laid.
  const lifecycleStatus = ((): {
    label: string;
    color: { fg: string; bg: string; border: string };
  } | null => {
    if (!sac) return null;
    if (sac.hatch_date) {
      return {
        label: 'Hatched',
        color: {
          fg: '#86efac',
          bg: 'rgba(34,197,94,0.15)',
          border: 'rgba(34,197,94,0.4)',
        },
      };
    }
    if (sac.pulled_date || sac.spiderling_count != null) {
      return {
        label: 'Incubating',
        color: {
          fg: '#fbbf24',
          bg: 'rgba(245,158,11,0.15)',
          border: 'rgba(245,158,11,0.4)',
        },
      };
    }
    return {
      label: 'Laid',
      color: {
        fg: '#7dd3fc',
        bg: 'rgba(14,165,233,0.15)',
        border: 'rgba(14,165,233,0.4)',
      },
    };
  })();

  // Survival rate — viable / spiderling. Uses spiderling as the
  // denominator since TV doesn't track fertile/slug separately like
  // HV's clutch does. The keeper's "I started with N and N survived"
  // is the honest framing without making up a denominator.
  const survivalRate = ((): number | null => {
    if (!sac || sac.spiderling_count == null || sac.viable_count == null)
      return null;
    const spider = Number(sac.spiderling_count);
    const viable = Number(sac.viable_count);
    if (!Number.isFinite(spider) || !Number.isFinite(viable) || spider <= 0)
      return null;
    return Math.round((viable / spider) * 100);
  })();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Egg sac"
        leftAction={backButton}
        rightAction={
          sac && !deleting ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete egg sac"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={22}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ) : deleting ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {sac === null && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

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

        {sac && lifecycleStatus && (
          <>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.heroLabel, { color: colors.textTertiary }]}
                  >
                    LAID
                  </Text>
                  <Text
                    style={[styles.heroValue, { color: colors.textPrimary }]}
                  >
                    {fmtDate(sac.laid_date)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: lifecycleStatus.color.bg,
                      borderColor: lifecycleStatus.color.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: lifecycleStatus.color.fg },
                    ]}
                  >
                    {lifecycleStatus.label}
                  </Text>
                </View>
              </View>

              {survivalRate != null && (
                <View style={styles.survivalRow}>
                  <Text
                    style={[styles.heroLabel, { color: colors.textTertiary }]}
                  >
                    SURVIVAL RATE
                  </Text>
                  <Text
                    style={[
                      styles.survivalValue,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {survivalRate}%
                    <Text
                      style={[
                        styles.survivalMeta,
                        { color: colors.textTertiary },
                      ]}
                    >
                      {' '}
                      {sac.viable_count} of {sac.spiderling_count}{' '}
                      spiderlings
                    </Text>
                  </Text>
                </View>
              )}

              <View style={styles.kvGrid}>
                {sac.pulled_date && (
                  <KV label="Pulled" value={fmtDate(sac.pulled_date)} />
                )}
                {sac.hatch_date && (
                  <KV label="Hatched" value={fmtDate(sac.hatch_date)} />
                )}
                {sac.spiderling_count != null && (
                  <KV
                    label="Spiderlings"
                    value={String(sac.spiderling_count)}
                  />
                )}
                {sac.viable_count != null && (
                  <KV label="Viable" value={String(sac.viable_count)} />
                )}
              </View>

              {sac.notes && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {sac.notes}
                </Text>
              )}
            </View>

            <View>
              <Text
                style={[styles.sectionLabel, { color: colors.textTertiary }]}
              >
                OFFSPRING{' '}
                <Text style={{ fontWeight: '400' }}>
                  ({offspring?.length ?? 0})
                </Text>
              </Text>
              {offspring === null ? (
                <ActivityIndicator color={colors.textTertiary} />
              ) : offspring.length === 0 ? (
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
                  <Text
                    style={[styles.emptyText, { color: colors.textSecondary }]}
                  >
                    No offspring recorded for this sac yet. Add hatchlings
                    on the web app to log status, sale info, and buyer
                    notes per spiderling.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {offspring.map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      onPress={() =>
                        router.push(`/breeding/offspring/${o.id}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open offspring — ${STATUS_LABEL[o.status] ?? o.status}`}
                      style={[
                        styles.offspringRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="spider"
                        size={18}
                        color={colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.offspringTitle,
                            { color: colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Text>
                        <Text
                          style={[
                            styles.offspringMeta,
                            { color: colors.textTertiary },
                          ]}
                          numberOfLines={1}
                        >
                          {o.status_date ? fmtDate(o.status_date) : ''}
                          {o.price_sold != null ? ` · $${o.price_sold}` : ''}
                          {o.buyer_info ? ` · ${o.buyer_info}` : ''}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.kvCell}>
      <Text style={[styles.kvLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.kvValue, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
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

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  loading: { paddingVertical: 40, alignItems: 'center' },

  errorBlock: { borderWidth: 1, padding: 12 },
  errorText: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },

  heroCard: {
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroValue: { fontSize: 18, fontWeight: '700' },

  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  survivalRow: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  survivalValue: { fontSize: 18, fontWeight: '700' },
  survivalMeta: { fontSize: 12, fontWeight: '400' },

  kvGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kvCell: { minWidth: '40%' },
  kvLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  kvValue: { fontSize: 13, fontWeight: '600' },

  notes: { fontSize: 13, lineHeight: 18, marginTop: 4 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  emptyCard: { borderWidth: 1, padding: 14 },
  emptyText: { fontSize: 13, lineHeight: 18 },

  offspringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
  },
  offspringTitle: { fontSize: 14, fontWeight: '600' },
  offspringMeta: { fontSize: 11, marginTop: 2 },
});

export default withErrorBoundary(EggSacDetailScreen, 'tv-egg-sac-detail');
