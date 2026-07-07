/**
 * Feeder stock detail (ADR-012). Full inventory view for one stock — per-size
 * buckets each get their own Used/Restock stepper (a "Used" posts a signed
 * negative count_delta on that bucket; "Restock" positive), or a single
 * stepper for count-mode stock. Low-stock badge when `is_low_stock`. Recent
 * log history, plus edit + delete + deactivate.
 *
 * apiClient baseURL already includes /api/v1 — lib helpers start at the
 * resource. Theme is dark-first; on-primary text is #0B0B0B. Every inventory
 * mutation reconciles the low-stock local reminder (best-effort, guarded).
 */
import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { useTheme } from '../../src/contexts/ThemeContext';
import { syncLowStockReminder } from '../../src/services/notifications';
import {
  deleteFeederStock,
  feederFormGlyph,
  feederStockTitle,
  getFeederStock,
  listFeederLogs,
  markFeederRestocked,
  markFeederUsed,
  sizedEntries,
  titleize,
  updateFeederStock,
  type FeederLogType,
  type HvFeederLog,
  type HvFeederStock,
} from '../../src/lib/feeders';

const LOG_META: Record<FeederLogType, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  restock: { label: 'Restocked', icon: 'plus-box' },
  used: { label: 'Used', icon: 'minus-box' },
  cleaned: { label: 'Cleaned', icon: 'broom' },
  bred: { label: 'Bred', icon: 'egg' },
  died: { label: 'Died off', icon: 'skull-outline' },
  count_correction: { label: 'Correction', icon: 'pencil' },
};

function FeederDetailScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const stockId = typeof params.id === 'string' ? params.id : null;

  const [stock, setStock] = useState<HvFeederStock | null>(null);
  const [logs, setLogs] = useState<HvFeederLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!stockId) return;
    try {
      const [s, l] = await Promise.all([
        getFeederStock(stockId),
        listFeederLogs(stockId).catch(() => []),
      ]);
      setStock(s);
      setLogs(l ?? []);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setLoadError(
        e?.response?.data?.detail || e?.message || 'Failed to load feeder stock',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stockId]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  const applyUpdated = useCallback((updated: HvFeederStock) => {
    setStock(updated);
    syncLowStockReminder(updated.id, feederStockTitle(updated), updated.is_low_stock);
  }, []);

  const adjust = useCallback(
    async (mode: 'used' | 'restock', size: string | null, key: string) => {
      if (!stockId) return;
      setBusyKey(key);
      try {
        const updated =
          mode === 'used'
            ? await markFeederUsed(stockId, 1, size)
            : await markFeederRestocked(stockId, 1, size);
        applyUpdated(updated);
        // Refresh log history in the background so the new entry shows.
        listFeederLogs(stockId).then((l) => setLogs(l ?? [])).catch(() => {});
        setLoadError('');
      } catch (e: any) {
        setLoadError(
          e?.response?.data?.detail || e?.message || 'Failed to adjust inventory',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [stockId, applyUpdated],
  );

  const confirmDelete = () => {
    if (!stock) return;
    Alert.alert(
      'Delete feeder stock?',
      `"${feederStockTitle(stock)}" and its log history will be removed. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFeederStock(stock.id);
              // Clean up any pending low-stock reminder.
              syncLowStockReminder(stock.id, feederStockTitle(stock), false);
              router.replace('/feeders' as never);
            } catch (e: any) {
              setLoadError(
                e?.response?.data?.detail || e?.message || 'Failed to delete',
              );
            }
          },
        },
      ],
    );
  };

  const toggleActive = async () => {
    if (!stock) return;
    try {
      const updated = await updateFeederStock(stock.id, {
        is_active: !stock.is_active,
      });
      setStock(updated);
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to update');
    }
  };

  const sized = useMemo(
    () => (stock ? sizedEntries(stock) : []),
    [stock],
  );

  // ---- Render states ----
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Feeder" leftAction={<HeaderBackButton />} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError && !stock) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppHeader title="Feeder" leftAction={<HeaderBackButton />} />
        <View style={styles.loadingWrap}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              setLoadError('');
              fetchAll();
            }}
          >
            <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!stock) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title={feederStockTitle(stock)}
        subtitle={stock.form === 'live' ? 'Live colony' : 'Frozen'}
        leftAction={<HeaderBackButton />}
        rightAction={
          <TouchableOpacity
            onPress={() => router.push(`/feeders/add?id=${stock.id}` as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit feeder stock"
          >
            <MaterialCommunityIcons name="pencil" size={22} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchAll();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {loadError !== '' && (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.surface, borderColor: colors.danger },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {loadError}
            </Text>
          </View>
        )}

        {/* Header card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: stock.is_low_stock ? colors.warning : colors.border,
              borderRadius: layout.radius.md,
            },
          ]}
        >
          <View style={styles.cardTop}>
            <Text style={styles.formGlyph}>{feederFormGlyph(stock.form)}</Text>
            <View style={styles.cardTopText}>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>
                {stock.total_count ?? 0}
                <Text style={[styles.totalUnit, { color: colors.textTertiary }]}>
                  {'  '}total
                </Text>
              </Text>
              {stock.species_display_name ? (
                <Text style={[styles.metaLine, { color: colors.textTertiary }]}>
                  {stock.species_display_name}
                </Text>
              ) : null}
              {stock.storage_location ? (
                <Text style={[styles.metaLine, { color: colors.textTertiary }]}>
                  📍 {stock.storage_location}
                </Text>
              ) : null}
            </View>
            {stock.is_low_stock && (
              <View
                style={[styles.lowBadge, { backgroundColor: `${colors.warning}22` }]}
              >
                <MaterialCommunityIcons name="alert" size={12} color={colors.warning} />
                <Text style={[styles.lowBadgeText, { color: colors.warning }]}>
                  Low
                </Text>
              </View>
            )}
          </View>
          {stock.low_threshold != null && (
            <Text style={[styles.thresholdLine, { color: colors.textTertiary }]}>
              Low-stock threshold: {stock.low_threshold}
            </Text>
          )}
        </View>

        {/* Inventory + steppers */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Inventory
        </Text>

        {stock.inventory_mode === 'sized' ? (
          sized.length > 0 ? (
            sized.map(([size, n]) => (
              <StepperRow
                key={size}
                label={titleize(size)}
                count={n}
                busy={busyKey === `sized-${size}`}
                onUsed={() => adjust('used', size, `sized-${size}`)}
                onRestock={() => adjust('restock', size, `sized-${size}`)}
                colors={colors}
                layout={layout}
              />
            ))
          ) : (
            <Text style={[styles.emptyBuckets, { color: colors.textSecondary }]}>
              No size buckets yet. Edit this stock to add sizes.
            </Text>
          )
        ) : (
          <StepperRow
            label="Count"
            count={stock.count ?? 0}
            busy={busyKey === 'count'}
            onUsed={() => adjust('used', null, 'count')}
            onRestock={() => adjust('restock', null, 'count')}
            colors={colors}
            layout={layout}
          />
        )}

        {/* Notes */}
        {stock.notes ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Notes
            </Text>
            <View
              style={[
                styles.notesCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: layout.radius.md,
                },
              ]}
            >
              <Text style={[styles.notesText, { color: colors.textSecondary }]}>
                {stock.notes}
              </Text>
            </View>
          </>
        ) : null}

        {/* Recent activity */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Recent activity
        </Text>
        {logs.length === 0 ? (
          <Text style={[styles.emptyBuckets, { color: colors.textTertiary }]}>
            No activity yet. Use the Used/Restock buttons above.
          </Text>
        ) : (
          logs.slice(0, 20).map((log) => {
            const meta = LOG_META[log.log_type] ?? LOG_META.count_correction;
            const delta = log.count_delta ?? 0;
            const deltaColor =
              delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textTertiary;
            return (
              <View
                key={log.id}
                style={[styles.logRow, { borderBottomColor: colors.border }]}
              >
                <MaterialCommunityIcons
                  name={meta.icon}
                  size={18}
                  color={colors.textTertiary}
                />
                <View style={styles.logText}>
                  <Text style={[styles.logLabel, { color: colors.textPrimary }]}>
                    {meta.label}
                    {log.size ? ` · ${titleize(log.size)}` : ''}
                  </Text>
                  <Text style={[styles.logDate, { color: colors.textTertiary }]}>
                    {log.logged_at}
                    {log.notes ? ` — ${log.notes}` : ''}
                  </Text>
                </View>
                {delta !== 0 && (
                  <Text style={[styles.logDelta, { color: deltaColor }]}>
                    {delta > 0 ? `+${delta}` : delta}
                  </Text>
                )}
              </View>
            );
          })
        )}

        {/* Danger zone */}
        <View style={styles.dangerRow}>
          <TouchableOpacity
            onPress={toggleActive}
            style={[
              styles.dangerBtn,
              { borderColor: colors.border, borderRadius: layout.radius.md },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.dangerBtnText, { color: colors.textSecondary }]}>
              {stock.is_active ? 'Archive' : 'Reactivate'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmDelete}
            style={[
              styles.dangerBtn,
              { borderColor: colors.danger, borderRadius: layout.radius.md },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StepperRow — one inventory line with Used (−) / count / Restock (+).
// ---------------------------------------------------------------------------

function StepperRow({
  label,
  count,
  busy,
  onUsed,
  onRestock,
  colors,
  layout,
}: {
  label: string;
  count: number;
  busy: boolean;
  onUsed: () => void;
  onRestock: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  layout: ReturnType<typeof useTheme>['layout'];
}) {
  return (
    <View
      style={[
        styles.stepperRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
    >
      <View style={styles.stepperInfo}>
        <Text style={[styles.stepperLabel, { color: colors.textPrimary }]}>
          {label}
        </Text>
        <Text style={[styles.stepperCount, { color: colors.textSecondary }]}>
          {count} in stock
        </Text>
      </View>
      <TouchableOpacity
        onPress={onUsed}
        disabled={busy}
        style={[
          styles.stepBtn,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderRadius: layout.radius.sm,
            opacity: busy ? 0.5 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Used one ${label}`}
      >
        <MaterialCommunityIcons name="minus" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onRestock}
        disabled={busy}
        style={[
          styles.stepBtn,
          {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            borderRadius: layout.radius.sm,
            opacity: busy ? 0.5 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Restock one ${label}`}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#0B0B0B" />
        ) : (
          <MaterialCommunityIcons name="plus" size={20} color="#0B0B0B" />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default withErrorBoundary(FeederDetailScreen, 'feeder-detail');

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  scroll: { padding: 16, gap: 4 },
  errorCard: { padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },

  card: { borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  formGlyph: { fontSize: 32 },
  cardTopText: { flex: 1, minWidth: 0 },
  totalValue: { fontSize: 30, fontWeight: '800' },
  totalUnit: { fontSize: 14, fontWeight: '600' },
  metaLine: { fontSize: 13, marginTop: 2 },
  lowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lowBadgeText: { fontSize: 11, fontWeight: '800' },
  thresholdLine: { fontSize: 12, marginTop: 10 },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  stepperInfo: { flex: 1, minWidth: 0 },
  stepperLabel: { fontSize: 15, fontWeight: '700' },
  stepperCount: { fontSize: 13, marginTop: 2 },
  stepBtn: {
    width: 46,
    height: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBuckets: { fontSize: 14, paddingVertical: 8, lineHeight: 20 },

  notesCard: { borderWidth: 1, padding: 14, marginBottom: 4 },
  notesText: { fontSize: 14, lineHeight: 20 },

  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logText: { flex: 1, minWidth: 0 },
  logLabel: { fontSize: 14, fontWeight: '600' },
  logDate: { fontSize: 12, marginTop: 1 },
  logDelta: { fontSize: 15, fontWeight: '800' },

  dangerRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  dangerBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { fontSize: 15, fontWeight: '600' },
});
