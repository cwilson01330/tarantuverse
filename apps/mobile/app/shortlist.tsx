/**
 * Shortlist — species the keeper saved from a care sheet but doesn't own.
 *
 * This screen is the reason the bookmark button is allowed to exist. A
 * bookmark with nowhere to land is a button that pretends to do something.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../src/contexts/ThemeContext';
import { AppHeader } from '../src/components/AppHeader';
import { withErrorBoundary } from '../src/components/ErrorBoundary';
import { getImageUrl } from '../src/utils/image-url';
import { taxonMdiIcon } from '../src/lib/inverts';
import { careLevelMeta } from '../src/components/caresheet';
import {
  listShortlist,
  removeFromShortlist,
  type ShortlistItem,
} from '../src/lib/shortlist';

function ShortlistScreen() {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listShortlist());
    } catch (e) {
      setError("Couldn't load your shortlist.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refetch on focus: the keeper may have bookmarked or unbookmarked from a
  // care sheet since this screen was last seen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openSheet = (item: ShortlistItem) => {
    // Tarantulas keep their dedicated care sheet; everything else renders
    // through the generic invert sheet (ADR-007).
    const path =
      item.taxon === 'tarantula'
        ? `/species/${item.species_id}`
        : `/invert-species/${item.species_id}`;
    router.push(path as any);
  };

  const confirmRemove = (item: ShortlistItem) => {
    const label = item.common_names?.[0] || item.scientific_name || 'this species';
    Alert.alert('Remove from shortlist?', `${label} will be removed from your saved species.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const previous = items;
          setItems((rows) => rows.filter((r) => r.species_id !== item.species_id));
          try {
            await removeFromShortlist(item.species_id);
          } catch {
            setItems(previous);
            Alert.alert('Could not remove', 'Something went wrong. Please try again.');
          }
        },
      },
    ]);
  };

  const styles = makeStyles(colors);

  if (loading) {
    return (
      <View style={styles.flex}>
        <AppHeader
          title="Shortlist"
          leftAction={
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
            </TouchableOpacity>
          }
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Shortlist"
        subtitle={items.length ? `${items.length} saved` : undefined}
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="bookmark-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyBody}>
            Tap the bookmark on any care sheet to save a species you're considering.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push('/(tabs)/species' as any)}
          >
            <Text style={styles.browseText}>Browse species</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            const care = careLevelMeta(item.care_level, colors.textSecondary);
            const hot = item.venom_severity === 'medically_significant';
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.8}
                onPress={() => openSheet(item)}
                onLongPress={() => confirmRemove(item)}
              >
                <View style={styles.thumb}>
                  {item.image_url ? (
                    <Image source={{ uri: getImageUrl(item.image_url) }} style={styles.thumbImage} />
                  ) : (
                    <MaterialCommunityIcons
                      name={taxonMdiIcon(item.taxon ?? '') as any}
                      size={26}
                      color={colors.textTertiary}
                    />
                  )}
                </View>

                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.common_names?.[0] || item.scientific_name}
                  </Text>
                  <Text style={styles.rowSci} numberOfLines={1}>
                    {item.scientific_name}
                  </Text>

                  <View style={styles.badgeRow}>
                    {!!item.care_level && (
                      <View style={[styles.pill, { backgroundColor: care.color + '24' }]}>
                        <Text style={[styles.pillText, { color: care.color }]}>{care.text}</Text>
                      </View>
                    )}
                    {hot && (
                      <View style={[styles.pill, { backgroundColor: '#ef444424' }]}>
                        <Text style={[styles.pillText, { color: '#ef4444' }]}>Hot venom</Text>
                      </View>
                    )}
                    {/* Honest state: they bought it since saving it. */}
                    {item.owned && (
                      <View style={[styles.pill, { backgroundColor: '#22c55e24' }]}>
                        <Text style={[styles.pillText, { color: '#22c55e' }]}>In collection</Text>
                      </View>
                    )}
                  </View>

                  {!!item.note && (
                    <Text style={styles.note} numberOfLines={2}>
                      {item.note}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => confirmRemove(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.scientific_name} from shortlist`}
                >
                  <MaterialCommunityIcons name="bookmark" size={22} color={colors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    errorText: { color: colors.textPrimary, marginBottom: 12 },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    retryText: { color: '#fff', fontWeight: '600' },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginTop: 6 },
    emptyBody: {
      fontSize: 13.5,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },
    browseButton: {
      marginTop: 10,
      paddingVertical: 11,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    browseText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 11,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    thumbImage: { width: '100%', height: '100%' },
    rowBody: { flex: 1, gap: 2 },
    rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    rowSci: { fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
    pillText: { fontSize: 11, fontWeight: '700' },
    note: { fontSize: 12, color: colors.textSecondary, marginTop: 5, fontStyle: 'italic' },
  });

export default withErrorBoundary(ShortlistScreen, 'shortlist');
