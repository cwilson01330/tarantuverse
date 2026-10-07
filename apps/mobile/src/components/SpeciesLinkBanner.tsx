/**
 * Suggest a care sheet (and, for a mis-filed animal, a taxon) on an animal's
 * page when its typed species name matches something we list.
 *
 * 2026-10-07: 65% of live animals had no care sheet linked, and ~20 sat in
 * "Other" while their species was in the catalog. Each of those misses the
 * feeding card, care sheet and (tarantulas) molt prediction. We don't fix
 * other people's records from the backend; this offers it, the keeper taps.
 *
 * Three offers, strongest first:
 *  - same taxon: "Link the X care sheet"
 *  - other taxon: "Looks like a tarantula" (change-taxon keeps every log)
 *  - genus only, while filed as Other: "Avicularia is a tarantula genus"
 * Dismissing is remembered per animal + suggestion, so it never nags.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import { changeInvertTaxon, updateInvert, type Invert, type InvertTaxon } from '../lib/inverts';
import { taxonLabel, useSpeciesMatch } from './SpeciesSuggestion';

const dismissKey = (animalId: string, what: string) => `species-suggestion-dismissed:${animalId}:${what}`;

export function SpeciesLinkBanner({ invert, canEdit, onChanged }: { invert: Invert; canEdit: boolean; onChanged: () => void }) {
  const { colors, layout } = useTheme();
  const eligible = canEdit && !invert.species_id && !invert.died_at && !!invert.scientific_name?.trim();
  const res = useSpeciesMatch(eligible ? invert.scientific_name ?? '' : '', invert.taxon);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const m = res?.match ?? null;
  // What we'd offer, if anything.
  const offer: { key: string; title: string; detail: string; action: string; taxon: InvertTaxon; speciesId: string | null; name: string | null } | null =
    m
      ? m.taxon === invert.taxon
        ? { key: `link:${m.id}`, title: `Link the ${m.scientific_name} care sheet`, detail: 'Adds its care guide and feeding cadence to this animal.', action: 'Link care sheet', taxon: m.taxon, speciesId: m.id, name: m.scientific_name }
        : { key: `switch:${m.id}`, title: `This looks like a ${taxonLabel(m.taxon).toLowerCase()}`, detail: `${m.scientific_name} is in our list as a ${taxonLabel(m.taxon).toLowerCase()}. Switching keeps every feeding, molt and photo.`, action: `Switch & link`, taxon: m.taxon, speciesId: m.id, name: m.scientific_name }
      : invert.taxon === 'other' && res?.genus_taxon && res.genus_taxon !== 'other'
        ? { key: `genus:${res.genus_taxon}`, title: `${res.genus} is a ${taxonLabel(res.genus_taxon).toLowerCase()} ${res.rank === 'group' ? 'group' : 'genus'}`, detail: `Filed as a ${taxonLabel(res.genus_taxon).toLowerCase()} it gets the feeding card and the right care tools. Every log is kept.`, action: `File as ${taxonLabel(res.genus_taxon).toLowerCase()}`, taxon: res.genus_taxon, speciesId: null, name: null }
        : null;

  useEffect(() => {
    if (!offer) return;
    setDismissed(null);
    AsyncStorage.getItem(dismissKey(invert.id, offer.key)).then((v) => setDismissed(v === '1')).catch(() => setDismissed(false));
  }, [invert.id, offer?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!offer || dismissed !== false) return null;

  const accept = async () => {
    setBusy(true);
    try {
      if (offer.taxon !== invert.taxon) await changeInvertTaxon(invert.id, offer.taxon, offer.speciesId);
      if (offer.speciesId) {
        // The keeper confirmed this species, so take the catalog spelling too
        // ("minatrix" -> "Avicularia minatrix", "HOGNA MADERIANA " -> "Hogna maderiana").
        await updateInvert(invert.id, { species_id: offer.speciesId, scientific_name: offer.name } as any);
      }
      onChanged();
    } catch (e: any) {
      Alert.alert("Couldn't update this animal", e?.response?.data?.detail ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(dismissKey(invert.id, offer.key), '1').catch(() => {});
  };

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
      <View style={s.row}>
        <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{offer.title}</Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary, marginTop: 2 }]}>{offer.detail}</Text>
        </View>
      </View>
      <View style={s.actions}>
        <TouchableOpacity onPress={dismiss} accessibilityRole="button" style={s.btn} disabled={busy}>
          <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>Not this one</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={accept} accessibilityRole="button" disabled={busy}
          style={[s.btn, s.primary, { backgroundColor: colors.primary, borderRadius: layout.radius.sm }]}>
          {busy ? <ActivityIndicator color={colors.background} /> : <Text style={[TYPE.bodyStrong, { color: colors.background }]}>{offer.action}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, padding: 14, marginHorizontal: 16, marginTop: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  primary: { paddingHorizontal: 16 },
});
