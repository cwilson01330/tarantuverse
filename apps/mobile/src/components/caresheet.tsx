/**
 * Shared care-sheet presentation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Tarantuverse has two care-sheet screens that will not merge cheaply:
 *
 *   app/species/[id].tsx         tarantulas   (`Species`)
 *   app/invert-species/[id].tsx  nine taxa    (`InvertSpecies`)
 *
 * Their DATA models genuinely differ — tarantulas carry
 * `urticating_hairs` + `medically_significant_venom` booleans, while inverts
 * carry a `venom_severity` enum with `venom_notes`, plus `communal_suitable`
 * and `feeding_mode` that tarantulas don't have at all. Collapsing those into
 * one screen means one component branching on two response shapes, which is
 * how the per-taxon screens got unmaintainable the first time.
 *
 * What they share is how they LOOK. So the presentation lives here and each
 * screen keeps its own data adapter: the visual layer is written once, and
 * neither taxon group is second-class, without pretending the two payloads
 * are the same thing.
 *
 * Everything here is presentational — no fetching, no navigation decisions.
 * Colors come from the caller so this stays theme-agnostic.
 */
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type Colors = any;

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export interface CareSheetBadge {
  label: string;
  /** Solid background. Omit for the neutral translucent treatment. */
  color?: string;
}

/**
 * Share a care sheet. Kept here so both screens produce identical share text
 * and neither has to remember to swallow the dismissal rejection.
 */
export async function shareSpecies(scientificName: string, commonName: string | undefined, id: string) {
  try {
    await Share.share({
      message: commonName
        ? `${commonName} (${scientificName}) — care sheet on Tarantuverse\nhttps://tarantuverse.com/species/${id}`
        : `${scientificName} — care sheet on Tarantuverse\nhttps://tarantuverse.com/species/${id}`,
    });
  } catch {
    // Dismissed, or the platform refused. Nothing to recover from and nothing
    // worth interrupting the keeper over.
  }
}

