/**
 * Collection grid card — one component for every taxon.
 *
 * WHY THIS EXISTS
 * ---------------
 * `(tabs)/collection.tsx` had FIVE near-identical card renderers
 * (renderTarantula / renderScorpion / renderCentipede / renderWhipSpider /
 * renderInvert) that had already drifted apart: some showed a feeding badge,
 * some didn't; some rendered the sex chip for 'unknown', some skipped it.
 * Any change to the card had to be made five times, which is exactly how the
 * drift happened. One component, five call sites.
 *
 * DESIGN (handoff screen 2)
 * -------------------------
 * - Photo is `aspectRatio: 4/5`, not a fixed 150pt — animals are portrait.
 * - AT MOST TWO OVERLAYS. The old card stacked four (feeding pill, premolt
 *   badge, sex chip, taxon glyph) and two of them collided: premolt and taxon
 *   glyph were both pinned `bottom/left: 8`. Worse, the taxon glyph duplicated
 *   the placeholder emoji rendered directly behind it. Feeding status moved
 *   OUT of the photo into a real footer, where it can be a sentence.
 * - The body drops its third line. The card printed the common name in the
 *   title AND again below it for most animals.
 * - Status footer reads "Fed 1d ago" / "17d overdue" / "Not yet fed" — words,
 *   not an emoji-prefixed day count.
 */
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getImageUrl } from '../utils/image-url';
import { taxonMdiIcon } from '../lib/inverts';

export interface AnimalCardFeeding {
  /** null / undefined = never fed (or no ACCEPTED feeding). Not the same as 0. */
  daysSince?: number | null;
  isOverdue?: boolean;
  isPaused?: boolean;
  /** Recommended days between feedings, from /inverts/feeding-status. Needed to
   *  say how far PAST DUE an animal is; without it the card says "Overdue"
   *  rather than guessing a number. */
  intervalDays?: number | null;
}

export interface AnimalCardProps {
  displayName: string;
  scientificName?: string | null;
  photoUrl?: string | null;
  /** 'male' | 'female' | 'unknown' | undefined */
  sex?: string | null;
  taxon: string;
  feeding?: AnimalCardFeeding;
  /** Renders the premolt pill. Only pass true when a prediction is active. */
  premolt?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Logs an accepted feeding for this animal, today.
   *
   *  Restores the path a keeper reported losing (2026-07-28): "I liked the
   *  simplicity of going to the collection and logging feedings that way."
   *  The capability never went away — it moved behind a long press, which is
   *  invisible. Feeding Day remains the batch flow; this is the one-off. */
  onQuickFeed?: () => void;
  /** Disables the feed button while a log is in flight. */
  quickFeedBusy?: boolean;
  colors: any;
  /** Extra style for the root. The default is `flex: 1, margin: 8`, which is
   *  what the collection grid relies on — it sizes columns with flex inside
   *  FlatList's `numColumns`, not with explicit widths. */
  style?: any;
}

/** Status line content + colour. Words, because "17d overdue" tells you what
 *  to do and "⚠️ 17d ago" makes you work it out. */
function feedingLine(f: AnimalCardFeeding | undefined, colors: any) {
  if (!f) return null;
  if (f.isPaused) return { text: 'Feeding paused', color: colors.textTertiary };
  if (f.daysSince === undefined || f.daysSince === null) {
    // Never fed is a real, common state for a newly added animal — say so
    // rather than rendering nothing or a phantom day count.
    return { text: 'Not yet fed', color: colors.textTertiary };
  }
  const d = f.daysSince;
  // Semantic colors come from the theme — they're immutable across aesthetic
  // presets, but they still differ between light and dark mode (#ef4444 vs
  // #dc2626), so hardcoding the dark value washes out on a light background.
  if (f.isOverdue) {
    // `d` is days SINCE FEEDING, not days PAST DUE. Rendering it as
    // "20d overdue" for an animal on an 18-day cadence overstates it by the
    // whole interval — it's 2 days late, not 20. With the interval we can say
    // it properly; without one, don't invent a number.
    const past = f.intervalDays != null ? d - f.intervalDays : null;
    return {
      text: past == null ? 'Overdue' : past > 0 ? `${past}d overdue` : 'Due today',
      color: colors.error,
      strong: true,
    };
  }
  if (d === 0) return { text: 'Fed today', color: colors.textSecondary };
  return { text: `Fed ${d}d ago`, color: colors.textSecondary };
}

