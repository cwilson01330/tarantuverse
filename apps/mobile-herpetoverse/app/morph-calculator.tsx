/**
 * Morph calculator — standalone Punnett-square tool.
 *
 * Works offline once the gene catalog is cached. Two parent panels;
 * each holds a list of (gene, allele state) entries you build up via
 * the same shared modal pattern as GenotypeSection. Predicted offspring
 * panel below shows the top outcomes ranked by probability, with lethal
 * outcomes flagged and pushed to the bottom.
 *
 * The calculator can be opened standalone (empty parents) OR pre-filled
 * from a snake's recorded genotype via the `snakeId` query param.
 *
 * Currently only ball pythons have enough seeded gene data to be useful
 * — the species picker is a no-op until we expand the catalog. Web has
 * the same constraint.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { AppHeader } from '../src/components/AppHeader';
import { HeaderBackButton } from '../src/components/HeaderBackButton';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { useTheme } from '../src/contexts/ThemeContext';
import {
  CALCULATOR_SPECIES,
  type AlleleState,
  type CitationSourceType,
  type Gene,
  type GeneInput,
  type WelfareCitation,
  type WelfareFlag,
  combineOffspring,
  describeOutcome,
  fetchGenesForSpecies,
  formatProbability,
  listSnakeGenotype,
  stateLabel,
  stateToCount,
  validStatesForGene,
  zygosityToCount,
} from '../src/lib/genes';

interface ParentEntry {
  gene: Gene;
  state: AlleleState;
}

const TOP_N = 12;

// ---------------------------------------------------------------------------
// Gene-detail labels + colors — mirror the web morph calculator so cross-
// platform keepers see the same names and warning copy.
// ---------------------------------------------------------------------------

const WELFARE_FLAG_LABELS: Record<WelfareFlag, string> = {
  neurological: 'Neurological',
  structural: 'Structural',
  viability: 'Viability',
};

// (fg, bg) pairs. fg works on dark surfaces; bg is a 15-22% tint of fg.
const WELFARE_FLAG_COLORS: Record<WelfareFlag, { fg: string; bg: string; border: string }> = {
  neurological: { fg: '#fca5a5', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' },
  structural:   { fg: '#fcd34d', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  viability:    { fg: '#fda4af', bg: 'rgba(244,63,94,0.15)',  border: 'rgba(244,63,94,0.4)'  },
};

const SOURCE_TYPE_LABELS: Record<CitationSourceType, string> = {
  peer_reviewed: 'Peer reviewed',
  breeder_community: 'Breeder / community',
};

const SOURCE_TYPE_COLORS: Record<CitationSourceType, { fg: string; bg: string; border: string }> = {
  peer_reviewed: { fg: '#5eead4', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.4)' },
  breeder_community: { fg: '#d4d4d4', bg: 'rgba(64,64,64,0.4)', border: 'rgba(82,82,82,1)' },
};

function sortCitations(citations: WelfareCitation[]): WelfareCitation[] {
  const rank = (c: WelfareCitation) => (c.source_type === 'peer_reviewed' ? 0 : 1);
  return [...citations].sort((a, b) => rank(a) - rank(b));
}

function extractYear(date?: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(date);
  return m ? m[1] : null;
}

function MorphCalculatorScreen() {
  const { colors, layout } = useTheme();
  const { snakeId } = useLocalSearchParams<{ snakeId?: string }>();

  const species = CALCULATOR_SPECIES[0]; // Ball python only for now

  const [genes, setGenes] = useState<Gene[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parentA, setParentA] = useState<ParentEntry[]>([]);
  const [parentB, setParentB] = useState<ParentEntry[]>([]);
  const [activeParent, setActiveParent] = useState<'A' | 'B' | null>(null);

  // Fetch the gene catalog once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchGenesForSpecies(species.scientific_name);
        if (cancelled) return;
        setGenes(list ?? []);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Couldn't load the gene catalog.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [species.scientific_name]);

  // Pre-fill parent A from a snake's genotype when arriving with ?snakeId=...
  useEffect(() => {
    if (!snakeId || !genes) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSnakeGenotype(snakeId as string);
        if (cancelled) return;
        const entries: ParentEntry[] = rows
          .map((row) => {
            const g = genes.find((gx) => gx.id === row.gene_id);
            if (!g) return null;
            // Map the snake's recorded zygosity to the calculator's
            // AlleleState. zygosityToCount returns 0/1/2; we then map
            // back to a state appropriate for the gene type.
            const count = zygosityToCount(row.zygosity, g.gene_type);
            const state: AlleleState =
              count === 0
                ? 'absent'
                : count === 2
                  ? g.gene_type === 'recessive' || g.gene_type === 'dominant'
                    ? 'visual'
                    : 'super'
                  : g.gene_type === 'recessive'
                    ? 'het'
                    : 'visual';
            return { gene: g, state };
          })
          .filter(Boolean) as ParentEntry[];
        if (entries.length > 0) setParentA(entries);
      } catch {
        // Non-fatal — calculator still works empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snakeId, genes]);

  // Combine parent entries into GeneInput[] for the math layer.
  // If a gene appears on only one parent, the other is implicitly absent.
  const offspringInputs = useMemo<GeneInput[]>(() => {
    if (!genes) return [];
    const map = new Map<string, GeneInput>();
    parentA.forEach((e) => {
      map.set(e.gene.id, {
        gene: e.gene,
        parentA: stateToCount(e.state, e.gene.gene_type),
        parentB: 0,
      });
    });
    parentB.forEach((e) => {
      const existing = map.get(e.gene.id);
      const cnt = stateToCount(e.state, e.gene.gene_type);
      if (existing) {
        existing.parentB = cnt;
      } else {
        map.set(e.gene.id, {
          gene: e.gene,
          parentA: 0,
          parentB: cnt,
        });
      }
    });
    // Drop genes where both parents are absent — they don't affect math.
    return Array.from(map.values()).filter(
      (g) => g.parentA !== 0 || g.parentB !== 0,
    );
  }, [parentA, parentB, genes]);

  const outcomes = useMemo(
    () => combineOffspring(offspringInputs),
    [offspringInputs],
  );

  const inputGenes = offspringInputs.map((g) => g.gene);

  const handleAddToParent = (parent: 'A' | 'B', entry: ParentEntry) => {
    const setter = parent === 'A' ? setParentA : setParentB;
    setter((prev) => {
      // Replace if gene already in this parent's list, otherwise append.
      const exists = prev.some((e) => e.gene.id === entry.gene.id);
      if (exists) {
        return prev.map((e) =>
          e.gene.id === entry.gene.id ? entry : e,
        );
      }
      return [...prev, entry];
    });
  };

  const handleRemoveFromParent = (parent: 'A' | 'B', geneId: string) => {
    const setter = parent === 'A' ? setParentA : setParentB;
    setter((prev) => prev.filter((e) => e.gene.id !== geneId));
  };

  const handleClear = (parent: 'A' | 'B') => {
    if (parent === 'A') setParentA([]);
    else setParentB([]);
  };

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Morph calculator"
        subtitle={species.common_name}
        leftAction={<HeaderBackButton />}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {loadError ? (
          <Text style={{ color: colors.danger }}>{loadError}</Text>
        ) : !genes ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <ParentPanel
              label="Parent A"
              entries={parentA}
              onAdd={() => setActiveParent('A')}
              onRemove={(id) => handleRemoveFromParent('A', id)}
              onClear={() => handleClear('A')}
            />
            <ParentPanel
              label="Parent B"
              entries={parentB}
              onAdd={() => setActiveParent('B')}
              onRemove={(id) => handleRemoveFromParent('B', id)}
              onClear={() => handleClear('B')}
            />

            <Text
              style={[
                styles.sectionLabel,
                { color: colors.textSecondary, marginTop: 18 },
              ]}
            >
              Predicted offspring
            </Text>
            {outcomes.length === 0 ? (
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                Add at least one gene to a parent to see predicted offspring.
              </Text>
            ) : (
              <View
                style={[
                  styles.outcomeBox,
                  {
                    borderColor: colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
              >
                {outcomes.slice(0, TOP_N).map((o, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.outcomeRow,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth:
                          idx < Math.min(outcomes.length, TOP_N) - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: o.isLethal
                            ? colors.danger
                            : colors.textPrimary,
                          fontWeight: '600',
                          fontSize: 14,
                        }}
                        numberOfLines={2}
                      >
                        {describeOutcome(o, inputGenes)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {formatProbability(o.probability)}
                    </Text>
                  </View>
                ))}
                {outcomes.length > TOP_N ? (
                  <Text
                    style={[
                      styles.note,
                      {
                        color: colors.textTertiary,
                        padding: 12,
                        textAlign: 'center',
                      },
                    ]}
                  >
                    + {outcomes.length - TOP_N} less likely outcome
                    {outcomes.length - TOP_N === 1 ? '' : 's'} not shown
                  </Text>
                ) : null}
              </View>
            )}

            <Text
              style={[
                styles.disclaimer,
                { color: colors.textTertiary, marginTop: 16 },
              ]}
            >
              Probabilities assume independent assortment, no epistasis,
              no linkage — same model as MorphMarket / genecalc /
              World of Ball Pythons. Real clutches vary.
            </Text>
          </>
        )}
      </ScrollView>

      <PickGeneModal
        visible={activeParent !== null}
        onClose={() => setActiveParent(null)}
        genes={genes ?? []}
        existingForParent={
          activeParent === 'A'
            ? parentA
            : activeParent === 'B'
              ? parentB
              : []
        }
        onPick={(entry) => {
          if (activeParent) handleAddToParent(activeParent, entry);
          setActiveParent(null);
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Parent panel — chips with state + remove button
// ---------------------------------------------------------------------------

function ParentPanel({
  label,
  entries,
  onAdd,
  onRemove,
  onClear,
}: {
  label: string;
  entries: ParentEntry[];
  onAdd: () => void;
  onRemove: (geneId: string) => void;
  onClear: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <View style={styles.panelHeader}>
        <Text style={[styles.panelLabel, { color: colors.textPrimary }]}>
          {label}
        </Text>
        {entries.length > 0 ? (
          <TouchableOpacity onPress={onClear} hitSlop={8}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Clear
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {entries.length === 0 ? (
        <Text
          style={[
            styles.note,
            { color: colors.textTertiary, marginVertical: 4 },
          ]}
        >
          Wild type. Add a gene to start.
        </Text>
      ) : (
        <View style={styles.chipsWrap}>
          {entries.map((e) => (
            <TouchableOpacity
              key={e.gene.id}
              onPress={() => onRemove(e.gene.id)}
              style={[
                styles.parentChip,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  borderRadius: layout.radius.sm,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${e.gene.common_name}`}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontWeight: '600',
                  fontSize: 13,
                }}
              >
                {e.gene.common_name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                {stateLabel(e.state, e.gene.gene_type)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={onAdd}
        style={[
          styles.addButton,
          {
            borderColor: colors.primary,
            borderRadius: layout.radius.sm,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="plus"
          size={16}
          color={colors.primary}
        />
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
          Add gene
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PickGeneModal — search a gene, then pick its allele state
// ---------------------------------------------------------------------------

interface PickGeneModalProps {
  visible: boolean;
  onClose: () => void;
  genes: Gene[];
  existingForParent: ParentEntry[];
  onPick: (entry: ParentEntry) => void;
}

function PickGeneModal({
  visible,
  onClose,
  genes,
  existingForParent,
  onPick,
}: PickGeneModalProps) {
  const { colors, layout } = useTheme();

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Gene | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setPicked(null);
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

  const states = picked ? validStatesForGene(picked.gene_type) : [];

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
              {picked ? (
                <TouchableOpacity onPress={() => setPicked(null)} hitSlop={8}>
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
                {picked ? picked.common_name : 'Pick a gene'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {!picked ? (
              <View style={{ paddingTop: 4, paddingBottom: 8 }}>
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
                  style={{ maxHeight: 380 }}
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
                      const inUse = existingForParent.some(
                        (e) => e.gene.id === g.id,
                      );
                      // Welfare badge gives an early visual warning at the
                      // search list level — keeper sees "⚠ Neurological"
                      // before they tap into the gene details.
                      const welfareColors = g.welfare_flag
                        ? WELFARE_FLAG_COLORS[g.welfare_flag]
                        : null;
                      return (
                        <TouchableOpacity
                          key={g.id}
                          onPress={() => setPicked(g)}
                          style={[
                            styles.geneRow,
                            { borderBottomColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.geneRowTitle}>
                              <Text
                                style={{
                                  color: colors.textPrimary,
                                  fontWeight: '600',
                                  fontSize: 15,
                                }}
                              >
                                {g.common_name}
                              </Text>
                              {welfareColors && g.welfare_flag && (
                                <View
                                  style={[
                                    styles.welfareBadge,
                                    {
                                      backgroundColor: welfareColors.bg,
                                      borderColor: welfareColors.border,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.welfareBadgeText,
                                      { color: welfareColors.fg },
                                    ]}
                                  >
                                    ⚠ {WELFARE_FLAG_LABELS[g.welfare_flag]}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                color: colors.textSecondary,
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {g.gene_type.replace('_', ' ')}
                              {g.lethal_homozygous ? ' · lethal homozygous' : ''}
                              {inUse ? ' · already on this parent' : ''}
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
              <ScrollView
                style={{ maxHeight: 480 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 12, gap: 12 }}
              >
                {/* Gene details — description + welfare notes + citations.
                    Surfaces here (between gene pick and state pick) so the
                    keeper sees what they're picking AND has the welfare
                    context before they commit. Web parity: same content,
                    same source order, same citation badges. */}
                <GeneDetails gene={picked} />

                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 4 }]}>
                  How does Parent carry this gene?
                </Text>
                {states.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => onPick({ gene: picked, state: s })}
                    style={[
                      styles.stateRow,
                      {
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontWeight: '600',
                        fontSize: 14,
                        flex: 1,
                      }}
                    >
                      {stateLabel(s, picked.gene_type)}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// GeneDetails — description, welfare notes, citations. Inline disclosure so
// the keeper can verify every welfare claim without leaving the calculator.
// Mirrors web's GeneDetails component (apps/web-herpetoverse/.../MorphCalculator.tsx).
// ---------------------------------------------------------------------------

function GeneDetails({ gene }: { gene: Gene }) {
  const { colors, layout } = useTheme();
  const citations = gene.welfare_citations ?? [];
  const hasCitations = citations.length > 0;
  const sorted = hasCitations ? sortCitations(citations) : [];
  const reviewedAt = gene.content_last_reviewed_at;
  const welfareColors = gene.welfare_flag
    ? WELFARE_FLAG_COLORS[gene.welfare_flag]
    : null;

  const hasAnyDetail =
    !!gene.description ||
    (!!gene.welfare_flag && !!gene.welfare_notes) ||
    hasCitations ||
    !!reviewedAt;

  if (!hasAnyDetail) {
    return (
      <View
        style={[
          styles.detailsCard,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
      >
        <Text style={[styles.detailsEmpty, { color: colors.textTertiary }]}>
          No additional notes on file for this gene yet.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.detailsCard,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      {gene.description && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.detailsLabel, { color: colors.textTertiary }]}>
            What it does
          </Text>
          <Text style={[styles.detailsBody, { color: colors.textPrimary }]}>
            {gene.description}
          </Text>
        </View>
      )}

      {gene.welfare_flag && gene.welfare_notes && welfareColors && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.detailsLabel, { color: colors.textTertiary }]}>
            Welfare notes ({WELFARE_FLAG_LABELS[gene.welfare_flag]})
          </Text>
          <View
            style={{
              backgroundColor: welfareColors.bg,
              borderColor: welfareColors.border,
              borderWidth: 1,
              borderRadius: 8,
              padding: 10,
            }}
          >
            <Text style={{ color: welfareColors.fg, fontSize: 12, lineHeight: 17 }}>
              {gene.welfare_notes}
            </Text>
          </View>
        </View>
      )}

      {hasCitations ? (
        <View style={{ marginBottom: reviewedAt ? 10 : 0 }}>
          <Text style={[styles.detailsLabel, { color: colors.textTertiary }]}>
            References ({sorted.length})
          </Text>
          <View style={{ gap: 8 }}>
            {sorted.map((c, i) => (
              <CitationItem key={c.ref_key ?? c.url ?? String(i)} citation={c} />
            ))}
          </View>
        </View>
      ) : gene.welfare_flag ? (
        <Text
          style={{
            color: '#fcd34d',
            fontSize: 11,
            fontStyle: 'italic',
            marginBottom: reviewedAt ? 10 : 0,
          }}
        >
          Welfare flag set but no citations attached yet.
        </Text>
      ) : null}

      {reviewedAt && (
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: 10,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          Content last reviewed{' '}
          {new Date(reviewedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
          .
        </Text>
      )}
    </View>
  );
}

