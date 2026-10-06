/**
 * Photo picker for the share-card composer: the animal's photos as a row of
 * thumbnails. Shown only when there is a real choice (two or more photos).
 * `value` null means "the main photo".
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import { SharePhoto } from '../../lib/share-cards';

export function PhotoStrip({ photos, value, onChange }: { photos: SharePhoto[]; value: string | null; onChange: (id: string | null) => void }) {
  const { colors, layout } = useTheme();
  const mainId = photos.find((p) => p.is_main)?.id ?? null;
  const selected = value ?? mainId;
  return (
    <View style={s.wrap}>
      <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Photo</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} accessibilityRole="radiogroup" accessibilityLabel="Photo for this card">
        {photos.map((p, i) => {
          const on = p.id === selected;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onChange(p.is_main ? null : p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.is_main ? 'Main photo' : `Photo ${i + 1}`}
              style={[s.tile, { borderRadius: layout.radius.sm, borderWidth: on ? 2 : 1, borderColor: on ? colors.textPrimary : colors.border }]}
            >
              <Image source={{ uri: p.thumbnail_url || p.url }} style={s.img} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  row: { gap: 8, paddingVertical: 2 },
  tile: { width: 56, height: 56, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
});
