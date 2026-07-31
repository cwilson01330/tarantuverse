import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../src/components/AppHeader';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';

interface FeedingStatus {
  id: string;
  name: string | null;
  common_name: string | null;
  scientific_name: string | null;
  taxon: string;
  photo_url: string | null;
  life_stage: string | null;
  last_feeding_date: string | null;
  days_since_last_feeding: number | null;
  is_feeding_paused: boolean;
  is_overdue: boolean;
  interval_days: number | null;
  /** 'species' = from the care sheet; 'stage_default' / 'generic_default' = a
   *  guess. Never render a default as a species schedule. */
  interval_source: string | null;
}

type FilterKey = 'all' | 'overdue' | 'never';

const FOOD_CHIPS = ['Crickets', 'Dubia', 'Roaches', 'Mealworms'];

const STATUS = {
  overdue: '#dc2626',
  paused: '#d97706',
  ok: '#16a34a',
};

function taxonEmoji(taxon: string): string {
  switch (taxon) {
    case 'scorpion':
      return '🦂';
    case 'roach':
      return '🪳';
    case 'centipede':
    case 'millipede':
    case 'other':
      return '🐛';
    case 'mantis':
      return '🦗';
    default:
      return '🕷️'; // tarantula, true_spider, whip_spider, vinegaroon
  }
}

function displayName(a: FeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}

