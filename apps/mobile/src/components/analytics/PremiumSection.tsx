import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import {
  SAMPLE_ADVANCED,
  SAMPLE_NOW,
  SAMPLE_SENTENCE,
  SEMANTIC_COLORS,
  barsModel,
  formatCount,
  growthBaseline,
  previewFromCollection,
  type AdvancedAnalytics,
  type CollectionAnalytics,
  type SplitPart,
} from '../../lib/analytics-view';
import { INVERT_TAXA, isInvertTaxon } from '../../lib/inverts';
import { Bars, SplitBar, StepLine } from '../charts';
import { PrimaryButton } from '../PrimaryButton';
import { AnalyticsCard, CardHeading, MIN_TOUCH, ON_PRIMARY, OutlineButton } from './parts';
import { PremiumSkeleton } from './AnalyticsSkeleton';
import { MoneyCard } from './MoneyCard';

export type PremiumState =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'member'; advanced: AdvancedAnalytics; onSaveCost: (value: number | null) => Promise<void> }
  | { kind: 'preview'; collection: CollectionAnalytics; onSeePremium: () => void }
  | { kind: 'sample' };

/** README §6 split palette after the fixed sex colours: molt purple, success, warning, info (primary first, from the theme). */
const SPLIT_FIXED = [SEMANTIC_COLORS.molt, SEMANTIC_COLORS.success, SEMANTIC_COLORS.warning, SEMANTIC_COLORS.info];

/** The preview block is never taller than ~300pt (README §3). */
const PREVIEW_MAX_HEIGHT = 300;
/** README §3: the washed-out layer is the cards at 35% over `surfaceElevated`. */
const PREVIEW_OPACITY = 0.35;

function splitParts(
  dist: Record<string, number> | undefined,
  primary: string,
  labelFor: (key: string, count: number) => string,
): SplitPart[] {
  const palette = [primary, ...SPLIT_FIXED];
  return Object.entries(dist ?? {})
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], i) => ({ key, count, color: palette[i % palette.length], label: labelFor(key, count) }));
}

/** "3 tarantulas", "2 true spiders", "1 roach": the group word, pluralised past one. */
function groupWord(name: string, count: number): string {
  if (count === 1) return name;
  if (/(ch|sh|s|x)$/.test(name)) return `${name}es`; // roach -> roaches, mantis -> mantises
  return `${name}s`;
}

// ───────────────────────────── label row ─────────────────────────────

function LabelRow({ state }: { state: PremiumState }) {
  const { colors, theme, layout } = useTheme();
  const member = state.kind === 'member' || state.kind === 'error';
  const lilac = theme === 'dark' ? SEMANTIC_COLORS.premiumDark : SEMANTIC_COLORS.premiumLight;
  const text = state.kind === 'preview' ? 'PREMIUM · PREVIEW OF YOUR DATA' : 'PREMIUM';
  return (
    <View style={styles.labelRow}>
      {member ? (
        <MaterialCommunityIcons name="star-four-points-outline" size={14} color={lilac} />
      ) : state.kind === 'loading' ? null : (
        <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textTertiary} />
      )}
      <Text accessibilityRole="header" style={[styles.labelText, { color: colors.textTertiary }]}>
        {text}
      </Text>
      {state.kind === 'sample' ? (
        <View style={[styles.sampleChip, { borderColor: colors.border, borderRadius: layout.radius.full }]}>
          <Text style={[styles.sampleChipText, { color: colors.textTertiary }]}>SAMPLE DATA</Text>
        </View>
      ) : null}
    </View>
  );
}

// ───────────────────────────── the cards ─────────────────────────────

function MoltsBarsCard({
  series,
  now,
  sample,
  muted,
}: {
  series: { month: string; count: number }[];
  now: Date;
  sample?: boolean;
  muted?: boolean;
}) {
  const total = barsModel(series, 300, now).total;
  return (
    <AnalyticsCard sample={sample}>
      <CardHeading icon="butterfly-outline" title="Molts, last 12 months" trailing={`${formatCount(total)} total`} />
      <Bars series={series} now={now} muted={muted || sample} sentence={sample ? SAMPLE_SENTENCE : undefined} />
    </AnalyticsCard>
  );
}

function GrowthCard({
  series,
  baseline,
  sample,
  muted,
}: {
  series: { month: string; count: number }[];
  baseline: number;
  sample?: boolean;
  muted?: boolean;
}) {
  return (
    <AnalyticsCard sample={sample}>
      <CardHeading icon="trending-up" title="Collection growth" />
      <StepLine series={series} baseline={baseline} muted={muted || sample} />
    </AnalyticsCard>
  );
}

function EnclosuresCard({ dist }: { dist: Record<string, number> | undefined }) {
  const { colors } = useTheme();
  const parts = splitParts(dist, colors.primary, (k) => k);
  if (parts.length === 0) return null;
  return (
    <AnalyticsCard>
      <CardHeading icon="home-outline" title="Enclosures" />
      <SplitBar parts={parts} />
    </AnalyticsCard>
  );
}

function ByGroupCard({ dist }: { dist: Record<string, number> | undefined }) {
  const { colors } = useTheme();
  // Only says something when more than one group has animals (zero-count keys don't count).
  const parts = splitParts(dist, colors.primary, (k, n) =>
    groupWord(isInvertTaxon(k) ? INVERT_TAXA[k].label.toLowerCase() : k, n),
  );
  if (parts.length <= 1) return null;
  return (
    <AnalyticsCard>
      <CardHeading icon="layers-outline" title="By group" />
      <SplitBar parts={parts} />
    </AnalyticsCard>
  );
}

