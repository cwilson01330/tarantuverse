/**
 * One feeding card — design handoff, screen 9 ("Three cards answer one question").
 *
 * Replaces the stack of FeedingStatusBanner + FeedingIntelligence +
 * CgdRefreshSection. All three answered "should I feed this animal, and
 * with what?" in three visual languages. Here it's one sentence, one line
 * of reasoning, and the action — mirroring the TV detail screen's card.
 *
 *   Head:    verdict as a sentence ("Feed now — 4 days overdue")
 *            reasoning ("Every 7–10d · prey 141–212 g · fed 11 days ago")
 *   Warning: power-feeding flag, when the last accepted meal crossed the
 *            species threshold (kept from FeedingIntelligence — flag, never block)
 *   Actions: primary "Fed — small rat" (quick-feed reuses the last meal
 *            server-side) or "Refresh CGD" for complete-diet animals,
 *            then the full form and pause.
 *
 * Honesty rules carried over from the components this replaces:
 *   - no schedule on file → say so; never invent a cadence
 *   - a failed load is an error with a retry, not a blank card
 *     (the old banner silently vanished on error, which reads as "nothing due")
 *
 * Co-keepers: logging needs `canLog`; pause and schedule need `canKeep`.
 * The API enforces both; this only hides what would fail.
 *
 * Hermes-prod safety: static JSX branches only.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/type';
import {
  type Animal,
  type FeedingLog,
  type PreySuggestion,
  createFeeding,
  getPreySuggestion,
  quickFeedAnimal,
} from '../../lib/animals';
import { DEFAULT_CGD_FOOD_TYPE } from '../../lib/cgd';
import { type FeedingStatus, fetchFeedingStatus } from '../../lib/feeding-status';
import { daysSince } from '../../utils/relative-days';

type Tone = 'danger' | 'warning' | 'success' | 'info' | 'muted';
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface Verdict {
  tone: Tone;
  icon: IconName;
  headline: string;
  detail?: string;
}

interface Props {
  animal: Animal;
  feedings: FeedingLog[];
  /** Bumps whenever a feeding / pause / cadence change should re-fetch. */
  refreshKey: string;
  canLog: boolean;
  canKeep: boolean;
  /** After a one-tap log, so the parent refetches history and the animal. */
  onLogged: () => Promise<void> | void;
  onFullForm: () => void;
  onPause: () => void;
  onSetCadence: () => void;
}

