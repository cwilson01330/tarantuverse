/**
 * TV pairing detail — Sprint 6e.
 *
 * Mirror of the HV pairing detail pattern, adapted for tarantula data:
 *   - Hero with parent names + paired/separated dates
 *   - Pairing type + tap-to-edit outcome (modal sheet)
 *   - KV grid with all the pairing metadata
 *   - Egg sacs list filtered to this pairing
 *   - Delete affordance in the header (cascades to egg sacs + offspring)
 *
 * Backend's `PairingResponse` only returns parent IDs, so we fetch
 * `/tarantulas/` once and resolve names client-side. Single
 * round-trip; the keeper's collection is already cached by other
 * screens so this is usually warm.
 *
 * Inline types match TV mobile's existing pattern.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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

interface TarantulaLite {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
}

// ─── Outcome model ────────────────────────────────────────────────────

const OUTCOME_ORDER = [
  'in_progress',
  'successful',
  'unsuccessful',
  'unknown',
] as const;

const OUTCOME_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  successful: 'Successful',
  unsuccessful: 'Unsuccessful',
  unknown: 'Unknown',
};

const OUTCOME_HELP: Record<string, string> = {
  in_progress: "Still trying or watching for results.",
  successful: 'Egg sac dropped or live offspring confirmed.',
  unsuccessful: 'Pair did not produce — moving on.',
  unknown: "Don't have a clean answer yet.",
};

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

function PairingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [eggSacs, setEggSacs] = useState<EggSac[] | null>(null);
  const [tarantulaMap, setTarantulaMap] = useState<Map<string, TarantulaLite>>(
    new Map(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      // The pairing endpoint doesn't include parent names; fetch the
      // whole tarantula list once and resolve names client-side. We
      // also fetch egg sacs and filter to this pairing on the client
      // since the API only exposes a flat list.
      const [pRes, sRes, tRes] = await Promise.all([
        apiClient.get<Pairing>(`/pairings/${id}`),
        apiClient.get<EggSac[]>('/egg-sacs/').catch(() => ({ data: [] })),
        apiClient.get<TarantulaLite[]>('/tarantulas/').catch(() => ({ data: [] })),
      ]);
      setPairing(pRes.data);
      setEggSacs(sRes.data.filter((s) => s.pairing_id === id));
      const m = new Map<string, TarantulaLite>();
      for (const t of tRes.data) m.set(t.id, t);
      setTarantulaMap(m);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load this pairing.",
      );
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handlePickOutcome(next: string) {
    if (!pairing || savingOutcome) return;
    if (next === pairing.outcome) {
      setOutcomeOpen(false);
      return;
    }
    setOutcomeError(null);
    setSavingOutcome(true);
    try {
      const res = await apiClient.put<Pairing>(`/pairings/${pairing.id}`, {
        outcome: next,
      });
      setPairing(res.data);
      setOutcomeOpen(false);
    } catch (err: any) {
      setOutcomeError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't update outcome.",
      );
    } finally {
      setSavingOutcome(false);
    }
  }

  function handleDelete() {
    if (!pairing || deleting) return;
    const sacCount = eggSacs?.length ?? 0;
    const suffix =
      sacCount > 0
        ? `\n\nThis will also delete ${sacCount} egg sac${
            sacCount === 1 ? '' : 's'
          } and any offspring records under them. This can't be undone.`
        : "\n\nThis can't be undone.";
    Alert.alert(
      'Delete pairing?',
      `${displayName(tarantulaMap.get(pairing.male_id))} × ${displayName(
        tarantulaMap.get(pairing.female_id),
      )}${suffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiClient.delete(`/pairings/${pairing.id}`);
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

  const outcomeC = pairing
    ? OUTCOME_COLORS[pairing.outcome] ?? OUTCOME_COLORS.unknown
    : null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Pairing"
        leftAction={backButton}
        rightAction={
          pairing && !deleting ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete pairing"
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
        {pairing === null && !loadError && (
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

        {pairing && outcomeC && (
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
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                <Text style={styles.male}>♂ </Text>
                {displayName(tarantulaMap.get(pairing.male_id))}
                <Text style={styles.dim}>  ×  </Text>
                <Text style={styles.female}>♀ </Text>
                {displayName(tarantulaMap.get(pairing.female_id))}
              </Text>

              <View style={styles.kvGrid}>
                <KV label="Paired" value={fmtDate(pairing.paired_date)} />
                {pairing.separated_date && (
                  <KV
                    label="Separated"
                    value={fmtDate(pairing.separated_date)}
                  />
                )}
                <KV
                  label="Type"
                  value={fmtSimple(pairing.pairing_type)}
                />
                <KVPressable
                  label="Outcome"
                  value={OUTCOME_LABEL[pairing.outcome] ?? pairing.outcome}
                  onPress={() => {
                    setOutcomeError(null);
                    setOutcomeOpen(true);
                  }}
                />
              </View>

              {pairing.notes && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {pairing.notes}
                </Text>
              )}
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                EGG SACS{' '}
                <Text style={{ fontWeight: '400' }}>
                  ({eggSacs?.length ?? 0})
                </Text>
              </Text>
              {eggSacs === null ? (
                <ActivityIndicator color={colors.textTertiary} />
              ) : eggSacs.length === 0 ? (
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
                    No egg sacs recorded for this pairing yet. Log a sac on
                    the web app once she drops to start tracking laid
                    date, spiderling count, and hatch outcome.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {eggSacs.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() =>
                        router.push(`/breeding/egg-sacs/${s.id}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open egg sac laid ${fmtDate(s.laid_date)}`}
                      style={[
                        styles.sacRow,
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
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.sacTitle, { color: colors.textPrimary }]}
                        >
                          Laid {fmtDate(s.laid_date)}
                        </Text>
                        <Text
                          style={[styles.sacMeta, { color: colors.textTertiary }]}
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

      {/* Outcome edit modal — same pattern as HV. */}
      {pairing && (
        <OutcomePickerModal
          visible={outcomeOpen}
          current={pairing.outcome}
          saving={savingOutcome}
          error={outcomeError}
          onClose={() => setOutcomeOpen(false)}
          onPick={handlePickOutcome}
        />
      )}
    </SafeAreaView>
  );
}

