import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

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

function parseIntOrNull(s: string): number | null {
  if (s === '') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function AddFeederColonyScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [name, setName] = useState('');
  const [speciesQuery, setSpeciesQuery] = useState('');
  const [speciesResults, setSpeciesResults] = useState<FeederSpecies[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<FeederSpecies | null>(null);
  const [speciesSearching, setSpeciesSearching] = useState(false);

  const [enclosures, setEnclosures] = useState<EnclosureOption[]>([]);
  const [enclosureId, setEnclosureId] = useState('');
  const [enclosuresLoading, setEnclosuresLoading] = useState(true);

  const [inventoryMode, setInventoryMode] = useState<InventoryMode>('count');
  const [count, setCount] = useState('');
  const [lifeStageCounts, setLifeStageCounts] = useState<Record<string, string>>({});

  const [lowThreshold, setLowThreshold] = useState('');
  const [foodNotes, setFoodNotes] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEnclosures();
  }, []);

  // Debounced species search
  useEffect(() => {
    if (selectedSpecies) return; // don't search while a species is picked
    const q = speciesQuery.trim();
    if (q.length < 2) {
      setSpeciesResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchSpecies(q);
    }, 250);
    return () => clearTimeout(handle);
  }, [speciesQuery, selectedSpecies]);

  const loadEnclosures = async () => {
    try {
      const res = await apiClient.get<EnclosureOption[]>('/enclosures/');
      setEnclosures(
        (res.data ?? []).filter((e) => (e.purpose ?? 'tarantula') === 'feeder')
      );
    } catch {
      // non-fatal — user can still save without an enclosure
    } finally {
      setEnclosuresLoading(false);
    }
  };

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
    // Auto-configure life-stage buckets from the species default
    if (sp.supports_life_stages && sp.default_life_stages && sp.default_life_stages.length > 0) {
      setInventoryMode('life_stage');
      setLifeStageCounts((prev) => {
        const next: Record<string, string> = { ...prev };
        sp.default_life_stages!.forEach((stage) => {
          if (next[stage] === undefined) next[stage] = '';
        });
        return next;
      });
    } else if (!sp.supports_life_stages) {
      setInventoryMode('count');
    }
  };

  const clearSpecies = () => {
    setSelectedSpecies(null);
    setSpeciesQuery('');
    setSpeciesResults([]);
  };

  const switchMode = (next: InventoryMode) => {
    if (next === inventoryMode) return;
    setInventoryMode(next);
    // Seed life-stage buckets the first time we switch into life_stage
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

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Give the colony a name.');
      return;
    }
    if (inventoryMode === 'life_stage') {
      const hasAny = Object.values(lifeStageCounts).some((v) => v.trim() !== '');
      if (!hasAny) {
        Alert.alert(
          'No bucket counts',
          'Life-stage mode needs at least one bucket count (you can use 0).'
        );
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      feeder_species_id: selectedSpecies?.id ?? null,
      enclosure_id: enclosureId || null,
      inventory_mode: inventoryMode,
      low_threshold: parseIntOrNull(lowThreshold),
      food_notes: foodNotes.trim() || null,
      notes: notes.trim() || null,
    };

    if (inventoryMode === 'count') {
      payload.count = parseIntOrNull(count);
      payload.life_stage_counts = null;
    } else {
      const map: Record<string, number> = {};
      for (const [k, v] of Object.entries(lifeStageCounts)) {
        const n = parseIntOrNull(v);
        if (n !== null) map[k] = n;
      }
      payload.life_stage_counts = map;
      payload.count = null;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/feeder-colonies/', payload);
      const created = res.data;
      router.replace(`/feeders/${created.id}`);
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail || e?.message || 'Failed to create colony';
      Alert.alert('Could not save', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

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
      disabled={submitting}
      style={{ opacity: submitting ? 0.5 : 1, paddingHorizontal: 6 }}
    >
      <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>
        {submitting ? 'Saving…' : 'Save'}
      </Text>
    </TouchableOpacity>
  );

  const speciesHasFocus = !selectedSpecies && speciesQuery.trim().length >= 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Add Feeder Colony"
        subtitle="One container of a single feeder species"
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
            Optional. Picking a species auto-fills life-stage buckets.
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
              No feeder enclosures yet. Create one with purpose “feeder” to link
              this colony to a physical bin. You can skip for now.
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
                One number (“~200 crickets”).
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
                Track adults, nymphs, etc. separately.
              </Text>
            </TouchableOpacity>
          </View>
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
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                Pick a feeder species above to seed life-stage buckets, or switch
                back to simple count.
              </Text>
            )}
            {Object.entries(lifeStageCounts).map(([stage, value]) => (
              <View key={stage} style={styles.bucketRow}>
                <Text
                  style={[
                    styles.bucketLabel,
                    { color: colors.textSecondary },
                  ]}
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
              </View>
            ))}
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
            Optional. Leave blank to skip low-stock alerts for this colony.
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
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
  clearBtn: {
    padding: 6,
  },
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
  dropdownName: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownSci: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
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
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeCard: {
    flex: 1,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  modeSub: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  bucketLabel: {
    width: 100,
    fontSize: 13,
    textTransform: 'capitalize',
  },
});
