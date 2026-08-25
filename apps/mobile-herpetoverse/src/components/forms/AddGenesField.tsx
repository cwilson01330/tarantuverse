/**
 * AddGenesField — pick a snake's genes while ADDING it, not after.
 *
 * Why this exists: for a ball python keeper the morph *is* the animal —
 * it's how they describe it, price it and search for it. But the add form
 * had no genotype input at all, so every new snake had to be saved,
 * reopened, and edited through the detail screen's Genetics section. Three
 * screens to record the single most important attribute.
 *
 * Design handoff Screen 10, item 2.
 *
 * ── Why it doesn't reuse GenotypeSection ──────────────────────────────
 *
 * `GenotypeSection` writes straight through to
 * `POST /animals/{id}/genotype`, which needs an animal that already
 * exists. On the add screen there is no id yet. So this component is
 * purely local state — it hands the parent a list of
 * `CreateGenotypePayload`, and the parent attaches them after the animal
 * is created. Nothing here touches the network except loading the gene
 * catalog.
 *
 * Genes are species-scoped, so this renders only once a scientific name is
 * known. Without one there is no catalog to search and a picker would be
 * an empty box.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import {
  type CreateGenotypePayload,
  type Gene,
  type Zygosity,
  fetchGenesForSpecies,
} from '../../lib/genes';

/** A locally-picked gene, before the animal exists. */
export interface PickedGene {
  gene: Gene;
  zygosity: Zygosity;
}

/** Convert what the keeper picked into create payloads. */
export function pickedGenesToPayloads(picked: PickedGene[]): CreateGenotypePayload[] {
  return picked.map((p) => ({
    gene_id: p.gene.id,
    zygosity: p.zygosity,
  }));
}

/**
 * Zygosity options per gene type. Recessive genes are the ones where
 * "het" is meaningful; a dominant gene is either present or not, so
 * offering "het" there would invite a wrong record.
 */
function zygosityOptions(g: Gene): Zygosity[] {
  if (g.gene_type === 'recessive') return ['visual', 'het', 'poss_het'];
  if (g.gene_type === 'codominant' || g.gene_type === 'incomplete_dominant') {
    return ['visual', 'super'];
  }
  return ['visual'];
}

const ZYG_LABEL: Record<Zygosity, string> = {
  visual: 'Visual',
  het: 'Het',
  poss_het: 'Poss het',
  super: 'Super',
};

export function AddGenesField({
  scientificName,
  picked,
  onChange,
}: {
  scientificName: string;
  picked: PickedGene[];
  onChange: (next: PickedGene[]) => void;
}) {
  const { colors } = useTheme();
  const [catalog, setCatalog] = useState<Gene[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const sci = scientificName.trim();

  useEffect(() => {
    if (!sci) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGenesForSpecies(sci)
      .then((g) => {
        if (!cancelled) setCatalog(g);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sci]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const pickedIds = new Set(picked.map((p) => p.gene.id));
    return catalog
      .filter((g) => !pickedIds.has(g.id))
      .filter(
        (g) =>
          !q ||
          g.common_name.toLowerCase().includes(q) ||
          (g.symbol ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [catalog, query, picked]);

  function add(g: Gene) {
    // Default to the first valid zygosity for the gene's type rather than
    // a blanket "visual" — the keeper can change it on the chip.
    onChange([...picked, { gene: g, zygosity: zygosityOptions(g)[0] }]);
    setQuery('');
    setOpen(false);
  }

  function cycleZygosity(id: string) {
    onChange(
      picked.map((p) => {
        if (p.gene.id !== id) return p;
        const opts = zygosityOptions(p.gene);
        const i = opts.indexOf(p.zygosity);
        return { ...p, zygosity: opts[(i + 1) % opts.length] };
      }),
    );
  }

  // No species yet — say why instead of rendering a dead control.
  if (!sci) {
    return (
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        Pick a species above to choose genes.
      </Text>
    );
  }

  if (loading && catalog === null) {
    return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  }

  // An em dash where a list would be is the tell for "we couldn't load
  // this", which is not the same as "this species has no genes".
  if (catalog === null) {
    return (
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        Couldn&rsquo;t load the gene catalog. You can add genes later from the
        animal&rsquo;s Genetics section.
      </Text>
    );
  }

  if (catalog.length === 0) {
    return (
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        No genes catalogued for {sci} yet.
      </Text>
    );
  }

  return (
    <View>
      {picked.length > 0 && (
        <View style={styles.chipRow}>
          {picked.map((p) => (
            <View
              key={p.gene.id}
              style={[styles.chip, { backgroundColor: colors.primary + '24', borderColor: colors.primary + '55' }]}
            >
              {/* Tapping the label cycles zygosity — het → poss het →
                  visual — so changing it costs one tap, not a modal. */}
              <TouchableOpacity
                onPress={() => cycleZygosity(p.gene.id)}
                accessibilityRole="button"
                accessibilityLabel={`${p.gene.common_name}, ${ZYG_LABEL[p.zygosity]}. Tap to change zygosity.`}
              >
                <Text style={[styles.chipText, { color: colors.textPrimary }]}>
                  {p.gene.common_name}
                  <Text style={{ color: colors.accent }}>
                    {'  '}
                    {ZYG_LABEL[p.zygosity]}
                  </Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange(picked.filter((x) => x.gene.id !== p.gene.id))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.gene.common_name}`}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={14}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {open ? (
        <View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search genes — Pastel, Clown…"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            autoCorrect={false}
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            accessibilityLabel="Search genes"
          />
          <View style={styles.results}>
            {results.map((g) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => add(g)}
                style={[styles.result, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Add ${g.common_name}`}
              >
                <Text style={[styles.resultName, { color: colors.textPrimary }]}>
                  {g.common_name}
                </Text>
                <Text style={[styles.resultType, { color: colors.textTertiary }]}>
                  {g.gene_type.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
            {results.length === 0 && (
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                No matches.
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              setOpen(false);
              setQuery('');
            }}
            style={styles.cancel}
            accessibilityRole="button"
            accessibilityLabel="Done adding genes"
          >
            <Text style={[styles.cancelText, { color: colors.textTertiary }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setOpen(true)}
          style={[styles.addChip, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Add a gene"
        >
          <MaterialCommunityIcons name="plus" size={14} color={colors.accent} />
          <Text style={[styles.addChipText, { color: colors.accent }]}>
            Add gene
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12.5, lineHeight: 18 },
  loading: { alignSelf: 'flex-start', marginVertical: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },

  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addChipText: { fontSize: 12, fontWeight: '700' },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  results: { marginTop: 4 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  resultName: { fontSize: 14, fontWeight: '600' },
  resultType: { fontSize: 11.5, textTransform: 'capitalize' },

  cancel: { paddingVertical: 10, alignSelf: 'flex-start' },
  cancelText: { fontSize: 13, fontWeight: '600' },
});
