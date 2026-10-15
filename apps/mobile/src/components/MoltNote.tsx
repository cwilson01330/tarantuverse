import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';
import { moltNote } from '../lib/taxon-modules';

/**
 * Per-taxon molting note (registry: MOLT_NOTES in lib/taxon-modules.ts).
 * Renders nothing for a taxon without one. Used on the invert detail screen,
 * the molt form and the care sheet so the wording lives in one place.
 */
export function MoltNote({ taxon, style }: { taxon: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const { colors, layout } = useTheme();
  const note = moltNote(taxon);
  if (!note) return null;
  return (
    <View
      accessibilityRole="text"
      style={[
        {
          flexDirection: 'row',
          gap: SPACING.sm,
          padding: SPACING.md,
          borderRadius: layout.radius.sm,
          borderLeftWidth: 3,
          borderLeftColor: colors.warning,
          backgroundColor: colors.surfaceElevated,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="information-outline" size={18} color={colors.warning} />
      <Text style={[TYPE.caption, { flex: 1, color: colors.textSecondary }]}>{note}</Text>
    </View>
  );
}

export default MoltNote;
