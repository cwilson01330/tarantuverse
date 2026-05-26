/**
 * Scorpions collection screen — Phase 3a of the scorpion expansion.
 *
 * Deliberately a slim first cut: list + empty state + read-only tap to
 * a detail screen that doesn't exist yet (3b adds it). No feeding
 * statuses, no premolt predictions, no sort/search/action sheets —
 * those land in 3b/3c when the detail + log forms exist.
 *
 * The collection.tsx (tarantulas) screen is the reference for the
 * heavier-weight version we'll grow into.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { getImageUrl } from '../../src/utils/image-url';
import {
  listScorpions,
  scorpionDisplayName,
  type Scorpion,
} from '../../src/lib/scorpions';

function ScorpionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, layout } = useTheme();

  const [scorpions, setScorpions] = useState<Scorpion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScorpions = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const rows = await listScorpions();
        setScorpions(rows);
      } catch (err) {
        // Cold-start / 401 are handled by apiClient interceptors; surface
        // anything else so the keeper sees a retry affordance rather
        // than a blank screen.
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't load scorpions. Pull to retry.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  // Refetch when this tab regains focus — matches the tarantula tab
  // behavior so a newly-added scorpion shows up without a hard refresh.
  useFocusEffect(
    useCallback(() => {
      if (user) fetchScorpions('initial');
    }, [user, fetchScorpions]),
  );

  useEffect(() => {
    if (!user) {
      setScorpions([]);
      setLoading(false);
    }
  }, [user]);

  const handleAdd = () => {
    // Route stub — Phase 3b adds the actual /scorpion/add screen.
    router.push('/scorpion/add' as any);
  };

  const handleOpenScorpion = (id: string) => {
    // Route stub — Phase 3b adds /scorpion/[id].
    router.push(`/scorpion/${id}` as any);
  };

  const styles = makeStyles(colors);

  const renderScorpion = ({ item }: { item: Scorpion }) => {
    const photoUri = item.photo_url ? getImageUrl(item.photo_url) : null;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleOpenScorpion(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${scorpionDisplayName(item)}`}
      >
        <View style={styles.photoWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <MaterialCommunityIcons
                name="zodiac-scorpio"
                size={40}
                color={colors.textTertiary}
              />
            </View>
          )}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name || item.common_name || item.scientific_name || 'Unnamed'}
          </Text>
          {(item.common_name || item.scientific_name) && (
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {item.common_name || item.scientific_name}
            </Text>
          )}
          <View style={styles.metaRow}>
            {item.sex && item.sex !== 'unknown' && (
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor:
                      item.sex === 'female' ? '#fce7f3' : '#dbeafe',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    {
                      color: item.sex === 'female' ? '#9d174d' : '#1e40af',
                    },
                  ]}
                >
                  {item.sex === 'female' ? '♀' : '♂'}{' '}
                  {item.sex === 'female' ? 'Female' : 'Male'}
                </Text>
              </View>
            )}
            {item.current_instar != null && (
              <View
                style={[styles.pill, { backgroundColor: colors.surfaceElevated }]}
              >
                <Text style={[styles.pillText, { color: colors.textSecondary }]}>
                  Instar {item.current_instar}
                </Text>
              </View>
            )}
          </View>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
    );
  };

  if (loading && scorpions.length === 0) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={scorpions}
        keyExtractor={(item) => item.id}
        renderItem={renderScorpion}
        contentContainerStyle={
          scorpions.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchScorpions('refresh')}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="scorpio"
              size={64}
              color={colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>No scorpions yet</Text>
            <Text style={styles.emptyText}>
              {error
                ? error
                : 'Start tracking your collection — log feedings, '
                  + 'molts, substrate changes, and care notes.'}
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel="Add your first scorpion"
            >
              <MaterialCommunityIcons name="plus" size={18} color="#fff" />
              <Text style={styles.emptyCtaText}>Add your first scorpion</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {scorpions.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a scorpion"
        >
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="plus" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },

    list: {
      padding: 16,
      paddingBottom: 96, // FAB clearance: 56 + 16 + 24
      gap: 12,
    },
    emptyList: {
      flexGrow: 1,
      padding: 24,
      justifyContent: 'center',
    },

    empty: {
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    emptyCtaText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoWrap: {
      width: 64,
      height: 64,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surfaceElevated,
    },
    photo: { width: '100%', height: '100%' },
    photoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: {
      flex: 1,
      gap: 2,
    },
    cardName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    metaRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
      flexWrap: 'wrap',
    },
    pill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    pillText: {
      fontSize: 11,
      fontWeight: '600',
    },

    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      overflow: 'hidden',
    },
    fabGradient: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default withErrorBoundary(ScorpionsScreen);
