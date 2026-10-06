/**
 * Frame picker for the share-card composer (handoff §4): three 56×70 tiles,
 * each a tiny abstract of its frame, in Herbarium · Field notes · Specimen
 * order. The tiles use the cards' fixed paper palette, not theme colours.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { SHARE_CARD_PALETTE as P, TYPE } from '../../theme/tokens';
import { CardFrame, FRAMES } from '../../lib/share-cards';

function Thumb({ frame }: { frame: CardFrame }) {
  if (frame === 'herbarium') {
    return (
      <View style={[s.fill, { backgroundColor: P.herbariumPaper }]}>
        <View style={[s.abs, { left: 7, top: 6, width: 40, height: 32, backgroundColor: P.photo, transform: [{ rotate: '-3deg' }] }]} />
        <View style={[s.abs, { left: 6, right: 6, bottom: 6, height: 20, borderWidth: 1, borderColor: P.herbariumBorder }]} />
      </View>
    );
  }
  if (frame === 'notes') {
    return (
      <View style={[s.fill, { backgroundColor: P.notesPaper }]}>
        <View style={[s.abs, { left: 5, right: 5, top: 5, height: 38, backgroundColor: P.photo }]} />
        <View style={[s.abs, { left: 6, top: 50, width: 34, height: 3, backgroundColor: P.notesHand, transform: [{ rotate: '-3deg' }] }]} />
        <View style={[s.abs, { left: 8, top: 58, width: 24, height: 2, backgroundColor: P.notesHand, transform: [{ rotate: '-2deg' }] }]} />
      </View>
    );
  }
  return (
    <View style={[s.fill, { backgroundColor: P.specimenPaper }]}>
      <View style={[s.abs, { left: 5, right: 5, top: 5, height: 34, backgroundColor: P.photo }]} />
      <View style={[s.abs, { left: 6, top: 45, width: 26, height: 3, backgroundColor: P.specimenInk }]} />
      <View style={[s.abs, { left: 6, right: 6, top: 54, height: 1, backgroundColor: P.specimenRule }]} />
      <View style={[s.abs, { left: 6, right: 6, top: 59, height: 1, backgroundColor: P.specimenRule }]} />
    </View>
  );
}

export function FrameRow({ value, onChange }: { value: CardFrame; onChange: (f: CardFrame) => void }) {
  const { colors, layout } = useTheme();
  return (
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel="Frame">
      {FRAMES.map((f) => {
        const on = f.key === value;
        return (
          <TouchableOpacity key={f.key} onPress={() => onChange(f.key)} style={s.item}
            accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${f.label} frame`}>
            <View style={[s.tile, { borderRadius: layout.radius.sm, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.textPrimary : colors.border }]}>
              <Thumb frame={f.key} />
            </View>
            <Text style={[TYPE.caption, { color: on ? colors.textPrimary : colors.textSecondary }]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  item: { alignItems: 'center', gap: 4, minHeight: 44 },
  tile: { width: 56, height: 70, overflow: 'hidden' },
  fill: { flex: 1 },
  abs: { position: 'absolute' },
});
