/**
 * FeedingIntelligence — snake/lizard detail-screen panel that surfaces
 * species-aware feeding guidance:
 *
 *   - Current life stage (computed server-side from weight + species sheet)
 *   - Recommended prey weight range
 *   - Inter-feeding interval (days)
 *   - Next feed window (last_fed + interval_min .. last_fed + interval_max)
 *   - Power-feeding warning if the most recent accepted feeding's
 *     prey:body-weight ratio exceeded the species threshold
 *
 * Mirrors the web FeedingIntelligence panel (apps/web-herpetoverse/.../
 * SnakeDetailClient.tsx::FeedingIntelligence). Lives between the
 * FeedingStatusBanner and the LogActions on detail screens.
 *
 * Empty-state behavior: when the species sheet has no feeding-ratio data,
 * we say so honestly rather than rendering blank tiles or fake numbers —
 * tying back to the honesty-first product principle. Same when the animal
 * has no recorded weight yet (server returns `is_data_available: false`).
 *
 * Hermes-prod safety: static JSX branches only, no dynamic component
 * variables — see feedback_dynamic_component_hermes_prod_crash memory.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { type PreySuggestion, getPreySuggestion as getSnakeSuggestion } from '../lib/snakes';
import { getPreySuggestion as getLizardSuggestion } from '../lib/lizards';

interface Props {
  taxon: 'snake' | 'lizard';
  animalId: string;
  /** Most-recent ACCEPTED feeding date — drives the next-feed window. */
  lastFedAt: string | null;
  /** Most recent accepted feeding's prey_weight_g for power-feeding check. */
  lastAcceptedPreyWeightG: string | number | null;
  lastAcceptedFedAt: string | null;
  /** Re-fetch when this changes (e.g. after a feeding is logged). */
  refreshKey?: string | number;
}

const STAGE_LABEL: Record<string, string> = {
  hatchling: 'Hatchling',
  juvenile: 'Juvenile',
  subadult: 'Subadult',
  adult: 'Adult',
  unknown: 'Unknown',
};

