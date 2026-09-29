/**
 * Stat strip — design handoff, screen 9 item 3: Weight · Last shed · Accepted.
 *
 * Everything is computed from data the detail screen already holds; no new
 * endpoint. Acceptance rate is the new number and it's free — every feeding
 * carries `accepted`, and a run of refusals is the earliest sign something's
 * wrong. Empty values say so ("No weigh-ins") rather than showing a zero.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import type { Animal, FeedingLog, WeightLog } from '../../lib/animals';
import { daysSince } from '../../utils/relative-days';

const DELTA_WINDOW_DAYS = 28;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function StatStrip({
  animal,
  weights,
  feedings,
}: {
  animal: Animal;
  weights: WeightLog[];
  feedings: FeedingLog[];
}) {
  const { colors, layout } = useTheme();

  // ── weight + change over ~4 weeks ─────────────────────────────────────────
  const byDate = [...weights]
    .filter((w) => Number.isFinite(Number(w.weight_g)))
    .sort((a, b) => new Date(a.weighed_at).getTime() - new Date(b.weighed_at).getTime());
  const latest = byDate[byDate.length - 1];
  const current = animal.current_weight_g != null ? Number(animal.current_weight_g) : latest ? Number(latest.weight_g) : null;
  let delta: { grams: number; days: number } | null = null;
  if (latest && byDate.length > 1) {
    const cutoff = new Date(latest.weighed_at).getTime() - DELTA_WINDOW_DAYS * 86_400_000;
    // The most recent weigh-in at least four weeks before the latest; if none
    // is that old, compare against the earliest one we have.
    const base = [...byDate].reverse().find((w) => new Date(w.weighed_at).getTime() <= cutoff) ?? byDate[0];
    if (base !== latest) {
      delta = {
        grams: Number(latest.weight_g) - Number(base.weight_g),
        days: Math.max(1, Math.round((new Date(latest.weighed_at).getTime() - new Date(base.weighed_at).getTime()) / 86_400_000)),
      };
    }
  }

  // ── last shed ─────────────────────────────────────────────────────────────
  const shedDays = daysSince(animal.last_shed_at);

  // ── acceptance ────────────────────────────────────────────────────────────
  const total = feedings.length;
  const accepted = feedings.filter((f) => f.accepted).length;
  const pct = total > 0 ? Math.round((accepted / total) * 100) : null;

  const deltaColor = !delta || delta.grams === 0 ? colors.textSecondary : delta.grams > 0 ? colors.success : colors.danger;

  const card = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
  ];

  // A plain render helper, not a component defined in render (that would
  // remount every cell on every render).
  const cell = ({ icon, label, value, foot, footColor, a11y }: {
    icon: IconName; label: string; value: string; foot: string; footColor?: string; a11y: string;
  }) => (
    <View key={label} style={card} accessible accessibilityLabel={a11y}>
      <View style={styles.labelRow}>
        <MaterialCommunityIcons name={icon} size={14} color={colors.textTertiary} />
        <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[TYPE.heading, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[TYPE.caption, { color: footColor ?? colors.textSecondary }]} numberOfLines={1}>{foot}</Text>
    </View>
  );

  const weightValue = current != null && Number.isFinite(current) ? `${fmt(current)} g` : '—';
  const weightFoot = delta
    ? `${delta.grams > 0 ? '+' : delta.grams < 0 ? '−' : '±'}${fmt(Math.abs(delta.grams))} · ${delta.days}d`
    : byDate.length ? 'One weigh-in' : 'No weigh-ins';

  return (
    <View style={styles.row}>
      {cell({
        icon: 'scale-bathroom',
        label: 'Weight',
        value: weightValue,
        foot: weightFoot,
        footColor: delta ? deltaColor : undefined,
        a11y: `Weight ${weightValue}${delta ? `, ${delta.grams >= 0 ? 'up' : 'down'} ${fmt(Math.abs(delta.grams))} grams over ${delta.days} days` : ''}`,
      })}
      {cell({
        icon: 'weather-windy',
        label: 'Last shed',
        value: shedDays == null ? '—' : shedDays === 0 ? 'Today' : `${shedDays}d ago`,
        foot: animal.last_shed_at ? new Date(animal.last_shed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No sheds logged',
        a11y: shedDays == null ? 'No sheds logged' : `Last shed ${shedDays} days ago`,
      })}
      {cell({
        icon: 'silverware-fork-knife',
        label: 'Accepted',
        value: pct == null ? '—' : `${pct}%`,
        foot: total ? `${accepted} of ${total}` : 'No feedings',
        a11y: pct == null ? 'No feedings logged' : `Accepted ${accepted} of ${total} feedings, ${pct} percent`,
      })}
    </View>
  );
}

function fmt(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : String(Number(n.toFixed(1)));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 11, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
