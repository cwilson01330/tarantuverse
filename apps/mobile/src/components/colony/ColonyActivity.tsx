/**
 * Recent colony activity — design handoff, screen 8, "Colony detail" item 4.
 *
 * Each event reads as a sentence ("120 nymphs born") with a tinted icon, the
 * day it happened, and the signed change on the right. Three rows by default,
 * "All events" to expand.
 *
 * Delete moved off the row. Every row used to carry an ✕ — a destructive
 * control one tap from an accidental press on the thing you were reading.
 * It's a long-press now (only on entries you're allowed to change), and the
 * row says so to screen readers.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { TYPE } from '../../theme/tokens';
import type { ColonyEvent } from '../../lib/colonies';
import { COLONY_EVENT_MDI, COLONY_EVENT_TONE, colonyEventSentence, relativeDay, type EventTone } from '../../lib/colony-events';
import { attribution } from '../../lib/co-keepers';

const PREVIEW = 3;

export default function ColonyActivity({
  events,
  canChange,
  onDelete,
  onEdit,
}: {
  events: ColonyEvent[];
  canChange: (ev: ColonyEvent) => boolean;
  onDelete: (ev: ColonyEvent) => void;
  /** Tap on a row. When given, the screen offers Edit / Delete. */
  onEdit?: (ev: ColonyEvent) => void;
}) {
  const { colors, layout } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const tone = (t: EventTone) =>
    t === 'success' ? colors.success
      : t === 'error' ? colors.error
        : t === 'warning' ? colors.warning
          : t === 'accent' ? colors.accent
            : colors.textSecondary;

  if (events.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}>
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>
          Nothing logged yet. Births, deaths, removals and recounts build the population history.
        </Text>
      </View>
    );
  }

  const shown = showAll ? events : events.slice(0, PREVIEW);

  return (
    <View style={styles.list}>
      {shown.map((ev) => {
        const c = tone(COLONY_EVENT_TONE[ev.event_type] ?? 'muted');
        const sentence = colonyEventSentence(ev);
        const when = relativeDay(ev.occurred_at);
        const by = attribution(ev);
        const changeable = canChange(ev);
        const delta = ev.count_delta;
        const detail = [ev.severity ? `Severity: ${ev.severity}` : null, ev.event_type !== 'observation' ? ev.notes : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <TouchableOpacity
            key={ev.id}
            disabled={!changeable}
            onPress={onEdit ? () => onEdit(ev) : undefined}
            onLongPress={() => onDelete(ev)}
            delayLongPress={350}
            activeOpacity={0.8}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md }]}
            accessibilityRole={changeable ? 'button' : 'text'}
            accessibilityLabel={[sentence, when, delta ? `${delta > 0 ? 'plus' : 'minus'} ${Math.abs(delta)}` : null, detail || null, by ?? null]
              .filter(Boolean).join('. ')}
            accessibilityHint={changeable ? (onEdit ? 'Opens edit and delete options. Long press to delete.' : 'Long press to delete this event.') : undefined}
          >
            <View style={[styles.icon, { backgroundColor: c + '22', borderRadius: layout.radius.sm }]}>
              <MaterialCommunityIcons name={(COLONY_EVENT_MDI[ev.event_type] ?? 'circle-outline') as any} size={18} color={c} />
            </View>
            <View style={styles.flex}>
              <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]} numberOfLines={2}>{sentence}</Text>
              <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                {[when, detail || null, by ?? null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {delta != null && delta !== 0 ? (
              <Text style={[TYPE.bodyStrong, { color: c }]}>
                {delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString()}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
      {events.length > PREVIEW ? (
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={styles.all} accessibilityRole="button">
          <Text style={[TYPE.bodyStrong, { color: colors.accent }]}>
            {showAll ? 'Show fewer' : `All events (${events.length})`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 13 },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, padding: 14 },
  all: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
