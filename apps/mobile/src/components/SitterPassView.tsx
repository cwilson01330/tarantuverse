/**
 * Native render of a sitter pass — the same payload /sit shows on the web.
 *
 * Used by the keeper's "Preview as sitter" screen today, and intended for the
 * in-app /sit screen later (when the app registers /sit universal links).
 * Renders only what the API returned; it fetches and writes nothing.
 *
 * Theme tokens only (colors / layout.radius / TYPE) — no raw sizes or hex, so
 * the design-token gate stays green.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { TYPE } from '../theme/tokens';
import type { Card, CardSection, FeedState, Payload, Source } from '../lib/sitter-passes';
import { fmtDay } from '../lib/sitter-passes';

const GROUPS: { state: FeedState; title: string }[] = [
  { state: 'feed', title: 'Feed today' },
  { state: 'ask', title: 'Check before feeding' },
  { state: 'dont_feed', title: "Don't feed" },
  { state: 'not_due', title: 'Not today' },
  { state: 'graze', title: 'Colonies & grazers' },
];

const SOURCE_LABEL: Partial<Record<Source, string>> = {
  keeper: 'From the keeper',
  record: 'From their records',
  species: 'From the care sheet',
};

export default function SitterPassView({ data }: { data: Payload }) {
  const { colors, layout } = useTheme();
  const stateColor: Record<FeedState, string> = {
    feed: colors.success,
    ask: colors.warning,
    dont_feed: colors.error,
    not_due: colors.textTertiary,
    graze: colors.info,
  };
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const s = data.routine.summary;

  return (
    <View style={styles.wrap}>
      {data.label ? <Text style={[TYPE.body, { color: colors.textSecondary }]}>Hi {data.label},</Text> : null}
      <Text style={[TYPE.title, { color: colors.textPrimary }]}>{data.keeper_name}&apos;s feeding list</Text>
      <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Open until {fmtDay(data.expires_at)}</Text>
      {data.can_log && (
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
          Logging is on: your sitter sees a PIN box here, then Fed / Refused buttons on each animal.
        </Text>
      )}

      <View style={styles.chips}>
        <Chip color={stateColor.feed} label={`Feed today: ${s.feed_today}`} radius={layout.radius.full} />
        {s.check > 0 && <Chip color={stateColor.ask} label={`Check: ${s.check}`} radius={layout.radius.full} />}
        {s.dont_feed > 0 && <Chip color={stateColor.dont_feed} label={`Don't feed: ${s.dont_feed}`} radius={layout.radius.full} />}
        <Chip color={stateColor.not_due} label={`Not today: ${s.not_due}`} radius={layout.radius.full} />
      </View>

      {data.routine.steps.length > 0 && (
        <View style={card}>
          <Text style={[TYPE.heading, { color: colors.textPrimary }]}>The round</Text>
          {data.routine.steps.map((l, i) => (
            <Text key={i} style={[TYPE.body, styles.line, { color: colors.textPrimary }]}>
              {i + 1}. {l.text}
            </Text>
          ))}
        </View>
      )}

      {GROUPS.map((g) => {
        const cards = data.cards.filter((c) => (c.feeding?.state ?? 'graze') === g.state);
        if (cards.length === 0) return null;
        return (
          <View key={g.state} style={styles.group}>
            <Text style={[TYPE.heading, { color: colors.textPrimary }]}>
              {g.title} ({cards.length})
            </Text>
            {cards.map((c) => (
              <AnimalCard key={`${c.kind}-${c.id}`} card={c} stateColor={stateColor[c.feeding?.state ?? 'graze']} />
            ))}
          </View>
        );
      })}

      <View style={[card, { borderColor: colors.error }]}>
        <Text style={[TYPE.heading, { color: colors.textPrimary }]}>If something goes wrong</Text>
        {data.routine.emergency.map((l, i) => (
          <Text key={i} style={[TYPE.body, styles.line, { color: colors.textPrimary }]}>• {l.text}</Text>
        ))}
        {data.routine.contact_line ? (
          <Text style={[TYPE.bodyStrong, styles.line, { color: colors.textPrimary }]}>{data.routine.contact_line}</Text>
        ) : (
          <Text style={[TYPE.body, styles.line, { color: colors.textSecondary }]}>
            Message {data.keeper_name} the way you usually do.
          </Text>
        )}
        {data.routine.vet_contact ? (
          <Text style={[TYPE.body, styles.line, { color: colors.textSecondary }]}>Vet: {data.routine.vet_contact}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ color, label, radius }: { color: string; label: string; radius: number }) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}22`, borderRadius: radius }]}>
      <Text style={[TYPE.caption, { color }]}>{label}</Text>
    </View>
  );
}

function AnimalCard({ card, stateColor }: { card: Card; stateColor: string }) {
  const { colors, layout } = useTheme();
  const title = card.name || card.common_name || card.scientific_name || 'Unnamed';
  const subtitle = [card.name ? card.common_name : null, card.scientific_name].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
      <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[TYPE.caption, styles.italic, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      {card.feeding ? (
        <View style={[styles.headline, { backgroundColor: `${stateColor}22`, borderRadius: layout.radius.md }]}>
          <Text style={[TYPE.bodyStrong, { color: stateColor }]}>{card.feeding.headline}</Text>
        </View>
      ) : null}
      {card.sections
        .filter((s) => s.key !== 'today')
        .map((s) => (
          <Section key={s.key} section={s} />
        ))}
    </View>
  );
}

function Section({ section }: { section: CardSection }) {
  const { colors, layout } = useTheme();
  const safety = section.key === 'safety';
  const note = section.key === 'note';
  const tint = safety ? colors.error : note ? colors.primary : colors.border;
  return (
    <View
      style={[
        styles.section,
        {
          borderColor: tint,
          backgroundColor: safety || note ? `${tint}14` : colors.surfaceElevated,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>
        {safety ? '⚠️ ' : ''}
        {section.title}
      </Text>
      {section.lines.map((l, i) => (
        <Text key={i} style={[TYPE.body, styles.line, { color: colors.textPrimary }]}>
          {l.text}
          {SOURCE_LABEL[l.source] && !note ? (
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{`  ${SOURCE_LABEL[l.source]}`}</Text>
          ) : null}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  group: { gap: 10, marginTop: 8 },
  headline: { paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  section: { borderWidth: 1, padding: 10, gap: 2 },
  line: { marginTop: 2 },
  italic: { fontStyle: 'italic' },
});
