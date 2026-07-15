/**
 * Feeding Day — bulk-log feedings across the whole collection.
 *
 * Mirrors the proven Tarantuverse mobile screen (apps/mobile/app/
 * feeding-day.tsx) on the Herpetoverse unified `animals` surface.
 *
 * Flow: fetch the neediest-first feeding-status board → filter (All /
 * Overdue / Never fed) → multi-select rows → a pinned bottom bar opens a
 * bottom sheet where the keeper picks Fed/Refused + optional food type +
 * note → one POST /animals/bulk-feedings covers every selected animal →
 * refetch.
 *
 * apiClient baseURL already includes /api/v1 (see feeding-status.ts), so
 * the lib helpers start at the resource. Styling reads ThemeContext
 * colors/layout — this app is dark-first; #0B0B0B is the on-primary text
 * color used everywhere (matches the collection FAB + empty-state CTA).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { useTheme } from '../src/contexts/ThemeContext';
import {
  ANIMAL_TAXA,
  bulkFeedAnimals,
  listAnimalFeedingStatus,
  type AnimalFeedingStatus,
} from '../src/lib/animals';

type FilterKey = 'all' | 'overdue' | 'never';

// Reptile/amphibian-forward quick chips. CGD + Greens cover the crestie /
// herbivore side; the rest are the standard prey items.
const FOOD_CHIPS = [
  'F/T mouse',
  'F/T rat',
  'Crickets',
  'Dubia',
  'Superworms',
  'Hornworms',
  'CGD',
  'Greens',
];

function displayName(a: AnimalFeedingStatus): string {
  return a.name || a.common_name || a.scientific_name || 'Unnamed';
}

function taxonGlyph(taxon: string): string {
  return ANIMAL_TAXA[taxon as keyof typeof ANIMAL_TAXA]?.glyph ?? '🦕';
}

function FeedingDayScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<AnimalFeedingStatus[]>([]);
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
      const rows = await listAnimalFeedingStatus(tz);
      setItems(rows ?? []);
      setLoadError('');
    } catch (e: any) {
      // 401 → interceptor already handles logout; stay quiet.
      if (e?.response?.status === 401) return;
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load animals',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus]),
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      overdue: items.filter((i) => i.is_overdue && i.status_mode !== 'daily').length,
      never: items.filter((i) => i.days_since_last_feeding === null).length,
    }),
    [items],
  );

  const shown = useMemo(() => {
    if (filter === 'overdue') return items.filter((i) => i.is_overdue && i.status_mode !== 'daily');
    if (filter === 'never')
      return items.filter((i) => i.days_since_last_feeding === null);
    return items;
  }, [items, filter]);

  const shownIds = useMemo(() => shown.map((i) => i.id), [shown]);
  const allShownSelected =
    shownIds.length > 0 && shownIds.every((id) => selected.has(id));

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

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await bulkFeedAnimals({
        animal_ids: Array.from(selected),
        accepted: outcome === 'fed',
        food_type: foodType.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSheetOpen(false);
      setSelected(new Set());
      setFoodType('');
      setNotes('');
      setLoadError('');
      await fetchStatus();
    } catch (e: any) {
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to log feeding',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusPill = (a: AnimalFeedingStatus) => {
    if (a.is_feeding_paused) return { label: 'Paused', color: colors.warning };
    // Frequent/daily feeders (e.g. insectivorous beardies) get a calm fed-today
    // check — never a red "days overdue" that would nag every morning.
    if (a.status_mode === 'daily') {
      return a.fed_today
        ? { label: 'Fed today', color: colors.success }
        : { label: 'Feed today', color: colors.textTertiary };
    }
    if (a.days_since_last_feeding === null)
      return { label: 'Never fed', color: colors.danger };
    if (a.is_overdue)
      return { label: `${a.days_since_last_feeding}d ago`, color: colors.danger };
    return {
      label: `${a.days_since_last_feeding}d ago`,
      color: colors.textTertiary,
    };
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'overdue', label: `Overdue (${counts.overdue})` },
    { key: 'never', label: `Never fed (${counts.never})` },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Feeding Day"
        subtitle="Log feeding for many at once"
        leftAction={<HeaderBackButton />}
      />

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
              accessibilityRole="button"
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
              <Text
                style={[
                  styles.chipText,
                  { color: active ? '#0B0B0B' : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Select all shown */}
      {!loading && shown.length > 0 && (
        <TouchableOpacity
          onPress={toggleAllShown}
          style={styles.selectAllRow}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={
              allShownSelected ? 'checkbox-marked' : 'checkbox-blank-outline'
            }
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchStatus();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {loadError !== '' && !loading && (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.danger,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchStatus();
              }}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && shown.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Nothing here
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'Add animals to your collection to feed them here.'
                : 'No animals match this filter.'}
            </Text>
          </View>
        )}

        {!loading &&
          shown.map((a) => {
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
                  <View
                    style={[
                      styles.thumbPlaceholder,
                      { backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    <Text style={styles.thumbEmoji}>{taxonGlyph(a.taxon)}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {displayName(a)}
                  </Text>
                  {a.scientific_name ? (
                    <Text
                      style={[styles.rowSci, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {a.scientific_name}
                    </Text>
                  ) : null}
                  {a.interval_days ? (
                    <Text
                      style={[styles.rowMeta, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      every ~{a.interval_days}d
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[styles.pill, { backgroundColor: `${pill.color}22` }]}
                >
                  <Text style={[styles.pillText, { color: pill.color }]}>
                    {pill.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

        <View style={styles.scrollTail} />
      </ScrollView>

      {/* Pinned action bar */}
      {selected.size > 0 && (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => setSheetOpen(true)}
            style={[
              styles.actionBtn,
              { backgroundColor: colors.primary, borderRadius: layout.radius.lg },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Log feeding for ${selected.size} animals`}
          >
            <Text style={styles.actionBtnText}>
              Log feeding for {selected.size}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Batch sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setSheetOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View
                style={[styles.sheetHandle, { backgroundColor: colors.border }]}
              />
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
                        backgroundColor: active
                          ? colors.primary
                          : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.outcomeText,
                        { color: active ? '#0B0B0B' : colors.textSecondary },
                      ]}
                    >
                      {o === 'fed' ? 'Fed' : 'Refused'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Food type */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Food type (optional)
            </Text>
            <TextInput
              value={foodType}
              onChangeText={setFoodType}
              placeholder="e.g. F/T mouse"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.sm,
                },
              ]}
            />
            <View style={styles.foodChips}>
              {FOOD_CHIPS.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFoodType(f)}
                  style={[
                    styles.foodChip,
                    {
                      borderColor: colors.border,
                      borderRadius: layout.radius.lg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.foodChipText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Note */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Note (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Applies to all selected"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[
                styles.input,
                styles.textarea,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: layout.radius.sm,
                },
              ]}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={() => setSheetOpen(false)}
                disabled={submitting}
                style={[
                  styles.ghostBtn,
                  { borderColor: colors.border, borderRadius: layout.radius.md },
                ]}
              >
                <Text style={[styles.ghostBtnText, { color: colors.textPrimary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={submitting}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: layout.radius.md,
                    opacity: submitting ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>
                  {submitting
                    ? 'Saving…'
                    : outcome === 'fed'
                      ? `Mark ${selected.size} fed`
                      : `Mark ${selected.size} refused`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default withErrorBoundary(FeedingDayScreen, 'feeding-day');

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 4 },
  scrollTail: { height: 120 },
  chipsRow: { flexGrow: 0, paddingVertical: 12 },
  chipsInner: { paddingHorizontal: 16, gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectAllText: { fontSize: 13, fontWeight: '600' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  rowText: { flex: 1, minWidth: 0 },
  thumb: { width: 42, height: 42, borderRadius: 8 },
  thumbPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: { fontSize: 22 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSci: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  rowMeta: { fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#0B0B0B',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: { borderWidth: 1, padding: 20 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  outcomeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  outcomeBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outcomeText: { fontSize: 15, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },
  foodChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  foodChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  foodChipText: { fontSize: 13, fontWeight: '600' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ghostBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
