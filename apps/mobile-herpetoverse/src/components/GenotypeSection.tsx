/**
 * GenotypeSection — per-snake gene chips + add/delete modal.
 *
 * Shown on the snake detail screen (under "Genetics"). Lists every gene
 * the keeper has recorded as a labeled chip — e.g. "Pastel · visual",
 * "Albino · het", "Clown · poss het 66%". Each chip is tappable to
 * delete; the "+ Add gene" button opens a 2-step modal:
 *
 *   Step 1: search + pick from the gene catalog (filtered to the snake's
 *           species — falls back to ball python if not set, since that's
 *           our only seeded catalog right now)
 *   Step 2: pick zygosity (the picker constrains options based on the
 *           gene's inheritance mode), optionally enter poss_het %
 *
 * Editing in place is intentionally not supported in v1 — keepers delete
 * & re-add to change a row. That's the same pattern as MorphMarket's
 * trait list, and avoids a third UI mode.
 *
 * Lizards are NOT supported yet — the gene catalog is ball-python only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  type AnimalGenotype,
  type CreateGenotypePayload,
  type Gene,
  type Zygosity,
  addSnakeGenotype,
  deleteSnakeGenotype,
  fetchGenesForSpecies,
  listSnakeGenotype,
  zygosityLabel,
} from '../lib/genes';

const FALLBACK_SPECIES = 'Python regius';

interface Props {
  snakeId: string;
  /** Snake's scientific_name from the parent. Fallback to ball python. */
  scientificName?: string | null;
}