export default function FeedingDayScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [items, setItems] = useState<FeedingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Batch sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [outcome, setOutcome] = useState<'fed' | 'refused'>('fed');
  const [foodType, setFoodType] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset();
      const res = await apiClient.get<FeedingStatus[]>(
        `/inverts/feeding-status?tz_offset_minutes=${tz}`
      );
      setItems(res.data ?? []);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to load animals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      overdue: items.filter((i) => i.is_overdue).length,
      never: items.filter((i) => i.days_since_last_feeding === null).length,
    }),
    [items]
  );

  const shown = useMemo(() => {
    if (filter === 'overdue') return items.filter((i) => i.is_overdue);
    if (filter === 'never') return items.filter((i) => i.days_since_last_feeding === null);
    return items;
  }, [items, filter]);

  const shownIds = useMemo(() => shown.map((i) => i.id), [shown]);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) {
        shownIds.forEach((id) => next.delete(id));
      } else {
        shownIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Cleared on the next fetch; purely informational.
  const [resumedNote, setResumedNote] = useState('');

  const [resumingId, setResumingId] = useState<string | null>(null);

  /** Lift a pause from the list, with a confirmation.
   *
   *  Confirmed rather than instant because a pause encodes a husbandry
   *  judgment — "this one is in premolt, leave it alone" — and an accidental
   *  tap would put the animal straight back into overdue nagging. Cheap to
   *  redo, but the tap is easy to make by accident while scanning a list.
   */
  const confirmResume = (a: FeedingStatus) => {
    Alert.alert(
      `Resume feeding for ${displayName(a)}?`,
      'It will start appearing in overdue checks again.',
      [
        { text: 'Keep paused', style: 'cancel' },
        {
          text: 'Resume',
          onPress: async () => {
            setResumingId(a.id);
            try {
              await apiClient.put(`/inverts/${a.id}`, {
                feeding_paused_reason: null,
                feeding_paused_until: null,
              });
              await fetchStatus();
            } catch (e: any) {
              setLoadError(
                e?.response?.data?.detail || e?.message || 'Could not resume feeding',
              );
            } finally {
              setResumingId(null);
            }
          },
        },
      ],
    );
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post<{
        created_count: number;
        skipped: any[];
        resumed_ids: string[];
      }>(
        '/inverts/bulk-feedings',
        {
          invert_ids: Array.from(selected),
          accepted: outcome === 'fed',
          food_type: foodType.trim() || undefined,
          notes: notes.trim() || undefined,
        }
      );
      const n = res.data?.created_count ?? 0;
      const resumed = res.data?.resumed_ids?.length ?? 0;
      setSheetOpen(false);
      setSelected(new Set());
      setFoodType('');
      setNotes('');
      await fetchStatus();
      setLoadError('');
      // Resuming a pause is a state change the KEEPER made deliberately when
      // they paused, so undoing it silently would be wrong even though the
      // undo is correct. Say it happened; stay quiet on an ordinary feeding.
      setResumedNote(
        resumed > 0
          ? `${resumed} paused ${resumed === 1 ? 'animal' : 'animals'} resumed — they ate.`
          : '',
      );
      void n;
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to log feeding');
    } finally {
      setSubmitting(false);
    }
  };

  const backAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const statusPill = (a: FeedingStatus) => {
    if (a.is_feeding_paused) return { label: 'Paused', color: STATUS.paused };
    if (a.days_since_last_feeding === null) return { label: 'Never fed', color: STATUS.overdue };
    if (a.is_overdue) return { label: `${a.days_since_last_feeding}d ago`, color: STATUS.overdue };
    return { label: `${a.days_since_last_feeding}d ago`, color: colors.textTertiary };
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'overdue', label: `Overdue (${counts.overdue})` },
    { key: 'never', label: `Never fed (${counts.never})` },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Feeding Day" subtitle="Log feeding for many at once" leftAction={backAction} />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsInner}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  borderRadius: layout.radius.lg,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Select all shown */}
      {!loading && shown.length > 0 && (
        <TouchableOpacity onPress={toggleAllShown} style={styles.selectAllRow} accessibilityRole="button">
          <MaterialCommunityIcons
            name={allShownSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={allShownSelected ? colors.primary : colors.textTertiary}
          />
          <Text style={[styles.selectAllText, { color: colors.textSecondary }]}>
            {allShownSelected ? 'Deselect all' : 'Select all shown'}
            {selected.size > 0 ? `  ·  ${selected.size} selected` : ''}
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStatus(); }} tintColor={colors.primary} />
        }
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {loadError !== '' && !loading && (
          <View style={[styles.errorCard, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.error ?? '#ef4444' }]}>
            <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>{loadError}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); setLoadError(''); fetchStatus(); }}>
              <Text style={[styles.retryText, { color: colors.error ?? '#b91c1c' }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* An accepted feeding resumes a paused animal server-side. Announce it
            rather than letting the Paused pill quietly vanish — the keeper set
            that pause on purpose and deserves to know it's been lifted. */}
        {resumedNote !== '' && (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: 'rgba(34, 197, 94, 0.12)', borderColor: colors.success ?? '#22c55e' },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.errorText, { color: colors.success ?? '#15803d' }]}>
              {resumedNote}
            </Text>
            <TouchableOpacity onPress={() => setResumedNote('')} accessibilityLabel="Dismiss">
              <Text style={[styles.retryText, { color: colors.success ?? '#15803d' }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && shown.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nothing here</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {filter === 'all' ? 'Add animals to your collection to feed them here.' : 'No animals match this filter.'}
            </Text>
          </View>
        )}

        {!loading && shown.map((a) => {
          const isSel = selected.has(a.id);
          const pill = statusPill(a);
          return (
            <TouchableOpacity
              key={a.id}
              onPress={() => toggle(a.id)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSel }}
              accessibilityLabel={`${displayName(a)}, ${pill.label}`}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: isSel ? colors.primary : colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isSel ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={isSel ? colors.primary : colors.textTertiary}
              />
              {a.photo_url ? (
                <Image source={{ uri: a.photo_url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumbPlaceholder, { backgroundColor: colors.background }]}>
                  <Text style={styles.thumbEmoji}>{taxonEmoji(a.taxon)}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {displayName(a)}
                </Text>
                {a.scientific_name ? (
                  <Text style={[styles.rowSci, { color: colors.textTertiary }]} numberOfLines={1}>
                    {a.scientific_name}
                  </Text>
                ) : null}
                {(() => {
                  const stageLabel = a.life_stage
                    ? a.life_stage.charAt(0).toUpperCase() + a.life_stage.slice(1)
                    : null;
                  // "every ~7d" is a claim about this species. Only make it
                  // when the number came from a care sheet — otherwise label
                  // it a default so our guess doesn't read as guidance.
                  const cadence = a.interval_days
                    ? a.interval_source === 'species'
                      ? `every ~${a.interval_days}d`
                      : `~${a.interval_days}d (default)`
                    : a.taxon === 'millipede'
                      ? 'grazer'
                      : null;
                  const meta = [stageLabel, cadence].filter(Boolean).join(' · ');
                  return meta ? (
                    <Text style={[styles.rowMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                      {meta}
                    </Text>
                  ) : null;
                })()}
              </View>
              {/* The Paused pill is tappable — Feeding Day is where a keeper
                  notices a pause is stale ("this one's been paused since
                  April"), and until now the only way to lift it was to leave,
                  find the animal, and open its detail screen. That distance is
                  why pauses outlive their reason. */}
              {a.is_feeding_paused ? (
                <TouchableOpacity
                  onPress={() => confirmResume(a)}
                  disabled={resumingId === a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayName(a)} is paused. Tap to resume feeding.`}
                  style={[styles.pill, { backgroundColor: `${pill.color}22` }]}
                >
                  <Text style={[styles.pillText, { color: pill.color }]}>
                    {resumingId === a.id ? 'Resuming…' : 'Paused ✕'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.pill, { backgroundColor: `${pill.color}22` }]}>
                  <Text style={[styles.pillText, { color: pill.color }]}>{pill.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Action bar */}
      {selected.size > 0 && (
        <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <PrimaryButton
            onPress={() => setSheetOpen(true)}
            style={styles.actionBtn}
            outerStyle={{ borderRadius: layout.radius.lg, flex: 1 }}
          >
            <Text style={styles.actionBtnText}>Log feeding for {selected.size}</Text>
          </PrimaryButton>
        </View>
      )}

      {/* Batch sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => !submitting && setSheetOpen(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={'padding'}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: layout.radius.lg, borderTopRightRadius: layout.radius.lg, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandleWrap}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {selected.size} {selected.size === 1 ? 'animal' : 'animals'}
            </Text>

            {/* Outcome toggle */}
            <View style={styles.outcomeRow}>
              {(['fed', 'refused'] as const).map((o) => {
                const active = outcome === o;
                return (
                  <TouchableOpacity
                    key={o}
                    onPress={() => setOutcome(o)}
                    style={[
                      styles.outcomeBtn,
                      {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                  >
                    <Text style={[styles.outcomeText, { color: active ? '#fff' : colors.textSecondary }]}>
                      {o === 'fed' ? 'Fed' : 'Refused'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Food type */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Food type (optional)</Text>
            <TextInput
              value={foodType}
              onChangeText={setFoodType}
              placeholder="e.g. Crickets"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary, borderRadius: layout.radius.sm }]}
            />
            <View style={styles.foodChips}>
              {FOOD_CHIPS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFoodType(f)}
                  style={[styles.foodChip, { borderColor: colors.border, borderRadius: layout.radius.lg }]}
                >
                  <Text style={[styles.foodChipText, { color: colors.textSecondary }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Note */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Note (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Applies to all selected"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary, borderRadius: layout.radius.sm }]}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={() => setSheetOpen(false)}
                disabled={submitting}
                style={[styles.ghostBtn, { borderColor: colors.border, borderRadius: layout.radius.md }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <PrimaryButton
                onPress={submit}
                disabled={submitting}
                style={styles.confirmBtn}
                outerStyle={{ borderRadius: layout.radius.md, flex: 1 }}
              >
                <Text style={styles.actionBtnText}>
                  {submitting ? 'Saving…' : outcome === 'fed' ? `Mark ${selected.size} fed` : `Mark ${selected.size} refused`}
                </Text>
              </PrimaryButton>
            </View>
            <View style={{ height: 8 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 4 },
  chipsRow: { flexGrow: 0, paddingVertical: 12 },
  chipsInner: { paddingHorizontal: 16, gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  selectAllText: { fontSize: 13, fontWeight: '600' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: { padding: 14, borderWidth: 1, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  thumb: { width: 42, height: 42, borderRadius: 8 },
  thumbPlaceholder: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 22 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSci: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  rowMeta: { fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  actionBtn: { paddingVertical: 14 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderWidth: 1, padding: 20, paddingBottom: 28 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  outcomeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  outcomeBtn: { flex: 1, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  outcomeText: { fontSize: 15, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
  foodChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 16 },
  foodChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  foodChipText: { fontSize: 13, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ghostBtn: { borderWidth: 1, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  confirmBtn: { paddingVertical: 12 },
});
