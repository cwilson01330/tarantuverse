import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from './ui';
import { RankedRows } from './charts';
import { SPACING, TYPE } from '../theme/tokens';
import { withAlpha } from '../lib/chart-helpers';
import { feedingStatusColor, FEEDING_OVERDUE_ORANGE } from '../utils/status-colors';
import type { RankedRow } from '../lib/analytics-view';

interface PreyTypeCount {
  food_type: string;
  count: number;
  percentage: number;
}

interface FeedingStats {
  tarantula_id: string;
  total_feedings: number;
  total_accepted: number;
  total_refused: number;
  acceptance_rate: number;
  average_days_between_feedings?: number;
  last_feeding_date?: string;
  days_since_last_feeding?: number;
  next_feeding_prediction?: string;
  longest_gap_days?: number;
  current_streak_accepted: number;
  prey_type_distribution: PreyTypeCount[];
  // Pause state — see migration pst_20260502. When true, FeedingStatsCard
  // swaps the red "X days ago" treatment for a quiet paused indicator.
  is_feeding_paused?: boolean;
  feeding_paused_reason?: string | null;
  feeding_paused_until?: string | null;
}

const PAUSE_REASON_LABELS: Record<string, string> = {
  premolt: 'In premolt',
  post_rehouse: 'Settling after rehouse',
  recovering: 'Recovering',
  mating_season: 'Mating-season pause',
  other: 'Feeding paused',
};

function pauseReasonLabel(reason?: string | null): string {
  if (!reason) return 'Feeding paused';
  return PAUSE_REASON_LABELS[reason] ?? reason;
}

interface FeedingStatsCardProps {
  data: FeedingStats;
  /** When the spider is paused, the paused banner becomes tappable.
   *  Wire this to open the PauseFeedingSheet so the keeper can edit
   *  or resume directly from the detail screen without backing out
   *  to the log-feeding flow. */
  onPausedPress?: () => void;
}

// ───────────────────────────── chart grammar (README §6) ─────────────────────────────
// Acceptance is a split (SegmentedBar rules: 8pt bar, 2pt gaps, radius 4, a legend
// that lists every category, a sentence instead of the bar when only one category
// has anything). The prey mix is ranked rows. No donut, no percent labels on bars.

