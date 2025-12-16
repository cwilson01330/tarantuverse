import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import TarantulaCardSkeleton from '../../src/components/TarantulaCardSkeleton';

interface Tarantula {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  photo_url?: string;
}

interface FeedingStatus {
  tarantula_id: string;
  days_since_last_feeding?: number;
  acceptance_rate: number;
}

interface PremoltPrediction {
  tarantula_id: string;
  probability: number;
  confidence_level: string;
  status_text: string;
}

interface CollectionStats {
  total_tarantulas: number;
  unique_species: number;
  total_feedings: number;
  total_molts: number;
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
}

export default function CollectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([]);
  const [feedingStatuses, setFeedingStatuses] = useState<Map<string, FeedingStatus>>(new Map());
  const [premoltPredictions, setPremoltPredictions] = useState<Map<string, PremoltPrediction>>(new Map());
  const [collectionStats, setCollectionStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Load view preference from AsyncStorage
  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const savedView = await AsyncStorage.getItem('collection_view_mode');
        if (savedView === 'card' || savedView === 'list') {
          setViewMode(savedView);
        }
      } catch (error) {
        // Silently fail
      }
    };
    loadViewMode();
  }, []);

  const toggleViewMode = async (mode: 'card' | 'list') => {
    setViewMode(mode);
    try {
      await AsyncStorage.setItem('collection_view_mode', mode);
    } catch (error) {
      // Silently fail
    }
  };

  // Helper function to handle both R2 (absolute) and local (relative) URLs
  const getImageUrl = (url?: string) => {
    if (!url) return '';
    // If URL starts with http, it's already absolute (R2)
    if (url.startsWith('http')) {
      return url;
    }
    // Otherwise, it's a local path - prepend the API base URL
    return `https://tarantuverse-api.onrender.com${url}`;
  };

  useEffect(() => {
    fetchTarantulas();
    fetchCollectionStats();
  }, []);

  const fetchCollectionStats = async () => {
    try {
      const response = await apiClient.get('/analytics/collection');
      setCollectionStats(response.data);
    } catch (error) {
      // Silently fail - stats are optional
    }
  };

  const fetchTarantulas = async () => {
    try {
      const response = await apiClient.get('/tarantulas/');
      setTarantulas(response.data);
      await fetchAllFeedingStatuses(response.data);
      await fetchAllPremoltPredictions(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantulas');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFeedingStatuses = async (tarantulasList: Tarantula[]) => {
    const statusMap = new Map<string, FeedingStatus>();
    
    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(`/tarantulas/${t.id}/feeding-stats`);
          statusMap.set(t.id, {
            tarantula_id: t.id,
            days_since_last_feeding: response.data.days_since_last_feeding,
            acceptance_rate: response.data.acceptance_rate,
          });
        } catch (error) {
          // Silently fail for individual tarantulas
        }
      })
    );
    
    setFeedingStatuses(statusMap);
  };

  const fetchAllPremoltPredictions = async (tarantulasList: Tarantula[]) => {
    const predictionMap = new Map<string, PremoltPrediction>();

    await Promise.all(
      tarantulasList.map(async (t) => {
        try {
          const response = await apiClient.get(`/tarantulas/${t.id}/premolt-prediction`);
          predictionMap.set(t.id, {
            tarantula_id: t.id,
            probability: response.data.probability,
            confidence_level: response.data.confidence_level,
            status_text: response.data.status_text,
          });
        } catch (error) {
          // Silently fail for individual tarantulas
        }
      })
    );

    setPremoltPredictions(predictionMap);
  };

  const getFeedingStatusBadge = (tarantulaId: string) => {
    const status = feedingStatuses.get(tarantulaId);
    if (!status || status.days_since_last_feeding === undefined) return null;

    const days = status.days_since_last_feeding;
    let badgeStyle = styles.feedingBadgeGreen;
    let emoji = '✓';

    if (days >= 21) {
      badgeStyle = styles.feedingBadgeRed;
      emoji = '⚠️';
    } else if (days >= 14) {
      badgeStyle = styles.feedingBadgeOrange;
      emoji = '⏰';
    } else if (days >= 7) {
      badgeStyle = styles.feedingBadgeYellow;
      emoji = '📅';
    }

    return (
      <View style={[styles.feedingBadge, badgeStyle]}>
        <Text style={styles.feedingBadgeText}>
          {emoji} {days}d
        </Text>
      </View>
    );
  };

  const getPremoltBadge = (tarantulaId: string) => {
    const prediction = premoltPredictions.get(tarantulaId);
    if (!prediction) return null;

    // Only show badge for medium or higher confidence
    if (prediction.confidence_level === 'low') return null;

    let badgeStyle = styles.premoltBadgeGray;

    if (prediction.confidence_level === 'very_high') {
      badgeStyle = styles.premoltBadgeRed;
    } else if (prediction.confidence_level === 'high') {
      badgeStyle = styles.premoltBadgeOrange;
    } else if (prediction.confidence_level === 'medium') {
      badgeStyle = styles.premoltBadgeYellow;
    }

    return (
      <View style={[styles.premoltBadge, badgeStyle]}>
        <Text style={styles.premoltBadgeText}>
          🦋 {prediction.probability}%
        </Text>
      </View>
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTarantulas();
    await fetchCollectionStats();
    setRefreshing(false);
  }, []);

  const renderTarantula = ({ item }: { item: Tarantula }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/tarantula/${item.id}`)}
    >
      <View style={styles.imageContainer}>
        {item.photo_url ? (
          <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.image} />
        ) : (
          <View style={styles.placeholderImage}>
            <MaterialCommunityIcons name="spider" size={40} color={colors.textTertiary} />
          </View>
        )}
        {item.sex && (
          <View style={[styles.sexBadge, item.sex === 'female' ? styles.femaleBadge : styles.maleBadge]}>
            <MaterialCommunityIcons
              name={item.sex === 'female' ? 'gender-female' : 'gender-male'}
              size={16}
              color="#fff"
            />
          </View>
        )}
        {getFeedingStatusBadge(item.id)}
        {getPremoltBadge(item.id)}
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.scientificName}>{item.scientific_name}</Text>
        {item.common_name && (
          <Text style={styles.commonName}>{item.common_name}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderListItem = ({ item }: { item: Tarantula }) => {
    const feedingStatus = feedingStatuses.get(item.id);
    const premoltPrediction = premoltPredictions.get(item.id);
    const days = feedingStatus?.days_since_last_feeding;

    let feedingColor = colors.success;
    if (days !== undefined) {
      if (days >= 21) feedingColor = '#ef4444';
      else if (days >= 14) feedingColor = '#f97316';
      else if (days >= 7) feedingColor = '#eab308';
    }

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => router.push(`/tarantula/${item.id}`)}
      >
        <View style={styles.listImageContainer}>
          {item.photo_url ? (
            <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.listImage} />
          ) : (
            <View style={styles.listPlaceholder}>
              <MaterialCommunityIcons name="spider" size={24} color={colors.textTertiary} />
            </View>
          )}
        </View>
        <View style={styles.listContent}>
          <View style={styles.listHeader}>
            <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
            {item.sex && (
              <MaterialCommunityIcons
                name={item.sex === 'female' ? 'gender-female' : 'gender-male'}
                size={18}
                color={item.sex === 'female' ? '#ec4899' : '#3b82f6'}
              />
            )}
          </View>
          <Text style={styles.listScientificName} numberOfLines={1}>{item.scientific_name}</Text>
        </View>
        <View style={styles.listBadges}>
          {days !== undefined && (
            <View style={[styles.listBadge, { backgroundColor: feedingColor }]}>
              <Text style={styles.listBadgeText}>{days}d</Text>
            </View>
          )}
          {premoltPrediction && premoltPrediction.confidence_level !== 'low' && (
            <View style={[styles.listBadge, { backgroundColor: '#f97316' }]}>
              <Text style={styles.listBadgeText}>🦋 {premoltPrediction.probability}%</Text>
            </View>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  const ViewToggle = () => (
    <View style={styles.viewToggleContainer}>
      <TouchableOpacity
        style={[styles.viewToggleButton, viewMode === 'card' && styles.viewToggleActive]}
        onPress={() => toggleViewMode('card')}
      >
        <MaterialCommunityIcons
          name="view-grid"
          size={20}
          color={viewMode === 'card' ? '#fff' : colors.textSecondary}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
        onPress={() => toggleViewMode('list')}
      >
        <MaterialCommunityIcons
          name="view-list"
          size={20}
          color={viewMode === 'list' ? '#fff' : colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    list: {
      padding: 8,
    },
    statsCard: {
      margin: 8,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    statsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    viewAllLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    sexDistribution: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sexItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    sexText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    card: {
      flex: 1,
      margin: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imageContainer: {
      position: 'relative',
    },
    image: {
      width: '100%',
      height: 150,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    placeholderImage: {
      width: '100%',
      height: 150,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    sexBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    maleBadge: {
      backgroundColor: '#3b82f6',
    },
    femaleBadge: {
      backgroundColor: '#ec4899',
    },
    feedingBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    feedingBadgeGreen: {
      backgroundColor: 'rgba(34, 197, 94, 0.9)',
    },
    feedingBadgeYellow: {
      backgroundColor: 'rgba(234, 179, 8, 0.9)',
    },
    feedingBadgeOrange: {
      backgroundColor: 'rgba(249, 115, 22, 0.9)',
    },
    feedingBadgeRed: {
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    feedingBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    premoltBadge: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    premoltBadgeRed: {
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
    },
    premoltBadgeOrange: {
      backgroundColor: 'rgba(249, 115, 22, 0.9)',
    },
    premoltBadgeYellow: {
      backgroundColor: 'rgba(234, 179, 8, 0.9)',
    },
    premoltBadgeGray: {
      backgroundColor: 'rgba(107, 114, 128, 0.9)',
    },
    premoltBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    cardContent: {
      padding: 12,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    scientificName: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
      marginBottom: 2,
    },
    commonName: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
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
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 16,
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
      justifyContent: 'center',
      alignItems: 'center',
    },
    // View toggle styles
    viewToggleContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewToggleButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    viewToggleActive: {
      backgroundColor: colors.primary,
    },
    // List view styles
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 8,
      marginVertical: 4,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    listImageContainer: {
      width: 50,
      height: 50,
      borderRadius: 8,
      overflow: 'hidden',
      marginRight: 12,
    },
    listImage: {
      width: 50,
      height: 50,
    },
    listPlaceholder: {
      width: 50,
      height: 50,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      flex: 1,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    listName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    listScientificName: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
      marginTop: 2,
    },
    listBadges: {
      flexDirection: 'row',
      gap: 6,
      marginRight: 8,
    },
    listBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    listBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    // Stats header with toggle
    statsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 8,
      marginBottom: 8,
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
          <TarantulaCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tarantulas.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="spider" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Tarantulas Yet</Text>
          <Text style={styles.emptyText}>
            Start building your collection by adding your first tarantula
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/tarantula/add')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButton}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Tarantula</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            key={viewMode} // Force re-render when viewMode changes (needed for numColumns)
            data={tarantulas}
            renderItem={viewMode === 'card' ? renderTarantula : renderListItem}
            keyExtractor={(item) => item.id}
            numColumns={viewMode === 'card' ? 2 : 1}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <>
                {/* View Toggle Row */}
                <View style={styles.statsHeaderRow}>
                  <Text style={styles.statsTitle}>🕷️ My Collection</Text>
                  <ViewToggle />
                </View>

                {/* Stats Card */}
                {collectionStats && (
                  <View style={styles.statsCard}>
                    <View style={styles.statsHeader}>
                      <Text style={styles.statsTitle}>📊 Collection Stats</Text>
                      <TouchableOpacity onPress={() => router.push('/analytics')}>
                        <Text style={styles.viewAllLink}>View All →</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.statsGrid}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_tarantulas}</Text>
                        <Text style={styles.statLabel}>Total</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.unique_species}</Text>
                        <Text style={styles.statLabel}>Species</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_feedings}</Text>
                        <Text style={styles.statLabel}>Feedings</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{collectionStats.total_molts}</Text>
                        <Text style={styles.statLabel}>Molts</Text>
                      </View>
                    </View>
                    <View style={styles.sexDistribution}>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="gender-male" size={16} color="#3b82f6" />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.male} ♂</Text>
                      </View>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="gender-female" size={16} color="#ec4899" />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.female} ♀</Text>
                      </View>
                      <View style={styles.sexItem}>
                        <MaterialCommunityIcons name="help-circle" size={16} color={colors.textTertiary} />
                        <Text style={styles.sexText}>{collectionStats.sex_distribution.unknown} ?</Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
          />
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/tarantula/add')}
            activeOpacity={0.8}
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
        </>
      )}
    </View>
  );
}
