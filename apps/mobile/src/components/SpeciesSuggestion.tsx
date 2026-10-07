/**
 * "Did you mean…?" for a species name typed by hand.
 *
 * 2026-10-07: most animals filed as "Other", and most animals with no care
 * sheet at all, were a species we already list, typed freehand (capitals, a
 * stray space, one wrong letter, or just the second word). This asks the
 * server's matcher (GET /invert-species/match) and offers the catalog species
 * in one tap. It never changes anything by itself.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { INVERT_TAXA, matchSpeciesName, type InvertTaxon, type SpeciesNameMatch } from '../lib/inverts';

const DEBOUNCE_MS = 450;

/** Debounced matcher result for `text`. `taxon` resolves a bare epithet. */
export function useSpeciesMatch(text: string, taxon?: InvertTaxon | null): SpeciesNameMatch | null {
  const [res, setRes] = useState<SpeciesNameMatch | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const t = text.trim();
    const mine = ++seq.current;
    if (t.length < 3) { setRes(null); return; }
    const timer = setTimeout(() => {
      matchSpeciesName(t, taxon ?? null)
        .then((r) => { if (mine === seq.current) setRes(r); })
        .catch(() => { if (mine === seq.current) setRes(null); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, taxon]);
  return res;
}

export const taxonLabel = (t: string) => (INVERT_TAXA as Record<string, { label: string }>)[t]?.label ?? t;

export function SpeciesSuggestion({
  match, onUse, currentTaxon,
}: {
  match: NonNullable<SpeciesNameMatch['match']>;
  onUse: () => void;
  /** When set and different, the card says the taxon will change too. */
  currentTaxon?: string | null;
}) {
  const { colors, layout } = useTheme();
  const switching = !!currentTaxon && currentTaxon !== match.taxon;
  const lead = match.kind === 'exact' ? 'In our species list' : 'Did you mean';
  return (
    <View
      style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: layout.radius.md }]}
      accessibilityRole="summary"
    >
      <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{lead}</Text>
        <Text style={[TYPE.bodyStrong, { color: colors.textPrimary, fontStyle: 'italic' }]} numberOfLines={1}>
          {match.scientific_name}
        </Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>
          {[match.common_name, taxonLabel(match.taxon)].filter(Boolean).join(' · ')}
          {switching ? ` — files it as a ${taxonLabel(match.taxon).toLowerCase()}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onUse}
        accessibilityRole="button"
        accessibilityLabel={`Use ${match.scientific_name}`}
        style={[s.btn, { backgroundColor: colors.primary, borderRadius: layout.radius.sm }]}
      >
        <Text style={[TYPE.bodyStrong, { color: colors.background }]}>Use this</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 12, marginTop: 10 },
  btn: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center' },
});