function OutcomePickerModal({
  visible,
  current,
  saving,
  error,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (o: string) => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.modalHeader}>
              <View style={{ width: 24 }} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Update outcome
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} disabled={saving}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {OUTCOME_ORDER.map((o) => {
                const selected = o === current;
                return (
                  <TouchableOpacity
                    key={o}
                    onPress={() => onPick(o)}
                    disabled={saving}
                    style={[
                      styles.outcomeRow,
                      {
                        borderBottomColor: colors.border,
                        opacity: saving && !selected ? 0.5 : 1,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontWeight: '600',
                          fontSize: 14,
                        }}
                      >
                        {OUTCOME_LABEL[o]}
                      </Text>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: 12,
                          marginTop: 2,
                          lineHeight: 17,
                        }}
                      >
                        {OUTCOME_HELP[o]}
                      </Text>
                    </View>
                    {saving && selected && (
                      <ActivityIndicator size="small" color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {error && (
              <Text
                style={{
                  color: '#fca5a5',
                  fontSize: 12,
                  lineHeight: 17,
                  paddingTop: 12,
                }}
              >
                {error}
              </Text>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────

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

function KVPressable({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to change.`}
      style={styles.kvCell}
    >
      <Text style={[styles.kvLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.kvPressableRow}>
        <Text
          style={[styles.kvValue, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <MaterialCommunityIcons
          name="pencil-outline"
          size={13}
          color={colors.primary}
        />
      </View>
    </TouchableOpacity>
  );
}

function displayName(t: TarantulaLite | undefined): string {
  if (!t) return 'Unknown';
  return t.name || t.common_name || t.scientific_name || 'Unnamed';
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

function fmtSimple(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },

  errorBlock: { borderWidth: 1, padding: 12 },
  errorText: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },

  heroCard: {
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  heroTitle: { fontSize: 16, fontWeight: '700' },
  male: { color: '#38bdf8' },
  female: { color: '#f472b6' },
  dim: { color: '#525252' },

  notes: { fontSize: 13, lineHeight: 18, marginTop: 4 },

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
  kvPressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },

  emptyCard: {
    borderWidth: 1,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 18 },

  sacRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
  },
  sacTitle: { fontSize: 14, fontWeight: '600' },
  sacMeta: { fontSize: 11, marginTop: 2 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '85%',
    minHeight: 260,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 15, fontWeight: '700' },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});

export default withErrorBoundary(PairingDetailScreen, 'tv-pairing-detail');
