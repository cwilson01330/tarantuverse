/**
 * FeedingStatusBanner — colored pill on the snake/lizard detail screen
 * that communicates "needs feeding" status at a glance.
 *
 * Status palette:
 *   - upcoming   → neutral surface, primary text       ("Next feeding in 4 days")
 *   - due        → warning (yellow)                    ("Feeding due")
 *   - overdue    → danger (red)                        ("Overdue by 3 days")
 *   - paused     → neutral, info icon                  ("Feeding paused for brumation")
 *   - no_data    → muted surface                       ("Link a species to see reminders")
 *   - no_feedings→ muted surface                       ("Log a feeding to start the clock")
 *
 * Lives just below the hero on detail screens so it's the first thing a
 * keeper sees after the animal's name. Tapping does nothing — it's a
 * status indicator, not a CTA. The "Feed" action button below is the
 * affordance.
 *
 * Backend route: GET /animals/<id>/feeding-status (ADR-003 collapsed the
 * per-taxon snake/lizard endpoints).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import {
  type FeedingStatus,
  type FeedingStatusKind,
  fetchFeedingStatus,
} from '../lib/feeding-status';

interface Props {
  animalId: string;
  /** Re-fetch when this changes (e.g. after a feeding is logged). */
  refreshKey?: string | number;
  /** When the status is `paused`, providing this makes the banner
   *  tappable (with a small "Tap to edit" hint) so the keeper can
   *  open the PauseFeedingSheet from the banner itself instead of
   *  hunting for a separate button. */
  onPausedPress?: () => void;
}

interface Visual {
  /** Background color */
  bg: string;
  /** Text + icon color */
  fg: string;
  /** Icon name */
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Headline */
  title: string;
  /** Optional smaller line below */
  detail?: string;
}

export function FeedingStatusBanner({ animalId, refreshKey, onPausedPress }: Props) {
  const { colors, layout } = useTheme();
  const [status, setStatus] = useState<FeedingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setLoadError(null);
    (async () => {
      try {
        const s = await fetchFeedingStatus(animalId);
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setLoadError("Couldn't load feeding status.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [animalId, refreshKey]);

  // Hide entirely on transient load failure — the section "Recent
  // feedings" still surfaces what the keeper needs.
  if (loadError) return null;

  if (status === null) {
    return (
      <View
        style={[
          styles.skeleton,
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

  const visual = describe(status, colors);
  const tappable = status.status === 'paused' && !!onPausedPress;

  // Static JSX branches — the dynamic component pattern
  // (`const W: any = condition ? Touchable : View`) crashes Hermes
  // prod builds. See feedback memory dated 2026-05-01.
  const inner = (
    <>
      <MaterialCommunityIcons name={visual.icon} size={20} color={visual.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: visual.fg }]} numberOfLines={1}>
          {visual.title}
        </Text>
        {visual.detail ? (
          <Text style={[styles.detail, { color: visual.fg }]} numberOfLines={2}>
            {visual.detail}
          </Text>
        ) : null}
      </View>
      {tappable && (
        <View style={styles.editHint}>
          <Text style={[styles.editHintText, { color: visual.fg }]}>Edit</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={visual.fg} />
        </View>
      )}
    </>
  );

  if (tappable) {
    return (
      <TouchableOpacity
        onPress={onPausedPress}
        activeOpacity={0.75}
        style={[
          styles.banner,
          {
            backgroundColor: visual.bg,
            borderRadius: layout.radius.md,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${visual.title}. Tap to edit pause.`}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: visual.bg,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${visual.title}${visual.detail ? `. ${visual.detail}` : ''}`}
    >
      {inner}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status → visual mapping. Pure function — easy to unit test.
// ---------------------------------------------------------------------------

function describe(
  s: FeedingStatus,
  colors: ReturnType<typeof useTheme>['colors'],
): Visual {
  const kind: FeedingStatusKind = s.status;

  // Color tokens — semantic + tinted backgrounds. Hex with low alpha
  // gives us an inline pill without needing a separate surface tone
  // per status.
  const tinted = (hex: string, alpha = '20') => `${hex}${alpha}`;

  if (kind === 'overdue') {
    const days = s.days_until_due ?? 0;
    const overdueBy =
      s.interval_days_max != null
        ? Math.max(1, -days - (s.interval_days_max - (s.interval_days_min ?? 0)))
        : Math.max(1, -days);
    return {
      bg: tinted(colors.danger, '22'),
      fg: colors.danger,
      icon: 'alert-circle',
      title: 'Feeding overdue',
      detail: `Past the recommended window by about ${overdueBy} day${overdueBy === 1 ? '' : 's'}.`,
    };
  }

  if (kind === 'due') {
    return {
      bg: tinted(colors.warning, '22'),
      fg: colors.warning,
      icon: 'silverware-fork-knife',
      title: 'Feeding due',
      detail:
        s.interval_days_min != null && s.interval_days_max != null
          ? `Species window: every ${s.interval_days_min}–${s.interval_days_max} days.`
          : undefined,
    };
  }

  if (kind === 'upcoming') {
    const n = s.days_until_due ?? 0;
    return {
      bg: tinted(colors.success, '18'),
      fg: colors.success,
      icon: 'calendar-clock',
      title: n <= 1 ? 'Feeding due soon' : `Next feeding in ~${n} days`,
      detail:
        s.interval_days_min != null && s.interval_days_max != null
          ? `Species window: every ${s.interval_days_min}–${s.interval_days_max} days.`
          : undefined,
    };
  }

  if (kind === 'paused') {
    return {
      bg: tinted(colors.info, '18'),
      fg: colors.info,
      icon: 'pause-circle',
      title: 'Feeding paused',
      detail: s.note ?? 'Brumation is active. Reminders are silenced.',
    };
  }

  if (kind === 'no_feedings') {
    return {
      bg: tinted(colors.textTertiary, '18'),
      fg: colors.textSecondary,
      icon: 'silverware-variant',
      title: 'No feedings logged yet',
      detail: 'Log the first feeding to start the reminder clock.',
    };
  }

  // no_data
  return {
    bg: tinted(colors.textTertiary, '18'),
    fg: colors.textSecondary,
    icon: 'help-circle-outline',
    title: 'Feeding cadence not on file',
    detail:
      s.note ??
      'Link this animal to a species with care-sheet data to see reminders.',
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: { fontSize: 14, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 2, opacity: 0.85 },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    opacity: 0.85,
  },
  editHintText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  skeleton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