export function CareSheetHero({
  imageUrl,
  commonName,
  scientificName,
  isVerified,
  badges,
  topInset,
  onBack,
  onShare,
  fallbackIcon = 'spider-web',
  colors,
}: {
  imageUrl?: string | null;
  commonName?: string | null;
  scientificName: string;
  isVerified?: boolean;
  badges: CareSheetBadge[];
  topInset: number;
  onBack: () => void;
  onShare: () => void;
  /** MDI glyph shown when the species has no photo. */
  fallbackIcon?: string;
  colors: Colors;
}) {
  return (
    <View style={styles.heroContainer}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
      ) : (
        // Most catalog entries have no photo. A centred glyph reads as
        // deliberate; an empty dark box reads as a failed image load.
        <View style={styles.heroFallback}>
          <MaterialCommunityIcons name={fallbackIcon as any} size={64} color="rgba(255,255,255,0.16)" />
        </View>
      )}
      <View style={styles.heroGradient} />

      <TouchableOpacity
        onPress={onBack}
        style={[styles.floatingAction, { left: 16, top: topInset + 8 }]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={22} color="#ffffff" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onShare}
        style={[styles.floatingAction, { right: 16, top: topInset + 8 }]}
        accessibilityRole="button"
        accessibilityLabel={`Share ${scientificName}`}
      >
        <MaterialCommunityIcons name="share-variant-outline" size={20} color="#ffffff" />
      </TouchableOpacity>

      {/* Common name ABOVE the binomial — people search and speak in common
          names; the scientific name is the qualifier, not the headline. */}
      <View style={styles.heroContent}>
        {!!commonName && (
          <Text style={styles.heroCommonName} numberOfLines={1}>
            {commonName}
          </Text>
        )}
        <View style={styles.heroNameRow}>
          <Text style={styles.heroScientificName} numberOfLines={2}>
            {scientificName}
          </Text>
          {isVerified && <MaterialCommunityIcons name="check-decagram" size={16} color="#22c55e" />}
        </View>

        <View style={styles.badgeRow}>
          {badges.map((b) => (
            <View
              key={b.label}
              style={[styles.badge, b.color ? { backgroundColor: b.color } : styles.badgeNeutral]}
            >
              <Text style={styles.badgeText}>{b.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick stats
// ---------------------------------------------------------------------------

export interface QuickStatSpec {
  icon: string;
  value?: string | null;
  label: string;
}

/**
 * Four stats across. Always renders every slot — a missing value shows "—"
 * rather than collapsing, so the row keeps even columns across species
 * instead of reflowing to two or three depending on catalog completeness.
 */
export function QuickStatsRow({ stats, colors }: { stats: QuickStatSpec[]; colors: Colors }) {
  return (
    <View style={styles.quickStatsRow}>
      {stats.map((s) => (
        <View
          key={s.label}
          style={[styles.quickStat, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name={s.icon as any} size={18} color={colors.primary} />
          <Text
            style={[styles.quickStatValue, { color: s.value ? colors.textPrimary : colors.textTertiary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {s.value || '—'}
          </Text>
          <Text style={[styles.quickStatLabel, { color: colors.textTertiary }]} numberOfLines={1}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/**
 * One safety line. Replaces stacked warning blocks that repeated what the
 * hero badges already said. `accent` drives the left border and icon, so the
 * same component covers a red venom warning and a green "harmless" note.
 */
export function SafetyLine({
  accent,
  icon = 'alert',
  title,
  body,
  colors,
}: {
  accent: string;
  icon?: string;
  title: string;
  body: string;
  colors: Colors;
}) {
  return (
    <View style={[styles.safetyLine, { backgroundColor: colors.surface, borderLeftColor: accent }]}>
      <MaterialCommunityIcons name={icon as any} size={19} color={accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.safetyTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.safetyBody, { color: colors.textTertiary }]}>{body}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export function CareAccordion({
  title,
  icon,
  isExpanded,
  onToggle,
  preview,
  colors,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isExpanded: boolean;
  onToggle: () => void;
  /** Right-aligned summary shown only while collapsed, so a closed sheet
   *  still says what's inside instead of showing a stack of grey bars. */
  preview?: string | null;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.accordion, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.accordionHeader}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={title}
      >
        <View style={styles.accordionTitleGroup}>
          <Ionicons name={icon} size={22} color={colors.primary} />
          <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        <View style={styles.accordionRight}>
          {!isExpanded && !!preview && (
            <Text style={[styles.accordionPreview, { color: colors.textTertiary }]} numberOfLines={1}>
              {preview}
            </Text>
          )}
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
      {isExpanded && <View style={styles.accordionContent}>{children}</View>}
    </View>
  );
}

/** Label/value row inside an accordion. Renders nothing without a value. */
export function CareFact({
  label,
  value,
  italic,
  colors,
}: {
  label: string;
  value?: string | number | null;
  italic?: boolean;
  colors: Colors;
}) {
  if (value === null || value === undefined || `${value}`.trim() === '') return null;
  return (
    <View style={[styles.factRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.factLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text
        style={[styles.factValue, { color: colors.textPrimary }, italic && { fontStyle: 'italic' }]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Joins non-empty parts of an accordion preview with a middot. */
export function previewOf(...parts: Array<string | number | null | undefined>): string | null {
  const kept = parts.filter((p) => p !== null && p !== undefined && `${p}`.trim() !== '');
  return kept.length ? kept.join(' · ') : null;
}

/** Shared care-level presentation. The word, never a bare glyph — colour
 *  alone fails for colour-blind keepers and nothing teaches a ✓/⚠/⚡ mapping. */
export function careLevelMeta(level?: string | null, fallbackColor = '#9ca3af') {
  switch (level) {
    case 'beginner':
      return { color: '#22c55e', text: 'Beginner' };
    case 'intermediate':
      return { color: '#eab308', text: 'Intermediate' };
    case 'advanced':
      return { color: '#f97316', text: 'Advanced' };
    default:
      return { color: fallbackColor, text: 'Unknown' };
  }
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  heroContainer: {
    position: 'relative',
    height: 192,
    backgroundColor: '#1e293b',
  },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  floatingAction: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  heroCommonName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroScientificName: {
    fontSize: 23,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#ffffff',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  badgeNeutral: { backgroundColor: 'rgba(10,10,15,0.55)' },
  badgeText: { fontSize: 11.5, fontWeight: '700', color: '#ffffff' },

  quickStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickStatValue: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  quickStatLabel: { fontSize: 10.5, fontWeight: '400' },

  safetyLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 12,
    paddingLeft: 14,
    borderRadius: 12,
    borderLeftWidth: 3,
    marginBottom: 16,
  },
  safetyTitle: { fontSize: 13.5, fontWeight: '700', marginBottom: 3 },
  safetyBody: { fontSize: 12.5, lineHeight: 18 },

  accordion: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  accordionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  accordionTitle: { fontSize: 15, fontWeight: '700' },
  accordionRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  accordionPreview: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  accordionContent: { paddingHorizontal: 14, paddingBottom: 14 },

  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factLabel: { fontSize: 13 },
  factValue: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 12 },
});