export function FeedingCard({
  animal,
  feedings,
  refreshKey,
  canLog,
  canKeep,
  onLogged,
  onFullForm,
  onPause,
  onSetCadence,
}: Props) {
  const { colors, layout } = useTheme();
  const [status, setStatus] = useState<FeedingStatus | null>(null);
  const [suggestion, setSuggestion] = useState<PreySuggestion | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    // Status is the card; prey guidance only enriches the reasoning line, so
    // losing it degrades quietly while losing status is a visible error.
    const [s, p] = await Promise.allSettled([
      fetchFeedingStatus(animal.id),
      getPreySuggestion(animal.id),
    ]);
    if (s.status === 'fulfilled') setStatus(s.value);
    else setFailed(true);
    setSuggestion(p.status === 'fulfilled' ? p.value : null);
  }, [animal.id]);

  // Refreshes keep showing the last verdict until the new one arrives, so
  // tapping Fed doesn't collapse the card to a spinner and jump the layout.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toneColor = (t: Tone) =>
    t === 'danger' ? colors.danger
      : t === 'warning' ? colors.warning
        : t === 'success' ? colors.success
          : t === 'info' ? colors.info
            : colors.textSecondary;

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
  ];

  if (failed) {
    return (
      <View style={cardStyle} accessibilityRole="alert">
        <View style={styles.head}>
          <View style={[styles.well, { backgroundColor: colors.danger + '22', borderRadius: layout.radius.md }]}>
            <MaterialCommunityIcons name="wifi-off" size={22} color={colors.danger} />
          </View>
          <View style={styles.flex}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Couldn&apos;t load feeding status</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              This isn&apos;t the same as nothing being due — check your connection.
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={styles.link}>
          <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === null) {
    return (
      <View style={[cardStyle, styles.loading]}>
        <ActivityIndicator color={colors.textTertiary} accessibilityLabel="Loading feeding status" />
      </View>
    );
  }

  const verdict = describe(status, animal);
  const paused = status.status === 'paused';

  // ── reasoning line — only facts we actually hold ──────────────────────────
  const lastAccepted = [...feedings]
    .filter((f) => f.accepted)
    .sort((a, b) => new Date(b.fed_at).getTime() - new Date(a.fed_at).getTime())[0];
  const fedDays = daysSince(animal.last_fed_at ?? lastAccepted?.fed_at ?? null);
  const reasoning = [
    animal.feeding_interval_days
      ? `Every ${animal.feeding_interval_days}d (your schedule)`
      : status.interval_days_min != null && status.interval_days_max != null
        ? status.interval_days_min === status.interval_days_max
          ? `Every ${status.interval_days_min}d`
          : `Every ${status.interval_days_min}–${status.interval_days_max}d`
        : null,
    suggestion?.is_data_available && suggestion.suggested_min_g && suggestion.suggested_max_g
      ? `prey ${fmtG(suggestion.suggested_min_g)}–${fmtG(suggestion.suggested_max_g)} g`
      : null,
    fedDays == null ? null : fedDays === 0 ? 'fed today' : `fed ${fedDays}d ago`,
  ].filter(Boolean).join(' · ');

  // ── power-feeding flag (from FeedingIntelligence) ─────────────────────────
  const power = (() => {
    if (!suggestion?.power_feeding_threshold_g || !lastAccepted?.prey_weight_g) return null;
    const prey = Number(lastAccepted.prey_weight_g);
    const threshold = Number(suggestion.power_feeding_threshold_g);
    if (!Number.isFinite(prey) || !Number.isFinite(threshold) || prey < threshold) return null;
    const bw = Number(suggestion.snake_weight_g);
    return bw > 0 ? `${fmtG(prey)} g, ${((prey / bw) * 100).toFixed(0)}% of body weight` : `${fmtG(prey)} g`;
  })();

  const lastPrey = lastAccepted?.food_type?.trim() || null;
  const primaryLabel = animal.feeds_on_cgd
    ? 'Refresh CGD'
    : lastPrey ? `Fed — ${lastPrey}` : 'Fed';

  const logNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (animal.feeds_on_cgd) {
        await createFeeding(animal.id, {
          fed_at: new Date().toISOString(),
          food_type: DEFAULT_CGD_FOOD_TYPE,
          accepted: true,
        });
      } else {
        // Server reuses the last meal's type and size.
        await quickFeedAnimal(animal.id);
      }
      await onLogged();
    } catch {
      Alert.alert("That didn't save", 'Something went wrong. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const fg = toneColor(verdict.tone);
  const offerCadence =
    canKeep && status.status === 'overdue' && !animal.feeding_interval_days;

  return (
    <View
      style={[...cardStyle, verdict.tone === 'danger' && { borderColor: colors.danger + '55' }]}
    >
      <View style={styles.head} accessible accessibilityLabel={`${verdict.headline}. ${reasoning}`}>
        <View style={[styles.well, { backgroundColor: fg + '22', borderRadius: layout.radius.md }]}>
          <MaterialCommunityIcons name={verdict.icon} size={22} color={fg} />
        </View>
        <View style={styles.flex}>
          <Text style={[TYPE.subheading, styles.verdict, { color: fg }]}>{verdict.headline}</Text>
          {reasoning ? (
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{reasoning}</Text>
          ) : null}
          {verdict.detail ? (
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{verdict.detail}</Text>
          ) : null}
        </View>
      </View>

      {power ? (
        <View style={[styles.warn, { backgroundColor: colors.warning + '18', borderRadius: layout.radius.sm }]}>
          <MaterialCommunityIcons name="alert-outline" size={16} color={colors.warning} />
          <Text style={[TYPE.caption, styles.flex, { color: colors.warning }]}>
            Last meal was large ({power}) — that&apos;s power-feeding territory for this species.
          </Text>
        </View>
      ) : null}

      {canLog && !paused ? (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => void logNow()}
            disabled={busy}
            style={[styles.primary, { backgroundColor: colors.primary, borderRadius: layout.radius.md, opacity: busy ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={animal.feeds_on_cgd ? 'Log a fresh CGD dish' : lastPrey ? `Log a feeding of ${lastPrey}` : 'Log a feeding'}
          >
            {busy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <MaterialCommunityIcons name={animal.feeds_on_cgd ? 'leaf' : 'check'} size={17} color={colors.background} />
                <Text style={[TYPE.bodyStrong, { color: colors.background }]} numberOfLines={1}>{primaryLabel}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onFullForm}
            style={[styles.square, { borderColor: colors.textTertiary, borderRadius: layout.radius.md }]}
            accessibilityRole="button"
            accessibilityLabel="Log a feeding with full details"
          >
            <MaterialCommunityIcons name="tune-variant" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {canKeep ? (
            <TouchableOpacity
              onPress={onPause}
              style={[styles.square, { borderColor: colors.textTertiary, borderRadius: layout.radius.md }]}
              accessibilityRole="button"
              accessibilityLabel="Pause feeding reminders"
            >
              <MaterialCommunityIcons name="pause" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {paused && canKeep ? (
        <TouchableOpacity onPress={onPause} accessibilityRole="button" style={styles.link}>
          <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>Manage pause</Text>
        </TouchableOpacity>
      ) : null}

      {offerCadence ? (
        <TouchableOpacity
          onPress={onSetCadence}
          accessibilityRole="button"
          style={[styles.offer, { borderTopColor: colors.border }]}
        >
          <MaterialCommunityIcons name="calendar-clock" size={15} color={colors.textSecondary} />
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Feed on your own schedule?</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Status → one sentence. Pure; mirrors the old banner's thresholds. */
function describe(s: FeedingStatus, animal: Animal): Verdict {
  if (s.status === 'overdue') {
    const days = s.days_until_due ?? 0;
    const by =
      s.interval_days_max != null
        ? Math.max(1, -days - (s.interval_days_max - (s.interval_days_min ?? 0)))
        : Math.max(1, -days);
    return { tone: 'danger', icon: 'alert-circle-outline', headline: `Feed now — ${by} day${by === 1 ? '' : 's'} overdue` };
  }
  if (s.status === 'due') {
    return { tone: 'warning', icon: 'silverware-fork-knife', headline: 'Feed today' };
  }
  if (s.status === 'upcoming') {
    const n = s.days_until_due ?? 0;
    return {
      tone: 'success',
      icon: 'calendar-clock',
      headline: n <= 0 ? 'Feed today' : n === 1 ? 'Feed tomorrow' : `Feed in ${n} days`,
    };
  }
  if (s.status === 'paused') {
    return {
      tone: 'info',
      icon: 'pause-circle-outline',
      headline: 'Feeding paused',
      detail: s.note ?? (animal.brumation_active ? 'Brumation is active. Reminders are silenced.' : undefined),
    };
  }
  if (s.status === 'no_feedings') {
    return {
      tone: 'muted',
      icon: 'silverware-variant',
      headline: 'Not yet fed',
      detail: 'Log the first feeding to start the clock.',
    };
  }
  // no_data — never invent a schedule.
  return {
    tone: 'muted',
    icon: 'help-circle-outline',
    headline: 'No feeding schedule on file',
    detail: s.note ?? 'Link a species with care-sheet data, or set your own schedule.',
  };
}

function fmtG(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(n % 1 === 0 ? 0 : 1);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, padding: 16, gap: 12 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 88 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  well: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  verdict: { marginBottom: 2 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  square: { width: 44, height: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingTop: 6, borderTopWidth: 1 },
});
