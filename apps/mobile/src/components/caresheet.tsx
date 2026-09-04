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
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, Modal } from 'react-native';
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

/**
 * Compact care-sheet header.
 *
 * WHY NO PHOTO HERO
 * -----------------
 * This was a 192pt image hero. But 206 of 401 catalog species have no photo
 * at all (and only 102 of 197 tarantulas do), so on half the catalog that
 * hero was a large empty frame pushing the husbandry data — the reason people
 * open a care sheet — below the fold. The header's cost was paid on every
 * sheet; its benefit landed on half.
 *
 * The photo isn't gone: when one exists it renders as a 72pt thumbnail beside
 * the name, tappable for the full image. Zero footprint when absent.
 *
 * ATTRIBUTION IS NOT OPTIONAL. These images are Wikimedia CC-BY. Wherever the
 * photo goes, `imageAttribution` goes with it — hence the caption in the
 * full-screen viewer. Don't drop it in a future restyle.
 */
export function CareSheetHero({
  imageUrl,
  imageAttribution,
  commonName,
  scientificName,
  isVerified,
  badges,
  topInset,
  onBack,
  onShare,
  onToggleBookmark,
  isBookmarked,
  bookmarkBusy,
  fallbackIcon = 'spider-web',
  colors,
}: {
  imageUrl?: string | null;
  /** CC-BY credit line. Required whenever imageUrl is present. */
  imageAttribution?: string | null;
  commonName?: string | null;
  scientificName: string;
  isVerified?: boolean;
  badges: CareSheetBadge[];
  topInset: number;
  onBack: () => void;
  onShare: () => void;
  /** Omit to hide the bookmark entirely (e.g. signed-out viewers). */
  onToggleBookmark?: () => void;
  isBookmarked?: boolean;
  bookmarkBusy?: boolean;
  /** MDI glyph shown in the thumbnail slot when there's no photo. */
  fallbackIcon?: string;
  colors: Colors;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const action = (
    key: string,
    icon: string,
    label: string,
    onPress: () => void,
    opts?: { active?: boolean; busy?: boolean; ionicon?: boolean },
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      disabled={opts?.busy}
      style={[styles.headerAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!opts?.active, busy: !!opts?.busy }}
    >
      {opts?.ionicon ? (
        <Ionicons name={icon as any} size={20} color={colors.textPrimary} />
      ) : (
        <MaterialCommunityIcons
          name={icon as any}
          size={19}
          color={opts?.active ? '#fbbf24' : colors.textPrimary}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.header, { paddingTop: topInset + 8 }]}>
      <View style={styles.headerActionRow}>
        {action('back', 'arrow-back', 'Go back', onBack, { ionicon: true })}
        <View style={{ flex: 1 }} />
        {!!onToggleBookmark &&
          action(
            'bookmark',
            isBookmarked ? 'bookmark' : 'bookmark-outline',
            isBookmarked
              ? `Remove ${scientificName} from your shortlist`
              : `Save ${scientificName} to your shortlist`,
            onToggleBookmark,
            { active: isBookmarked, busy: bookmarkBusy },
          )}
        {action('share', 'share-variant-outline', `Share ${scientificName}`, onShare)}
      </View>

      <View style={styles.headerBody}>
        <View style={{ flex: 1 }}>
          {/* Common name ABOVE the binomial — people search and speak in
              common names; the scientific name is the qualifier. */}
          {!!commonName && (
            <Text style={[styles.headerCommonName, { color: colors.textTertiary }]} numberOfLines={1}>
              {commonName}
            </Text>
          )}
          <View style={styles.headerNameRow}>
            <Text
              style={[styles.headerScientificName, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {scientificName}
            </Text>
            {isVerified && (
              <MaterialCommunityIcons name="check-decagram" size={16} color="#22c55e" />
            )}
          </View>
        </View>

        {/* Thumbnail only when there IS a photo — no empty frame otherwise.
            `imageFailed` covers the case where a URL exists but can't load:
            ~12 catalog entries hotlink upload.wikimedia.org, which returns 403
            to clients that don't send a browser User-Agent (React Native's
            Image doesn't). Without this they render as a blank box. */}
        {!!imageUrl && !imageFailed && (
          <TouchableOpacity
            onPress={() => setPhotoOpen(true)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`View photo of ${scientificName}`}
            style={[styles.headerThumb, { borderColor: colors.border }]}
          >
            <Image
              source={{ uri: imageUrl }}
              style={styles.headerThumbImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.badgeRow}>
        {badges.map((b) => (
          <View
            key={b.label}
            style={[
              styles.badge,
              b.color
                ? { backgroundColor: b.color + '24' }
                : { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.badgeText, { color: b.color ?? colors.textSecondary }]}>
              {b.label}
            </Text>
          </View>
        ))}
      </View>

      <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
        <View style={styles.photoBackdrop}>
          <TouchableOpacity
            style={styles.photoClose}
            onPress={() => setPhotoOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {!!imageUrl && (
            <Image source={{ uri: imageUrl }} style={styles.photoFull} resizeMode="contain" />
          )}
          {/* CC-BY credit travels with the photo. */}
          {!!imageAttribution && <Text style={styles.photoCredit}>{imageAttribution}</Text>}
        </View>
      </Modal>
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
          <Text
            style={[styles.accordionTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
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
            style={styles.accordionChevron}
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
  // Compact header (replaced the 192pt photo hero)
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCommonName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerScientificName: {
    fontSize: 23,
    fontWeight: '700',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  headerThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerThumbImage: { width: '100%', height: '100%' },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9 },
  badgeText: { fontSize: 11.5, fontWeight: '700' },

  // Full-screen photo + its CC-BY credit
  photoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  photoClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, padding: 6 },
  photoFull: { width: '100%', height: '72%' },
  photoCredit: {
    marginTop: 16,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

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
  // Collapsed row layout. Both children used to be flexShrink:1 under
  // space-between, with no numberOfLines on the title — so when a preview was
  // long ("48x12x18\" or similar vertical enclosure...") neither side would
  // yield and the preview rendered on top of the title. Short previews
  // ("heavy webbing", "43 keepers") fit, which is why only some rows looked
  // broken.
  //
  // The fix assigns one job per element:
  //   title group  — never shrinks. These are fixed, short, app-controlled
  //                  strings ("Feeding", "Behavior & Safety"); the label is
  //                  the one thing that must always be readable.
  //   right group  — takes all remaining width and right-aligns into it.
  //   preview      — shrinks and ellipsizes inside that remaining width.
  //   chevron      — never shrinks, or it deforms before the text does.
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  accordionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  accordionTitle: { fontSize: 15, fontWeight: '700' },
  accordionRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  accordionPreview: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  accordionChevron: { flexShrink: 0 },
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
