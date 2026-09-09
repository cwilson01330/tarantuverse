/**
 * AnimalHero — full-bleed hero for the HV animal detail screen
 * (design handoff Screen 9).
 *
 * Replaces the previous 88×88 thumbnail inside a bordered card. This is a
 * screen about an animal; the photo should behave like one.
 *
 * It also fixes the screen's most visible defect: the name used to render
 * twice within ~100px, once in the `AppHeader` and again in the hero. The
 * header is gone and this owns the name, so back / share / edit are
 * floating circular buttons over the photo instead.
 *
 * The scrim is a stack of stepped Views rather than a LinearGradient — see
 * GradientBand for why expo-linear-gradient can't be rendered on the
 * current HV binary.
 */

import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

type Sex = 'male' | 'female' | 'unknown' | null;

/** Scrim layers, lightest at the top. Bottom-weighted so the name stays
 *  legible over a bright photo without dimming the whole image. */
const SCRIM = [0.0, 0.06, 0.16, 0.34, 0.58, 0.82];

export function AnimalHero({
  title,
  scientificName,
  sex,
  photoUrl,
  fallbackGlyph,
  taxonLabel,
  ageLabel,
  photoCount,
  brumationActive,
  onBack,
  onShare,
  onEdit,
  onOpenGallery,
}: {
  title: string;
  scientificName: string | null;
  sex: Sex;
  photoUrl: string | null;
  fallbackGlyph: string;
  taxonLabel: string;
  /** e.g. "2y 3m" — omitted when the hatch date is unknown. */
  ageLabel?: string | null;
  /** Total photos; the chip is hidden below 2 since one photo is the hero. */
  photoCount: number;
  brumationActive?: boolean;
  onBack: () => void;
  onShare: () => void;
  onEdit: () => void;
  onOpenGallery: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const subtitleParts = [scientificName, ageLabel, taxonLabel].filter(
    (p): p is string => !!p,
  );

  const sexIcon =
    sex === 'female'
      ? 'gender-female'
      : sex === 'male'
        ? 'gender-male'
        : 'help-circle-outline';
  const sexColor =
    sex === 'female' ? '#ec4899' : sex === 'male' ? '#3b82f6' : 'rgba(255,255,255,0.7)';

  return (
    <View style={styles.wrap}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoEmpty, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={{ fontSize: 64 }}>{fallbackGlyph}</Text>
        </View>
      )}

      {/* Scrim — pointerEvents none throughout so it never eats a tap on
          the buttons beneath it. A gradient header that swallowed taps is
          a bug this codebase has already shipped once. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {SCRIM.map((opacity, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(i / SCRIM.length) * 100}%`,
              height: `${(1 / SCRIM.length) * 100 + 1}%`,
              backgroundColor: `rgba(0,0,0,${opacity})`,
            }}
          />
        ))}
      </View>

      {/* Floating actions */}
      <View style={[styles.actions, { top: insets.top + 8 }]}>
        <CircleButton icon="arrow-left" label="Go back" onPress={onBack} />
        <View style={styles.actionsRight}>
          <CircleButton icon="share-variant" label="Share public profile" onPress={onShare} />
          <CircleButton icon="pencil-outline" label="Edit this animal" onPress={onEdit} />
        </View>
      </View>

      {/* Photo count — the gallery used to sit many sections down the
          scroll, so the hero looked like the only photo. */}
      {photoCount > 1 && (
        <TouchableOpacity
          style={styles.countChip}
          onPress={onOpenGallery}
          accessibilityRole="button"
          accessibilityLabel={`View all ${photoCount} photos`}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={13} color="#fff" />
          <Text style={styles.countChipText}>{photoCount}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <MaterialCommunityIcons name={sexIcon} size={17} color={sexColor} />
          {brumationActive && (
            <View style={styles.brumationChip}>
              <MaterialCommunityIcons name="snowflake" size={11} color="#0ea5e9" />
              <Text style={styles.brumationText}>Brumating</Text>
            </View>
          )}
        </View>
        {subtitleParts.length > 0 && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {/* Scientific name reads italic; the rest doesn't. Nested Text
                keeps that distinction without splitting the line. */}
            {scientificName && <Text style={styles.sciName}>{scientificName}</Text>}
            {scientificName && subtitleParts.length > 1 ? ' · ' : ''}
            {subtitleParts.filter((p) => p !== scientificName).join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}

function CircleButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.circle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <MaterialCommunityIcons name={icon} size={20} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 214, width: '100%' },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },

  actions: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsRight: { flexDirection: 'row', gap: 10 },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(10,10,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  countChip: {
    position: 'absolute',
    right: 14,
    bottom: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(10,10,15,0.62)',
  },
  countChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  textBlock: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 3 },
  sciName: { fontStyle: 'italic' },

  brumationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(14,165,233,0.18)',
  },
  brumationText: { color: '#0ea5e9', fontSize: 11, fontWeight: '700' },
});
