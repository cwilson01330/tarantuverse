/**
 * AnimalTimeline — one merged history replacing the three per-type lists
 * (Recent weigh-ins / Recent feedings / Recent sheds) on the HV animal
 * detail screen.
 *
 * Why merge: the three lists had identical shape, each sorted
 * independently, so "what happened to this animal recently" required
 * reading three separate widgets and interleaving them mentally. This is
 * the same move ADR-013 already made on Tarantuverse mobile.
 *
 * No new endpoints — this is a client-side merge of arrays the detail
 * screen already fetches.
 *
 * ── The same-day tiebreak (design handoff §14.7) ──────────────────────
 *
 * Tarantuverse shipped a real bug here that this component must not
 * repeat. Its merge sorted purely on timestamp:
 *
 *     .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
 *
 * `fed_at` and `weighed_at` are DateTimes, but date-only values parse to
 * midnight — so a date-only entry silently claims to be the FIRST event of
 * its day and sorts above every timed event that day, regardless of when
 * it actually happened.
 *
 * The rule implemented below:
 *   1. Sort descending by calendar day.
 *   2. Within a day, entries WITH a time come first, newest first.
 *   3. Entries WITHOUT a time come after them.
 *
 * Placing an unknown time last is equally arbitrary but it is not a
 * *claim*, because the row says "No time recorded" rather than rendering a
 * fabricated 00:00.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { FeedingLog, ShedLog, WeightLog } from '../../lib/animals';

export type TimelineKind = 'feeding' | 'weight' | 'shed';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** Raw ISO string as the server sent it. */
  at: string;
  /** Local calendar day, as YYYY-MM-DD, used as the primary sort key. */
  day: string;
  /** False when `at` carried no time component — see the tiebreak note. */
  hasTime: boolean;
  title: string;
  /** Right-aligned outcome or delta. */
  trailing?: string;
  /** Colour for `trailing`; falls back to textTertiary. */
  trailingTone?: 'success' | 'danger' | 'muted';
}

/**
 * A value is date-only if it has no time component at all. The API sends
 * either a bare `YYYY-MM-DD` or a full ISO datetime, so the presence of a
 * "T" is the discriminator. A midnight-exact datetime is NOT treated as
 * date-only — the server said midnight and we believe it.
 */
function hasTimeComponent(iso: string): boolean {
  return iso.includes('T');
}