export function FeedingIntelligence({
  taxon,
  animalId,
  lastFedAt,
  lastAcceptedPreyWeightG,
  lastAcceptedFedAt,
  refreshKey,
}: Props) {
  const { colors, layout } = useTheme();
  const [suggestion, setSuggestion] = useState<PreySuggestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSuggestion(null);
    setLoadError(null);
    (async () => {
      try {
        const s =
          taxon === 'snake'
            ? await getSnakeSuggestion(animalId)
            : await getLizardSuggestion(animalId);
        if (!cancelled) setSuggestion(s);
      } catch {
        if (!cancelled) setLoadError("Couldn't load feeding guidance.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taxon, animalId, refreshKey]);

  // Next-feed window — last_fed + interval_min .. last_fed + interval_max.
  // We compute on the client because last_fed_at can change without
  // re-fetching prey-suggestion.
  const nextWindow = useMemo(() => {
    if (
      !suggestion ||
      !lastFedAt ||
      suggestion.interval_days_min == null
    ) {
      return null;
    }
    const last = new Date(lastFedAt);
    if (Number.isNaN(last.getTime())) return null;
    const min = new Date(last);
    min.setDate(
      min.getDate() + (suggestion.interval_days_min ?? 0),
    );
    const max = new Date(last);
    max.setDate(
      max.getDate() +
        (suggestion.interval_days_max ?? suggestion.interval_days_min ?? 0),
    );
    return { min, max };
  }, [suggestion, lastFedAt]);

  const overdue = useMemo(() => {
    if (!nextWindow) return false;
    return Date.now() > nextWindow.max.getTime();
  }, [nextWindow]);

  // Power-feeding warning — if the most recent accepted feeding's prey
  // was at or above the species threshold, surface it. The keeper's job
  // is to know; the app's job is to flag, not block.
  const powerWarning = useMemo(() => {
    if (
      !suggestion ||
      !lastAcceptedPreyWeightG ||
      !suggestion.power_feeding_threshold_g ||
      !suggestion.snake_weight_g
    ) {
      return null;
    }
    const prey = Number(lastAcceptedPreyWeightG);
    const threshold = Number(suggestion.power_feeding_threshold_g);
    if (!Number.isFinite(prey) || !Number.isFinite(threshold)) return null;
    if (prey < threshold) return null;
    const bw = Number(suggestion.snake_weight_g);
    const pct = bw > 0 ? (prey / bw) * 100 : null;
    return {
      preyG: prey,
      pct: pct != null ? Number(pct.toFixed(1)) : null,
      date: lastAcceptedFedAt
        ? new Date(lastAcceptedFedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        : null,
    };
  }, [suggestion, lastAcceptedPreyWeightG, lastAcceptedFedAt]);

  if (loadError) return null;

  if (suggestion === null) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
      >
        <ActivityIndicator color={colors.textTertiary} size="small" />
      </View>
    );
  }

  // Empty states — be honest, don't render fake tiles.
  if (!suggestion.is_data_available) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
      >
        <Text style={[styles.headerLabel, { color: colors.textTertiary }]}>
          FEEDING INTELLIGENCE
        </Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          We don&apos;t have feeding-ratio data for this species yet.
          Quantitative suggestions will appear once the species sheet
          gains bracket data.
        </Text>
      </View>
    );
  }

  if (suggestion.warning && !suggestion.suggested_min_g) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: layout.radius.md,
          },
        ]}
      >
        <Text style={[styles.headerLabel, { color: colors.textTertiary }]}>
          FEEDING INTELLIGENCE
        </Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {suggestion.warning}
        </Text>
      </View>
    );
  }

  const preyRange =
    suggestion.suggested_min_g && suggestion.suggested_max_g
      ? `${fmtG(suggestion.suggested_min_g)}–${fmtG(suggestion.suggested_max_g)} g`
      : '—';

  const intervalRange =
    suggestion.interval_days_min != null && suggestion.interval_days_max != null
      ? suggestion.interval_days_min === suggestion.interval_days_max
        ? `${suggestion.interval_days_min} days`
        : `${suggestion.interval_days_min}–${suggestion.interval_days_max} days`
      : '—';

  const nextWindowText = nextWindow
    ? `${shortDate(nextWindow.min)} – ${shortDate(nextWindow.max)}`
    : 'Log a feeding to start the clock';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <Text style={[styles.headerLabel, { color: colors.textTertiary }]}>
        FEEDING INTELLIGENCE
      </Text>

      <View style={styles.stageRow}>
        <Text style={[styles.stageLabel, { color: colors.textTertiary }]}>
          Current stage
        </Text>
        <Text style={[styles.stageValue, { color: colors.textPrimary }]}>
          {STAGE_LABEL[suggestion.stage] ?? suggestion.stage}
        </Text>
        {suggestion.snake_weight_g && (
          <Text style={[styles.stageMuted, { color: colors.textTertiary }]}>
            · {fmtG(suggestion.snake_weight_g)} g
          </Text>
        )}
      </View>

      <View style={styles.tilesRow}>
        <InfoTile label="Prey weight" value={preyRange} />
        <InfoTile label="Interval" value={intervalRange} />
      </View>
      <View style={styles.tilesRow}>
        <InfoTile
          label="Next feed window"
          value={nextWindowText}
          tone={overdue ? 'warn' : 'neutral'}
        />
      </View>

      {overdue && (
        <Text style={[styles.warnText, { color: '#fbbf24' }]}>
          ⚠ Overdue against the upper interval. Refusal is often fine —
          check body condition + temps before pushing another offer.
        </Text>
      )}

      {powerWarning && (
        <View
          style={[
            styles.warnBlock,
            {
              borderColor: 'rgba(239,68,68,0.4)',
              backgroundColor: 'rgba(239,68,68,0.12)',
            },
          ]}
        >
          <MaterialCommunityIcons name="alert" size={14} color="#fca5a5" />
          <Text style={{ color: '#fca5a5', fontSize: 12, flex: 1, lineHeight: 17 }}>
            Last accepted feeding{powerWarning.date ? ` (${powerWarning.date})` : ''}{' '}
            was {fmtG(powerWarning.preyG)} g
            {powerWarning.pct != null ? ` — ${powerWarning.pct}% of body weight` : ''}
            . That&apos;s at or above the power-feeding threshold for this stage.
          </Text>
        </View>
      )}
    </View>
  );
}

function InfoTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warn';
}) {
  const { colors, layout } = useTheme();
  const valueColor = tone === 'warn' ? '#fbbf24' : colors.textPrimary;
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderRadius: layout.radius.sm,
        },
      ]}
    >
      <Text style={[styles.tileLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.tileValue, { color: valueColor }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function fmtG(v: string | number | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // Drop trailing zeros while keeping single-decimal precision when needed.
  return n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '');
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
  },
  stageLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stageValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  stageMuted: {
    fontSize: 12,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  tileValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  warnText: {
    fontSize: 12,
    lineHeight: 17,
  },
  warnBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export default FeedingIntelligence;
