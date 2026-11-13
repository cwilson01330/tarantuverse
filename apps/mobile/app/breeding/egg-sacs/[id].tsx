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
 * Edit (keepers): date laid / born, expected hatch (egg layers), count
 * (live birth), notes -- PUT /egg-sacs/{id}, partial. Taxon-dependent words
 * (Laid/Born, egg sac/ootheca/brood) render only once the mother's taxon is
 * known, so a scorpion brood never flashes "Laid".
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../src/components/AppHeader';
import { withErrorBoundary } from '../../../src/components/ErrorBoundary';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { apiClient } from '../../../src/services/api';
import { parseLocalDate, toISODateLocal } from '../../../src/utils/date';
import { SPACING, TYPE } from '../../../src/theme/tokens';
import DateInput from '../../../src/components/DateInput';
import { HatchSheet } from '../../../src/components/HatchSheet';
import UpgradeModal from '../../../src/components/UpgradeModal';
import { useAuth } from '../../../src/contexts/AuthContext';
import { can, useCollectionRole } from '../../../src/lib/co-keepers';
import { sacStatus, sacStatusLabel, splitCapText } from '../../../src/lib/broods';
import { clutchSingularLabel, hatchButtonLabel, isLiveBirth, offspringNoun } from '../../../src/lib/taxon-modules';
import { buildSacEditPayload, type CapDetail, type EggSac } from '../../../src/lib/egg-sacs';
import { failEggSac } from '../../../src/lib/egg-sacs-api';
import { getInvert } from '../../../src/lib/inverts';
import { getErrorMessage } from '../../../src/utils/errors';

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

  // Hatch / fail. The mother's taxon picks the words (egg sac, ootheca...).
  const { user } = useAuth();
  const { role } = useCollectionRole(user?.id, sac?.user_id);
  const canKeep = can(role, 'keeper');
  // null until the mother is read; a sac with no mother (older pairing
  // sacs) or an unreadable one falls back to tarantula, as before.
  const [motherTaxon, setMotherTaxon] = useState<string | null>(null);
  const [motherFailed, setMotherFailed] = useState(false);
  const [hatchOpen, setHatchOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [failing, setFailing] = useState(false);
  const [actionError, setActionError] = useState('');
  const motherId = sac?.mother_invert_id ?? null;
  useEffect(() => {
    if (!motherId) return;
    getInvert(motherId)
      .then((m) => {
        if (m?.taxon) setMotherTaxon(m.taxon);
        else setMotherFailed(true);
      })
      .catch(() => setMotherFailed(true));
  }, [motherId]);
  const taxonPending = !!motherId && motherTaxon === null && !motherFailed;
  const taxon = motherTaxon ?? 'tarantula';
  const live = isLiveBirth(taxon);
  const noun = clutchSingularLabel(taxon);
  const dateWord = live ? 'Born' : 'Laid';

  // Edit (keepers). Seeded from the sac each time it opens.
  const [editOpen, setEditOpen] = useState(false);
  const [editLaid, setEditLaid] = useState<Date>(new Date());
  const [editExpected, setEditExpected] = useState<Date | null>(null);
  const [editCount, setEditCount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const openEdit = () => {
    if (!sac) return;
    setEditLaid(parseLocalDate(sac.laid_date) ?? new Date());
    setEditExpected(sac.expected_hatch_date ? parseLocalDate(sac.expected_hatch_date) : null);
    setEditCount(sac.spiderling_count != null ? String(sac.spiderling_count) : '');
    setEditNotes(sac.notes ?? '');
    setEditError('');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!sac || editSaving) return;
    const built = buildSacEditPayload({
      laidDate: toISODateLocal(editLaid),
      expectedHatch: editExpected ? toISODateLocal(editExpected) : null,
      countText: editCount,
      notes: editNotes,
      liveBirth: live,
    });
    if (!built.ok) {
      setEditError(built.error);
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const r = await apiClient.put<EggSac>(`/egg-sacs/${sac.id}`, built.payload);
      setSac(r.data);
      setEditOpen(false);
    } catch (err: any) {
      setEditError(getErrorMessage(err, "Couldn't save that. Nothing has changed. Try again."));
    }
    setEditSaving(false);
  };

  const reloadSac = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiClient.get<EggSac>(`/egg-sacs/${id}`);
      setSac(r.data);
    } catch {
      /* the next focus reload will try again */
    }
  }, [id]);

  const handleCap = (detail: CapDetail) => {
    setHatchOpen(false);
    if (role && role !== 'owner') {
      Alert.alert('Collection is full', 'This collection is at its free-plan limit. The owner can upgrade to add more.');
      return;
    }
    Alert.alert('Collection is full', `${splitCapText(detail.can_add ?? 0)}.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'See plans', onPress: () => setUpgradeOpen(true) },
    ]);
  };

  const handleFail = () => {
    if (!sac || failing) return;
    Alert.alert(
      `Mark as didn't hatch?`,
      `This ${noun.toLowerCase()} stays in your records, marked as not hatched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "Didn't hatch",
          onPress: async () => {
            setFailing(true);
            setActionError('');
            try {
              await failEggSac(sac.id);
              await reloadSac();
            } catch (err: any) {
              setActionError(getErrorMessage(err, "Couldn't save that. Nothing has changed."));
            }
            setFailing(false);
          },
        },
      ],
    );
  };

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
      `Delete ${noun.toLowerCase()}?`,
      `${dateWord} ${fmtDate(sac.laid_date)}${suffix}`,
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
    if (live) {
      // A brood is born, not laid: no incubation step to show.
      const st = sacStatus(sac);
      return { label: sacStatusLabel(st, true), color: st === 'waiting' ? PILL_LAID : PILL_HATCHED };
    }
    if (sac.hatch_date) {
      return { label: 'Hatched', color: PILL_HATCHED };
    }
    if (sac.pulled_date || sac.spiderling_count != null) {
      return { label: 'Incubating', color: PILL_INCUBATING };
    }
    return { label: 'Laid', color: PILL_LAID };
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
        title={taxonPending ? '' : noun}
        leftAction={backButton}
        rightAction={
          sac && !deleting ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${noun.toLowerCase()}`}
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
                    {taxonPending ? ' ' : dateWord.toUpperCase()}
                  </Text>
                  <Text
                    style={[styles.heroValue, { color: colors.textPrimary }]}
                  >
                    {fmtDate(sac.laid_date)}
                  </Text>
                </View>
                {!taxonPending && (
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
                    {sac.outcome ? sacStatusLabel(sacStatus(sac), live) : lifecycleStatus.label}
                  </Text>
                </View>
                )}
              </View>
              {canKeep && !taxonPending && !editOpen && (
                <TouchableOpacity
                  onPress={openEdit}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${noun.toLowerCase()}`}
                  style={[styles.editBtn, { borderColor: colors.border, borderRadius: layout.radius.sm }]}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.textSecondary} />
                  <Text style={[TYPE.label, { color: colors.textPrimary }]}>Edit</Text>
                </TouchableOpacity>
              )}

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
                      {offspringNoun(taxon)}
                    </Text>
                  </Text>
                </View>
              )}

              <View style={styles.kvGrid}>
                {sac.pulled_date && (
                  <KV label="Pulled" value={fmtDate(sac.pulled_date)} />
                )}
                {!live && !taxonPending && sac.expected_hatch_date && !sac.hatch_date && (
                  <KV label="Expected hatch" value={fmtDate(sac.expected_hatch_date)} />
                )}
                {sac.hatch_date && (
                  <KV label={live ? 'Grouped' : 'Hatched'} value={fmtDate(sac.hatch_date)} />
                )}
                {sac.spiderling_count != null && (
                  <KV
                    label={live ? 'Count' : offspringNoun(taxon)}
                    value={String(sac.spiderling_count)}
                  />
                )}
                {sac.viable_count != null && (
                  <KV label="Viable" value={String(sac.viable_count)} />
                )}
              </View>

              {sac.notes && !editOpen && (
                <Text style={[styles.notes, { color: colors.textSecondary }]}>
                  {sac.notes}
                </Text>
              )}

              {editOpen && (
                <View style={[styles.editForm, { borderTopColor: colors.border }]}>
                  <Text style={[TYPE.caption, styles.editLabel, { color: colors.textTertiary }]}>
                    {live ? 'DATE BORN' : 'DATE LAID'}
                  </Text>
                  <DateInput value={editLaid} onChange={setEditLaid} maximumDate={new Date()} label={live ? 'Date born' : 'Date laid'} />

                  {!live && (
                    <>
                      <Text style={[TYPE.caption, styles.editLabel, { color: colors.textTertiary }]}>EXPECTED HATCH · OPTIONAL</Text>
                      <DateInput value={editExpected ?? editLaid} onChange={setEditExpected} futureYears={1} label="Expected hatch" />
                      {editExpected && (
                        <TouchableOpacity onPress={() => setEditExpected(null)} accessibilityRole="button">
                          <Text style={[TYPE.label, { color: colors.accent }]}>Clear expected hatch</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {live && (
                    <>
                      <Text style={[TYPE.caption, styles.editLabel, { color: colors.textTertiary }]}>COUNT · OPTIONAL</Text>
                      <TextInput
                        value={editCount}
                        onChangeText={setEditCount}
                        keyboardType="number-pad"
                        placeholderTextColor={colors.textTertiary}
                        style={[TYPE.body, styles.editInput, { borderColor: colors.border, borderRadius: layout.radius.sm, color: colors.textPrimary, backgroundColor: colors.surface }]}
                        accessibilityLabel="Count"
                      />
                    </>
                  )}

                  <Text style={[TYPE.caption, styles.editLabel, { color: colors.textTertiary }]}>NOTES · OPTIONAL</Text>
                  <TextInput
                    value={editNotes}
                    onChangeText={setEditNotes}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={colors.textTertiary}
                    style={[TYPE.body, styles.editInput, styles.editTextarea, { borderColor: colors.border, borderRadius: layout.radius.sm, color: colors.textPrimary, backgroundColor: colors.surface }]}
                    accessibilityLabel="Notes"
                  />

                  {editError !== '' && (
                    <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
                      {editError}
                    </Text>
                  )}

                  <View style={styles.editActions}>
                    <TouchableOpacity
                      onPress={() => setEditOpen(false)}
                      disabled={editSaving}
                      accessibilityRole="button"
                      style={[styles.failBtn, styles.editActionBtn, { borderColor: colors.border, borderRadius: layout.radius.md }]}
                    >
                      <Text style={[styles.offspringTitle, { color: colors.textPrimary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveEdit}
                      disabled={editSaving}
                      accessibilityRole="button"
                      style={[styles.hatchBtn, styles.editActionBtn, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md }, editSaving && { opacity: 0.6 }]}
                    >
                      {editSaving ? (
                        <ActivityIndicator color={colors.background} />
                      ) : (
                        <Text style={[styles.hatchBtnText, { color: colors.background }]}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Group made from this sac, or the way to make one. Works
                without a pairing; needs the mother (the API answers 400
                without one). */}
            {sac.hatched_colony ? (
              <TouchableOpacity
                onPress={() => router.push(`/colony/${sac.hatched_colony!.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={`Open group ${sac.hatched_colony.name}`}
                style={[
                  styles.groupRow,
                  { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: layout.radius.md },
                ]}
              >
                <MaterialCommunityIcons name="account-group-outline" size={20} color={colors.textSecondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>GROUP</Text>
                  <Text style={[styles.offspringTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sac.hatched_colony.name}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
            {canKeep && !taxonPending && sac.mother_invert_id && (sacStatus(sac) === 'waiting' || sacStatus(sac) === 'failed') ? (
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setHatchOpen(true)}
                  accessibilityRole="button"
                  style={[styles.hatchBtn, { backgroundColor: colors.textPrimary, borderRadius: layout.radius.md }]}
                >
                  <Text style={[styles.hatchBtnText, { color: colors.background }]}>{hatchButtonLabel(taxon)}</Text>
                </TouchableOpacity>
                {sacStatus(sac) === 'waiting' && !live ? (
                  <TouchableOpacity
                    onPress={handleFail}
                    disabled={failing}
                    accessibilityRole="button"
                    style={[styles.failBtn, { borderColor: colors.border, borderRadius: layout.radius.md }, failing && { opacity: 0.6 }]}
                  >
                    {failing ? (
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                    ) : (
                      <Text style={[styles.offspringTitle, { color: colors.textPrimary }]}>Didn&apos;t hatch</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {actionError !== '' && (
                  <Text style={[styles.offspringMeta, { color: colors.error }]} accessibilityLiveRegion="polite">
                    {actionError}
                  </Text>
                )}
              </View>
            ) : null}

            <View>
              <View style={styles.sectionHeaderRow}>
                <Text
                  style={[styles.sectionLabel, { color: colors.textTertiary }]}
                >
                  OFFSPRING{' '}
                  <Text style={{ fontWeight: '400' }}>
                    ({offspring?.length ?? 0})
                  </Text>
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      `/breeding/egg-sacs/${sac.id}/offspring/new` as never,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Add offspring"
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
                    Add offspring
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
                    No offspring recorded for this {noun.toLowerCase()} yet. Tap{' '}
                    <Text style={{ fontWeight: '600' }}>Add offspring</Text>{' '}
                    to log one — status, sale info, and buyer
                    notes per individual.
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

      {sac && sac.mother_invert_id ? (
        <HatchSheet
          visible={hatchOpen}
          onClose={() => setHatchOpen(false)}
          sacId={sac.id}
          taxon={taxon}
          initialCount={sac.spiderling_count}
          onHatched={(colonyId) => {
            setHatchOpen(false);
            router.replace(`/colony/${colonyId}` as never);
          }}
          onCap={handleCap}
        />
      ) : null}
      <UpgradeModal source="collection_cap" visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </SafeAreaView>
  );
}

const PILL_HATCHED = { fg: '#86efac', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)' };
const PILL_INCUBATING = { fg: '#fbbf24', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' };
const PILL_LAID = { fg: '#7dd3fc', bg: 'rgba(14,165,233,0.15)', border: 'rgba(14,165,233,0.4)' };

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

// Routes through parseLocalDate. A bare "YYYY-MM-DD" from a DATE column is
// parsed by `new Date()` as UTC midnight, and toLocaleDateString then rewinds
// it a day for everyone west of Greenwich — so a substrate change dated the
// 28th printed as the 27th for every keeper in the Americas. The helper in
// utils/date has anchored pure dates to the local calendar since it was
// written; these local copies simply never used it.
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = parseLocalDate(iso);
  if (!d || Number.isNaN(d.getTime())) return iso;
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

  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 12 },
  hatchBtn: { paddingVertical: 15, alignItems: 'center' },
  hatchBtnText: { ...TYPE.subheading },
  failBtn: { borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  editForm: { borderTopWidth: 1, paddingTop: SPACING.md, gap: SPACING.sm },
  editLabel: { letterSpacing: 0.5 },
  editInput: { borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  editTextarea: { minHeight: 88 },
  editActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  editActionBtn: { flex: 1 },

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