const BAR_HEIGHT = 8;
const BAR_GAP = 2;
const SWATCH = 8;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Accepted vs refused. Accepted first; fixed semantic colours. */
function AcceptanceSplit({ data }: { data: FeedingStats }) {
  const { colors } = useTheme();
  const accepted = Math.max(0, data.total_accepted ?? 0);
  const refused = Math.max(0, data.total_refused ?? 0);
  const filled = (accepted > 0 ? 1 : 0) + (refused > 0 ? 1 : 0);

  let sentence: string;
  if (filled === 0) {
    sentence = 'No accepted or refused feedings recorded yet.';
  } else if (refused === 0) {
    sentence = accepted === 1 ? 'The one feeding was accepted.' : `All ${accepted} feedings accepted.`;
  } else if (accepted === 0) {
    sentence = refused === 1 ? 'The one feeding was refused.' : `All ${refused} feedings refused.`;
  } else {
    sentence = `${accepted} of ${data.total_feedings} feedings accepted (${Math.round(data.acceptance_rate)}%).`;
  }

  const legend = [
    { key: 'accepted', label: `${accepted} accepted`, color: colors.success },
    { key: 'refused', label: `${refused} refused`, color: colors.error },
  ];

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Acceptance: ${accepted} accepted, ${refused} refused`}>
      {filled >= 2 && (
        <View style={{ flexDirection: 'row', height: BAR_HEIGHT }}>
          <View style={{ flex: accepted, backgroundColor: colors.success, borderRadius: BAR_HEIGHT / 2 }} />
          <View style={{ flex: refused, backgroundColor: colors.error, borderRadius: BAR_HEIGHT / 2, marginLeft: BAR_GAP }} />
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: SPACING.md,
          rowGap: SPACING.xs,
          marginTop: filled >= 2 ? SPACING.sm : 0,
        }}
      >
        {legend.map((item) => (
          <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: item.color }} />
            <Text style={{ ...TYPE.caption, fontWeight: '400', color: colors.textSecondary }}>{item.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ ...TYPE.label, fontWeight: '400', color: colors.textSecondary, marginTop: SPACING.sm }}>
        {sentence}
      </Text>
    </View>
  );
}

/** Prey types as ranked rows, biggest first, with the sentence under them. */
function PreyRows({ prey }: { prey: PreyTypeCount[] }) {
  const { colors } = useTheme();
  const sorted = [...prey].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((p) => p.count));
  const total = sorted.reduce((sum, p) => sum + p.count, 0);
  const rows: RankedRow[] = sorted.map((p, i) => {
    const pct = `${Math.round(p.percentage)}%`;
    return {
      key: `${p.food_type}-${i}`,
      id: null,
      label: p.food_type ? p.food_type.charAt(0).toUpperCase() + p.food_type.slice(1) : '—',
      count: p.count,
      fraction: p.count / max,
      value: String(p.count),
      detail: pct,
      right: `${p.count} · ${pct}`,
      none: false,
      a11y: `${p.food_type}, ${plural(p.count, 'feeding')}, ${pct}`,
    };
  });
  const top = sorted[0];
  const sentence =
    sorted.length === 1
      ? `Every feeding so far was ${top.food_type}.`
      : `Mostly ${top.food_type}: ${top.count} of ${total} feedings.`;
  return (
    <View>
      <RankedRows rows={rows} labelWidth={84} />
      <Text style={{ ...TYPE.label, fontWeight: '400', color: colors.textSecondary, marginTop: SPACING.sm }}>
        {sentence}
      </Text>
    </View>
  );
}

const FeedingStatsCard: React.FC<FeedingStatsCardProps> = ({ data, onPausedPress }) => {
  const { colors, layout } = useTheme();

  // Last-fed ladder: the app-wide one (green <7, yellow 7-13, orange 14-20,
  // red 21+). `!= null`: 0 days is "fed today", not "unknown".
  const statusColorFor = (days?: number | null): string =>
    days == null ? colors.textTertiary : feedingStatusColor(days, colors);

  const acceptanceColor = (rate: number): string => {
    if (rate >= 80) return colors.success;
    if (rate >= 60) return colors.warning;
    return FEEDING_OVERDUE_ORANGE;
  };

  const cardStyle = { borderRadius: layout.radius.lg };

  const title = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
      <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.primary} />
      <Text accessibilityRole="header" style={{ ...TYPE.heading, color: colors.textPrimary }}>
        Feeding Stats
      </Text>
    </View>
  );

  if (data.total_feedings === 0) {
    return (
      <Card style={cardStyle}>
        {title}
        <Text style={{ ...TYPE.body, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.xl }}>
          No feeding data yet. Add feeding logs to track patterns.
        </Text>
      </Card>
    );
  }

  const statusColor = statusColorFor(data.days_since_last_feeding);
  const bannerStyle = (tone: string) => ({
    borderRadius: layout.radius.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: withAlpha(tone, 0.5, tone),
    backgroundColor: withAlpha(tone, 0.14, colors.surfaceElevated),
  });
  const kicker = { ...TYPE.caption, fontWeight: '600' as const, color: colors.textSecondary, textTransform: 'uppercase' as const, marginBottom: SPACING.xs };

  const tile = (label: string, value: string, sub: string, valueColor: string) => (
    <View
      key={label}
      accessible
      accessibilityLabel={`${label}: ${value}, ${sub}`}
      style={{
        minWidth: '47%',
        flexGrow: 1,
        borderRadius: layout.radius.md,
        padding: SPACING.md,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Text style={{ ...TYPE.caption, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
        {label}
      </Text>
      <Text style={{ ...TYPE.display, color: valueColor }}>{value}</Text>
      <Text style={{ ...TYPE.caption, fontWeight: '400', color: colors.textTertiary }}>{sub}</Text>
    </View>
  );

  return (
    <Card style={cardStyle}>
      {title}

      {/* Paused banner takes priority over the overdue red banner.
          A 7-month premolt sling shouldn't see her "Last Fed: 200 days
          ago" pulsing red — the keeper already knows.

          When `onPausedPress` is provided, the banner becomes tappable
          (so the keeper can edit/resume directly from the detail
          screen). We branch with static JSX rather than a dynamic
          `: any` component variable — that pattern crashes Hermes
          prod with "Cannot call a class as a function" via
          `_classCallCheck`. See feedback memory dated 2026-05-01. */}
      {data.is_feeding_paused ? (() => {
        const pausedInner = (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={kicker}>Feeding paused</Text>
              <Text style={{ ...TYPE.title, color: colors.textPrimary }}>
                {pauseReasonLabel(data.feeding_paused_reason)}
              </Text>
              {data.days_since_last_feeding != null && (
                <Text style={{ ...TYPE.caption, fontWeight: '400', color: colors.textSecondary, marginTop: SPACING.xs }}>
                  Last fed {data.days_since_last_feeding} days ago
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {data.feeding_paused_until ? (
                <>
                  <Text style={kicker}>Until</Text>
                  <Text style={{ ...TYPE.subheading, color: colors.textPrimary }}>
                    {new Date(data.feeding_paused_until).toLocaleDateString()}
                  </Text>
                </>
              ) : (
                <Text style={{ ...TYPE.caption, fontWeight: '400', color: colors.textSecondary }}>Indefinite</Text>
              )}
              {onPausedPress && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: SPACING.sm }}>
                  <Text style={{ ...TYPE.caption, fontWeight: '600', color: colors.textSecondary }}>Tap to edit</Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color={colors.textSecondary} />
                </View>
              )}
            </View>
          </View>
        );
        return onPausedPress ? (
          <TouchableOpacity
            onPress={onPausedPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Feeding paused: ${pauseReasonLabel(data.feeding_paused_reason)}. Tap to edit.`}
            style={[bannerStyle(colors.info), { minHeight: 44 }]}
          >
            {pausedInner}
          </TouchableOpacity>
        ) : (
          <View style={bannerStyle(colors.info)}>
            {pausedInner}
          </View>
        );
      })() : (
        /* Status Banner — `!= null` covers both null (no accepted feedings yet)
            and undefined (data still loading). Previous `!== undefined` let
            null through and rendered "null days ago" on new spiders. */
        data.days_since_last_feeding != null && (
          <View style={bannerStyle(statusColor)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={kicker}>Last fed</Text>
                <Text style={{ ...TYPE.title, color: colors.textPrimary }}>
                  {data.days_since_last_feeding} days ago
                </Text>
              </View>
              {data.next_feeding_prediction && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={kicker}>Next feeding</Text>
                  <Text style={{ ...TYPE.subheading, color: colors.textPrimary }}>
                    {new Date(data.next_feeding_prediction).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )
      )}

      {/* Key Metrics */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
        {tile(
          'Acceptance rate',
          `${data.acceptance_rate}%`,
          `${data.total_accepted}/${data.total_feedings} accepted`,
          acceptanceColor(data.acceptance_rate),
        )}
        {data.average_days_between_feedings != null && data.average_days_between_feedings > 0 &&
          tile('Avg interval', String(Math.round(data.average_days_between_feedings)), 'days between', colors.textPrimary)}
        {data.current_streak_accepted != null && data.current_streak_accepted > 0 &&
          tile('Current streak', String(data.current_streak_accepted), 'accepted', colors.textPrimary)}
        {data.longest_gap_days != null && data.longest_gap_days > 0 &&
          tile('Longest gap', String(data.longest_gap_days), 'days', colors.textPrimary)}
      </View>

      {/* Acceptance split */}
      {data.total_feedings > 1 && (
        <View>
          <Text style={{ ...TYPE.bodyStrong, color: colors.textPrimary, marginBottom: SPACING.sm }}>Acceptance</Text>
          <AcceptanceSplit data={data} />
        </View>
      )}

      {/* Prey type distribution */}
      {data.prey_type_distribution.length > 0 && (
        <View>
          <Text style={{ ...TYPE.bodyStrong, color: colors.textPrimary, marginBottom: SPACING.sm }}>Prey types</Text>
          <PreyRows prey={data.prey_type_distribution} />
        </View>
      )}
    </Card>
  );
};

export default FeedingStatsCard;
