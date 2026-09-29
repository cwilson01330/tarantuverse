/**
 * Stage proportion bar for a colony — one 7px bar split by stage bucket.
 *
 * Proportion, not a pair of boxes: "mostly nymphs" is the thing a keeper
 * reads off a colony at a glance, and absolute numbers sit in the legend.
 * Buckets are free-form (ADR-010), so colours are assigned by order from the
 * theme rather than by name. Empty buckets are left out.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { StageCounts } from '../lib/colonies';

export interface StageEntry {
  label: string;
  count: number;
}

/** Non-empty buckets, largest first. */
export function stageEntries(counts: StageCounts | null | undefined): StageEntry[] {
  return Object.entries(counts ?? {})
    .map(([label, n]) => ({ label, count: Number(n) || 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Theme colour for the nth bucket (same order everywhere a colony is drawn). */
export function useStageColors(): string[] {
  const { colors } = useTheme();
  return [colors.primary, colors.accent, colors.success, colors.warning, colors.info, colors.secondary];
}

export default function StageBar({ counts, height = 7 }: { counts: StageCounts | null | undefined; height?: number }) {
  const { colors } = useTheme();
  const palette = useStageColors();
  const entries = stageEntries(counts);
  const total = entries.reduce((a, e) => a + e.count, 0);
  if (total === 0) return null;
  return (
    <View
      style={[styles.bar, { height, borderRadius: height / 2, backgroundColor: colors.border }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {entries.map((e, i) => (
        <View key={e.label} style={{ flex: e.count / total, backgroundColor: palette[i % palette.length] }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', overflow: 'hidden', gap: 2 },
});
