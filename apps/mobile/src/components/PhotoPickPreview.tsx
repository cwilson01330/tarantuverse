/**
 * The preview box on the add-photo screens.
 *
 * WHY THIS EXISTS. On Android (Expo 54 / RN 0.81, new architecture) a keeper
 * cropped a photo, came back, and saw an empty black box — no image, and no
 * remove button either. The pick had worked (Upload was enabled); only the
 * preview failed to draw. The old markup was an unfilled View with
 * `overflow: 'hidden'` + a border radius wrapping a `width: '100%'` Image,
 * and it failed with nothing on screen to say so.
 *
 * So this version:
 *   - gives the frame a real background and a fixed 4:3 shape (the crop
 *     aspect), so it is never an invisible, sizeless rectangle;
 *   - rounds the Image itself instead of relying on the parent to clip it;
 *   - keys the Image on the URI, so re-picking always reloads;
 *   - on a load error, SAYS so instead of showing an empty box, and keeps the
 *     remove / choose-again path visible.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';

const ASPECT = 4 / 3; // matches `aspect: [4, 3]` in the pickers

export function PhotoPickPreview({
  uri,
  onRemove,
}: {
  uri: string;
  onRemove: () => void;
}) {
  const { colors, layout } = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  const radius = layout.radius.md;
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius }]}>
      {failed ? (
        <View style={styles.fallback} accessibilityRole="alert">
          <MaterialCommunityIcons name="image-broken-variant" size={40} color={colors.textTertiary} />
          <Text style={[TYPE.bodyStrong, styles.center, { color: colors.textPrimary }]}>
            Photo selected, but the preview couldn’t load
          </Text>
          <Text style={[TYPE.caption, styles.center, { color: colors.textSecondary }]}>
            Choose it again, or pick a different one.
          </Text>
        </View>
      ) : (
        <Image
          key={uri}
          source={{ uri }}
          style={[styles.image, { borderRadius: radius }]}
          resizeMode="cover"
          onError={(e) => {
            console.warn('[PhotoPickPreview] preview failed', uri, e.nativeEvent?.error);
            setFailed(true);
          }}
          accessibilityLabel="Selected photo"
        />
      )}
      <TouchableOpacity
        style={[styles.remove, { backgroundColor: colors.background + 'CC', borderColor: colors.border, borderRadius: layout.radius.full }]}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove photo"
        hitSlop={8}
      >
        <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: ASPECT, borderWidth: 1, marginBottom: 16 },
  image: { ...StyleSheet.absoluteFillObject },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  center: { textAlign: 'center' },
  remove: {
    position: 'absolute', top: 10, right: 10, width: 36, height: 36,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
