/**
 * Offspring detail screen — Sprint 5d.
 *
 * Read + mutate a single hatchling:
 *   - Hero with morph label + status pill
 *   - KV grid (status date, hatch metrics, sale info)
 *   - Tap-to-edit status (mirrors the pairing-outcome pattern)
 *   - Delete affordance in the header
 *
 * Editing fields beyond status is deferred to a later sprint; the
 * status flip covers the most common workflow (hatched → kept / sold /
 * deceased) and the rest is rare enough that delete + recreate is an
 * acceptable recovery path for now.
 *
 * Hermes-prod safety: static JSX branches only — no dynamic component
 * variables. See feedback_dynamic_component_hermes_prod_crash memory.
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
  OFFSPRING_STATUS_LABEL,
  type OffspringStatus,
  type ReptileOffspring,
  deleteOffspring,
  getOffspring,
  updateOffspring,
} from '../../../src/lib/breeding';

const STATUS_ORDER: OffspringStatus[] = [
  'hatched',
  'kept',
  'available',
  'sold',
  'traded',
  'gifted',
  'deceased',
  'unknown',
];

const STATUS_HELP: Record<OffspringStatus, string> = {
  hatched: 'Just out of the egg, no other disposition yet.',
  kept: 'Staying in your collection.',
  available: 'Listed for sale or grow-out.',
  sold: 'Sold to a keeper — fill in buyer + price below.',
  traded: 'Traded to another keeper.',
  gifted: 'Given away, no money exchanged.',
  deceased: 'Did not survive.',
  unknown: "Status isn't clear yet.",
};

// Color tokens for the status pill. Pure visual hint, doesn't gate
// anything. Same color logic the offspring list row uses so the
// scan-and-recognize behavior carries across screens.
const STATUS_COLORS: Record<
  OffspringStatus,
  { fg: string; bg: string; border: string }
> = {
  hatched: {
    fg: '#7dd3fc',
    bg: 'rgba(14,165,233,0.15)',
    border: 'rgba(14,165,233,0.4)',
  },
  kept: {
    fg: '#86efac',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
  },
  available: {
    fg: '#fbbf24',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.4)',
  },
  sold: {
    fg: '#c4b5fd',
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.4)',
  },
  traded: {
    fg: '#c4b5fd',
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.4)',
  },
  gifted: {
    fg: '#c4b5fd',
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.4)',
  },
  deceased: {
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

function OffspringDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [offspring, setOffspring] = useState<ReptileOffspring | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Status edit modal
  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const fetchOffspring = useCallback(async () => {
    if (!id) return;
    try {
      const o = await getOffspring(id as string);
      setOffspring(o);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't load this offspring.",
      );
    }
  }, [id]);

  useEffect(() => {
    fetchOffspring();
  }, [fetchOffspring]);

  async function handlePickStatus(next: OffspringStatus) {
    if (!offspring || savingStatus) return;
    if (next === offspring.status) {
      setStatusOpen(false);
      return;
    }
    setStatusError(null);
    setSavingStatus(true);
    try {
      const updated = await updateOffspring(offspring.id, { status: next });
      setOffspring(updated);
      setStatusOpen(false);
    } catch (err: any) {
      setStatusError(
        err?.response?.data?.detail ||
          err?.message ||
          "Couldn't update status.",
      );
    } finally {
      setSavingStatus(false);
    }
  }

  function handleDelete() {
    if (!offspring || deleting) return;
    Alert.alert(
      'Delete offspring?',
      `${offspring.morph_label ?? 'This hatchling'} will be removed from the clutch. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteOffspring(offspring.id);
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

  const statusColors = offspring ? STATUS_COLORS[offspring.status] : null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Offspring"
        leftAction={<HeaderBackButton />}
        rightAction={
          offspring && !deleting ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete offspring"
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
        {offspring === null && !loadError && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textTertiary} />
          </View>
        )}

        {loadError && <FormErrorBanner message={loadError} />}

        {offspring && statusColors && (
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
                    HATCHLING
                  </Text>
                  <Text
                    style={[styles.heroValue, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {offspring.morph_label ?? 'Unlabeled'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setStatusError(null);
                    setStatusOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Status: ${OFFSPRING_STATUS_LABEL[offspring.status]}. Tap to change.`}
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: statusColors.bg,
                      borderColor: statusColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.statusPillText, { color: statusColors.fg }]}
                  >
                    {OFFSPRING_STATUS_LABEL[offspring.status]}
                  </Text>
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={11}
                    color={statusColors.fg}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.kvGrid}>
                {offspring.status_date && (
                  <KV
                    label="Status date"
                    value={fmtDate(offspring.status_date)}
                  />
                )}
                {offspring.hatch_weight_g != null && (
                  <KV
                    label="Hatch weight"
                    value={`${offspring.hatch_weight_g} g`}
                  />
                )}
                {offspring.hatch_length_in != null && (
                  <KV
                    label="Hatch length"
                    value={`${offspring.hatch_length_in} in`}
                  />
                )}
                {offspring.price_sold != null && (
                  <KV
                    label="Price sold"
                    value={`$${offspring.price_sold}`}
                  />
                )}
                {offspring.buyer_info && (
                  <KV
                    label="Buyer"
                    value={offspring.buyer_info}
                  />
                )}
                {(offspring.snake_id || offspring.lizard_id) && (
                  <KV
                    label="Live record"
                    value="Linked to collection"
                  />
                )}
              </View>

              {offspring.notes && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {offspring.notes}
                </Text>
              )}
            </View>

            <View
              style={[
                styles.comingSoon,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: layout.radius.sm,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="hammer-wrench"
                size={14}
                color={colors.textTertiary}
              />
              <Text
                style={[styles.comingSoonText, { color: colors.textTertiary }]}
              >
                Recording sale price, buyer info, genotype refinement,
                and linking to a live collection record move to mobile
                in a future sprint. For now use the web app for those
                details.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Status edit modal */}
      {offspring && (
        <StatusPickerModal
          visible={statusOpen}
          current={offspring.status}
          saving={savingStatus}
          error={statusError}
          onClose={() => setStatusOpen(false)}
          onPick={handlePickStatus}
        />
      )}
    </SafeAreaView>
  );
}

function StatusPickerModal({
  visible,
  current,
  saving,
  error,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: OffspringStatus;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (s: OffspringStatus) => void;
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
                Update status
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                disabled={saving}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {STATUS_ORDER.map((s) => {
                const selected = s === current;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => onPick(s)}
                    disabled={saving}
                    style={[
                      styles.statusRow,
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
                        {OFFSPRING_STATUS_LABEL[s]}
                      </Text>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: 12,
                          marginTop: 2,
                          lineHeight: 17,
                        }}
                      >
                        {STATUS_HELP[s]}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

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

  // Status modal — same pattern as pairing outcome modal.
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});

export default withErrorBoundary(OffspringDetailScreen, 'offspring-detail');