// ───────────────────────────── states ─────────────────────────────

function MemberCards({
  advanced,
  now,
  onSaveCost,
}: {
  advanced: AdvancedAnalytics;
  now: Date;
  onSaveCost: (value: number | null) => Promise<void>;
}) {
  return (
    <View style={styles.stack}>
      <MoltsBarsCard series={advanced.molt_heatmap} now={now} />
      <GrowthCard series={advanced.collection_growth} baseline={growthBaseline(advanced)} />
      <EnclosuresCard dist={advanced.enclosure_type_distribution} />
      <ByGroupCard dist={advanced.taxon_distribution} />
      <MoneyCard mode="member" data={advanced} onSaveCost={onSaveCost} />
    </View>
  );
}

function PreviewBlock({
  collection,
  now,
  onSeePremium,
}: {
  collection: CollectionAnalytics;
  now: Date;
  onSeePremium: () => void;
}) {
  const { colors, layout } = useTheme();
  const preview = previewFromCollection(collection, now);
  const animals = collection.total_animals || collection.total_tarantulas;
  return (
    <View
      style={[
        styles.previewFrame,
        { borderRadius: layout.radius.lg, backgroundColor: colors.surfaceElevated, maxHeight: PREVIEW_MAX_HEIGHT },
      ]}
    >
      {/* Nothing in here is real data and nothing free sits inside it: hidden from
          screen readers, untouchable, and washed out (no blur library in the binary). */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.stack, { opacity: PREVIEW_OPACITY }]}
      >
        <MoltsBarsCard series={preview.moltSeries} now={now} muted />
        <GrowthCard series={preview.growthSeries} baseline={0} muted />
        <MoneyCard mode="preview" paid={preview.money} />
      </View>

      <View style={styles.unlockLayer} pointerEvents="box-none">
        <View
          style={[
            styles.unlockCard,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
          ]}
        >
          <Text style={[styles.unlockTitle, { color: colors.textPrimary }]}>Molt timing, growth and what you spend</Text>
          <Text style={[styles.unlockBody, { color: colors.textSecondary }]}>
            Computed from your {formatCount(animals)} {animals === 1 ? 'animal' : 'animals'}. Premium unlocks the detail.
          </Text>
          <PrimaryButton
            onPress={onSeePremium}
            accessibilityLabel="See Premium"
            accessibilityRole="button"
            style={[styles.unlockButton, { borderRadius: layout.radius.sm }]}
          >
            <Text style={[styles.unlockButtonText, { color: ON_PRIMARY }]}>See Premium</Text>
          </PrimaryButton>
          <Text style={[styles.unlockCaption, { color: colors.textTertiary }]}>No charge until you choose.</Text>
        </View>
      </View>
    </View>
  );
}

function SampleBlock() {
  return (
    <View style={styles.stack}>
      <MoltsBarsCard series={SAMPLE_ADVANCED.molt_heatmap} now={SAMPLE_NOW} sample />
      <GrowthCard series={SAMPLE_ADVANCED.collection_growth} baseline={growthBaseline(SAMPLE_ADVANCED)} sample />
      <MoneyCard mode="sample" data={SAMPLE_ADVANCED} />
    </View>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <AnalyticsCard style={styles.errorCard}>
      <MaterialCommunityIcons name="alert-outline" size={34} color={SEMANTIC_COLORS.warning} />
      <Text accessibilityRole="header" style={[styles.errorTitle, { color: colors.textPrimary }]}>
        We couldn&apos;t load your Premium insights.
      </Text>
      <OutlineButton label="Try again" onPress={onRetry} />
    </AnalyticsCard>
  );
}

/** Blocks 6-10: the Premium label row and whichever of member / preview / sample / error / loading applies. */
export function PremiumSection({ state, now }: { state: PremiumState; now: Date }) {
  return (
    <View style={styles.section}>
      <LabelRow state={state} />
      {state.kind === 'loading' && <PremiumSkeleton />}
      {state.kind === 'error' && <ErrorCard onRetry={state.onRetry} />}
      {state.kind === 'member' && <MemberCards advanced={state.advanced} now={now} onSaveCost={state.onSaveCost} />}
      {state.kind === 'preview' && (
        <PreviewBlock collection={state.collection} now={now} onSeePremium={state.onSeePremium} />
      )}
      {state.kind === 'sample' && <SampleBlock />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  stack: { gap: SPACING.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingTop: SPACING.xs, minHeight: 20 },
  labelText: { ...TYPE.eyebrow },
  sampleChip: {
    marginLeft: 'auto',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  sampleChipText: { ...TYPE.microBold },
  previewFrame: { overflow: 'hidden' },
  unlockLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: SPACING.md },
  unlockCard: {
    alignSelf: 'stretch',
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
    // README: 0 8px 24px rgba(0,0,0,.25)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  unlockTitle: { ...TYPE.panelTitle },
  unlockBody: { ...TYPE.panelBody },
  unlockButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockButtonText: { ...TYPE.smallBold },
  unlockCaption: { ...TYPE.note },
  errorCard: { alignItems: 'center', paddingVertical: SPACING.xl },
  errorTitle: { ...TYPE.subheadingBold, textAlign: 'center' },
});
