import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../src/services/api';
import PhotoViewer from '../../src/components/PhotoViewer';
import GrowthChart from '../../src/components/GrowthChart';
import FeedingStatsCard from '../../src/components/FeedingStatsCard';
import TarantulaDetailSkeleton from '../../src/components/TarantulaDetailSkeleton';
import { useTheme } from '../../src/contexts/ThemeContext';

interface TarantulaDetail {
  id: string;
  name: string;
  common_name: string;
  scientific_name: string;
  sex?: string;
  age_years?: number;
  acquisition_date?: string;
  enclosure_size?: string;
  substrate_type?: string;
  last_fed?: string;
  last_molt?: string;
  photo_url?: string;
  notes?: string;
}

interface FeedingLog {
  id: string;
  fed_at: string;
  food_type?: string;
  food_size?: string;
  accepted: boolean;
  notes?: string;
}

interface MoltLog {
  id: string;
  molted_at: string;
  premolt_started_at?: string;
  leg_span_before?: number;
  leg_span_after?: number;
  weight_before?: number;
  weight_after?: number;
  notes?: string;
}

interface Photo {
  id: string;
  url: string;
  thumbnail_url?: string;
  caption?: string;
  taken_at?: string;
  created_at: string;
}

interface GrowthDataPoint {
  date: string;
  weight?: number;
  leg_span?: number;
  days_since_previous?: number;
  weight_change?: number;
  leg_span_change?: number;
}

interface GrowthAnalytics {
  tarantula_id: string;
  data_points: GrowthDataPoint[];
  total_molts: number;
  average_days_between_molts?: number;
  total_weight_gain?: number;
  total_leg_span_gain?: number;
  growth_rate_weight?: number;
  growth_rate_leg_span?: number;
  last_molt_date?: string;
  days_since_last_molt?: number;
}

interface PreyTypeCount {
  food_type: string;
  count: number;
  percentage: number;
}

interface FeedingStats {
  tarantula_id: string;
  total_feedings: number;
  total_accepted: number;
  total_refused: number;
  acceptance_rate: number;
  average_days_between_feedings?: number;
  last_feeding_date?: string;
  days_since_last_feeding?: number;
  next_feeding_prediction?: string;
  longest_gap_days?: number;
  current_streak_accepted: number;
  prey_type_distribution: PreyTypeCount[];
}

