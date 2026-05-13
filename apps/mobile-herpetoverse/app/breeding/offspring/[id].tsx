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
import { HeaderBackButton } from '../../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { FormErrorBanner } from '../../../src/components/forms/FormPrimitives';
import { useTheme } from '../../../src/contexts/ThemeContext';
import {
  OFFSPRING_STATUS_LABEL,
  type OffspringStatus,
  type ReptileOffspring,
  deleteOffspring,
  getClutch,
  getOffspring,
  getPairing,
  updateOffspring,
} from '../../../src/lib/breeding';
import {
  createSnake,
  getSnake,
  type CreateSnakePayload,
} from '../../../src/lib/snakes';
import {
  createLizard,
  getLizard,
  type CreateLizardPayload,
} from '../../../src/lib/lizards';

/**
 * Lazy-fetched parent species + lifecycle data for the hold-back
 * modal prefill. Mirrors the HV web equivalent.
 */
interface HoldBackPrefill {
  taxon: 'snake' | 'lizard';
  scientific_name: string | null;
  reptile_species_id: string | null;
  hatch_date: string | null;
}

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

  // Hold-back modal — same pattern as the HV web equivalent. Parent
  // species prefill is lazy-loaded on first open and cached.
  const [holdBackOpen, setHoldBackOpen] = useState(false);
  const [holdBackPrefill, setHoldBackPrefill] =
    useState<HoldBackPrefill | null>(null);
  const [holdBackLoading, setHoldBackLoading] = useState(false);
  const [holdBackPrefillError, setHoldBackPrefillError] = useState<
    string | null
  >(null);
  const [holdBackName, setHoldBackName] = useState('');
  const [holdBackSex, setHoldBackSex] = useState<'male' | 'female' | 'unknown'>(
    'unknown',
  );
  const [holdBackCreating, setHoldBackCreating] = useState(false);
  const [holdBackError, setHoldBackError] = useState<string | null>(null);
  const [linkedRecordName, setLinkedRecordName] = useState<string | null>(null);

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

  /**
   * Open hold-back modal and lazy-fetch parent species/taxon prefill.
   * Cached after first open. Soft-fails on parent fetch — keeper can
   * still type the species manually.
   */
  async function openHoldBack() {
    setHoldBackOpen(true);
    setHoldBackError(null);
    if (holdBackPrefill || holdBackLoading || !offspring) return;
    setHoldBackLoading(true);
    setHoldBackPrefillError(null);
    try {
      const clutch = await getClutch(offspring.clutch_id);
      const pairing = await getPairing(clutch.pairing_id);
      const taxon = pairing.taxon;
      let scientific_name: string | null = null;
      let reptile_species_id: string | null = null;
      try {
        if (taxon === 'snake' && pairing.male_snake_id) {
          const m = await getSnake(pairing.male_snake_id);
          scientific_name = m.scientific_name;
          reptile_species_id = m.reptile_species_id;
        } else if (taxon === 'lizard' && pairing.male_lizard_id) {
          const m = await getLizard(pairing.male_lizard_id);
          scientific_name = m.scientific_name;
          reptile_species_id = m.reptile_species_id;
        }
      } catch {
        // fall through to female
      }
      if (!scientific_name) {
        try {
          if (taxon === 'snake' && pairing.female_snake_id) {
            const f = await getSnake(pairing.female_snake_id);
            scientific_name = f.scientific_name;
            reptile_species_id = f.reptile_species_id;
          } else if (taxon === 'lizard' && pairing.female_lizard_id) {
            const f = await getLizard(pairing.female_lizard_id);
            scientific_name = f.scientific_name;
            reptile_species_id = f.reptile_species_id;
          }
        } catch {
          // soft-fail; keeper can still proceed.
        }
      }
      setHoldBackPrefill({
        taxon,
        scientific_name,
        reptile_species_id,
        hatch_date: clutch.hatch_date,
      });
    } catch (err: any) {
      setHoldBackPrefillError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not load parent species info for prefill.',
      );
    } finally {
      setHoldBackLoading(false);
    }
  }

  /**
   * Create the live snake/lizard record from the offspring + parent
   * prefill, then link it back via PUT. Flips status to 'kept' if it
   * wasn't already since the keeper has made the call.
   */
  async function handleHoldBackSubmit() {
    if (!offspring || holdBackCreating) return;
    if (!holdBackName.trim()) {
      setHoldBackError('Give your new reptile a name first.');
      return;
    }
    setHoldBackError(null);
    setHoldBackCreating(true);
    try {
      const morphLabelLine = offspring.morph_label
        ? `Morph: ${offspring.morph_label}.`
        : null;
      const hatchedLine = holdBackPrefill?.hatch_date
        ? `Hatched ${holdBackPrefill.hatch_date}.`
        : 'Hatched from this clutch.';
      const noteLines = [hatchedLine, morphLabelLine].filter(
        (l): l is string => Boolean(l),
      );

      if (holdBackPrefill?.taxon === 'lizard') {
        const payload: CreateLizardPayload = {
          name: holdBackName.trim(),
          sex: holdBackSex,
          source: 'bred',
          hatch_date: holdBackPrefill?.hatch_date ?? null,
          scientific_name: holdBackPrefill?.scientific_name ?? null,
          reptile_species_id: holdBackPrefill?.reptile_species_id ?? null,
          notes: noteLines.join('\n'),
          current_weight_g: offspring.hatch_weight_g ?? null,
          current_length_in: offspring.hatch_length_in ?? null,
        };
        const created = await createLizard(payload);
        await updateOffspring(offspring.id, {
          lizard_id: created.id,
          status: offspring.status === 'kept' ? undefined : 'kept',
        });
      } else {
        // Defaults to snake — taxon is required on the parent pairing,
        // so this is a paranoid fallback.
        const payload: CreateSnakePayload = {
          name: holdBackName.trim(),
          sex: holdBackSex,
          source: 'bred',
          hatch_date: holdBackPrefill?.hatch_date ?? null,
          scientific_name: holdBackPrefill?.scientific_name ?? null,
          reptile_species_id: holdBackPrefill?.reptile_species_id ?? null,
          notes: noteLines.join('\n'),
          current_weight_g: offspring.hatch_weight_g ?? null,
          current_length_in: offspring.hatch_length_in ?? null,
        };
        const created = await createSnake(payload);
        await updateOffspring(offspring.id, {
          snake_id: created.id,
          status: offspring.status === 'kept' ? undefined : 'kept',
        });
      }
      const refreshed = await getOffspring(offspring.id);
      setOffspring(refreshed);
      setLinkedRecordName(holdBackName.trim());
      setHoldBackOpen(false);
      setHoldBackName('');
      setHoldBackSex('unknown');
    } catch (err: any) {
      setHoldBackError(
        err?.response?.data?.detail ||
          err?.message ||
          'Something went wrong creating the record.',
      );
    } finally {
      setHoldBackCreating(false);
    }
  }

  // Fetch the linked record's name so the linked card shows what it's
  // linked to rather than a generic indicator.
  useEffect(() => {
    if (!offspring) {
      setLinkedRecordName(null);
      return;
    }
    if (offspring.snake_id) {
      getSnake(offspring.snake_id)
        .then((s) =>
          setLinkedRecordName(
            s.name || s.common_name || s.scientific_name || 'Snake record',
          ),
        )
        .catch(() => setLinkedRecordName(null));
    } else if (offspring.lizard_id) {
      getLizard(offspring.lizard_id)
        .then((l) =>
          setLinkedRecordName(
            l.name || l.common_name || l.scientific_name || 'Lizard record',
          ),
        )
        .catch(() => setLinkedRecordName(null));
    } else {
      setLinkedRecordName(null);
    }
  }, [offspring?.snake_id, offspring?.lizard_id]);

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
              </View>

              {offspring.notes && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {offspring.notes}
                </Text>
              )}
            </View>

            {/* Linked-to-collection card or hold-back CTA. Three states:
                1. Already linked → tap to open the live record.
                2. Status allows hold-back → "Add to collection" CTA.
                3. Otherwise (sold/traded/gifted/deceased) → render
                   nothing — the offspring is out of the keeper's hands. */}
            {offspring.snake_id || offspring.lizard_id ? (
              <TouchableOpacity
                onPress={() => {
                  if (offspring.snake_id) {
                    router.push(`/reptile/${offspring.snake_id}` as never);
                  } else if (offspring.lizard_id) {
                    router.push(`/lizard/${offspring.lizard_id}` as never);
                  }
                }}
                accessibilityRole="link"
                style={[
                  styles.linkedCard,
                  {
                    borderColor: 'rgba(45,212,191,0.4)',
                    backgroundColor: 'rgba(45,212,191,0.10)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <Text style={[styles.linkedLabel, { color: '#5eead4' }]}>
                  LINKED TO COLLECTION
                </Text>
                <Text
                  style={[styles.linkedValue, { color: '#99f6e4' }]}
                  numberOfLines={1}
                >
                  {linkedRecordName ??
                    `Open ${offspring.snake_id ? 'snake' : 'lizard'} record`}
                </Text>
                <Text style={[styles.linkedHelp, { color: '#5eead4' }]}>
                  The live record&rsquo;s own genotype is authoritative.
                </Text>
              </TouchableOpacity>
            ) : showHoldBackCta(offspring.status) ? (
              <View
                style={[
                  styles.ctaCard,
                  {
                    borderColor: 'rgba(190,242,100,0.4)',
                    backgroundColor: 'rgba(190,242,100,0.10)',
                    borderRadius: layout.radius.sm,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.ctaTitle, { color: '#bef264' }]}>
                    Holding this one back?
                  </Text>
                  <Text style={[styles.ctaHelp, { color: '#d9f99d' }]}>
                    Create a live reptile record — species, hatch date,
                    and weight prefill from this clutch.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openHoldBack}
                  accessibilityRole="button"
                  accessibilityLabel="Add to collection"
                  style={[styles.ctaButton, { borderRadius: layout.radius.sm }]}
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

      {/* Hold-back modal — creates a live snake/lizard record and links
          it to this offspring. */}
      {offspring && (
        <HoldBackModal
          visible={holdBackOpen}
          prefill={holdBackPrefill}
          prefillLoading={holdBackLoading}
          prefillError={holdBackPrefillError}
          morphLabel={offspring.morph_label}
          name={holdBackName}
          onNameChange={setHoldBackName}
          sex={holdBackSex}
          onSexChange={setHoldBackSex}
          creating={holdBackCreating}
          error={holdBackError}
          onClose={() => {
            if (!holdBackCreating) setHoldBackOpen(false);
          }}
          onSubmit={handleHoldBackSubmit}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Visibility predicate for the hold-back CTA. Same logic as the HV web
 * equivalent — shows on statuses where the keeper hasn't disposed of
 * the hatchling.
 */
function showHoldBackCta(status: OffspringStatus): boolean {
  return (
    status === 'hatched' ||
    status === 'kept' ||
    status === 'available' ||
    status === 'unknown'
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

function HoldBackModal({
  visible,
  prefill,
  prefillLoading,
  prefillError,
  morphLabel,
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
  prefill: HoldBackPrefill | null;
  prefillLoading: boolean;
  prefillError: string | null;
  morphLabel: string | null;
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  Creates a live {prefill?.taxon ?? 'reptile'} record and
                  links it back to this offspring entry.
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
                  {prefillLoading ? (
                    <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                      Loading parent info…
                    </Text>
                  ) : prefillError ? (
                    <Text
                      style={{
                        color: '#fcd34d',
                        fontSize: 12,
                        lineHeight: 17,
                      }}
                    >
                      {prefillError} You can still create the record — it
                      just won&rsquo;t auto-fill the species.
                    </Text>
                  ) : (
                    <>
                      <PrefillRow
                        label="Taxon"
                        value={
                          prefill?.taxon === 'lizard'
                            ? '🦎 Lizard'
                            : '🐍 Snake'
                        }
                      />
                      <PrefillRow
                        label="Species"
                        value={
                          prefill?.scientific_name || 'Not set on parents'
                        }
                        muted={!prefill?.scientific_name}
                      />
                      <PrefillRow
                        label="Hatch date"
                        value={prefill?.hatch_date ?? 'Not recorded'}
                        muted={!prefill?.hatch_date}
                      />
                      <PrefillRow label="Source" value="Bred" />
                    </>
                  )}
                </View>

                {/* Name */}
                <Text
                  style={[styles.formLabel, { color: colors.textSecondary }]}
                >
                  NAME *
                </Text>
                <TextInput
                  value={name}
                  onChangeText={onNameChange}
                  placeholder={
                    morphLabel ? `${morphLabel} hold-back` : 'e.g. Hold-back #1'
                  }
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
                              ? 'rgba(190,242,100,0.16)'
                              : colors.background,
                            borderColor: selected
                              ? 'rgba(190,242,100,0.5)'
                              : colors.border,
                            borderRadius: layout.radius.sm,
                            opacity: creating ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? '#bef264' : colors.textPrimary,
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
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: 11,
                    lineHeight: 15,
                    marginTop: 6,
                  }}
                >
                  Set to unknown if it&rsquo;s too young to sex — you can
                  update it on the reptile detail page later.
                </Text>

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

  // Linked-to-collection card.
  linkedCard: {
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  linkedLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  linkedValue: { fontSize: 14, fontWeight: '700' },
  linkedHelp: { fontSize: 11, lineHeight: 15, marginTop: 4 },

  // Hold-back CTA card.
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
    backgroundColor: '#bef264',
  },
  ctaButtonText: {
    color: '#022c22',
    fontWeight: '700',
    fontSize: 13,
  },

  // Hold-back modal styles.
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
    backgroundColor: '#bef264',
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

export default withErrorBoundary(OffspringDetailScreen, 'offspring-detail');
