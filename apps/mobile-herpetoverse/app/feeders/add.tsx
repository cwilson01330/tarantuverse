/**
 * Add / edit feeder stock (ADR-012). One screen for both create and edit —
 * pass `?id=<stockId>` to edit an existing stock; without it we create.
 *
 * Fields: name, optional catalog species (search), form (live/frozen),
 * inventory mode (count vs sized). When sized, a bucket editor lets the
 * keeper add per-size counts — defaulting the bucket names from the picked
 * species' `typical_sizes`. Plus storage location, low threshold, notes.
 *
 * Inputs live inside a KeyboardAvoidingView so the keyboard never hides the
 * active field (HV convention — matches reptile/add.tsx and the memory note
 * on mobile forms needing KAV).
 *
 * apiClient baseURL already includes /api/v1 — the lib helpers start at the
 * resource. Theme is dark-first; on-primary text is #0B0B0B.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import {
  ChipGroup,
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  extractErrorMessage,
} from '../../src/components/forms/FormPrimitives';
import { syncLowStockReminder } from '../../src/services/notifications';
import {
  createFeederStock,
  feederCategoryGlyph,
  getFeederStock,
  listFeederSpecies,
  updateFeederStock,
  type FeederForm,
  type FeederInventoryMode,
  type HvFeederSpecies,
  type SizedCounts,
} from '../../src/lib/feeders';

const FORM_OPTIONS: { value: FeederForm; label: string }[] = [
  { value: 'frozen', label: '🧊 Frozen' },
  { value: 'live', label: '🌱 Live colony' },
];

const MODE_OPTIONS: { value: FeederInventoryMode; label: string }[] = [
  { value: 'count', label: 'Single count' },
  { value: 'sized', label: 'Per-size buckets' },
];

// A locally-editable bucket: name + string count (parsed on submit).
interface BucketDraft {
  key: string; // stable local id
  name: string;
  count: string;
}

function makeBucket(name = '', count = ''): BucketDraft {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, count };
}

function AddFeederScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const params = useLocalSearchParams<{ id?: string; species_id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : null;
  const isEdit = editId !== null;
  // Care-sheet deep-link: pre-pick this species on a fresh create.
  const prefillSpeciesId =
    !editId && typeof params.species_id === 'string' ? params.species_id : null;

  const [name, setName] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [speciesLabel, setSpeciesLabel] = useState('');
  const [form, setForm] = useState<FeederForm>('frozen');
  const [mode, setMode] = useState<FeederInventoryMode>('count');
  const [count, setCount] = useState('');
  const [buckets, setBuckets] = useState<BucketDraft[]>([makeBucket()]);
  const [storageLocation, setStorageLocation] = useState('');
  const [lowThreshold, setLowThreshold] = useState('');
  const [notes, setNotes] = useState('');

  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Species search
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesResults, setSpeciesResults] = useState<HvFeederSpecies[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // ---- Load existing stock when editing ----
  useEffect(() => {
    if (!editId) return;
    let active = true;
    (async () => {
      try {
        const s = await getFeederStock(editId);
        if (!active) return;
        setName(s.name);
        setSpeciesId(s.hv_feeder_species_id);
        setSpeciesLabel(s.species_display_name ?? '');
        setForm(s.form);
        setMode(s.inventory_mode);
        setCount(s.count != null ? String(s.count) : '');
        if (s.inventory_mode === 'sized' && s.sized_counts) {
          const drafts = Object.entries(s.sized_counts).map(([k, v]) =>
            makeBucket(k, String(v)),
          );
          setBuckets(drafts.length > 0 ? drafts : [makeBucket()]);
        }
        setStorageLocation(s.storage_location ?? '');
        setLowThreshold(s.low_threshold != null ? String(s.low_threshold) : '');
        setNotes(s.notes ?? '');
      } catch (e) {
        setError(extractErrorMessage(e, 'Could not load this feeder stock.'));
      } finally {
        if (active) setLoadingEdit(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [editId]);

  // ---- Prefill species from a care-sheet deep-link (fresh create only) ----
  useEffect(() => {
    if (!prefillSpeciesId) return;
    let active = true;
    (async () => {
      try {
        const rows = await listFeederSpecies({ limit: 200 });
        const match = rows.find((r) => r.id === prefillSpeciesId);
        if (!active || !match) return;
        setSpeciesId(match.id);
        const label = match.common_names?.[0] ?? match.scientific_name;
        setSpeciesLabel(label);
        setName((prev) => prev || label);
      } catch {
        // Non-fatal — keeper can still search manually.
      }
    })();
    return () => {
      active = false;
    };
  }, [prefillSpeciesId]);

  // ---- Species search (debounced) ----
  useEffect(() => {
    if (!showSearch) return;
    const q = speciesQuery.trim();
    if (q.length < 2) {
      setSpeciesResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await listFeederSpecies({ q, limit: 25 });
        if (active) setSpeciesResults(rows ?? []);
      } catch {
        if (active) setSpeciesResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [speciesQuery, showSearch]);

  const pickSpecies = useCallback(
    (sp: HvFeederSpecies) => {
      setSpeciesId(sp.id);
      const label = sp.common_names?.[0] ?? sp.scientific_name;
      setSpeciesLabel(label);
      if (!name.trim()) setName(label);
      // Seed bucket names from the species' typical sizes when we're in
      // sized mode and the keeper hasn't set up buckets yet.
      if (
        mode === 'sized' &&
        sp.typical_sizes &&
        sp.typical_sizes.length > 0 &&
        buckets.every((b) => !b.name.trim() && !b.count.trim())
      ) {
        setBuckets(sp.typical_sizes.map((s) => makeBucket(s, '')));
      }
      setShowSearch(false);
      setSpeciesQuery('');
      setSpeciesResults([]);
    },
    [name, mode, buckets],
  );

  const clearSpecies = () => {
    setSpeciesId(null);
    setSpeciesLabel('');
  };

  // Bucket editing
  const updateBucket = (key: string, patch: Partial<BucketDraft>) =>
    setBuckets((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBucket = () => setBuckets((prev) => [...prev, makeBucket()]);
  const removeBucket = (key: string) =>
    setBuckets((prev) => (prev.length > 1 ? prev.filter((b) => b.key !== key) : prev));

  const totalPreview = useMemo(() => {
    if (mode === 'count') return Number(count) || 0;
    return buckets.reduce((sum, b) => sum + (Number(b.count) || 0), 0);
  }, [mode, count, buckets]);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Give this stock a name (e.g. "Adult mice" or "Dubia colony").');
      return;
    }

    // Build inventory payload per mode.
    let countVal: number | null = null;
    let sizedVal: SizedCounts | null = null;

    if (mode === 'count') {
      if (count.trim() && !Number.isFinite(Number(count))) {
        setError('Count needs to be a whole number, or leave it blank.');
        return;
      }
      countVal = count.trim() ? Math.max(0, Math.floor(Number(count))) : 0;
    } else {
      const named = buckets.filter((b) => b.name.trim());
      if (named.length === 0) {
        setError('Add at least one size bucket, or switch to Single count.');
        return;
      }
      const map: SizedCounts = {};
      for (const b of named) {
        const key = b.name.trim().toLowerCase().replace(/\s+/g, '_');
        const n = b.count.trim() ? Number(b.count) : 0;
        if (!Number.isFinite(n)) {
          setError(`"${b.name.trim()}" count must be a number.`);
          return;
        }
        map[key] = Math.max(0, Math.floor(n));
      }
      sizedVal = map;
    }

    let thresholdVal: number | null = null;
    if (lowThreshold.trim()) {
      if (!Number.isFinite(Number(lowThreshold))) {
        setError('Low threshold must be a whole number, or leave it blank.');
        return;
      }
      thresholdVal = Math.max(0, Math.floor(Number(lowThreshold)));
    }

    const payload = {
      name: trimmedName,
      hv_feeder_species_id: speciesId,
      form,
      inventory_mode: mode,
      count: mode === 'count' ? countVal : null,
      sized_counts: mode === 'sized' ? sizedVal : null,
      storage_location: storageLocation.trim() || null,
      low_threshold: thresholdVal,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      const saved = isEdit
        ? await updateFeederStock(editId!, payload)
        : await createFeederStock(payload);
      // Reconcile the low-stock reminder for the saved state (best-effort).
      syncLowStockReminder(saved.id, saved.name, saved.is_low_stock);
      router.replace('/feeders' as never);
    } catch (e) {
      setError(extractErrorMessage(e, 'Could not save this feeder stock.'));
      setSubmitting(false);
    }
  }

  if (loadingEdit) {
    return (
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Edit feeder" leftAction={<HeaderBackButton />} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title={isEdit ? 'Edit feeder' : 'Add feeder stock'}
        leftAction={<HeaderBackButton />}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Name" required hint="What you call this stock.">
            <ThemedInput
              value={name}
              onChangeText={setName}
              placeholder="Adult mice"
              autoCapitalize="sentences"
            />
          </Field>

          {/* Species picker (optional) */}
          <Field
            label="Feeder species"
            hint="Optional. Links to a care sheet and can seed size buckets."
          >
            {speciesId ? (
              <View
                style={[
                  styles.speciesPicked,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                <Text
                  style={[styles.speciesPickedText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {speciesLabel || 'Selected species'}
                </Text>
                <TouchableOpacity
                  onPress={clearSpecies}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear species"
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={20}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            ) : !showSearch ? (
              <TouchableOpacity
                onPress={() => setShowSearch(true)}
                style={[
                  styles.speciesPickBtn,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Search feeder species"
              >
                <MaterialCommunityIcons
                  name="magnify"
                  size={18}
                  color={colors.textTertiary}
                />
                <Text style={[styles.speciesPickText, { color: colors.textTertiary }]}>
                  Search catalog…
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.searchWrap}>
                <TextInput
                  value={speciesQuery}
                  onChangeText={setSpeciesQuery}
                  placeholder="Type 2+ letters…"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                  autoCorrect={false}
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                />
                {searching && (
                  <ActivityIndicator
                    style={styles.searchSpinner}
                    size="small"
                    color={colors.primary}
                  />
                )}
                {speciesResults.map((sp) => (
                  <TouchableOpacity
                    key={sp.id}
                    onPress={() => pickSpecies(sp)}
                    style={[
                      styles.resultRow,
                      { borderBottomColor: colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={sp.common_names?.[0] ?? sp.scientific_name}
                  >
                    <Text style={styles.resultGlyph}>
                      {feederCategoryGlyph(sp.category)}
                    </Text>
                    <View style={styles.resultText}>
                      <Text
                        style={[styles.resultName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {sp.common_names?.[0] ?? sp.scientific_name}
                      </Text>
                      <Text
                        style={[styles.resultSci, { color: colors.textTertiary }]}
                        numberOfLines={1}
                      >
                        {sp.scientific_name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setShowSearch(false);
                    setSpeciesQuery('');
                    setSpeciesResults([]);
                  }}
                  style={styles.searchCancel}
                  accessibilityRole="button"
                >
                  <Text style={[styles.searchCancelText, { color: colors.textSecondary }]}>
                    Cancel search
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Field>

          <Field label="Form">
            <ChipGroup options={FORM_OPTIONS} value={form} onChange={setForm} />
          </Field>

          <Field
            label="Inventory mode"
            hint={
              mode === 'sized'
                ? 'Track separate counts per size (e.g. pinky, hopper, adult).'
                : 'Track one running total.'
            }
          >
            <ChipGroup options={MODE_OPTIONS} value={mode} onChange={setMode} />
          </Field>

          {/* Count mode */}
          {mode === 'count' && (
            <Field label="Current count" hint="How many you have right now.">
              <ThemedInput
                value={count}
                onChangeText={setCount}
                placeholder="0"
                keyboardType="number-pad"
              />
            </Field>
          )}

          {/* Sized mode — bucket editor */}
          {mode === 'sized' && (
            <View style={styles.field}>
              <Text style={[styles.bucketLabel, { color: colors.textTertiary }]}>
                SIZE BUCKETS
              </Text>
              {buckets.map((b) => (
                <View key={b.key} style={styles.bucketRow}>
                  <TextInput
                    value={b.name}
                    onChangeText={(t) => updateBucket(b.key, { name: t })}
                    placeholder="Size (e.g. adult)"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.bucketName,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                  />
                  <TextInput
                    value={b.count}
                    onChangeText={(t) => updateBucket(b.key, { count: t })}
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    style={[
                      styles.bucketCount,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                  />
                  <TouchableOpacity
                    onPress={() => removeBucket(b.key)}
                    disabled={buckets.length <= 1}
                    hitSlop={8}
                    style={styles.bucketRemove}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${b.name || 'bucket'}`}
                  >
                    <MaterialCommunityIcons
                      name="minus-circle-outline"
                      size={22}
                      color={buckets.length <= 1 ? colors.border : colors.danger}
                    />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={addBucket}
                style={[
                  styles.addBucketBtn,
                  { borderColor: colors.border, borderRadius: layout.radius.md },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add size bucket"
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
                <Text style={[styles.addBucketText, { color: colors.primary }]}>
                  Add size
                </Text>
              </TouchableOpacity>
              <Text style={[styles.bucketHint, { color: colors.textTertiary }]}>
                Total: {totalPreview}
              </Text>
            </View>
          )}

          <Field label="Storage location" hint="Optional. e.g. Chest freezer, Shelf B.">
            <ThemedInput
              value={storageLocation}
              onChangeText={setStorageLocation}
              placeholder="Chest freezer"
              autoCapitalize="sentences"
            />
          </Field>

          <Field
            label="Low-stock threshold"
            hint="Optional. Flag + remind when the total drops below this."
          >
            <ThemedInput
              value={lowThreshold}
              onChangeText={setLowThreshold}
              placeholder="e.g. 10"
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Notes" hint="Optional.">
            <ThemedInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Supplier, batch date, anything…"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, paddingTop: 12 }}
            />
          </Field>

          {error && <FormErrorBanner message={error} />}

          <SubmitButton
            label={isEdit ? 'Save changes' : 'Add feeder stock'}
            busy={submitting}
            onPress={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default withErrorBoundary(AddFeederScreen, 'add-feeder');

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  field: { gap: 6 },

  // Species picker
  speciesPicked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  speciesPickedText: { flex: 1, fontSize: 15, fontWeight: '600' },
  speciesPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
  },
  speciesPickText: { fontSize: 15 },
  searchWrap: { gap: 4 },
  searchInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
  searchSpinner: { position: 'absolute', right: 14, top: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultGlyph: { fontSize: 20 },
  resultText: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultSci: { fontSize: 12, fontStyle: 'italic', marginTop: 1 },
  searchCancel: { paddingVertical: 10, alignItems: 'center' },
  searchCancelText: { fontSize: 13, fontWeight: '600' },

  // Sized bucket editor
  bucketLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bucketName: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
  },
  bucketCount: {
    width: 72,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
    textAlign: 'center',
  },
  bucketRemove: { width: 32, alignItems: 'center', justifyContent: 'center' },
  addBucketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 10,
    marginTop: 2,
  },
  addBucketText: { fontSize: 14, fontWeight: '600' },
  bucketHint: { fontSize: 12, marginTop: 6 },
});
