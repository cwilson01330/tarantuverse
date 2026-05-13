/**
 * Clutch detail screen — Sprint 5c.
 *
 * Read-only summary of a clutch with its offspring list. Surfaces:
 *   - Hero: laid date + status pill (laid / incubating / hatched)
 *   - Hatch rate: hatched / fertile when both are present
 *   - KV grid: pulled, expected hatch, hatch, temp/humidity ranges,
 *     all five counts
 *   - Offspring list (read-only) — full CRUD lands in Sprint 5d
 *   - Delete affordance with cascade-aware confirm
 *
 * Editing clutch fields inline is deferred — for now, deleting +
 * re-creating is the recovery path. The delete already cascades to
 * offspring on the server.
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
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { FormErrorBanner } from '../../../src/components/forms/FormPrimitives';
import { useTheme } from '../../../src/contexts/ThemeContext';
import {
  OFFSPRING_STATUS_LABEL,
  type Clutch,
  type ReptileOffspring,
  deleteClutch,
  getClutch,
  listOffspringForClutch,
} from '../../../src/lib/breeding';

function ClutchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [clutch, setClutch] = useState<Clutch | null>(null);
  const [offspring, setOffspring] = useState<ReptileOffspring[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const [c, o] = await Promise.all([
        getClutch(id as string),
        listOffspringForClutch(id as string).catch(
          () => [] as ReptileOffspring[],
        ),
      ]);
      setClutch(c);
      setOffspring(o);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load this clutch.",
      );
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function handleDelete() {
    if (!clutch || deleting) return;
    const offspringSuffix =
      clutch.offspring_count > 0
        ? `\n\nThis will also delete ${clutch.offspring_count} offspring record${
            clutch.offspring_count === 1 ? '' : 's'
          } under it. This can't be undone.`
        : "\n\nThis can't be undone.";
    Alert.alert(
      'Delete clutch?',
      `Laid ${fmtDate(clutch.laid_date)}${offspringSuffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteClutch(clutch.id);
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

  // Status semantic: laid → no pulled, no hatch; incubating → pulled
  // OR has fertile/temp but no hatch_date; hatched → hatch_date set.
  // Pure visual hint, never blocking.
  const lifecycleStatus = ((): {
    label: string;
    color: { fg: string; bg: string; border: string };
  } | null => {
    if (!clutch) return null;
    if (clutch.hatch_date) {
      return {
        label: 'Hatched',
        color: {
          fg: '#86efac',
          bg: 'rgba(34,197,94,0.15)',
          border: 'rgba(34,197,94,0.4)',
        },
      };
    }
    if (
      clutch.pulled_date ||
      clutch.fertile_count != null ||
      clutch.incubation_temp_min_f != null
    ) {
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

  // Hatch rate: hatched / fertile if both present. Most honest
  // denominator — out of eggs that were actually viable, how many
  // came out. expected_count includes slugs, which would dilute
  // this number unfairly against the keeper.
  const hatchRate = ((): number | null => {
    if (!clutch) return null;
    const hatched =
      clutch.hatched_count != null ? Number(clutch.hatched_count) : null;
    const fertile =
      clutch.fertile_count != null ? Number(clutch.fertile_count) : null;
    if (hatched == null || fertile == null || fertile <= 0) return null;
    return Math.round((hatched / fertile) * 100);
  })();

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Clutch"
        leftAction={<HeaderBackButton />}
        rightAction={
          clutch && !deleting ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete clutch"
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
          ) : null
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {clutch === null && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

        {loadError && <FormErrorBanner message={loadError} />}

        {clutch && (
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
                    {fmtDate(clutch.laid_date)}
                  </Text>
                </View>
                {lifecycleStatus && (
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
                )}
              </View>

              {hatchRate != null && (
                <View style={styles.hatchRateRow}>
                  <Text
                    style={[styles.heroLabel, { color: colors.textTertiary }]}
                  >
                    HATCH RATE
                  </Text>
                  <Text
                    style={[
                      styles.hatchRateValue,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {hatchRate}%
                    <Text
                      style={[
                        styles.hatchRateMeta,
                        { color: colors.textTertiary },
                      ]}
                    >
                      {' '}
                      {clutch.hatched_count} of {clutch.fertile_count} fertile
                    </Text>
                  </Text>
                </View>
              )}

              {/* KV grid for the lifecycle dates + conditions + counts. */}
              <View style={styles.kvGrid}>
                {clutch.pulled_date && (
                  <KV label="Pulled" value={fmtDate(clutch.pulled_date)} />
                )}
                {clutch.expected_hatch_date && (
                  <KV
                    label="Expected hatch"
                    value={fmtDate(clutch.expected_hatch_date)}
                  />
                )}
                {clutch.hatch_date && (
                  <KV
                    label="Hatched"
                    value={fmtDate(clutch.hatch_date)}
                  />
                )}
                {(clutch.incubation_temp_min_f ||
                  clutch.incubation_temp_max_f) && (
                  <KV
                    label="Temp range"
                    value={fmtRange(
                      clutch.incubation_temp_min_f,
                      clutch.incubation_temp_max_f,
                      '°F',
                    )}
                  />
                )}
                {(clutch.incubation_humidity_min_pct != null ||
                  clutch.incubation_humidity_max_pct != null) && (
                  <KV
                    label="Humidity"
                    value={fmtRange(
                      clutch.incubation_humidity_min_pct,
                      clutch.incubation_humidity_max_pct,
                      '%',
                    )}
                  />
                )}
                {clutch.expected_count != null && (
                  <KV
                    label="Expected"
                    value={String(clutch.expected_count)}
                  />
                )}
                {clutch.fertile_count != null && (
                  <KV
                    label="Fertile"
                    value={String(clutch.fertile_count)}
                  />
                )}
                {clutch.slug_count != null && (
                  <KV label="Slugs" value={String(clutch.slug_count)} />
                )}
                {clutch.hatched_count != null && (
                  <KV
                    label="Hatched"
                    value={String(clutch.hatched_count)}
                  />
                )}
                {clutch.viable_count != null && (
                  <KV
                    label="Viable"
                    value={String(clutch.viable_count)}
                  />
                )}
              </View>

              {clutch.notes && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {clutch.notes}
                </Text>
              )}
            </View>

            <View>
              <View style={styles.sectionHeaderRow}>
                <Text
                  style={[styles.sectionLabel, { color: colors.textTertiary }]}
                >
                  OFFSPRING
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      `/breeding/clutches/${clutch.id}/offspring/new` as never,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Add hatchling"
                  style={styles.sectionAdd}
                >
                  <MaterialCommunityIcons
                    name="plus-circle"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.sectionAddText, { color: colors.primary }]}
                  >
                    Add hatchling
                  </Text>
                </TouchableOpacity>
              </View>
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
                    No hatchlings recorded for this clutch yet. Tap{' '}
                    <Text style={{ fontWeight: '600' }}>Add hatchling</Text>{' '}
                    once eggs start cutting — you can record morph,
                    weight, and length, then update sale status later.
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
                      accessibilityLabel={`Open ${o.morph_label ?? 'hatchling'}`}
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
                        name="paw"
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
                          {o.morph_label ?? 'Hatchling'}
                        </Text>
                        <Text
                          style={[
                            styles.offspringMeta,
                            { color: colors.textTertiary },
                          ]}
                          numberOfLines={1}
                        >
                          {OFFSPRING_STATUS_LABEL[o.status]}
                          {o.status_date
                            ? ` · ${fmtDate(o.status_date)}`
                            : ''}
                          {o.price_sold ? ` · $${o.price_sold}` : ''}
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

function fmtRange(
  min: string | number | null,
  max: string | number | null,
  unit: string,
): string {
  if (min != null && max != null) return `${min}–${max}${unit}`;
  if (min != null) return `≥ ${min}${unit}`;
  if (max != null) return `≤ ${max}${unit}`;
  return '—';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },

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

  hatchRateRow: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  hatchRateValue: { fontSize: 18, fontWeight: '700' },
  hatchRateMeta: { fontSize: 12, fontWeight: '400' },

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

  notes: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  sectionAddText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  emptyCard: {
    borderWidth: 1,
    padding: 14,
  },
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

  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  comingSoonText: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
});

export default withErrorBoundary(ClutchDetailScreen, 'clutch-detail');
