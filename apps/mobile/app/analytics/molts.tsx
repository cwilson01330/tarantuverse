/**
 * Every animal with its molt count and when it last molted (the "All n" target
 * on the Analytics page). Rows come from `GET /analytics/molts` through the shared
 * lib's `moltRow`, so the words match the Molts card; tapping one opens the animal.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, PixelRatio, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { RankedRows } from '../../src/components/charts';
import { ListFrame } from '../../src/components/analytics/ListFrame';
import { Card } from '../../src/components/ui';
import { formatCount, moltRow, type MoltRow, type RankedRow } from '../../src/lib/analytics-view';
import { rankedValueWidth } from '../../src/lib/chart-helpers';
import type { LoadStatus } from '../../src/lib/analytics-page-state';
import { SPACING, TYPE } from '../../src/theme/tokens';

function MoltsListScreen() {
  const { colors, layout } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [molts, setMolts] = useState<MoltRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setStatus('loading');
    try {
      const response = await apiClient.get<MoltRow[]>('/analytics/molts', {
        params: { tz_offset_minutes: new Date().getTimezoneOffset() },
      });
      setMolts(Array.isArray(response.data) ? response.data : []);
      setNow(new Date());
      setStatus('ready');
    } catch (err) {
      console.error('Failed to fetch molts:', err);
      // A failed pull-to-refresh keeps the list that is on screen.
      setStatus((s) => (mode === 'refresh' && s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const rows: RankedRow[] = useMemo(() => {
    const max = molts.reduce((hi, r) => Math.max(hi, r.count), 0);
    return molts.map((r) => moltRow(r.tarantula_id, r.name, r.count, r.last_molted_at || r.last_date, max, now, false));
  }, [molts, now]);
  const total = useMemo(() => molts.reduce((sum, r) => sum + r.count, 0), [molts]);
  // One figure-column width for the whole list, so a virtualised row still lines up with the rest.
  const valueWidth = useMemo(() => rankedValueWidth(rows, PixelRatio.getFontScale()), [rows]);
  const labelWidth = Math.max(80, Math.min(140, Math.round(screenWidth * 0.32)));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load('refresh');
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: RankedRow }) => (
      <View style={styles.item}>
        <RankedRows
          rows={[item]}
          labelWidth={labelWidth}
          valueWidth={valueWidth}
          onPressRow={(r) => r.id && router.push(`/invert/${r.id}` as never)}
        />
      </View>
    ),
    [labelWidth, valueWidth],
  );

  return (
    <ListFrame
      title="Molts"
      subtitle={`${formatCount(total)} logged`}
      status={status}
      errorTitle="We couldn't load your molts"
      onRetry={() => void load('initial')}
    >
      <View style={styles.pad}>
        <Card style={[styles.card, { borderRadius: layout.radius.lg }]}>
          {rows.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>No animals yet.</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              initialNumToRender={24}
              windowSize={7}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
              }
            />
          )}
        </Card>
      </View>
    </ListFrame>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, padding: SPACING.lg },
  card: { flex: 1, padding: 0, gap: 0, overflow: 'hidden' },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  item: {},
  empty: { ...TYPE.small, padding: SPACING.lg },
});

export default withErrorBoundary(MoltsListScreen, 'analytics-molts');
