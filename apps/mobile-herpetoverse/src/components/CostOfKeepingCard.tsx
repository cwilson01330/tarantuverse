/**
 * "Cost of keeping" on an animal detail screen (spec 2026-10-22 §3): purchase
 * price, this animal's share of supplies by category, the total, and (tap to
 * expand) the expenses behind it. Shown on died and transferred animals too.
 * Herpetoverse copy of apps/mobile's CostOfKeepingCard, for animals only.
 *
 * The CALLER mounts this only for a viewer whose role is keeper or above
 * (`can(role, 'keeper')`), so loggers, viewers and visitors cost no request.
 * It fetches when it mounts and whenever the screen bumps `reloadKey`, which
 * the detail screen does once per full reload (focus, pull to refresh) and NOT
 * from its in-place refreshes (logging a feeding, pausing, etc.). It does not
 * listen for focus itself, so a refocus costs exactly one request. It renders
 * when `can_add` or there is at least one share; otherwise nothing (no upgrade
 * prompt on detail pages). The card is an extra: a failed load renders nothing
 * rather than an error. The purchase price comes from the response, never from
 * the animal record the screen already holds.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { TYPE } from '../theme/type';
import { fmtDay } from '../lib/lifecycle';
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, getAnimalCost, type AnimalCost } from '../lib/expenses';

interface Props {
  animalId: string;
  /** The animal's owner. When it isn't the signed-in keeper, the link opens THAT owner's ledger. */
  ownerId?: string | null;
  /** Change it to refetch (the screen bumps it when a full reload finishes). */
  reloadKey?: number;
}

export default function CostOfKeepingCard({ animalId, ownerId, reloadKey = 0 }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();
  const styles = useMemo(() => makeStyles(layout.spacing), [layout.spacing]);
  // Keyed by animal, so a different animal never shows the previous one's numbers.
  const [loaded, setLoaded] = useState<{ id: string; cost: AnimalCost } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    getAnimalCost({ animal_id: animalId })
      .then((c) => alive && setLoaded({ id: animalId, cost: c }))
      .catch(() => alive && setLoaded(null));
    return () => {
      alive = false;
    };
  }, [animalId, reloadKey]);

  const cost = loaded && loaded.id === animalId ? loaded.cost : null;

  if (!cost || !(cost.can_add || cost.shares.length > 0)) return null;

  const otherOwner = ownerId && user?.id && ownerId !== user.id ? ownerId : null;
  const categories = EXPENSE_CATEGORIES.filter((c) => (cost.by_category[c.key] ?? 0) !== 0);
  const hasAnything = cost.purchase_price !== null || cost.shares.length > 0;

  const row = (label: string, value: string, opts?: { muted?: boolean; strong?: boolean; key?: string }) => (
    <View key={opts?.key ?? label} style={styles.row}>
      <Text
        style={[opts?.strong ? TYPE.bodyStrong : TYPE.body, { color: opts?.muted ? colors.textTertiary : colors.textSecondary }]}
      >
        {label}
      </Text>
      <Text style={[opts?.strong ? TYPE.bodyStrong : TYPE.body, styles.tabular, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[TYPE.caption, styles.title, { color: colors.primary }]} accessibilityRole="header">
          COST OF KEEPING
        </Text>
        <TouchableOpacity
          onPress={() =>
            router.push((otherOwner ? { pathname: '/expenses', params: { collection: otherOwner } } : '/expenses') as never)
          }
          accessibilityRole="button"
          style={styles.hit}
        >
          <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>{cost.can_add ? 'Add expense' : 'Expenses'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
        {hasAnything ? (
          <>
            <View>
              {cost.purchase_price !== null ? row('Purchase price', formatMoney(cost.purchase_price)) : null}
              {categories.map((c) => row(c.label, formatMoney(cost.by_category[c.key]), { muted: true }))}
              {row('Total', formatMoney(cost.total), { strong: true })}
            </View>

            {cost.shares.length > 0 ? (
              <>
                <TouchableOpacity
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  style={styles.hit}
                >
                  <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>
                    {expanded
                      ? 'Hide expenses'
                      : `Show the ${cost.shares.length} ${cost.shares.length === 1 ? 'expense' : 'expenses'} behind this`}
                  </Text>
                </TouchableOpacity>
                {expanded
                  ? cost.shares.map((s, i) => (
                      <View key={`${s.expense_id}-${i}`} style={styles.share}>
                        <View style={styles.shareText}>
                          <Text style={[TYPE.body, { color: colors.textPrimary }]} numberOfLines={1}>
                            {s.description}
                          </Text>
                          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                            {fmtDay(s.spent_on)}
                            {' · '}
                            {categoryLabel(s.category)}
                          </Text>
                        </View>
                        <Text style={[TYPE.body, styles.tabular, { color: colors.textPrimary }]}>{formatMoney(s.amount)}</Text>
                      </View>
                    ))
                  : null}
              </>
            ) : null}
          </>
        ) : (
          <Text style={[TYPE.body, { color: colors.textTertiary }]}>
            Nothing logged yet. Split an expense across this animal to see what it costs to keep.
          </Text>
        )}
      </View>
    </View>
  );
}

type Spacing = { xs: number; sm: number; md: number; lg: number; xl: number };

function makeStyles(sp: Spacing) {
  return StyleSheet.create({
    section: { gap: sp.sm },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp.md },
    title: { letterSpacing: 1.5 },
    card: { borderWidth: 1, padding: sp.lg, gap: sp.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: sp.xs },
    tabular: { fontVariant: ['tabular-nums'] },
    hit: { minHeight: 44, justifyContent: 'center' },
    share: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp.md, paddingVertical: sp.xs },
    shareText: { flex: 1 },
  });
}
