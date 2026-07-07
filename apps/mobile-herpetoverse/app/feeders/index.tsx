/**
 * My Feeder Stock — the keeper's live colonies + frozen freezer inventory
 * (ADR-012). Each row shows the form (live 🌱 / frozen 🧊), a low-stock badge
 * when `is_low_stock`, and either a flat total or per-size buckets. Quick
 * "Used" / "Restock" actions decrement/increment inventory without leaving the
 * list; for a `sized` stock a size picker sheet lets the keeper pick which
 * bucket to touch.
 *
 * apiClient baseURL already includes /api/v1, so the lib helpers here start at
 * the resource. Theme is dark-first via ThemeContext — HV has no `error`
 * color (use `danger`); on-primary text is #0B0B0B everywhere.
 *
 * LOW-STOCK REMINDER: after any inventory change we reconcile a local reminder
 * via syncLowStockReminder (best-effort, guarded — no native deps).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import { syncLowStockReminder } from '../../src/services/notifications';
import {
  feederFormGlyph,
  feederStockTitle,
  inventorySummary,
  listFeederStocks,
  markFeederRestocked,
  markFeederUsed,
  sizedEntries,
  titleize,
  type HvFeederStock,
} from '../../src/lib/feeders';

type PendingAction = { stock: HvFeederStock; mode: 'used' | 'restock' };

function FeedersScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [stocks, setStocks] = useState<HvFeederStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Per-stock in-flight guard so double-taps don't double-post.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Size-picker sheet for sized stocks.
  const [pending, setPending] = useState<PendingAction | null>(null);

  const fetchStocks = useCallback(async () => {
    try {
      const rows = await listFeederStocks();
      setStocks(rows ?? []);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return; // interceptor handles logout
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load feeders',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStocks();
    }, [fetchStocks]),
  );

  const lowCount = useMemo(
    () => stocks.filter((s) => s.is_low_stock).length,
    [stocks],
  );

  // Apply an updated stock into local state + reconcile its low-stock reminder.
  const applyUpdated = useCallback((updated: HvFeederStock) => {
    setStocks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    // Best-effort local reminder — never blocks the UI.
    syncLowStockReminder(
      updated.id,
      feederStockTitle(updated),
      updated.is_low_stock,
    );
  }, []);

  const doUsed = useCallback(
    async (stock: HvFeederStock, size?: string | null) => {
      setBusyId(stock.id);
      try {
        const updated = await markFeederUsed(stock.id, 1, size);
        applyUpdated(updated);
        setLoadError('');
      } catch (e: any) {
        setLoadError(
          e?.response?.data?.detail || e?.message || 'Failed to log use',
        );
      } finally {
        setBusyId(null);
      }
    },
    [applyUpdated],
  );

  const doRestock = useCallback(
    async (stock: HvFeederStock, size?: string | null) => {
      setBusyId(stock.id);
      try {
        const updated = await markFeederRestocked(stock.id, 1, size);
        applyUpdated(updated);
        setLoadError('');
      } catch (e: any) {
        setLoadError(
          e?.response?.data?.detail || e?.message || 'Failed to restock',
        );
      } finally {
        setBusyId(null);
      }
    },
    [applyUpdated],
  );

  // A quick action either fires immediately (count stock) or opens the size
  // picker (sized stock — which bucket?).
  const onQuickAction = (stock: HvFeederStock, mode: 'used' | 'restock') => {
    if (stock.inventory_mode === 'sized') {
      setPending({ stock, mode });
      return;
    }
    if (mode === 'used') doUsed(stock);
    else doRestock(stock);
  };

  const onPickSize = (size: string) => {
    if (!pending) return;
    const { stock, mode } = pending;
    setPending(null);
    if (mode === 'used') doUsed(stock, size);
    else doRestock(stock, size);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Feeders"
        subtitle={
          stocks.length > 0
            ? lowCount > 0
              ? `${stocks.length} stocks · ${lowCount} low`
              : `${stocks.length} stocks`
            : 'Live colonies & frozen inventory'
        }
        leftAction={<HeaderBackButton />}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/feeder-species' as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Browse feeder care guides"
          >
            <MaterialCommunityIcons
              name="book-open-variant"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: insets.bottom + 96 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchStocks();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {loadError !== '' && !loading && (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.surface, borderColor: colors.danger },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchStocks();
              }}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !loadError && stocks.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🧊</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No feeder stock yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Track your live feeder colonies and frozen freezer inventory —
              mice, rats, fish, chicks, and insects — with low-stock alerts.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/feeders/add' as never)}
              style={[
                styles.emptyCta,
                {
                  backgroundColor: colors.primary,
                  borderRadius: layout.radius.lg,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add feeder stock"
            >
              <Text style={styles.emptyCtaText}>Add feeder stock</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading &&
          stocks.map((s) => {
            const isBusy = busyId === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.8}
                onPress={() =>
                  router.push(`/feeders/${s.id}` as never)
                }
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: s.is_low_stock ? colors.warning : colors.border,
                    borderRadius: layout.radius.md,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${feederStockTitle(s)}, ${
                  s.form === 'live' ? 'live colony' : 'frozen'
                }, ${inventorySummary(s)}${
                  s.is_low_stock ? ', running low' : ''
                }`}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.formGlyph}>
                      {feederFormGlyph(s.form)}
                    </Text>
                    <View style={styles.cardTitleBlock}>
                      <Text
                        style={[styles.cardName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {feederStockTitle(s)}
                      </Text>
                      <Text
                        style={[styles.cardMeta, { color: colors.textTertiary }]}
                        numberOfLines={1}
                      >
                        {s.form === 'live' ? 'Live colony' : 'Frozen'}
                        {s.species_display_name
                          ? `  ·  ${s.species_display_name}`
                          : ''}
                        {s.storage_location ? `  ·  ${s.storage_location}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.badgeCol}>
                    <View
                      style={[
                        styles.formBadge,
                        {
                          backgroundColor:
                            s.form === 'live'
                              ? `${colors.success}22`
                              : `${colors.info}22`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.formBadgeText,
                          {
                            color:
                              s.form === 'live' ? colors.success : colors.info,
                          },
                        ]}
                      >
                        {s.form === 'live' ? 'LIVE' : 'FROZEN'}
                      </Text>
                    </View>
                    {s.is_low_stock && (
                      <View
                        style={[
                          styles.lowBadge,
                          { backgroundColor: `${colors.warning}22` },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="alert"
                          size={11}
                          color={colors.warning}
                        />
                        <Text
                          style={[styles.lowBadgeText, { color: colors.warning }]}
                        >
                          Low
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Inventory summary */}
                <Text
                  style={[styles.inventoryLine, { color: colors.textSecondary }]}
                >
                  {inventorySummary(s)}
                  {s.low_threshold != null ? (
                    <Text style={{ color: colors.textTertiary }}>
                      {'   '}(low ≤ {s.low_threshold})
                    </Text>
                  ) : null}
                </Text>

                {/* Quick actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => onQuickAction(s, 'used')}
                    disabled={isBusy}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderRadius: layout.radius.sm,
                        opacity: isBusy ? 0.5 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Log one used from ${feederStockTitle(s)}`}
                  >
                    <MaterialCommunityIcons
                      name="minus"
                      size={16}
                      color={colors.textPrimary}
                    />
                    <Text
                      style={[styles.actionBtnText, { color: colors.textPrimary }]}
                    >
                      Used
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onQuickAction(s, 'restock')}
                    disabled={isBusy}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                        borderRadius: layout.radius.sm,
                        opacity: isBusy ? 0.5 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Restock ${feederStockTitle(s)}`}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color="#0B0B0B" />
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name="plus"
                          size={16}
                          color="#0B0B0B"
                        />
                        <Text style={styles.actionBtnTextOnPrimary}>Restock</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {/* Add FAB */}
      {!loading && stocks.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/feeders/add' as never)}
          style={[
            styles.fab,
            {
              backgroundColor: colors.primary,
              bottom: insets.bottom + 20,
              borderRadius: layout.radius.xl,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add feeder stock"
        >
          <MaterialCommunityIcons name="plus" size={26} color="#0B0B0B" />
        </TouchableOpacity>
      )}

      {/* Size picker sheet (sized stocks) */}
      <Modal
        visible={pending !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPending(null)}
      >
        <TouchableOpacity
          style={styles.modalWrap}
          activeOpacity={1}
          onPress={() => setPending(null)}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: layout.radius.lg,
                borderTopRightRadius: layout.radius.lg,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View
                style={[styles.sheetHandle, { backgroundColor: colors.border }]}
              />
            </View>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {pending?.mode === 'used' ? 'Which size — used?' : 'Which size — restock?'}
            </Text>
            <Text style={[styles.sheetSub, { color: colors.textTertiary }]}>
              {pending ? feederStockTitle(pending.stock) : ''}
            </Text>
            <View style={styles.sizeGrid}>
              {pending &&
                sizedEntries(pending.stock).map(([size, n]) => (
                  <TouchableOpacity
                    key={size}
                    onPress={() => onPickSize(size)}
                    style={[
                      styles.sizeChip,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderRadius: layout.radius.md,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${titleize(size)}, ${n} in stock`}
                  >
                    <Text
                      style={[styles.sizeChipName, { color: colors.textPrimary }]}
                    >
                      {titleize(size)}
                    </Text>
                    <Text
                      style={[styles.sizeChipCount, { color: colors.textTertiary }]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              {pending && sizedEntries(pending.stock).length === 0 && (
                <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
                  No size buckets defined. Edit this stock to add sizes.
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setPending(null)}
              style={[
                styles.sheetCancel,
                { borderColor: colors.border, borderRadius: layout.radius.md },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetCancelText, { color: colors.textPrimary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default withErrorBoundary(FeedersScreen, 'feeders');

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingTop: 12 },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: 20,
  },
  emptyCta: { paddingVertical: 13, paddingHorizontal: 24 },
  emptyCtaText: { color: '#0B0B0B', fontSize: 15, fontWeight: '700' },

  card: { borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitleRow: { flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  formGlyph: { fontSize: 24 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  badgeCol: { alignItems: 'flex-end', gap: 6 },
  formBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  formBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lowBadgeText: { fontSize: 10, fontWeight: '800' },
  inventoryLine: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 10,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  actionBtnTextOnPrimary: { fontSize: 14, fontWeight: '700', color: '#0B0B0B' },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: { borderWidth: 1, padding: 20 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  sizeChip: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 84,
  },
  sizeChipName: { fontSize: 14, fontWeight: '700' },
  sizeChipCount: { fontSize: 12, marginTop: 2 },
  sheetCancel: {
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetCancelText: { fontSize: 15, fontWeight: '600' },
});
