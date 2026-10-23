/**
 * Expenses (spec 2026-10-22 §3): this month / last month, a category bar from
 * /expenses/summary, the list grouped by month with category chips, and "Add
 * expense". Mirrors the web page apps/web/src/app/dashboard/expenses/page.tsx.
 *
 * States, all driven by the list response's `can_add` (the collection OWNER's
 * Premium, which is the only way a co-keeper can see it):
 *   free, no history     -> explainer + Upgrade button
 *   lapsed, has history  -> history read-only (no Edit), Upgrade button where "Add" was
 *   premium, empty       -> empty state with "Add your first expense"
 *   premium, has data    -> everything
 * Co-keepers with the keeper role (and a live owner plan) get a collection
 * picker: their own collection plus every shared TV collection they may write to.
 *
 * Every response is checked against the view it was asked for: switching the
 * collection or category clears the list and drops anything still in flight.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import UpgradeModal from '../../src/components/UpgradeModal';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { Card } from '../../src/components/ui';
import { SPACING, TYPE } from '../../src/theme/tokens';
import { MEMBER_APP, loadSharedWithMe, type SharedCollection } from '../../src/lib/co-keepers';
import { formatLocalDate } from '../../src/utils/date';
import { monthKey, monthLabel, splitText } from '../../src/lib/expense-form';
import {
  EXPENSE_CATEGORIES,
  categoryLabel,
  deleteExpense,
  formatMoney,
  getExpenseSummary,
  listExpenses,
  type Expense,
  type ExpenseCategory,
  type ExpenseSummary,
} from '../../src/lib/expenses';

const PAGE_SIZE = 50;

function ExpensesScreen() {
  const { colors, layout } = useTheme();
  const { user } = useAuth();
  // `collection` route param: the owner whose ledger to open (from a shared animal's
  // Cost of keeping card). Applied once, and only if it is a collection we may write to.
  const routeParams = useLocalSearchParams<{ collection?: string | string[] }>();
  const wantedCollection = useRef<string | null>(
    (Array.isArray(routeParams.collection) ? routeParams.collection[0] : routeParams.collection) || null,
  );
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [shared, setShared] = useState<SharedCollection[]>([]);
  // Owner's user id of the collection being viewed; null = your own.
  const [collection, setCollection] = useState<string | null>(null);
  const [category, setCategory] = useState<ExpenseCategory | 'all'>('all');

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [items, setItems] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [canAdd, setCanAdd] = useState(true);
  // True once an UNFILTERED list showed any expense: tells "free, never used it"
  // from "lapsed with history" even while a category filter is on.
  const [anyHistory, setAnyHistory] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Bumped whenever the list's view changes (collection, category, refresh) or
  // the screen blurs; a "Load more" answer from an older view is dropped.
  const listGen = useRef(0);
  const loadedOnce = useRef(false);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Collections this keeper may log into: shared TV collections where they are
  // a keeper and the owner's plan hasn't made it read-only.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadSharedWithMe(false, user?.id ?? null).then((s) => {
        if (!alive) return;
        const list = (s?.collections ?? []).filter((c) => c.app === MEMBER_APP && c.role === 'keeper' && !c.read_only);
        setShared(list);
        const wanted = wantedCollection.current;
        wantedCollection.current = null;
        if (wanted && list.some((c) => c.owner.id === wanted)) {
          setCollection(wanted);
          setCategory('all');
          setItems([]);
          setTotal(0);
          setSummary(null);
          setAnyHistory(false);
          setListLoading(true);
        }
        // A collection that is no longer shared with us falls back to our own.
        setCollection((prev) => (prev && !list.some((c) => c.owner.id === prev) ? null : prev));
      });
      return () => {
        alive = false;
      };
    }, [user?.id]),
  );

  // Summary (unfiltered by category): totals and the category bar.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void refreshKey; // changes only to force a reload (pull to refresh, after a delete)
      getExpenseSummary({ app: 'tarantuverse', collection })
        .then((s) => alive && setSummary(s))
        .catch(() => alive && setSummary(null));
      return () => {
        alive = false;
      };
    }, [collection, refreshKey]),
  );

  // First page of the list. Reloads on focus, so coming back from the edit
  // screen shows what was just saved.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const gen = ++listGen.current;
      void refreshKey; // changes only to force a reload (pull to refresh, retry, after a delete)
      setError(null);
      if (!loadedOnce.current) setListLoading(true);
      listExpenses({
        app: 'tarantuverse',
        collection,
        category: category === 'all' ? undefined : category,
        limit: PAGE_SIZE,
      })
        .then((res) => {
          if (!alive || gen !== listGen.current) return;
          loadedOnce.current = true;
          setItems(res.items);
          setTotal(res.total);
          setCanAdd(res.can_add);
          if (category === 'all') setAnyHistory(res.total > 0);
          setListLoading(false);
          setRefreshing(false);
        })
        .catch((e: unknown) => {
          if (!alive || gen !== listGen.current) return;
          setError(e instanceof Error ? e.message : 'Could not load your expenses.');
          setListLoading(false);
          setRefreshing(false);
        });
      return () => {
        alive = false;
        listGen.current++;
      };
    }, [collection, category, refreshKey]),
  );

  const loadMore = async () => {
    if (loadingMore) return;
    const gen = listGen.current;
    setLoadingMore(true);
    try {
      const res = await listExpenses({
        app: 'tarantuverse',
        collection,
        category: category === 'all' ? undefined : category,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (gen !== listGen.current) return;
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      if (gen === listGen.current) setActionError(e instanceof Error ? e.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  const switchCollection = (value: string | null) => {
    if (value === collection) return;
    // Nothing from the old collection may linger while the new one loads.
    setCollection(value);
    setCategory('all');
    setItems([]);
    setTotal(0);
    setSummary(null);
    setAnyHistory(false);
    setError(null);
    setActionError(null);
    setListLoading(true);
  };

  const pickCategory = (value: ExpenseCategory | 'all') => {
    if (value === category) return;
    setCategory(value);
    setItems([]);
    setTotal(0);
    setActionError(null);
    setListLoading(true);
  };

  const retry = () => {
    setListLoading(true);
    refresh();
  };

  const openAdd = () => {
    router.push({ pathname: '/expenses/edit', params: collection ? { collection } : {} });
  };

  const openEdit = (e: Expense) => {
    router.push({ pathname: '/expenses/edit', params: { id: e.id, ...(collection ? { collection } : {}) } });
  };

  const handleDelete = (e: Expense) => {
    Alert.alert(
      'Delete this expense?',
      `“${e.description}” (${formatMoney(e.amount)}). Its share of each animal's cost goes with it.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await deleteExpense(e.id);
              refresh();
            } catch (err) {
              setActionError(err instanceof Error ? err.message : 'Could not delete that expense.');
            }
          },
        },
      ],
    );
  };

  const now = new Date();
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const monthTotal = (key: string): number => summary?.by_month.find((m) => m.month === key)?.total ?? 0;

  // Theme colours only, so the bar follows the preset and dark mode.
  const categoryColor: Record<ExpenseCategory, string> = {
    feeders: colors.warning,
    substrate_decor: colors.success,
    enclosures_equipment: colors.info,
    heat_lighting: colors.accent,
    health_vet: colors.error,
    shipping: colors.secondary,
    other: colors.textTertiary,
  };

  const categoryTotals = useMemo(() => {
    const by = summary?.by_category ?? {};
    return EXPENSE_CATEGORIES.map((c) => ({ ...c, amount: by[c.key] ?? 0 })).filter((c) => c.amount > 0);
  }, [summary]);

  const groups = useMemo(() => {
    const out: { key: string; rows: Expense[] }[] = [];
    for (const e of items) {
      const key = e.spent_on.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(e);
      else out.push({ key, rows: [e] });
    }
    return out;
  }, [items]);

  const viewingShared = collection !== null;
  const ownerName = shared.find((c) => c.owner.id === collection)?.owner.name ?? 'the owner';
  const fullyLoaded = items.length >= total;
  const showFreeExplainer = !listLoading && !error && !canAdd && !anyHistory;

  const upgradeButton = <SitterButton label="Upgrade to add expenses" onPress={() => setUpgradeOpen(true)} />;

  const surface = [
    styles.panel,
    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg },
  ];

  const chip = (active: boolean) => [
    styles.chip,
    {
      borderRadius: layout.radius.full,
      borderColor: active ? colors.primary : colors.border,
      backgroundColor: active ? colors.surfaceElevated : 'transparent',
    },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Expenses"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refresh();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {shared.length > 0 ? (
          <View style={styles.gap}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>Collection</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => switchCollection(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: collection === null }}
                style={chip(collection === null)}
              >
                <Text style={[TYPE.bodyStrong, { color: collection === null ? colors.primary : colors.textPrimary }]}>
                  My collection
                </Text>
              </TouchableOpacity>
              {shared.map((c) => {
                const on = collection === c.owner.id;
                return (
                  <TouchableOpacity
                    key={c.owner.id}
                    onPress={() => switchCollection(c.owner.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={chip(on)}
                  >
                    <Text style={[TYPE.bodyStrong, { color: on ? colors.primary : colors.textPrimary }]}>
                      {c.owner.name}&apos;s collection
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {!showFreeExplainer && !listLoading && !error ? (
          canAdd ? (
            <SitterButton label="Add expense" onPress={openAdd} />
          ) : !viewingShared ? (
            upgradeButton
          ) : null
        ) : null}

        {actionError ? (
          <Text style={[TYPE.body, { color: colors.error }]} accessibilityLiveRegion="polite">
            {actionError}
          </Text>
        ) : null}

        {error ? (
          <View style={[...surface, styles.center]}>
            <Text style={[TYPE.body, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
            <SitterButton label="Try again" variant="secondary" onPress={retry} />
          </View>
        ) : listLoading && items.length === 0 ? (
          <View style={styles.center} accessibilityLabel="Loading expenses">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : showFreeExplainer ? (
          <View style={[...surface, styles.center]}>
            <MaterialCommunityIcons name="receipt" size={40} color={colors.textTertiary} />
            <Text style={[TYPE.heading, styles.centerText, { color: colors.textPrimary }]}>Know what your hobby costs</Text>
            <Text style={[TYPE.body, styles.centerText, { color: colors.textSecondary }]}>
              Log feeders, substrate, enclosures, heat and vet bills. Split a purchase across the animals it was for and
              every animal&apos;s page shows what it costs to keep. Expense tracking is a Premium feature.
            </Text>
            {viewingShared ? (
              <Text style={[TYPE.caption, styles.centerText, { color: colors.textTertiary }]}>
                Adding expenses to {ownerName}&apos;s collection needs their Premium plan.
              </Text>
            ) : (
              upgradeButton
            )}
          </View>
        ) : (
          <>
            {!canAdd ? (
              <View style={[...surface, { borderColor: colors.warning, backgroundColor: colors.surfaceElevated }]}>
                <Text style={[TYPE.body, { color: colors.textPrimary }]}>
                  {viewingShared
                    ? `${ownerName}'s Premium has ended, so this history is read-only. They need Premium to add or edit expenses.`
                    : 'Your Premium has ended, so your expense history is read-only. Upgrade to add or edit expenses.'}
                </Text>
              </View>
            ) : null}

            <View style={styles.statRow}>
              <StatCard label="This month" value={summary ? formatMoney(monthTotal(thisKey)) : '—'} />
              <StatCard label="Last month" value={summary ? formatMoney(monthTotal(lastKey)) : '—'} />
              <StatCard label="Last 12 months" value={summary ? formatMoney(summary.total) : '—'} />
            </View>

            {categoryTotals.length > 0 ? (
              <View style={surface}>
                <Text style={[TYPE.label, { color: colors.textSecondary }]} accessibilityRole="header">
                  By category · last 12 months
                </Text>
                <View
                  style={[styles.bar, { backgroundColor: colors.surfaceElevated, borderRadius: layout.radius.full }]}
                  accessibilityRole="image"
                  accessibilityLabel={categoryTotals.map((c) => `${c.label} ${formatMoney(c.amount)}`).join(', ')}
                >
                  {categoryTotals.map((c) => (
                    <View key={c.key} style={{ flex: c.amount, backgroundColor: categoryColor[c.key] }} />
                  ))}
                </View>
                {categoryTotals.map((c) => (
                  <View key={c.key} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: categoryColor[c.key], borderRadius: layout.radius.full }]} />
                    <Text style={[TYPE.body, styles.flex, { color: colors.textSecondary }]}>{c.label}</Text>
                    <Text style={[TYPE.body, styles.tabular, { color: colors.textPrimary }]}>{formatMoney(c.amount)}</Text>
                  </View>
                ))}
                {summary && summary.unallocated_total > 0 ? (
                  <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                    {formatMoney(summary.unallocated_total)} isn&apos;t assigned to an animal.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowScroll}>
              <TouchableOpacity
                onPress={() => pickCategory('all')}
                accessibilityRole="button"
                accessibilityState={{ selected: category === 'all' }}
                style={chip(category === 'all')}
              >
                <Text style={[TYPE.bodyStrong, { color: category === 'all' ? colors.primary : colors.textPrimary }]}>All</Text>
              </TouchableOpacity>
              {EXPENSE_CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => pickCategory(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={chip(on)}
                  >
                    <Text style={[TYPE.bodyStrong, { color: on ? colors.primary : colors.textPrimary }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {items.length === 0 ? (
              category !== 'all' ? (
                <Text style={[TYPE.body, styles.centerText, { color: colors.textTertiary }]}>
                  No {categoryLabel(category).toLowerCase()} expenses yet.
                </Text>
              ) : (
                <View style={[...surface, styles.center]}>
                  <Text style={[TYPE.body, styles.centerText, { color: colors.textSecondary }]}>
                    No expenses yet. Log a feeder order or a bag of substrate and split it across the animals it was for.
                  </Text>
                  {canAdd ? <SitterButton label="Add your first expense" onPress={openAdd} /> : null}
                </View>
              )
            ) : (
              <>
                {groups.map((g) => (
                  <View key={g.key} style={styles.gap}>
                    <View style={styles.monthHead}>
                      <Text style={[TYPE.caption, styles.monthLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                        {monthLabel(g.key)}
                      </Text>
                      {fullyLoaded ? (
                        <Text style={[TYPE.label, styles.tabular, { color: colors.textTertiary }]}>
                          {formatMoney(g.rows.reduce((s, r) => s + r.amount, 0))}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }]}>
                      {g.rows.map((e, i) => (
                        <View key={e.id} style={[styles.expenseRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                          <View style={styles.rowTop}>
                            <View style={styles.flex}>
                              <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{e.description}</Text>
                              <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
                                {formatLocalDate(e.spent_on, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' · '}
                                {categoryLabel(e.category)}
                                {' · '}
                                {splitText(e)}
                                {viewingShared && e.created_by_name ? ` · by ${e.created_by_name}` : ''}
                              </Text>
                              {e.notes ? (
                                <Text style={[TYPE.body, { color: colors.textSecondary }]}>{e.notes}</Text>
                              ) : null}
                            </View>
                            <Text style={[TYPE.bodyStrong, styles.tabular, { color: colors.textPrimary }]}>
                              {formatMoney(e.amount)}
                            </Text>
                          </View>
                          <View style={styles.rowActions}>
                            {canAdd ? (
                              <TouchableOpacity
                                onPress={() => openEdit(e)}
                                accessibilityRole="button"
                                accessibilityLabel={`Edit ${e.description}`}
                                style={styles.hit}
                              >
                                <Text style={[TYPE.bodyStrong, { color: colors.primary }]}>Edit</Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              onPress={() => handleDelete(e)}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${e.description}`}
                              style={styles.hit}
                            >
                              <Text style={[TYPE.bodyStrong, { color: colors.error }]}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {!fullyLoaded ? (
                  <SitterButton label="Load more" variant="secondary" busy={loadingMore} onPress={loadMore} />
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <UpgradeModal
        source="expenses"
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Expense tracking"
        message="Log what you spend on feeders, substrate, enclosures and vet visits, and see what each animal costs to keep."
      />
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.stat}>
      <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[TYPE.heading, styles.tabular, { color: colors.textPrimary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`${label}: ${value}`}
      >
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  gap: { gap: SPACING.sm },
  center: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  centerText: { textAlign: 'center' },
  panel: { borderWidth: 1, padding: SPACING.lg, gap: SPACING.sm },
  tabular: { fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', gap: SPACING.sm },
  stat: { flex: 1, gap: SPACING.xs },
  bar: { flexDirection: 'row', height: SPACING.md, overflow: 'hidden' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dot: { width: SPACING.sm, height: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chipRowScroll: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.xs },
  chip: { borderWidth: 1, paddingHorizontal: SPACING.md, minHeight: 36, justifyContent: 'center' },
  monthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  monthLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { borderWidth: 1, overflow: 'hidden' },
  expenseRow: { padding: SPACING.md, gap: SPACING.xs },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.lg },
  hit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACING.xs },
});

export default withErrorBoundary(ExpensesScreen, 'expenses');
