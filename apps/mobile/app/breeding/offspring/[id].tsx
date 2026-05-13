/**
 * TV offspring detail — Sprint 6g.
 *
 * Mirror of HV offspring detail, adapted for tarantula data:
 *   - Hero with tap-to-edit status pill
 *   - KV grid (status date, price, buyer, linked tarantula)
 *   - Status edit modal (6 values, smaller than HV's 8)
 *   - Delete in the header
 *
 * TV's OffspringStatus enum is kept / sold / traded / given_away /
 * died / unknown. The biggest difference from HV: no 'hatched'
 * default (TV's spiderlings get an explicit disposition or
 * 'unknown'), no 'available' status (TV doesn't track grow-out for
 * sale separately).
 *
 * Inline types, no src/lib layer — matches existing TV mobile
 * convention.
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

// ─── TV's OffspringStatus enum ────────────────────────────────────────

const STATUS_ORDER = [
  'kept',
  'sold',
  'traded',
  'given_away',
  'died',
  'unknown',
] as const;

const STATUS_LABEL: Record<string, string> = {
  kept: 'Kept',
  sold: 'Sold',
  traded: 'Traded',
  given_away: 'Given away',
  died: 'Died',
  unknown: 'Unknown',
};

const STATUS_HELP: Record<string, string> = {
  kept: 'Staying in your collection.',
  sold: 'Sold to a keeper — fill in buyer + price below.',
  traded: 'Traded to another keeper.',
  given_away: 'Given away, no money exchanged.',
  died: 'Did not survive.',
  unknown: "Status isn't clear yet.",
};

const STATUS_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  kept: {
    fg: '#86efac',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
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
  given_away: {
    fg: '#c4b5fd',
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.4)',
  },
  died: {
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
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const backButton = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const [offspring, setOffspring] = useState<Offspring | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const fetchOffspring = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient.get<Offspring>(`/offspring/${id}`);
      setOffspring(res.data);
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

  async function handlePickStatus(next: string) {
    if (!offspring || savingStatus) return;
    if (next === offspring.status) {
      setStatusOpen(false);
      return;
    }
    setStatusError(null);
    setSavingStatus(true);
    try {
      const res = await apiClient.put<Offspring>(`/offspring/${offspring.id}`, {
        status: next,
      });
      setOffspring(res.data);
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
      `This spiderling record will be removed. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiClient.delete(`/offspring/${offspring.id}`);
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

  const statusC = offspring
    ? STATUS_COLORS[offspring.status] ?? STATUS_COLORS.unknown
    : null;

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Offspring"
        leftAction={backButton}
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
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {offspring === null && !loadError && (
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

        {offspring && statusC && (
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
                  SPIDERLING
                </Text>
                <Text
                  style={[styles.heroValue, { color: colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {offspring.tarantula_id
                    ? 'Linked to collection'
                    : 'Unlinked record'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setStatusError(null);
                  setStatusOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Status: ${STATUS_LABEL[offspring.status] ?? offspring.status}. Tap to change.`}
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: statusC.bg,
                    borderColor: statusC.border,
                  },
                ]}
              >
                <Text style={[styles.statusPillText, { color: statusC.fg }]}>
                  {STATUS_LABEL[offspring.status] ?? offspring.status}
                </Text>
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={11}
                  color={statusC.fg}
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
              {offspring.price_sold != null && (
                <KV
                  label="Price sold"
                  value={`$${offspring.price_sold}`}
                />
              )}
              {offspring.buyer_info && (
                <KV label="Buyer" value={offspring.buyer_info} />
              )}
            </View>

            {offspring.notes && (
              <Text style={[styles.notes, { color: colors.textSecondary }]}>
                {offspring.notes}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

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
  current: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (s: string) => void;
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
              <TouchableOpacity onPress={onClose} hitSlop={8} disabled={saving}>
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
                        {STATUS_LABEL[s]}
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

  notes: { fontSize: 13, lineHeight: 18, marginTop: 4 },

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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});

export default withErrorBoundary(OffspringDetailScreen, 'tv-offspring-detail');
