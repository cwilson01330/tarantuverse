/**
 * FirstFeedingCard - Home nudge for animals with no logged feeding
 * (Day-one, 2026-10-27).
 *
 * Shows up to the items it is given (Home passes the first three animals the
 * server flags `needs_first_feeding`). Each row has "When did it last eat?",
 * which opens LastFedSheet; picking a day logs an accepted feeding for that
 * day. The X hides the whole card for 14 days (AsyncStorage
 * `first_feeding_card_hidden_at`, decided by `nudgeHidden`).
 *
 * Renders nothing with no items, while the hidden-until value is still
 * loading, or while hidden.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FIRST_FEEDING_COPY, nudgeHidden } from '../lib/first-feeding';
import { apiClient } from '../services/api';
import { SPACING, TYPE } from '../theme/tokens';
import { LastFedSheet } from './LastFedSheet';

export const FIRST_FEEDING_HIDDEN_KEY = 'first_feeding_card_hidden_at';

export interface FirstFeedingCardProps {
  items: { id: string; name: string }[];
  /** A feeding was logged: the caller re-runs its feeding-status fetch. */
  onLogged: () => void;
}

export function FirstFeedingCard({ items, onLogged }: FirstFeedingCardProps) {
  const { colors, layout } = useTheme();
  // undefined = not read yet (render nothing rather than flash the card).
  const [hiddenAt, setHiddenAt] = useState<string | null | undefined>(undefined);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  // Animals logged from this card: dropped at once, without waiting for the
  // caller's refresh to come back (which can take a second on a slow link).
  const [logged, setLogged] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FIRST_FEEDING_HIDDEN_KEY)
      .then((v) => {
        if (alive) setHiddenAt(v);
      })
      .catch(() => {
        if (alive) setHiddenAt(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hide = useCallback(async () => {
    const now = new Date().toISOString();
    setHiddenAt(now);
    try {
      await AsyncStorage.setItem(FIRST_FEEDING_HIDDEN_KEY, now);
    } catch {
      // Hidden for this session at least.
    }
  }, []);

  const log = useCallback(
    async (iso: string) => {
      if (!active) return;
      // Throws on failure: LastFedSheet shows the error and stays open.
      const id = active.id;
      await apiClient.post(`/inverts/${id}/feedings`, { fed_at: iso, accepted: true });
      setLogged((prev) => new Set(prev).add(id));
      onLogged();
    },
    [active, onLogged],
  );

  const shown = items.filter((item) => !logged.has(item.id));
  if (shown.length === 0 || hiddenAt === undefined || nudgeHidden(hiddenAt)) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
      ]}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.textPrimary} />
        <Text style={[TYPE.cardTitle, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          {FIRST_FEEDING_COPY.nudgeTitle}
        </Text>
        <TouchableOpacity
          onPress={hide}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={FIRST_FEEDING_COPY.nudgeHideLabel}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {shown.map((item) => (
        <View key={item.id} style={[styles.row, { borderTopColor: colors.border }]}>
          <Text style={[TYPE.bodyStrong, styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() => setActive(item)}
            style={[styles.rowButton, { borderColor: colors.primary, borderRadius: layout.radius.full }]}
            accessibilityRole="button"
            accessibilityLabel={`${FIRST_FEEDING_COPY.nudgeRowButton} ${item.name}`}
          >
            <Text style={[TYPE.label, { color: colors.primary }]}>{FIRST_FEEDING_COPY.nudgeRowButton}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <LastFedSheet
        visible={active !== null}
        animalName={active?.name ?? ''}
        onClose={() => setActive(null)}
        onPick={log}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: { flex: 1 },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1 },
  rowButton: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FirstFeedingCard;
