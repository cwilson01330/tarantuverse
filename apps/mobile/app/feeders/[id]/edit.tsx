import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../../src/components/AppHeader';
import { apiClient } from '../../../src/services/api';
import { useTheme } from '../../../src/contexts/ThemeContext';

type InventoryMode = 'count' | 'life_stage';

interface FeederSpecies {
  id: string;
  scientific_name: string;
  common_names: string[] | null;
  category: string;
  supports_life_stages: boolean;
  default_life_stages: string[] | null;
  image_url?: string | null;
}

interface EnclosureOption {
  id: string;
  name: string;
  purpose?: string | null;
}

interface FeederColony {
  id: string;
  feeder_species_id: string | null;
  enclosure_id: string | null;
  name: string;
  inventory_mode: InventoryMode;
  count: number | null;
  life_stage_counts: Record<string, number> | null;
  low_threshold: number | null;
  food_notes: string | null;
  notes: string | null;
  is_active: boolean;
  species_display_name: string | null;
}

function parseIntOrNull(s: string): number | null {
  if (s === '') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function EditFeederColonyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const colonyId = params.id;
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesResults, setSpeciesResults] = useState<FeederSpecies[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<FeederSpecies | null>(null);
  const [speciesCleared, setSpeciesCleared] = useState(false);
  const [speciesSearching, setSpeciesSearching] = useState(false);

  const [enclosures, setEnclosures] = useState<EnclosureOption[]>([]);
  const [enclosureId, setEnclosureId] = useState('');
  const [enclosuresLoading, setEnclosuresLoading] = useState(true);

  const [inventoryMode, setInventoryMode] = useState<InventoryMode>('count');
  const [count, setCount] = useState('');
  const [lifeStageCounts, setLifeStageCounts] = useState<Record<string, string>>({});
  const [newStageName, setNewStageName] = useState('');

  const [lowThreshold, setLowThreshold] = useState('');
  const [foodNotes, setFoodNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadEnclosures = useCallback(async () => {
    setEnclosuresLoading(true);
    try {
      const res = await apiClient.get<EnclosureOption[]>('/enclosures/');
      setEnclosures(
        (res.data ?? []).filter((e) => (e.purpose ?? 'tarantula') === 'feeder')
      );
    } catch {
      /* non-fatal */
    } finally {
      setEnclosuresLoading(false);
    }
  }, []);

  const loadColony = useCallback(async () => {
    if (!colonyId) return;
    try {
      const res = await apiClient.get<FeederColony>(`/feeder-colonies/${colonyId}`);
      const c = res.data;
      setName(c.name);
      setSpeciesQuery(c.species_display_name ?? '');
      setEnclosureId(c.enclosure_id ?? '');
      setInventoryMode(c.inventory_mode);
      setCount(c.count != null ? String(c.count) : '');
      if (c.life_stage_counts) {
        const asStrings: Record<string, string> = {};
        for (const [k, v] of Object.entries(c.life_stage_counts)) {
          asStrings[k] = String(v);
        }
        setLifeStageCounts(asStrings);
      }
      setLowThreshold(c.low_threshold != null ? String(c.low_threshold) : '');
      setFoodNotes(c.food_notes ?? '');
      setNotes(c.notes ?? '');
      setIsActive(c.is_active);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      const msg =
        e?.response?.status === 404
          ? 'Colony not found'
          : e?.response?.data?.detail || e?.message || 'Failed to load colony';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [colonyId]);

  useEffect(() => {
    loadEnclosures();
    loadColony();
  }, [loadEnclosures, loadColony]);

  // Debounced species search — only when user has typed after clearing/changing
  useEffect(() => {
    if (selectedSpecies) return;
    const q = speciesQuery.trim();
    if (q.length < 2) {
      setSpeciesResults([]);
      return;
    }
    const handle = setTimeout(() => searchSpecies(q), 250);
    return () => clearTimeout(handle);
  }, [speciesQuery, selectedSpecies]);

  const searchSpecies = async (q: string) => {
    setSpeciesSearching(true);
    try {
      const res = await apiClient.get<FeederSpecies[]>(
        `/feeder-species/?q=${encodeURIComponent(q)}&limit=8`
      );
      setSpeciesResults(res.data ?? []);
    } catch {
      setSpeciesResults([]);
    } finally {
      setSpeciesSearching(false);
    }
  };

  const pickSpecies = (sp: FeederSpecies) => {
    setSelectedSpecies(sp);
    setSpeciesQuery(sp.scientific_name);
    setSpeciesResults([]);
    setSpeciesCleared(false);
    // Seed buckets if empty and species provides defaults
    if (
      sp.supports_life_stages &&
      sp.default_life_stages &&
      sp.default_life_stages.length > 0 &&
      Object.keys(lifeStageCounts).length === 0
    ) {
      const seed: Record<string, string> = {};
      sp.default_life_stages.forEach((s) => (seed[s] = ''));
      setLifeStageCounts(seed);
    }
  };

  const clearSpecies = () => {
    setSelectedSpecies(null);
    setSpeciesQuery('');
    setSpeciesResults([]);
    setSpeciesCleared(true);
  };

  const switchMode = (next: InventoryMode) => {
    if (next === inventoryMode) return;
    setInventoryMode(next);
    if (next === 'life_stage' && Object.keys(lifeStageCounts).length === 0) {
      if (
        selectedSpecies?.default_life_stages &&
        selectedSpecies.default_life_stages.length > 0
      ) {
        const seed: Record<string, string> = {};
        selectedSpecies.default_life_stages.forEach((s) => (seed[s] = ''));
        setLifeStageCounts(seed);
      } else {
        setLifeStageCounts({ adults: '', nymphs: '' });
      }
    }
  };

  const setBucket = (stage: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setLifeStageCounts((prev) => ({ ...prev, [stage]: value }));
  };

  const removeBucket = (key: string) => {
    setLifeStageCounts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const addBucket = () => {
    const k = newStageName.trim().toLowerCase();
    if (!k) return;
    if (lifeStageCounts[k] !== undefined) {
      Alert.alert('Duplicate bucket', `A "${k}" bucket already exists.`);
      return;
    }
    setLifeStageCounts((prev) => ({ ...prev, [k]: '' }));
    setNewStageName('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Colony name is required.');
      return;
    }
    if (inventoryMode === 'life_stage' && Object.keys(lifeStageCounts).length === 0) {
      Alert.alert(
        'No buckets',
        'Life-stage mode needs at least one bucket. Add one below or switch to simple count.'
      );
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      enclosure_id: enclosureId || null,
      inventory_mode: inventoryMode,
      low_threshold: parseIntOrNull(lowThreshold),
      food_notes: foodNotes.trim() || null,
      notes: notes.trim() || null,
      is_active: isActive,
    };

    // Species — send only if user picked a new one or explicitly cleared.
    if (selectedSpecies) {
      payload.feeder_species_id = selectedSpecies.id;
    } else if (speciesCleared) {
      payload.feeder_species_id = null;
    }
    // Otherwise omit → server keeps existing link

    // Inventory — only write the field matching the selected mode so the
    // other mode's data is preserved server-side (PRD §6).
    if (inventoryMode === 'count') {
      payload.count = parseIntOrNull(count);
    } else {
      const map: Record<string, number> = {};
      for (const [k, v] of Object.entries(lifeStageCounts)) {
        const n = parseIntOrNull(v);
        if (n !== null) map[k] = n;
      }
      payload.life_stage_counts = map;
    }

    setSubmitting(true);
    try {
      await apiClient.put(`/feeder-colonies/${colonyId}`, payload);
      router.replace(`/feeders/${colonyId}` as any);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save changes';
      Alert.alert('Could not save', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Header actions ──────────────────────────────────────────────────────
  const closeAction = (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityLabel="Close"
      style={{ paddingRight: 4 }}
    >
      <MaterialCommunityIcons name="close" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const saveAction = (
    <TouchableOpacity
      onPress={handleSubmit}
      disabled={submitting || loading}
      style={{ opacity: submitting || loading ? 0.5 : 1, paddingHorizontal: 6 }}
    >
      <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>
        {submitting ? 'Saving…' : 'Save'}
      </Text>
    </TouchableOpacity>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Edit Colony" leftAction={closeAction} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Edit Colony" leftAction={closeAction} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🦗</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {loadError}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            It may have been deleted, or you may not have access to it.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              setLoadError('');
              loadColony();
            }}
            style={[
              styles.retryBtn,
              { borderColor: colors.border, borderRadius: layout.radius.md },
            ]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const speciesHasFocus =
    !selectedSpecies && speciesQuery.trim().length >= 2 && !speciesCleared;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Edit Colony"
        subtitle="Update inventory, species, and care details"
        leftAction={closeAction}
        rightAction={saveAction}
      />

      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Name */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Colony name *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Main hisser bin"
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
          />
        </View>

        {/* Species */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Feeder species
          </Text>
          <View style={styles.speciesRow}>
            <TextInput
              style={[
                styles.input,
                { flex: 1 },
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              value={speciesQuery}
              onChangeText={(v) => {
                setSpeciesQuery(v);
                if (selectedSpecies) setSelectedSpecies(null);
                setSpeciesCleared(false);
              }}
              placeholder="Search crickets, dubia, mealworms…"
              placeholderTextColor={colors.textTertiary}
            />
            {(selectedSpecies || speciesQuery !== '') && (
              <TouchableOpacity
                onPress={clearSpecies}
                accessibilityLabel="Clear species"
                style={styles.clearBtn}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            )}
          </View>
          {speciesHasFocus && (
            <View
              style={[
                styles.dropdown,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {speciesSearching && (
                <View style={styles.dropdownRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
              {!speciesSearching && speciesResults.length === 0 && (
                <View style={styles.dropdownRow}>
                  <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
                    No matching species.
                  </Text>
                </View>
              )}
              {speciesResults.map((sp) => (
                <TouchableOpacity
                  key={sp.id}
                  style={[
                    styles.dropdownRow,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => pickSpecies(sp)}
                >
                  <Text style={[styles.dropdownName, { color: colors.textPrimary }]}>
                    {sp.common_names && sp.common_names[0]
                      ? sp.common_names[0]
                      : sp.scientific_name}
                  </Text>
                  <Text
                    style={[styles.dropdownSci, { color: colors.textSecondary }]}
                  >
                    {sp.scientific_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Clear the field and leave blank to unlink the species.
          </Text>
        </View>

        {/* Enclosure */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Enclosure
          </Text>
          {enclosuresLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : enclosures.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              No feeder enclosures yet. Create one with purpose "feeder" to link
              this colony to a physical bin.
            </Text>
          ) : (
            <View style={styles.chipContainer}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                  enclosureId === '' && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => setEnclosureId('')}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    enclosureId === '' && { color: '#fff' },
                  ]}
                >
                  — None —
                </Text>
              </TouchableOpacity>
              {enclosures.map((en) => (
                <TouchableOpacity
                  key={en.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                    enclosureId === en.id && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setEnclosureId(en.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      enclosureId === en.id && { color: '#fff' },
                    ]}
                  >
                    {en.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Inventory mode */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Inventory mode
          </Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor:
                    inventoryMode === 'count' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => switchMode('count')}
              accessibilityRole="radio"
              accessibilityState={{ selected: inventoryMode === 'count' }}
            >
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>
                Simple count
              </Text>
              <Text style={[styles.modeSub, { color: colors.textTertiary }]}>
                One number total.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor:
                    inventoryMode === 'life_stage' ? colors.primary : colors.border,
                },
              ]}
              onPress={() => switchMode('life_stage')}
              accessibilityRole="radio"
              accessibilityState={{ selected: inventoryMode === 'life_stage' }}
            >
              <Text style={[styles.modeTitle, { color: colors.textPrimary }]}>
                Life stages
              </Text>
              <Text style={[styles.modeSub, { color: colors.textTertiary }]}>
                Adults, nymphs, etc. separately.
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Switching modes preserves the other mode's data server-side.
          </Text>
        </View>

        {/* Inventory inputs */}
        {inventoryMode === 'count' ? (
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              Current count
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              value={count}
              onChangeText={(v) => {
                if (v === '' || /^\d+$/.test(v)) setCount(v);
              }}
              placeholder="e.g. 200"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
            />
          </View>
        ) : (
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              Life-stage counts
            </Text>
            {Object.keys(lifeStageCounts).length === 0 && (
              <Text style={[styles.hint, { color: colors.textTertiary, marginBottom: 10 }]}>
                No buckets yet. Add one below.
              </Text>
            )}
            {Object.entries(lifeStageCounts).map(([stage, value]) => (
              <View key={stage} style={styles.bucketRow}>
                <Text
                  style={[styles.bucketLabel, { color: colors.textSecondary }]}
                >
                  {stage}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { flex: 1 },
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={value}
                  onChangeText={(v) => setBucket(stage, v)}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  onPress={() => removeBucket(stage)}
                  accessibilityLabel={`Remove ${stage} bucket`}
                  style={[
                    styles.removeBucketBtn,
                    { borderColor: colors.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            ))}

            {/* Add bucket */}
            <View style={styles.addBucketRow}>
              <TextInput
                style={[
                  styles.input,
                  { flex: 1 },
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                value={newStageName}
                onChangeText={setNewStageName}
                placeholder="Add a bucket (e.g. pinheads)"
                placeholderTextColor={colors.textTertiary}
                maxLength={30}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={addBucket}
                disabled={!newStageName.trim()}
                style={[
                  styles.addBucketBtn,
                  {
                    borderColor: colors.border,
                    opacity: !newStageName.trim() ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Low threshold */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Low-stock threshold
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={lowThreshold}
            onChangeText={(v) => {
              if (v === '' || /^\d+$/.test(v)) setLowThreshold(v);
            }}
            placeholder="Alert me when total drops below this"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Leave blank to disable low-stock alerts for this colony.
          </Text>
        </View>

        {/* Food notes */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Food / gut-load notes
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={foodNotes}
            onChangeText={setFoodNotes}
            placeholder="e.g. Dry oats + carrot slice, water crystals"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Notes */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Notes
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything else worth remembering about this colony"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Active toggle */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.label, { color: colors.textPrimary, marginBottom: 4 }]}>
                Active colony
              </Text>
              <Text style={[styles.hint, { color: colors.textTertiary, marginTop: 0 }]}>
                Turn off to archive. Archived colonies are hidden from the main
                list but history is preserved.
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{
                false: colors.border,
                true: colors.primary,
              }}
              thumbColor="#fff"
              accessibilityLabel="Toggle colony active"
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 320,
  },
  retryBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 15,
  },
  textArea: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 15,
    minHeight: 80,
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: { padding: 6 },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownName: { fontSize: 14, fontWeight: '600' },
  dropdownSci: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 20,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCard: {
    flex: 1,
    padding: 14,
    borderWidth: 2,
    borderRadius: 12,
  },
  modeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  modeSub: { fontSize: 12, lineHeight: 16 },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bucketLabel: {
    width: 96,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  removeBucketBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  addBucketRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  addBucketBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
