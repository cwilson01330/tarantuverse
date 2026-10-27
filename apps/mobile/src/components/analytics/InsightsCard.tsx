/**
 * Home "Insights" card (analytics redesign, README §3): one sentence about the
 * collection; the whole card opens /analytics.
 *
 * Built from the `/analytics/collection` response Home already loaded, so it
 * makes no request of its own. No money here, ever. Renders nothing while the
 * response is missing (loading or failed) or when the keeper has no animals
 * (`insight` returns null).
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { Card } from '../ui';
import { SPACING, TYPE } from '../../theme/tokens';
import { insight, type CollectionAnalytics } from '../../lib/analytics-view';
import { useLinkColor } from './parts';

export default function InsightsCard({ collection }: { collection: CollectionAnalytics | null }) {
  const { colors, layout } = useTheme();
  const router = useRouter();
  const linkColor = useLinkColor();
  const model = useMemo(() => (collection ? insight(collection, new Date()) : null), [collection]);
  if (!model) return null;

  const spoken = [model.sentence, model.support, model.link.replace('→', '').trim()].filter(Boolean).join(' ');

  return (
    <Pressable
      onPress={() => router.push('/analytics' as never)}
      accessibilityRole="button"
      accessibilityLabel={`Insights. ${spoken}`}
      accessibilityHint="Opens analytics"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card
        style={{
          borderRadius: layout.radius.lg,
          paddingVertical: 14,
          paddingHorizontal: SPACING.lg,
          gap: SPACING.xs,
          marginBottom: SPACING.lg,
        }}
      >
        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="chart-line"
            size={15}
            color={colors.accent}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[styles.label, { color: colors.textTertiary }]}>INSIGHTS</Text>
        </View>
        <Text style={[styles.sentence, { color: colors.textPrimary }]}>{model.sentence}</Text>
        {model.support ? <Text style={[styles.support, { color: colors.textTertiary }]}>{model.support}</Text> : null}
        <Text style={[styles.link, { color: linkColor }]}>{model.link}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  label: { ...TYPE.eyebrowSmall },
  sentence: { ...TYPE.subheading },
  support: { ...TYPE.small },
  link: { ...TYPE.smallStrong, marginTop: SPACING.xs },
});