export function AnimalCard({
  displayName,
  scientificName,
  photoUrl,
  sex,
  taxon,
  feeding,
  premolt,
  onPress,
  onLongPress,
  onQuickFeed,
  quickFeedBusy,
  colors,
  style,
}: AnimalCardProps) {
  // A photo URL that 404s would otherwise leave an empty frame — several
  // catalog images hotlink hosts that reject non-browser clients.
  const [imgFailed, setImgFailed] = useState(false);
  const styles = makeStyles(colors);
  const status = feedingLine(feeding, colors);
  const showPhoto = !!photoUrl && !imgFailed;

  const sexKnown = sex === 'male' || sex === 'female';
  const a11ySex = sexKnown ? sex : 'unknown sex';

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={[
        displayName,
        scientificName ?? undefined,
        a11ySex,
        status?.text,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={
        onLongPress
          ? "Opens this animal's detail page. Long press for quick actions."
          : "Opens this animal's detail page."
      }
    >
      <View style={styles.photo}>
        {showPhoto ? (
          <Image
            source={{ uri: getImageUrl(photoUrl!) }}
            style={StyleSheet.absoluteFill as any}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <View style={styles.placeholder} accessibilityElementsHidden importantForAccessibility="no">
            <MaterialCommunityIcons
              name={taxonMdiIcon(taxon) as any}
              size={38}
              color={colors.textTertiary}
            />
          </View>
        )}

        {/* Overlay 1 — sex, top right. Rendered for unknown too, because a
            keeper who hasn't sexed an animal yet still wants to see that at a
            glance; it just uses the neutral treatment. */}
        <View
          style={[
            styles.sexChip,
            sex === 'female'
              ? { backgroundColor: colors.female }
              : sex === 'male'
              ? { backgroundColor: colors.male }
              : { backgroundColor: 'rgba(10,10,15,0.7)' },
          ]}
        >
          <MaterialCommunityIcons
            name={
              sex === 'female'
                ? 'gender-female'
                : sex === 'male'
                ? 'gender-male'
                : 'help-circle-outline'
            }
            size={14}
            color="#fff"
          />
        </View>

        {/* Overlay 2 — premolt, bottom left, ONLY when active. This used to
            share its position with a taxon glyph that duplicated the
            placeholder behind it. */}
        {premolt && (
          <View style={styles.premoltPill}>
            <MaterialCommunityIcons name="butterfly-outline" size={11} color="#fff" />
            <Text style={styles.premoltText}>Premolt</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {!!scientificName && (
          <Text style={styles.sci} numberOfLines={1}>
            {scientificName}
          </Text>
        )}

        {!!status && (
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: status.color }]} />
            <Text
              style={[
                styles.statusText,
                { color: status.color },
                (status as any).strong && { fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {status.text}
            </Text>
          </View>
        )}

        {/* Visible one-tap feed. Nested Touchable inside the card's own
            Touchable: taps here must NOT also open the detail screen, which RN
            handles because the inner responder wins. */}
        {!!onQuickFeed && (
          <TouchableOpacity
            style={[
              styles.feedButton,
              { borderColor: colors.border },
              quickFeedBusy && { opacity: 0.5 },
            ]}
            onPress={onQuickFeed}
            disabled={quickFeedBusy}
            accessibilityRole="button"
            accessibilityLabel={`Log a feeding for ${displayName}`}
            accessibilityState={{ disabled: !!quickFeedBusy }}
            // Small control on a dense grid — widen the touch target beyond the
            // visual bounds rather than making the button itself taller.
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="silverware-fork-knife"
              size={13}
              color={colors.textSecondary}
            />
            <Text style={styles.feedButtonText} numberOfLines={1}>
              {quickFeedBusy ? 'Saving…' : 'Fed'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      // flex + margin, not an explicit width: the collection grid sizes its
      // two columns via FlatList `numColumns`, and the card it replaced used
      // exactly this.
      flex: 1,
      margin: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    photo: {
      width: '100%',
      aspectRatio: 4 / 5,
      backgroundColor: colors.surfaceElevated,
      position: 'relative',
    },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    sexChip: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    premoltPill: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 9,
      backgroundColor: 'rgba(139,92,246,0.92)',
    },
    premoltText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    body: { paddingHorizontal: 12, paddingTop: 11, paddingBottom: 12 },
    name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    sci: { fontSize: 12, fontStyle: 'italic', color: colors.textTertiary, marginTop: 1 },

    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 9,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
    feedButton: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      // Deliberately quiet — outline, not filled. On a two-column grid a
      // filled accent button on every card competes with the photos and makes
      // the collection read as a to-do list.
      backgroundColor: 'transparent',
    },
    feedButtonText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  });

export default AnimalCard;
