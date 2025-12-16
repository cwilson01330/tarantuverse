import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

interface Enclosure {
  id: string;
  name: string;
  is_communal: boolean;
  population_count: number | null;
  species_name: string | null;
  inhabitant_count: number;
  days_since_last_feeding: number | null;
  photo_url: string | null;
  enclosure_type: string | null;
}

export default function EnclosuresScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [enclosures, setEnclosures] = useState<Enclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `https://tarantuverse-api.onrender.com${url}`;
  };

  useEffect(() => {
    fetchEnclosures();
  }, []);

  const fetchEnclosures = async () => {
    try {
      const response = await apiClient.get('/enclosures/');
      setEnclosures(response.data);
    } catch (error) {
      console.error('Failed to fetch enclosures:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEnclosures();
    setRefreshing(false);
  }, []);

  const getFeedingStatusColor = (days: number | null) => {
    if (days === null) return { bg: colors.border, text: colors.textTertiary };
    if (days >= 21) return { bg: 'rgba(239, 68, 68, 0.9)', text: '#fff' };
    if (days >= 14) return { bg: 'rgba(249, 115, 22, 0.9)', text: '#fff' };
    if (days >= 7) return { bg: 'rgba(234, 179, 8, 0.9)', text: '#fff' };
    return { bg: 'rgba(34, 197, 94, 0.9)', text: '#fff' };
  };

  const getTypeIcon = (type: string | null) => {
    switch (type) {
      case 'terrestrial': return 'terrain';
      case 'arboreal': return 'tree';
      case 'fossorial': return 'arrow-down-bold-circle';
      default: return 'home-variant';
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      padding: 8,
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
      overflow: 'hidden',
    },
    imageContainer: {
      position: 'relative',
      height: 120,
    },
    image: {
      width: '100%',
      height: 120,
    },
    placeholderImage: {
      width: '100%',
      height: 120,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    communalBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(147, 51, 234, 0.9)',
    },
    communalBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
    feedingBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    feedingBadgeText: {
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
    speciesName: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textTertiary,
      marginBottom: 8,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    infoText: {
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    skeletonCard: {
      flex: 1,
      margin: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    skeletonImage: {
      height: 120,
      backgroundColor: colors.border,
    },
    skeletonContent: {
      padding: 12,
    },
    skeletonTitle: {
      height: 16,
      width: '70%',
      backgroundColor: colors.border,
      borderRadius: 4,
      marginBottom: 8,
    },
    skeletonText: {
      height: 12,
      width: '50%',
      backgroundColor: colors.border,
      borderRadius: 4,
    },
  });

  const renderEnclosure = ({ item }: { item: Enclosure }) => {
    const feedingColors = getFeedingStatusColor(item.days_since_last_feeding);
    const population = item.is_communal
      ? (item.population_count || item.inhabitant_count)
      : item.inhabitant_count;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/enclosure/${item.id}`)}
      >
        <View style={styles.imageContainer}>
          {item.photo_url ? (
            <Image source={{ uri: getImageUrl(item.photo_url) }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <MaterialCommunityIcons name="home-variant" size={40} color={colors.textTertiary} />
            </View>
          )}

          {item.is_communal && (
            <View style={styles.communalBadge}>
              <Text style={styles.communalBadgeText}>Communal</Text>
            </View>
          )}

          <View style={[styles.feedingBadge, { backgroundColor: feedingColors.bg }]}>
            <Text style={[styles.feedingBadgeText, { color: feedingColors.text }]}>
              {item.days_since_last_feeding !== null
                ? `Fed ${item.days_since_last_feeding}d ago`
                : 'No feedings'}
            </Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {item.species_name && (
            <Text style={styles.speciesName} numberOfLines={1}>{item.species_name}</Text>
          )}
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <MaterialCommunityIcons
                name={item.is_communal ? 'account-group' : 'spider'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.infoText}>
                {population} {population === 1 ? 'spider' : 'spiders'}
              </Text>
            </View>
            {item.enclosure_type && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons
                  name={getTypeIcon(item.enclosure_type)}
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.infoText}>{item.enclosure_type}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const SkeletonCard = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonImage} />
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonText} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.list, { flexDirection: 'row', flexWrap: 'wrap' }]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {enclosures.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="home-variant" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Enclosures Yet</Text>
          <Text style={styles.emptyText}>
            Create enclosures to track communal setups or organize your collection
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/enclosure/add')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#0066ff', '#ff0099']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButton}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Enclosure</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={enclosures}
            renderItem={renderEnclosure}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
          />
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/enclosure/add')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#0066ff', '#ff0099']}
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
