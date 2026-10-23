/**
 * "Cost of keeping" on an invert or colony detail screen (spec 2026-10-22 §3):
 * purchase price, this animal's share of supplies by category, the total, and
 * (tap to expand) the expenses behind it. Shown on died and transferred animals
 * too. Mirrors the web CostOfKeepingCard.
 *
 * The CALLER mounts this only for a viewer whose role is keeper or above
 * (`can(role, 'keeper')`), so loggers, viewers and visitors cost no request.
 * It fetches when it mounts and whenever the screen bumps `reloadKey`, which
 * both screens do at the end of their own focus reload (so a trip to Expenses
 * and back shows the new numbers). It does NOT listen for focus itself: the
 * invert screen swaps to a spinner while it reloads, which unmounts and
 * remounts this card, so a focus listener here fetched twice per refocus.
 * Deliberately NOT part of the invert screen's `refreshSlices`. It renders when
 * `can_add` or there is at least one share; otherwise nothing (no upgrade
 * prompt on detail pages). The card is an extra: a failed load renders nothing
 * rather than an error.
 */
import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { SectionCard, AppText } from './ui';
import { SPACING } from '../theme/tokens';
import { formatLocalDate } from '../utils/date';
import { EXPENSE_CATEGORIES, categoryLabel, formatMoney, getAnimalCost, type AnimalCost } from '../lib/expenses';

interface Props {
  kind: 'invert' | 'colony';
  id: string;
  /** The animal's owner. When it isn't the signed-in keeper, the link opens THAT owner's ledger. */
  ownerId?: string | null;
  /** Change it to refetch (the screen bumps it when its own reload finishes). */
  reloadKey?: number;
  /** Overrides the SectionCard's outer margins (the colony screen lays its cards out differently). */
  style?: StyleProp<ViewStyle>;
}

function CostRow({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} color={muted ? 'textTertiary' : 'textSecondary'}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.tabular}>
        {value}
      </AppText>
    </View>
  );
}

export default function CostOfKeepingCard({ kind, id, ownerId, reloadKey = 0, style }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [cost, setCost] = useState<AnimalCost | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    getAnimalCost(kind === 'invert' ? { invert_id: id } : { colony_id: id })
      .then((c) => alive && setCost(c))
      .catch(() => alive && setCost(null));
    return () => {
      alive = false;
    };
  }, [kind, id, reloadKey]);

  if (!cost || !(cost.can_add || cost.shares.length > 0)) return null;

  const otherOwner = ownerId && user?.id && ownerId !== user.id ? ownerId : null;
  const categories = EXPENSE_CATEGORIES.filter((c) => (cost.by_category[c.key] ?? 0) !== 0);
  const hasAnything = cost.purchase_price !== null || cost.shares.length > 0;

  return (
    <SectionCard
      title="Cost of keeping"
      actionLabel={cost.can_add ? 'Add expense' : 'Expenses'}
      onAction={() =>
        router.push(otherOwner ? { pathname: '/expenses', params: { collection: otherOwner } } : '/expenses')
      }
      style={style}
    >
      {hasAnything ? (
        <>
          <View>
            {cost.purchase_price !== null ? <CostRow label="Purchase price" value={formatMoney(cost.purchase_price)} /> : null}
            {categories.map((c) => (
              <CostRow key={c.key} label={c.label} value={formatMoney(cost.by_category[c.key])} muted />
            ))}
            <CostRow label="Total" value={formatMoney(cost.total)} strong />
          </View>

          {cost.shares.length > 0 ? (
            <>
              <TouchableOpacity
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={styles.toggle}
              >
                <AppText variant="bodyStrong" color="primary">
                  {expanded
                    ? 'Hide expenses'
                    : `Show the ${cost.shares.length} ${cost.shares.length === 1 ? 'expense' : 'expenses'} behind this`}
                </AppText>
              </TouchableOpacity>
              {expanded
                ? cost.shares.map((s, i) => (
                    <View key={`${s.expense_id}-${i}`} style={styles.share}>
                      <View style={styles.shareText}>
                        <AppText variant="body" numberOfLines={1}>
                          {s.description}
                        </AppText>
                        <AppText variant="caption" color="textTertiary">
                          {formatLocalDate(s.spent_on, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}
                          {categoryLabel(s.category)}
                        </AppText>
                      </View>
                      <AppText variant="body" style={styles.tabular}>
                        {formatMoney(s.amount)}
                      </AppText>
                    </View>
                  ))
                : null}
            </>
          ) : null}
        </>
      ) : (
        <AppText variant="body" color="textTertiary">
          Nothing logged yet. Split an expense across this {kind === 'colony' ? 'colony' : 'animal'} to see what it costs
          to keep.
        </AppText>
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  toggle: { minHeight: 44, justifyContent: 'center' },
  share: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingVertical: SPACING.xs },
  shareText: { flex: 1 },
});
