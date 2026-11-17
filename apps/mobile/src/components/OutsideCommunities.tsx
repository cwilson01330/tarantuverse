import React from 'react';
import { Linking, Text, TouchableOpacity } from 'react-native';

import { SectionCard } from './ui';
import { OUTSIDE_COMMUNITIES } from '../lib/features';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, TYPE } from '../theme/tokens';

/** "Talk with other keepers": links to outside communities, one per line. Links only, no claims. */
export function OutsideCommunities() {
  const { colors } = useTheme();
  return (
    <SectionCard title="Talk with other keepers">
      {OUTSIDE_COMMUNITIES.map((c) => (
        <TouchableOpacity
          key={c.url}
          onPress={() => Linking.openURL(c.url).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel={`${c.label}, opens in your browser`}
          style={{ paddingVertical: SPACING.xs }}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </SectionCard>
  );
}

export default OutsideCommunities;