/** Local calendar day for an ISO value, without a UTC round-trip. */
function localDay(iso: string): string {
  const d = new Date(hasTimeComponent(iso) ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function relativeDay(iso: string): string {
  const day = localDay(iso);
  if (!day) return '';
  const then = new Date(`${day}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - then.getTime()) / 86_400_000);

  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: then.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "Ate a small rat" / "Refused a cricket" — an event as a sentence. */
function feedingTitle(f: FeedingLog): string {
  const meal = [f.food_size, f.food_type].filter(Boolean).join(' ').trim();
  const verb = f.accepted ? 'Ate' : 'Refused';
  if (!meal) return f.accepted ? 'Ate a meal' : 'Refused a meal';
  const article = /^[aeiou]/i.test(meal) ? 'an' : 'a';
  const qty = f.quantity && f.quantity > 1 ? `${f.quantity} ` : `${article} `;
  return `${verb} ${qty}${meal}${f.quantity > 1 ? 's' : ''}`;
}

function shedTitle(s: ShedLog): string {
  if (s.has_retained_shed) return 'Shed — retained pieces';
  return s.is_complete_shed ? 'Shed complete' : 'Shed logged';
}

const META: Record<
  TimelineKind,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }
> = {
  feeding: { icon: 'silverware-fork-knife', label: 'Feed' },
  weight: { icon: 'scale-bathroom', label: 'Weight' },
  shed: { icon: 'weather-windy', label: 'Shed' },
};

const PAGE = 8;

export function AnimalTimeline({
  feedings,
  weights,
  sheds,
  onOpen,
}: {
  feedings: FeedingLog[];
  weights: WeightLog[];
  sheds: ShedLog[];
  /** Opens the matching edit form for a row. */
  onOpen: (kind: TimelineKind, id: string) => void;
}) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<TimelineKind | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const entries = useMemo<TimelineEntry[]>(() => {
    const out: TimelineEntry[] = [];

    for (const f of feedings) {
      out.push({
        id: f.id,
        kind: 'feeding',
        at: f.fed_at,
        day: localDay(f.fed_at),
        hasTime: hasTimeComponent(f.fed_at),
        title: feedingTitle(f),
        trailing: f.accepted ? undefined : 'Refused',
        trailingTone: f.accepted ? undefined : 'danger',
      });
    }

    // Weights carry a delta against the previous weigh-in, which is the
    // number a keeper is actually looking for. Sorted oldest-first here so
    // each entry can see the one before it.
    const byDate = [...weights].sort(
      (a, b) => new Date(a.weighed_at).getTime() - new Date(b.weighed_at).getTime(),
    );
    byDate.forEach((w, i) => {
      const grams = num(w.weight_g);
      const prev = i > 0 ? num(byDate[i - 1].weight_g) : null;
      const delta = grams != null && prev != null ? grams - prev : null;
      out.push({
        id: w.id,
        kind: 'weight',
        at: w.weighed_at,
        day: localDay(w.weighed_at),
        hasTime: hasTimeComponent(w.weighed_at),
        title:
          grams == null
            ? 'Weighed'
            : `Weighed ${Math.round(grams).toLocaleString()} g`,
        // A delta of exactly 0 is meaningful (held weight), so it renders
        // rather than being swallowed by a falsy check.
        trailing:
          delta == null
            ? undefined
            : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(
                Math.round(delta),
              ).toLocaleString()} g`,
        trailingTone: delta == null || delta === 0 ? 'muted' : delta > 0 ? 'success' : 'danger',
      });
    });

    for (const s of sheds) {
      out.push({
        id: s.id,
        kind: 'shed',
        at: s.shed_at,
        day: localDay(s.shed_at),
        hasTime: hasTimeComponent(s.shed_at),
        title: shedTitle(s),
        trailing: s.has_retained_shed ? 'Retained' : undefined,
        trailingTone: s.has_retained_shed ? 'danger' : undefined,
      });
    }

    // See the §14.7 note at the top of this file.
    out.sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
      if (!a.hasTime) return 0;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });

    return out;
  }, [feedings, weights, sheds]);

  const counts = useMemo(() => {
    const c: Record<TimelineKind, number> = { feeding: 0, weight: 0, shed: 0 };
    for (const e of entries) c[e.kind] += 1;
    return c;
  }, [entries]);

  const filtered = filter ? entries.filter((e) => e.kind === filter) : entries;
  const shown = filtered.slice(0, limit);

  const toneColor = (tone?: TimelineEntry['trailingTone']) =>
    tone === 'success'
      ? colors.success
      : tone === 'danger'
        ? colors.danger
        : colors.textTertiary;

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons
          name="timeline-outline"
          size={28}
          color={colors.textTertiary}
        />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No history yet. Feedings, weigh-ins and sheds appear here.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Filter chips. A chip is hidden at count 0, so an animal that has
          never shed doesn't see a Shed filter that yields nothing. */}
      <View style={styles.chipRow}>
        <Chip
          label={`All ${entries.length}`}
          active={filter === null}
          onPress={() => {
            setFilter(null);
            setLimit(PAGE);
          }}
        />
        {(Object.keys(META) as TimelineKind[])
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <Chip
              key={k}
              label={`${META[k].label} ${counts[k]}`}
              icon={META[k].icon}
              active={filter === k}
              onPress={() => {
                setFilter(k);
                setLimit(PAGE);
              }}
            />
          ))}
      </View>

      <View style={styles.rows}>
        {shown.map((e) => (
          <TouchableOpacity
            key={`${e.kind}:${e.id}`}
            style={[styles.row, { backgroundColor: colors.surfaceRaised }]}
            onPress={() => onOpen(e.kind, e.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${e.title}, ${relativeDay(e.at)}${
              e.trailing ? `, ${e.trailing}` : ''
            }. Opens for editing.`}
          >
            <View
              style={[styles.rowIcon, { backgroundColor: colors.primary + '1F' }]}
            >
              <MaterialCommunityIcons
                name={META[e.kind].icon}
                size={16}
                color={colors.accent}
              />
            </View>

            <View style={styles.rowText}>
              <Text
                style={[styles.rowTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {e.title}
              </Text>
              <Text style={[styles.rowDate, { color: colors.textTertiary }]}>
                {relativeDay(e.at)}
                {/* Never fabricate a 00:00 for a date-only entry. */}
                {!e.hasTime ? ' · No time recorded' : ''}
              </Text>
            </View>

            {e.trailing && (
              <Text style={[styles.rowTrailing, { color: toneColor(e.trailingTone) }]}>
                {e.trailing}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length > shown.length && (
        <TouchableOpacity
          onPress={() => setLimit((l) => l + PAGE)}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={`Show more history. ${
            filtered.length - shown.length
          } older entries.`}
        >
          <Text style={[styles.moreText, { color: colors.accent }]}>
            Show {Math.min(PAGE, filtered.length - shown.length)} more
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.surfaceRaised,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={13}
          color={active ? '#0B0B0B' : colors.textSecondary}
        />
      )}
      <Text
        style={[
          styles.chipText,
          { color: active ? '#0B0B0B' : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: { fontSize: 12.5, fontWeight: '600' },

  rows: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowDate: { fontSize: 11.5, marginTop: 1 },
  rowTrailing: { fontSize: 13, fontWeight: '700' },

  more: { paddingVertical: 12, alignItems: 'center' },
  moreText: { fontSize: 13, fontWeight: '600' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 22 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
});
