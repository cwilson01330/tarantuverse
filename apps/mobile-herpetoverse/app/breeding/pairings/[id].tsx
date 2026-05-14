/**
 * Pairing detail route — Sprint 5a + 5b incremental.
 *
 * Tapping a row from the breeding tab lands here. The screen fetches
 * the pairing record + clutch list and renders a hero card with parent
 * names, KV grid, clutch list, and notes. Outcome is now tappable —
 * 5b add: keepers can update in_progress → successful / unsuccessful /
 * abandoned without dropping to web. Clutch creation + offspring
 * still pending Sprint 5c.
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
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { FormErrorBanner } from '../../../src/components/forms/FormPrimitives';
import { useTheme } from '../../../src/contexts/ThemeContext';
import {
  PAIRING_OUTCOME_LABEL,
  PAIRING_TYPE_LABEL,
  type Clutch,
  type ReptilePairing,
  type ReptilePairingOutcome,
  deletePairing,
  getPairing,
  listClutchesForPairing,
  updatePairing,
} from '../../../src/lib/breeding';

const OUTCOME_ORDER: ReptilePairingOutcome[] = [
  'in_progress',
  'successful',
  'unsuccessful',
  'abandoned',
  'unknown',
];

const OUTCOME_HELP: Record<ReptilePairingOutcome, string> = {
  in_progress: "Still trying or watching for results.",
  successful: 'Eggs laid or live birth confirmed.',
  unsuccessful: 'Pair did not produce — moving on.',
  abandoned: 'Stopped trying before a result.',
  unknown: "Don't have a clean answer yet.",
};

function PairingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();
  const [pairing, setPairing] = useState<ReptilePairing | null>(null);
  const [clutches, setClutches] = useState<Clutch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Outcome edit modal state
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  // Delete-pairing state
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const [p, c] = await Promise.all([
        getPairing(id as string),
        listClutchesForPairing(id as string).catch(() => [] as Clutch[]),
      ]);
      setPairing(p);
      setClutches(c);
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

  /**
   * Delete this pairing. Confirmation lives in a native Alert since
   * destructive actions get one second-chance prompt. On success we
   * pop back to the breeding tab; if the row was already 404 (e.g.
   * deleted on another device) we still navigate back since the user's
   * intent was "remove it from my list."
   *
   * Backend CASCADEs to clutches + offspring; that's a one-way action.
   * The confirmation copy is explicit so keepers don't lose data by
   * accident.
   */
  function handleDelete() {
    if (!pairing || deleting) return;
    const clutchSuffix =
      pairing.clutch_count > 0
        ? `\n\nThis will also delete ${pairing.clutch_count} clutch${
            pairing.clutch_count === 1 ? '' : 'es'
          } and any offspring records under it. This can't be undone.`
        : "\n\nThis can't be undone.";
    Alert.alert(
      'Delete pairing?',
      `${pairing.male_display_name ?? 'Male'} × ${
        pairing.female_display_name ?? 'Female'
      }${clutchSuffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deletePairing(pairing.id);
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

  async function handlePickOutcome(next: ReptilePairingOutcome) {
    if (!pairing || savingOutcome) return;
    if (next === pairing.outcome) {
      setOutcomeOpen(false);
      return;
    }
    setOutcomeError(null);
    setSavingOutcome(true);
    try {
      const updated = await updatePairing(pairing.id, { outcome: next });
      setPairing(updated);
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

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Pairing"
        leftAction={<HeaderBackButton />}
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
          ) : null
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

        {pairing && (
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
                {pairing.male_display_name ?? 'Male'}
                <Text style={styles.dim}>  ×  </Text>
                <Text style={styles.female}>♀ </Text>
                {pairing.female_display_name ?? 'Female'}
              </Text>
              <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
                {pairing.taxon === 'snake'
                  ? '🐍 Snake pairing'
                  : pairing.taxon === 'frog'
                  ? '🐸 Frog pairing'
                  : '🦎 Lizard pairing'}
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
                  value={PAIRING_TYPE_LABEL[pairing.pairing_type]}
                />
                <KVPressable
                  label="Outcome"
                  value={PAIRING_OUTCOME_LABEL[pairing.outcome]}
                  onPress={() => {
                    setOutcomeError(null);
                    setOutcomeOpen(true);
                  }}
                />
                <KV
                  label="Visibility"
                  value={pairing.is_private ? '🔒 Private' : '🌐 Public'}
                />
              </View>
              {pairing.notes && (
                <Text
                  style={[styles.notes, { color: colors.textSecondary }]}
                >
                  {pairing.notes}
                </Text>
              )}
            </View>

            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                  CLUTCHES
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      `/breeding/pairings/${pairing.id}/clutches/new` as never,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Add clutch"
                  style={styles.sectionAdd}
                >
                  <MaterialCommunityIcons
                    name="plus-circle"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.sectionAddText, { color: colors.primary }]}>
                    Add clutch
                  </Text>
                </TouchableOpacity>
              </View>
              {clutches === null ? (
                <ActivityIndicator color={colors.textTertiary} />
              ) : clutches.length === 0 ? (
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
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No clutches recorded for this pairing yet. Tap{' '}
                    <Text style={{ fontWeight: '600' }}>Add clutch</Text> when
                    she lays — the only required field is the laid date,
                    you can fill in counts and conditions as the clutch
                    develops.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {clutches.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() =>
                        router.push(`/breeding/clutches/${c.id}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open clutch laid ${fmtDate(c.laid_date)}`}
                      style={[
                        styles.clutchRow,
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
                          style={[styles.clutchTitle, { color: colors.textPrimary }]}
                        >
                          Laid {fmtDate(c.laid_date)}
                        </Text>
                        <Text
                          style={[styles.clutchMeta, { color: colors.textTertiary }]}
                        >
                          {c.expected_count != null
                            ? `${c.expected_count} expected`
                            : ''}
                          {c.expected_count != null &&
                          c.hatched_count != null
                            ? ' · '
                            : ''}
                          {c.hatched_count != null
                            ? `${c.hatched_count} hatched`
                            : ''}
                          {c.offspring_count > 0
                            ? ` · ${c.offspring_count} offspring on file`
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

      {/* Outcome edit modal — bottom sheet with the 5 outcomes. */}
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

// ---------------------------------------------------------------------------
// OutcomePickerModal — bottom sheet for tap-to-edit outcome.
// ---------------------------------------------------------------------------

function OutcomePickerModal({
  visible,
  current,
  saving,
  error,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: ReptilePairingOutcome;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (o: ReptilePairingOutcome) => void;
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
                        {PAIRING_OUTCOME_LABEL[o]}
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
                      <ActivityIndicator
                        size="small"
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {error && (
              <View style={{ paddingTop: 8 }}>
                <FormErrorBanner message={error} />
              </View>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// KV cells — read-only and pressable variants.
// ---------------------------------------------------------------------------

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

/**
 * Pressable variant of KV — small chevron hints at edit. Used for the
 * Outcome row so keepers can tap to update.
 */
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
  loading: { paddingVertical: 40, alignItems: 'center' },
  errorBlock: {
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 17,
  },

  heroCard: {
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  heroTitle: { fontSize: 16, fontWeight: '700' },
  heroMeta: { fontSize: 12 },
  male: { color: '#38bdf8' },
  female: { color: '#f472b6' },
  dim: { color: '#525252' },
  notes: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

  kvGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  kvCell: { minWidth: '40%' },
  kvLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  kvValue: { fontSize: 13, fontWeight: '600' },

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

  clutchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
  },
  clutchTitle: { fontSize: 14, fontWeight: '600' },
  clutchMeta: { fontSize: 11, marginTop: 2 },

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

  // KV pressable variant — pencil glyph + value side by side.
  kvPressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Outcome-edit modal — same bottom-sheet pattern as the parent
  // picker in /breeding/pairings/new.tsx.
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
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});

export default withErrorBoundary(PairingDetailScreen, 'pairing-detail');
