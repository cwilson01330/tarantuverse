/**
 * Keeper-consensus husbandry signals (ADR-018) — mobile.
 *
 * Mirror of the web component of the same name. Both care sheets on mobile
 * (tarantula and generic invert) render this, so the wording lives in exactly
 * one place per platform and the two can't drift into saying different things
 * about the same evidence.
 *
 * The three rules, inherited from ADR-014:
 *
 *  1. We describe, we don't instruct — "what keepers do", never "recommended".
 *  2. The figure never appears without its evidence (keeper and observation
 *     counts render every time, not behind a tap).
 *  3. Below threshold we render NOTHING. Not a hedge, not a platform average,
 *     not a plea for more logs. An honest absence beats a plausible figure.
 *
 * Fetches its own data rather than taking it as a prop, because the two care
 * sheets load species differently and threading it through both would mean
 * touching their fetch paths for a block that is allowed to fail silently.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import apiClient from '../services/api';

export interface KeeperSignals {
  species_id: string;
  meets_threshold: boolean;
  median_interval_days: number | null;
  keeper_count: number;
  observation_count: number;
  animal_count: number;
  window_days: number;
  min_keepers: number;
  min_observations: number;
}

interface Colors {
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

export function KeeperSignalsBlock({
  speciesId,
  colors,
}: {
  speciesId?: string | null;
  colors: Colors;
}) {
  const [signals, setSignals] = useState<KeeperSignals | null>(null);

  useEffect(() => {
    if (!speciesId) return;
    let cancelled = false;

    // Served by the invert-species route for BOTH catalogs — they share
    // primary keys, so a legacy tarantula species id resolves here too
    // (verified 2026-09-04).
    //
    // Swallows errors on purpose. This block is additive to a care sheet that
    // must keep working; a failed lookup and a below-threshold species should
    // look identical, because in both cases we have nothing honest to say.
    apiClient
      .get<KeeperSignals>(`/invert-species/${speciesId}/keeper-signals`)
      .then((res) => {
        if (!cancelled) setSignals(res.data);
      })
      .catch(() => {
        if (!cancelled) setSignals(null);
      });

    return () => {
      cancelled = true;
    };
  }, [speciesId]);

  // Rule 3.
  if (!signals?.meets_threshold || signals.median_interval_days == null) {
    return null;
  }

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>
        What keepers actually do
      </Text>

      <Text style={[styles.figure, { color: colors.textPrimary }]}>
        Every {signals.median_interval_days} days
      </Text>

      {/* Rule 2 — evidence travels with the number, always visible. */}
      <Text style={[styles.evidence, { color: colors.textSecondary }]}>
        Median across {signals.keeper_count} keepers · {signals.animal_count}{' '}
        animals · {signals.observation_count} logged feedings
      </Text>

      {/* These medians mix life stages, and a sling and an adult are on
          completely different schedules. Say so rather than letting the number
          imply a precision it doesn't have. */}
      <Text style={[styles.caveat, { color: colors.textTertiary }]}>
        Observed across all life stages, so slings and adults are combined. This
        describes what keepers log — it isn&rsquo;t a recommendation.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  heading: { fontSize: 13, fontWeight: '700' },
  figure: { fontSize: 22, fontWeight: '700', marginTop: 6 },
  evidence: { fontSize: 12.5, marginTop: 3 },
  caveat: { fontSize: 11.5, marginTop: 8, lineHeight: 16 },
});