export default function TarantulaDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [tarantula, setTarantula] = useState<TarantulaDetail | null>(null);
  const [feedingLogs, setFeedingLogs] = useState<FeedingLog[]>([]);
  const [moltLogs, setMoltLogs] = useState<MoltLog[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [growthData, setGrowthData] = useState<GrowthAnalytics | null>(null);
  const [feedingStats, setFeedingStats] = useState<FeedingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  useEffect(() => {
    fetchTarantula();
    fetchFeedingLogs();
    fetchMoltLogs();
    fetchPhotos();
    fetchGrowth();
    fetchFeedingStats();
  }, [id]);

  const fetchTarantula = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}`);
      setTarantula(response.data);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load tarantula details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedingLogs = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}/feedings`);
      // Get only the 5 most recent logs
      setFeedingLogs(response.data.slice(0, 5));
    } catch (error: any) {
      // Silently fail - feeding logs are optional
    }
  };

  const fetchMoltLogs = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}/molts`);
      // Get only the 5 most recent logs
      setMoltLogs(response.data.slice(0, 5));
    } catch (error: any) {
      // Silently fail - molt logs are optional
    }
  };

  const fetchPhotos = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}/photos`);
      setPhotos(response.data);
    } catch (error: any) {
      // Silently fail if endpoint doesn't exist yet
      setPhotos([]);
    }
  };

  const fetchGrowth = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}/growth`);
      setGrowthData(response.data);
    } catch (error: any) {
      // Silently fail if no data available
      setGrowthData(null);
    }
  };

  const fetchFeedingStats = async () => {
    try {
      const response = await apiClient.get(`/tarantulas/${id}/feeding-stats`);
      setFeedingStats(response.data);
    } catch (error: any) {
      // Silently fail if no data available
      setFeedingStats(null);
    }
  };

  const deletePhoto = async (photoId: string) => {
    try {
      await apiClient.delete(`/photos/${photoId}`);
      // Remove photo from state
      setPhotos(photos.filter(p => p.id !== photoId));
      Alert.alert('Success', 'Photo deleted successfully');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to delete photo');
    }
  };

  const setMainPhoto = async (photoId: string, photoUrl: string) => {
    try {
      await apiClient.patch(`/photos/${photoId}/set-main`);
      // Update tarantula state with new main photo
      if (tarantula) {
        setTarantula({ ...tarantula, photo_url: photoUrl });
      }
      Alert.alert('Success', 'Main photo updated successfully');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to set main photo');
    }
  };

  const handlePhotoLongPress = (photoId: string, photoUrl: string, photoCaption?: string) => {
    const isMainPhoto = tarantula?.photo_url === photoUrl;
    
    Alert.alert(
      'Photo Options',
      photoCaption || 'Manage this photo',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(!isMainPhoto ? [{
          text: 'Set as Main',
          onPress: () => setMainPhoto(photoId, photoUrl)
        }] : []),
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Photo',
              'Are you sure you want to delete this photo?',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Delete', 
                  style: 'destructive',
                  onPress: () => deletePhoto(photoId)
                },
              ]
            );
          }
        },
      ]
    );
  };

  // Helper to get full image URL (handles both R2 and local storage URLs)
  const getImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    // If URL starts with http, it's already absolute (R2)
    if (url.startsWith('http')) {
      return url;
    }
    // Otherwise it's local storage, prepend API base
    const apiBase = 'https://tarantuverse-api.onrender.com';
    return `${apiBase}${url}`;
  };

  // Refetch logs when screen comes into focus (after adding a log)
  useFocusEffect(
    React.useCallback(() => {
      fetchFeedingLogs();
      fetchMoltLogs();
      fetchPhotos();
    }, [id])
  );

  if (loading) {
    return <TarantulaDetailSkeleton />;
  }

  if (!tarantula) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Details</Text>
        <TouchableOpacity 
          style={styles.editButton}
          onPress={() => router.push(`/tarantula/edit?id=${id}`)}
        >
          <MaterialCommunityIcons name="pencil" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={[styles.heroImageContainer, { backgroundColor: colors.surfaceElevated }]}>
          {tarantula.photo_url ? (
            <Image source={{ uri: tarantula.photo_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.placeholderHero, { backgroundColor: colors.surfaceElevated }]}>
              <MaterialCommunityIcons name="spider" size={80} color={colors.border} />
            </View>
          )}
        </View>

        {/* Name and Species */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{tarantula.name}</Text>
          <Text style={[styles.scientificName, { color: colors.textSecondary }]}>{tarantula.scientific_name}</Text>
          <Text style={[styles.commonName, { color: colors.textTertiary }]}>{tarantula.common_name}</Text>
        </View>

        {/* Basic Info */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Basic Information</Text>
          <View style={styles.infoGrid}>
            {tarantula.sex && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons
                  name={tarantula.sex === 'female' ? 'gender-female' : 'gender-male'}
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Sex</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {tarantula.sex.charAt(0).toUpperCase() + tarantula.sex.slice(1)}
                </Text>
              </View>
            )}
            {tarantula.age_years !== undefined && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="calendar" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Age</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{tarantula.age_years} years</Text>
              </View>
            )}
            {tarantula.acquisition_date && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="calendar-plus" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Acquired</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {new Date(tarantula.acquisition_date).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Husbandry */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Husbandry</Text>
          <View style={styles.infoGrid}>
            {tarantula.enclosure_size && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="cube-outline" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Enclosure</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{tarantula.enclosure_size}</Text>
              </View>
            )}
            {tarantula.substrate_type && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="layers" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Substrate</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{tarantula.substrate_type}</Text>
              </View>
            )}
            {tarantula.last_fed && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="food" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Last Fed</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {new Date(tarantula.last_fed).toLocaleDateString()}
                </Text>
              </View>
            )}
            {tarantula.last_molt && (
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Last Molt</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {new Date(tarantula.last_molt).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Feeding History */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Feeding History</Text>
            {feedingLogs.length > 0 && (
              <TouchableOpacity>
                <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          {feedingLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="food-off" size={32} color={colors.textTertiary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No feeding logs yet</Text>
            </View>
          ) : (
            <View style={styles.logList}>
              {feedingLogs.map((log) => (
                <View key={log.id} style={[styles.logItem, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <View style={styles.logIcon}>
                    <MaterialCommunityIcons 
                      name={log.accepted ? "check-circle" : "close-circle"} 
                      size={20} 
                      color={log.accepted ? "#10b981" : "#ef4444"} 
                    />
                  </View>
                  <View style={styles.logContent}>
                    <Text style={[styles.logTitle, { color: colors.textPrimary }]}>
                      {log.food_type || 'Unknown food'} {log.food_size ? `(${log.food_size})` : ''}
                    </Text>
                    <Text style={[styles.logDate, { color: colors.textSecondary }]}>
                      {new Date(log.fed_at).toLocaleDateString()}
                    </Text>
                    {log.notes && <Text style={[styles.logNotes, { color: colors.textSecondary }]}>{log.notes}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Molt History */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Molt History</Text>
            {moltLogs.length > 0 && (
              <TouchableOpacity>
                <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          {moltLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="refresh-circle" size={32} color={colors.textTertiary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No molt logs yet</Text>
            </View>
          ) : (
            <View style={styles.logList}>
              {moltLogs.map((log) => (
                <View key={log.id} style={[styles.logItem, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <View style={styles.logIcon}>
                    <MaterialCommunityIcons name="reload" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.logContent}>
                    <Text style={[styles.logTitle, { color: colors.textPrimary }]}>
                      Molt on {new Date(log.molted_at).toLocaleDateString()}
                    </Text>
                    {(log.leg_span_before || log.leg_span_after) && (
                      <Text style={[styles.logDate, { color: colors.textSecondary }]}>
                        Leg span: {log.leg_span_before || '?'}" → {log.leg_span_after || '?'}"
                      </Text>
                    )}
                    {log.notes && <Text style={[styles.logNotes, { color: colors.textSecondary }]}>{log.notes}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Feeding Stats */}
        {feedingStats && (
          <View style={styles.section}>
            <FeedingStatsCard data={feedingStats} />
          </View>
        )}

        {/* Growth Analytics */}
        {growthData && growthData.total_molts > 0 && (
          <View style={styles.section}>
            <GrowthChart data={growthData} />
          </View>
        )}

        {/* Photo Gallery */}
        <View style={[styles.section, { borderBottomColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Photos</Text>
          </View>
          
          {photos.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.photoGallery}
            >
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  style={[styles.photoThumbnail, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  onPress={() => {
                    setPhotoViewerIndex(index);
                    setPhotoViewerVisible(true);
                  }}
                  onLongPress={() => handlePhotoLongPress(photo.id, photo.url, photo.caption)}
                >
                  <Image 
                    source={{ uri: getImageUrl(photo.thumbnail_url || photo.url) }} 
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                  {tarantula?.photo_url === photo.url && (
                    <View style={styles.mainPhotoBadge}>
                      <MaterialCommunityIcons name="star" size={16} color="#fbbf24" />
                      <Text style={styles.mainPhotoText}>Main</Text>
                    </View>
                  )}
                  {photo.caption && (
                    <Text style={[styles.photoCaption, { color: colors.textSecondary }]} numberOfLines={2}>
                      {photo.caption}
                    </Text>
                  )}
                  <View style={styles.deleteHint}>
                    <MaterialCommunityIcons name="gesture-tap-hold" size={12} color="#fff" />
                    <Text style={styles.deleteHintText}>Hold to delete</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="camera-off" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No photos yet</Text>
              <Text style={[styles.emptyStateSubtext, { color: colors.textTertiary }]}>
                Tap the camera button below to add photos
              </Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {tarantula.notes && (
          <View style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
            <Text style={[styles.notes, { color: colors.textSecondary }]}>{tarantula.notes}</Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Bar */}
      <View style={[styles.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/tarantula/add-feeding?id=${id}`)}
        >
          <MaterialCommunityIcons name="food-apple" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/tarantula/add-molt?id=${id}`)}
        >
          <MaterialCommunityIcons name="reload" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Molt</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/tarantula/add-photo?id=${id}`)}
        >
          <MaterialCommunityIcons name="camera" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Photo Viewer Modal */}
      <PhotoViewer
        visible={photoViewerVisible}
        photos={photos}
        initialIndex={photoViewerIndex}
        onClose={() => setPhotoViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  editButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  heroImageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f3f4f6',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderHero: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  scientificName: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#6b7280',
    marginBottom: 2,
  },
  commonName: {
    fontSize: 16,
    color: '#9ca3af',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  infoItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  notes: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 32,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#7c3aed',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#d1d5db',
    marginTop: 4,
    textAlign: 'center',
  },
  logList: {
    gap: 12,
  },
  logItem: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  logIcon: {
    marginRight: 12,
    paddingTop: 2,
  },
  logContent: {
    flex: 1,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  logDate: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  logNotes: {
    fontSize: 13,
    color: '#4b5563',
    fontStyle: 'italic',
  },
  photoGallery: {
    marginTop: 12,
  },
  photoThumbnail: {
    marginRight: 12,
    width: 150,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: 150,
    height: 150,
    backgroundColor: '#e5e7eb',
  },
  photoCaption: {
    padding: 8,
    fontSize: 12,
    color: '#4b5563',
  },
  deleteHint: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 3,
  },
  deleteHintText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  mainPhotoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  mainPhotoText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