function CitationItem({ citation }: { citation: WelfareCitation }) {
  const { colors } = useTheme();
  const year = extractYear(citation.publication_date);
  const authorYear = [citation.author, year].filter(Boolean).join(', ');
  const title = citation.title ?? citation.url ?? 'Reference';
  const publication = citation.publication;
  const badgeColors = citation.source_type
    ? SOURCE_TYPE_COLORS[citation.source_type]
    : null;
  const badgeLabel = citation.source_type
    ? SOURCE_TYPE_LABELS[citation.source_type]
    : 'Reference';

  const titleNode = citation.url ? (
    <TouchableOpacity
      onPress={() => {
        if (citation.url) Linking.openURL(citation.url);
      }}
      accessibilityRole="link"
      accessibilityLabel={`Open ${title} in browser`}
    >
      <Text style={{ color: '#5eead4', fontSize: 12, textDecorationLine: 'underline' }}>
        {title}
      </Text>
    </TouchableOpacity>
  ) : (
    <Text style={{ color: colors.textPrimary, fontSize: 12 }}>{title}</Text>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      {badgeColors && (
        <View
          style={{
            backgroundColor: badgeColors.bg,
            borderColor: badgeColors.border,
            borderWidth: 1,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            marginTop: 2,
          }}
        >
          <Text
            style={{
              color: badgeColors.fg,
              fontSize: 9,
              fontWeight: '700',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {badgeLabel}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {titleNode}
        {(authorYear || publication) && (
          <Text
            style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}
          >
            {authorYear}
            {authorYear && publication ? ' · ' : ''}
            {publication ? <Text style={{ fontStyle: 'italic' }}>{publication}</Text> : null}
          </Text>
        )}
        {citation.summary && (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 11,
              fontStyle: 'italic',
              marginTop: 4,
              lineHeight: 16,
            }}
          >
            “{citation.summary}”
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { paddingVertical: 40, alignItems: 'center' },
  note: { fontSize: 13, lineHeight: 19 },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  panel: {
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelLabel: { fontSize: 14, fontWeight: '700' },

  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  parentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  addButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },

  outcomeBox: {
    borderWidth: 1,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },

  // Modal shared with GenotypeSection's add modal
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  geneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
  },
  geneRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  welfareBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  welfareBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  detailsCard: {
    borderWidth: 1,
    padding: 12,
  },
  detailsLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailsBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  detailsEmpty: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default withErrorBoundary(MorphCalculatorScreen, 'morph-calculator');
