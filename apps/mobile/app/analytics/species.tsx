/**
 * Every species in the collection, most animals first, with a search box (the
 * "n more species" target on the Analytics page). Rows come from the shared lib
 * (`speciesRows(data, null)` = no cap), so the words match the Collection card.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, PixelRatio, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { RankedRows } from '../../src/components/charts';
import { ListFrame } from '../../src/components/analytics/ListFrame';
import { Card } from '../../src/components/ui';
import { MIN_TOUCH } from '../../src/components/analytics/parts';
import { formatCount, speciesRows, type CollectionAnalytics, type RankedRow } from '../../src/lib/analytics-view';
import { rankedValueWidth } from '../../src/lib/chart-helpers';
import type { LoadStatus } from '../../src/lib/analytics-page-state';
import { SPACING, TYPE } from '../../src/theme/tokens';

function SpeciesListScreen() {
  const { colors, layout } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [data, setData] = useState<CollectionAnalytics | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setStatus('loading');
    try {
      const response = await apiClient.get<CollectionAnalytics>('/analytics/collection', {
        params: { tz_offset_minutes: new Date().getTimezoneOffset() },
      });
      setData(response.data);
      setStatus('ready');
    } catch (err) {
      console.error('Failed to fetch species counts:', err);
      // A failed pull-to-refresh keeps the list that is on screen.
      setStatus((s) => (mode === 'refresh' && s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const all = useMemo(() => (data ? speciesRows(data, null).rows : []), [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => !q || r.label.toLowerCase().includes(q));
  }, [all, query]);
  // One figure-column width for the whole list, so a virtualised row still lines up with the rest.
  const valueWidth = useMemo(() => rankedValueWidth(all, PixelRatio.getFontScale()), [all]);
  // Scientific names are long: give them nearly half the row.
  const labelWidth = Math.max(110, Math.min(190, Math.round(screenWidth * 0.45)));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load('refresh');
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: RankedRow }) => (
      <View style={styles.item}>
        <RankedRows rows={[item]} labelWidth={labelWidth} italicLabels valueWidth={valueWidth} />
      </View>
    ),
    [labelWidth, valueWidth],
  );

  const header = (
    <View
      style={[
        styles.search,
        { borderColor: colors.border, borderRadius: layout.radius.sm, backgroundColor: colors.surface },
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={20} color={colors.textTertiary} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search species"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Search species"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[TYPE.body, styles.searchInput, { color: colors.textPrimary }]}
      />
      {query.length > 0 && (
        <TouchableOpacity
          onPress={() => setQuery('')}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ListFrame
      title="Species"
      subtitle={`${formatCount(all.length)} species`}
      status={status}
      errorTitle="We couldn't load your species"
      onRetry={() => void load('initial')}
    >
      <View style={styles.pad}>
        <Card style={[styles.card, { borderRadius: layout.radius.lg }]}>
          {all.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>No animals yet.</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              renderItem={renderItem}
              ListHeaderComponent={header}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.textTertiary }]}>No species match that search.</Text>
              }
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
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
  item: { paddingVertical: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  searchInput: { flex: 1, minHeight: MIN_TOUCH, paddingVertical: 0 },
  clear: { minWidth: 32, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  empty: { ...TYPE.small, padding: SPACING.lg },
});

export default withErrorBoundary(SpeciesListScreen, 'analytics-species');
