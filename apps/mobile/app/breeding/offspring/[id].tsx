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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

interface EggSac {
  id: string;
  pairing_id: string;
  laid_date: string;
  hatch_date: string | null;
}

interface Pairing {
  id: string;
  male_id: string;
  female_id: string;
}

interface Tarantula {
  id: string;
  name?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  species_id?: string | null;
  sex?: string | null;
}

/**
 * Lazy-fetched parent prefill for the Add-to-collection modal. Sourced
 * from the parent pairing's male (with female as fallback). Mirrors
 * the web ParentPrefill type.
 */
interface ParentPrefill {
  scientific_name: string | null;
  species_id: string | null;
  hatch_date: string | null;
  laid_date: string;
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
  const [linkedTarantula, setLinkedTarantula] = useState<Tarantula | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  // Add-to-collection modal state — same shape as the web version.
  // Parent prefill is fetched on first modal open and cached.
  const [addOpen, setAddOpen] = useState(false);
  const [addParent, setAddParent] = useState<ParentPrefill | null>(null);
  const [addParentLoading, setAddParentLoading] = useState(false);
  const [addParentError, setAddParentError] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addSex, setAddSex] = useState<'male' | 'female' | 'unknown'>(
    'unknown',
  );
  const [addCreating, setAddCreating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchOffspring = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient.get<Offspring>(`/offspring/${id}`);
      setOffspring(res.data);
      setLoadError(null);
      // Best-effort fetch of the linked tarantula so we can display
      // its name in the linked card. Silent failure — if it 404s
      // (tarantula was deleted) we just skip the name.
      if (res.data.tarantula_id) {
        apiClient
          .get<Tarantula>(`/tarantulas/${res.data.tarantula_id}`)
          .then((tRes) => setLinkedTarantula(tRes.data))
          .catch(() => setLinkedTarantula(null));
      } else {
        setLinkedTarantula(null);
      }
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

  /**
   * Lazy-fetch parent prefill (species + dates) on first modal open.
   * Both parents should share a species after the cross-species fix —
   * we read the male as the canonical source, with female fallback if
   * the male fetch fails. Failure leaves the modal usable with empty
   * prefills + a soft inline warning.
   */
  async function openAddToCollection() {
    setAddOpen(true);
    setAddError(null);
    if (addParent || addParentLoading || !offspring) return;
    setAddParentLoading(true);
    setAddParentError(null);
    try {
      const sacRes = await apiClient.get<EggSac>(
        `/egg-sacs/${offspring.egg_sac_id}`,
      );
      const sac = sacRes.data;
      const pRes = await apiClient.get<Pairing>(`/pairings/${sac.pairing_id}`);
      const pairing = pRes.data;

      let parent: Tarantula | null = null;
      try {
        const maleRes = await apiClient.get<Tarantula>(
          `/tarantulas/${pairing.male_id}`,
        );
        parent = maleRes.data;
      } catch {
        try {
          const femRes = await apiClient.get<Tarantula>(
            `/tarantulas/${pairing.female_id}`,
          );
          parent = femRes.data;
        } catch {
          parent = null;
        }
      }

      setAddParent({
        scientific_name: parent?.scientific_name ?? null,
        species_id: parent?.species_id ?? null,
        hatch_date: sac.hatch_date,
        laid_date: sac.laid_date,
      });
    } catch (err: any) {
      setAddParentError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not load parent species info for prefill.',
      );
    } finally {
      setAddParentLoading(false);
    }
  }

  /**
   * Create a tarantula record from the prefill + form inputs, then
   * link it back to the offspring via PUT. On success we update local
   * state so the linked card appears immediately.
   */
  async function handleCreateAndLink() {
    if (!offspring || addCreating) return;
    if (!addName.trim()) {
      setAddError('Give your new tarantula a name first.');
      return;
    }
    setAddError(null);
    setAddCreating(true);
    try {
      const dateAcquired =
        addParent?.hatch_date ||
        new Date().toISOString().slice(0, 10);
      const noteLines: string[] = [];
      if (addParent?.laid_date) {
        noteLines.push(`Hatched from egg sac laid ${addParent.laid_date}.`);
      } else {
        noteLines.push('Bred from offspring record.');
      }
      const payload: Record<string, unknown> = {
        name: addName.trim(),
        sex: addSex,
        source: 'bred',
        date_acquired: dateAcquired,
        notes: noteLines.join('\n'),
      };
      if (addParent?.scientific_name) {
        payload.scientific_name = addParent.scientific_name;
      }
      if (addParent?.species_id) {
        payload.species_id = addParent.species_id;
      }

      const tarRes = await apiClient.post<Tarantula>('/tarantulas/', payload);
      const newTar = tarRes.data;

      // Link the new tarantula to this offspring. If this fails we
      // leave the tarantula in place — better to orphan the link than
      // delete a freshly created record. Keeper can fix in the API.
      try {
        const linkRes = await apiClient.put<Offspring>(
          `/offspring/${offspring.id}`,
          { tarantula_id: newTar.id },
        );
        setOffspring(linkRes.data);
        setLinkedTarantula(newTar);
        setAddOpen(false);
        setAddName('');
        setAddSex('unknown');
      } catch (err: any) {
        throw new Error(
          err?.response?.data?.detail ||
            err?.message ||
            "Tarantula created, but couldn't link it to this offspring. You can link it manually later.",
        );
      }
    } catch (err: any) {
      setAddError(
        err?.message ||
          err?.response?.data?.detail ||
          'Something went wrong creating the record.',
      );
    } finally {
      setAddCreating(false);
    }
  }

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

            {/* Linked tarantula / add-to-collection CTA. Three states:
                1. Already linked → tap to navigate to the tarantula.
                2. status === 'kept' but no link → "Add to collection".
                3. Anything else → render nothing. */}
            {offspring.tarantula_id ? (
              <TouchableOpacity
                onPress={() => {
                  if (linkedTarantula?.id) {
                    router.push(`/tarantula/${linkedTarantula.id}` as never);
                  }
                }}
                disabled={!linkedTarantula}
                accessibilityRole="link"
                style={[
                  styles.linkedCard,
                  {
                    backgroundColor: 'rgba(59,130,246,0.12)',
                    borderColor: 'rgba(59,130,246,0.4)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <Text style={[styles.linkedLabel, { color: '#93c5fd' }]}>
                  LINKED TO COLLECTION
                </Text>
                <Text
                  style={[styles.linkedValue, { color: '#bfdbfe' }]}
                  numberOfLines={1}
                >
                  {linkedTarantula
                    ? tarantulaName(linkedTarantula)
                    : 'Linked tarantula no longer exists.'}
                </Text>
              </TouchableOpacity>
            ) : offspring.status === 'kept' ? (
              <View
                style={[
                  styles.ctaCard,
                  {
                    backgroundColor: 'rgba(34,197,94,0.12)',
                    borderColor: 'rgba(34,197,94,0.4)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.ctaTitle, { color: '#86efac' }]}>
                    Ready to keep this sling?
                  </Text>
                  <Text style={[styles.ctaHelp, { color: '#bbf7d0' }]}>
                    Create a tarantula record and link it back here.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openAddToCollection}
                  accessibilityRole="button"
                  accessibilityLabel="Add to collection"
                  style={[
                    styles.ctaButton,
                    { borderRadius: layout.radius.sm },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={16}
                    color="#022c22"
                  />
                  <Text style={styles.ctaButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : null}

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

      {offspring && (
        <AddToCollectionModal
          visible={addOpen}
          parent={addParent}
          parentLoading={addParentLoading}
          parentError={addParentError}
          name={addName}
          onNameChange={setAddName}
          sex={addSex}
          onSexChange={setAddSex}
          creating={addCreating}
          error={addError}
          onClose={() => {
            if (!addCreating) setAddOpen(false);
          }}
          onSubmit={handleCreateAndLink}
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

function tarantulaName(t: Tarantula): string {
  return (
    t.name?.trim() ||
    t.common_name?.trim() ||
    t.scientific_name?.trim() ||
    'Unnamed'
  );
}

/**
 * Add-to-collection modal — creates a tarantula record prefilled from
 * the parent pairing's species and the egg sac's hatch date, then
 * links the new record back to this offspring entry. Pattern mirrors
 * StatusPickerModal but uses TextInput for the name field and pill
 * buttons for sex.
 */
function AddToCollectionModal({
  visible,
  parent,
  parentLoading,
  parentError,
  name,
  onNameChange,
  sex,
  onSexChange,
  creating,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  parent: ParentPrefill | null;
  parentLoading: boolean;
  parentError: string | null;
  name: string;
  onNameChange: (v: string) => void;
  sex: 'male' | 'female' | 'unknown';
  onSexChange: (v: 'male' | 'female' | 'unknown') => void;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { colors, layout } = useTheme();
  const sexOptions: Array<'male' | 'female' | 'unknown'> = [
    'male',
    'female',
    'unknown',
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={'padding'}
        style={{ flex: 1 }}
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
                <Text
                  style={[styles.modalTitle, { color: colors.textPrimary }]}
                >
                  Add to collection
                </Text>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={8}
                  disabled={creating}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 480 }}
              >
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: 12,
                    lineHeight: 17,
                    paddingHorizontal: 4,
                    paddingBottom: 12,
                  }}
                >
                  Creates a new tarantula record and links it back here.
                </Text>

                {/* Prefill summary */}
                <View
                  style={[
                    styles.prefillBox,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                >
                  {parentLoading ? (
                    <Text
                      style={{ color: colors.textTertiary, fontSize: 12 }}
                    >
                      Loading parent info…
                    </Text>
                  ) : parentError ? (
                    <Text
                      style={{
                        color: '#fcd34d',
                        fontSize: 12,
                        lineHeight: 17,
                      }}
                    >
                      {parentError} You can still create the record — it
                      just won&rsquo;t auto-fill the species.
                    </Text>
                  ) : (
                    <>
                      <PrefillRow
                        label="Species"
                        value={
                          parent?.scientific_name || 'Not set on parents'
                        }
                        muted={!parent?.scientific_name}
                      />
                      <PrefillRow
                        label="Date acquired"
                        value={
                          parent?.hatch_date
                            ? fmtDate(parent.hatch_date)
                            : 'Today'
                        }
                      />
                      <PrefillRow label="Source" value="Bred" />
                    </>
                  )}
                </View>

                {/* Name */}
                <Text
                  style={[
                    styles.formLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  NAME *
                </Text>
                <TextInput
                  value={name}
                  onChangeText={onNameChange}
                  placeholder="e.g. Sling #1"
                  placeholderTextColor={colors.textTertiary}
                  editable={!creating}
                  autoFocus
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.sm,
                    },
                  ]}
                />

                {/* Sex */}
                <Text
                  style={[
                    styles.formLabel,
                    { color: colors.textSecondary, marginTop: 16 },
                  ]}
                >
                  SEX
                </Text>
                <View style={styles.sexRow}>
                  {sexOptions.map((s) => {
                    const selected = s === sex;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => onSexChange(s)}
                        disabled={creating}
                        style={[
                          styles.sexButton,
                          {
                            backgroundColor: selected
                              ? 'rgba(34,197,94,0.18)'
                              : colors.background,
                            borderColor: selected
                              ? 'rgba(34,197,94,0.6)'
                              : colors.border,
                            borderRadius: layout.radius.sm,
                            opacity: creating ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? '#86efac' : colors.textPrimary,
                            fontWeight: selected ? '700' : '500',
                            fontSize: 14,
                            textTransform: 'capitalize',
                          }}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {error && (
                  <Text
                    style={{
                      color: '#fca5a5',
                      fontSize: 12,
                      lineHeight: 17,
                      marginTop: 12,
                    }}
                  >
                    {error}
                  </Text>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={onClose}
                  disabled={creating}
                  style={styles.modalFooterCancel}
                >
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onSubmit}
                  disabled={creating || !name.trim()}
                  style={[
                    styles.modalFooterPrimary,
                    {
                      borderRadius: layout.radius.sm,
                      opacity: creating || !name.trim() ? 0.5 : 1,
                    },
                  ]}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#022c22" />
                  ) : (
                    <Text style={styles.modalFooterPrimaryText}>
                      Create & link
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PrefillRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.prefillRow}>
      <Text style={[styles.prefillLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.prefillValue,
          {
            color: muted ? colors.textTertiary : colors.textPrimary,
            fontStyle: muted ? 'italic' : 'normal',
          },
        ]}
        numberOfLines={1}
      >
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

  // Linked-tarantula card (shows when offspring is linked).
  linkedCard: {
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  linkedLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  linkedValue: { fontSize: 14, fontWeight: '600' },

  // "Add to collection" CTA card (shows when status=kept + no link).
  ctaCard: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctaTitle: { fontSize: 13, fontWeight: '700' },
  ctaHelp: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#86efac',
  },
  ctaButtonText: {
    color: '#022c22',
    fontWeight: '700',
    fontSize: 13,
  },

  // Add-to-collection modal styles.
  prefillBox: {
    borderWidth: 1,
    padding: 10,
    gap: 4,
    marginBottom: 16,
  },
  prefillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  prefillLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  prefillValue: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sexRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sexButton: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
  },
  modalFooterCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalFooterPrimary: {
    backgroundColor: '#86efac',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 130,
    alignItems: 'center',
  },
  modalFooterPrimaryText: {
    color: '#022c22',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default withErrorBoundary(OffspringDetailScreen, 'tv-offspring-detail');