export function GenotypeSection({ snakeId, scientificName }: Props) {
  const { colors, layout } = useTheme();

  const [rows, setRows] = useState<AnimalGenotype[] | null>(null);
  const [genes, setGenes] = useState<Gene[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const species = scientificName?.trim() || FALLBACK_SPECIES;

  // Initial load — genotype rows + gene catalog in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [g, c] = await Promise.all([
          listSnakeGenotype(snakeId),
          fetchGenesForSpecies(species),
        ]);
        if (cancelled) return;
        setRows(g);
        setGenes(c ?? []);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Couldn't load genetics.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snakeId, species]);

  const geneById = useMemo(() => {
    const map: Record<string, Gene> = {};
    (genes ?? []).forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [genes]);

  const handleDelete = (row: AnimalGenotype) => {
    const gene = geneById[row.gene_id];
    const name = gene?.common_name ?? 'this gene';
    Alert.alert('Remove gene', `Remove ${name} from this snake?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSnakeGenotype(snakeId, row.id);
            setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
          } catch {
            Alert.alert('Error', "Couldn't remove that gene.");
          }
        },
      },
    ]);
  };

  const handleAdded = (created: AnimalGenotype) => {
    setRows((prev) => [...(prev ?? []), created]);
    setAdding(false);
  };

  if (rows === null && loadError === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <Text style={[styles.note, { color: colors.danger }]}>{loadError}</Text>
    );
  }

  const sortedRows = [...(rows ?? [])].sort((a, b) => {
    const an = geneById[a.gene_id]?.common_name ?? '';
    const bn = geneById[b.gene_id]?.common_name ?? '';
    return an.localeCompare(bn);
  });

  return (
    <View style={{ gap: 10 }}>
      {sortedRows.length === 0 ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          No genes recorded yet. Add what you know to fuel pairing
          predictions in the morph calculator.
        </Text>
      ) : (
        <View style={styles.chipsWrap}>
          {sortedRows.map((row) => {
            const gene = geneById[row.gene_id];
            const name = gene?.common_name ?? 'Unknown gene';
            const zygText = zygosityLabel(row.zygosity, row.poss_het_percentage);
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => handleDelete(row)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${zygText}. Tap to remove.`}
              >
                <Text
                  style={[styles.chipPrimary, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text
                  style={[styles.chipSecondary, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {zygText}
                </Text>
                {row.proven ? (
                  <Text
                    style={[styles.chipMicro, { color: colors.success }]}
                  >
                    proven
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        onPress={() => setAdding(true)}
        style={[
          styles.addButton,
          {
            borderColor: colors.primary,
            borderRadius: layout.radius.md,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add gene"
      >
        <MaterialCommunityIcons
          name="dna"
          size={18}
          color={colors.primary}
        />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>
          Add gene
        </Text>
      </TouchableOpacity>

      <AddGeneModal
        visible={adding}
        onClose={() => setAdding(false)}
        snakeId={snakeId}
        genes={genes ?? []}
        existingRows={rows ?? []}
        onAdded={handleAdded}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Add-gene modal — 2-step picker.
// ---------------------------------------------------------------------------

interface AddGeneModalProps {
  visible: boolean;
  onClose: () => void;
  snakeId: string;
  genes: Gene[];
  existingRows: AnimalGenotype[];
  onAdded: (row: AnimalGenotype) => void;
}

function AddGeneModal({
  visible,
  onClose,
  snakeId,
  genes,
  existingRows,
  onAdded,
}: AddGeneModalProps) {
  const { colors, layout } = useTheme();

  const [query, setQuery] = useState('');
  const [pickedGene, setPickedGene] = useState<Gene | null>(null);
  const [zygosity, setZygosity] = useState<Zygosity | null>(null);
  const [possHetPct, setPossHetPct] = useState('');
  const [proven, setProven] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the modal opens.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setPickedGene(null);
      setZygosity(null);
      setPossHetPct('');
      setProven(false);
      setNotes('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...genes];
    if (q) {
      list = list.filter(
        (g) =>
          g.common_name.toLowerCase().includes(q) ||
          (g.symbol ?? '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => a.common_name.localeCompare(b.common_name));
    return list;
  }, [genes, query]);

  // Available zygosity options for the picked gene.
  const zygosityOptions = useMemo<Zygosity[]>(() => {
    if (!pickedGene) return [];
    const t = pickedGene.gene_type;
    if (t === 'recessive') {
      return ['het', 'visual', 'poss_het'];
    }
    if (t === 'dominant') {
      return ['visual'];
    }
    // codominant / incomplete_dominant
    return ['visual', 'super'];
  }, [pickedGene]);

  // Auto-pick the first zygosity option when a gene is chosen, so the
  // dominant-only case (which has a single legal option) doesn't need
  // a tap.
  useEffect(() => {
    if (pickedGene && !zygosity && zygosityOptions.length > 0) {
      setZygosity(zygosityOptions[0]);
    }
  }, [pickedGene, zygosity, zygosityOptions]);

  async function handleSave() {
    if (!pickedGene || !zygosity) {
      setError('Pick a gene and zygosity.');
      return;
    }

    let possHet: number | null = null;
    if (zygosity === 'poss_het') {
      const n = Number(possHetPct);
      if (!Number.isFinite(n) || n < 1 || n > 99) {
        setError('Possible het percentage must be between 1 and 99.');
        return;
      }
      possHet = Math.round(n);
    }

    const payload: CreateGenotypePayload = {
      gene_id: pickedGene.id,
      zygosity,
      poss_het_percentage: possHet,
      proven,
      notes: notes.trim() || null,
    };

    setError(null);
    setSubmitting(true);
    try {
      const created = await addSnakeGenotype(snakeId, payload);
      onAdded(created);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Could not add this gene.',
      );
      setSubmitting(false);
    }
  }

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
              {pickedGene ? (
                <TouchableOpacity onPress={() => setPickedGene(null)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={24}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 24 }} />
              )}
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {pickedGene ? pickedGene.common_name : 'Pick a gene'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* STEP 1 — gene picker */}
            {!pickedGene ? (
              <View style={styles.stepWrap}>
                <View
                  style={[
                    styles.searchWrap,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="magnify"
                    size={18}
                    color={colors.textTertiary}
                  />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search — e.g. Pastel, Albino"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                  />
                </View>

                <ScrollView
                  style={{ maxHeight: 360 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {filtered.length === 0 ? (
                    <Text
                      style={[
                        styles.note,
                        { color: colors.textSecondary, padding: 16 },
                      ]}
                    >
                      No genes match. Try a different name.
                    </Text>
                  ) : (
                    filtered.map((g) => {
                      const alreadyHave = existingRows.some(
                        (r) => r.gene_id === g.id,
                      );
                      return (
                        <TouchableOpacity
                          key={g.id}
                          onPress={() => setPickedGene(g)}
                          style={[
                            styles.geneRow,
                            { borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: colors.textPrimary,
                                fontWeight: '600',
                                fontSize: 15,
                              }}
                            >
                              {g.common_name}
                            </Text>
                            <Text
                              style={{
                                color: colors.textSecondary,
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {g.gene_type.replace('_', ' ')}
                              {g.lethal_homozygous ? ' · lethal homozygous' : ''}
                              {alreadyHave ? ' · already on this snake' : ''}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={18}
                            color={colors.textTertiary}
                          />
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            ) : (
              // STEP 2 — zygosity picker
              <View style={styles.stepWrap}>
                <Text
                  style={[
                    styles.label,
                    { color: colors.textSecondary, marginTop: 4 },
                  ]}
                >
                  Zygosity
                </Text>
                <View style={styles.chipsWrap}>
                  {zygosityOptions.map((z) => {
                    const selected = zygosity === z;
                    return (
                      <TouchableOpacity
                        key={z}
                        onPress={() => setZygosity(z)}
                        style={[
                          styles.zygChip,
                          {
                            backgroundColor: selected
                              ? colors.primary
                              : colors.surfaceRaised,
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                            borderRadius: layout.radius.md,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? '#0B0B0B' : colors.textPrimary,
                            fontWeight: '600',
                            fontSize: 13,
                          }}
                        >
                          {z === 'poss_het' ? 'poss het' : z}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {zygosity === 'poss_het' ? (
                  <View style={{ marginTop: 12 }}>
                    <Text
                      style={[styles.label, { color: colors.textSecondary }]}
                    >
                      Possible het %
                    </Text>
                    <TextInput
                      value={possHetPct}
                      onChangeText={setPossHetPct}
                      placeholder="66"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="number-pad"
                      style={[
                        styles.numInput,
                        {
                          color: colors.textPrimary,
                          backgroundColor: colors.surfaceRaised,
                          borderColor: colors.border,
                          borderRadius: layout.radius.md,
                        },
                      ]}
                    />
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => setProven(!proven)}
                  style={[styles.checkboxRow, { marginTop: 14 }]}
                >
                  <MaterialCommunityIcons
                    name={
                      proven ? 'checkbox-marked' : 'checkbox-blank-outline'
                    }
                    size={22}
                    color={proven ? colors.primary : colors.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.textPrimary, fontSize: 14 }}
                    >
                      Proven
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      Verified through breeding (not just visual ID).
                    </Text>
                  </View>
                </TouchableOpacity>

                <Text
                  style={[
                    styles.label,
                    { color: colors.textSecondary, marginTop: 14 },
                  ]}
                >
                  Notes (optional)
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="From breeder X, lineage Y…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  style={[
                    styles.notesInput,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                      borderRadius: layout.radius.md,
                    },
                  ]}
                />

                {error ? (
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: 13,
                      marginTop: 8,
                    }}
                  >
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={submitting}
                  style={[
                    styles.saveButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: layout.radius.md,
                      opacity: submitting ? 0.6 : 1,
                    },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#0B0B0B" />
                  ) : (
                    <Text style={styles.saveButtonText}>Add gene</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  center: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
  },

  // Chips on the section
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
  },
  chipPrimary: { fontSize: 14, fontWeight: '600' },
  chipSecondary: { fontSize: 12 },
  chipMicro: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  addButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  addButtonText: { fontSize: 14, fontWeight: '600' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  stepWrap: {
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },

  // Step 1
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  geneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },

  // Step 2
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  zygChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  numInput: {
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    fontSize: 15,
    marginTop: 4,
  },
  notesInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 70,
    borderWidth: 1,
    fontSize: 14,
    marginTop: 4,
    textAlignVertical: 'top',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveButton: {
    marginTop: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 15,
  },
});
