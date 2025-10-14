import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus?: string;
  species?: string;
  family?: string;
  care_level?: string;
  temperament?: string;
  native_region?: string;
  adult_size_cm?: number;
  growth_rate?: string;
  type?: string;
  min_temperature?: number;
  max_temperature?: number;
  min_humidity?: number;
  max_humidity?: number;
  enclosure_type?: string;
  substrate_depth_cm?: number;
  substrate_type?: string;
  feeding_frequency_days?: number;
  typical_diet?: string;
  urticating_hairs?: boolean;
  defensive_behavior?: string;
  lifespan_years_min?: number;
  lifespan_years_max?: number;
  image_url?: string;
  is_verified?: boolean;
  times_kept?: number;
  average_rating?: number;
}

interface User {
  is_admin?: boolean;
  is_superuser?: boolean;
  subscription_tier?: string;
}

type TabType = 'overview' | 'husbandry' | 'behavior' | 'stats';

export default function SpeciesDetailScreen() {
  const { colors, isDarkMode } = useTheme();
  const { id } = useLocalSearchParams();
  const [species, setSpecies] = useState<Species | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchSpecies();
    fetchUser();
  }, [id]);

  const fetchUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const fetchSpecies = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/species/${id}`);
      
      if (!response.ok) {
        throw new Error('Species not found');
      }

      const data = await response.json();
      setSpecies(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load species');
    } finally {
      setLoading(false);
    }
  };

  const getCareLevel = (level?: string) => {
    switch (level) {
      case 'beginner':
        return { color: '#10b981', text: 'Beginner Friendly', icon: '🟢' };
      case 'intermediate':
        return { color: '#f59e0b', text: 'Intermediate', icon: '🟡' };
      case 'advanced':
        return { color: '#ef4444', text: 'Advanced', icon: '🔴' };
      default:
        return { color: colors.textSecondary, text: 'Unknown', icon: '⚪' };
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'terrestrial': return '🏜️';
      case 'arboreal': return '🌳';
      case 'fossorial': return '⛰️';
      default: return '🕷️';
    }
  };

  const renderGauge = (value: number, min: number, max: number, label: string, unit: string) => {
    const percentage = ((value - min) / (max - min)) * 100;
    return (
      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeHeader}>
          <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>{label}</Text>
          <Text style={[styles.gaugeValue, { color: colors.textPrimary }]}>{value}{unit}</Text>
        </View>
        <View style={[styles.gaugeTrack, { backgroundColor: isDarkMode ? '#374151' : '#e5e7eb' }]}>
          <View 
            style={[styles.gaugeFill, { width: `${percentage}%`, backgroundColor: colors.primary }]} 
          />
        </View>
        <View style={styles.gaugeLabels}>
          <Text style={[styles.gaugeMinMax, { color: colors.textSecondary }]}>{min}{unit}</Text>
          <Text style={[styles.gaugeMinMax, { color: colors.textSecondary }]}>{max}{unit}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>🕷️</Text>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading species details...
          </Text>
        </View>
      </View>
    );
  }

  if (error || !species) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Species</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.error }]}>Species Not Found</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error || 'The requested species could not be found.'}
          </Text>
        </View>
      </View>
    );
  }

  const careLevel = getCareLevel(species.care_level);
  const typeIcon = getTypeIcon(species.type);
  const canEdit = user && (user.is_admin || user.is_superuser);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 50,
      paddingBottom: 16,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
    },
    backButton: {
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    errorText: {
      fontSize: 16,
      textAlign: 'center',
    },
    heroContainer: {
      height: 300,
      position: 'relative',
    },
    heroGradient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.primary,
      opacity: 0.9,
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.3,
    },
    heroContent: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 20,
    },
    speciesName: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#ffffff',
      marginBottom: 8,
    },
    commonNames: {
      fontSize: 18,
      color: '#ffffff',
      opacity: 0.9,
      marginBottom: 16,
    },
    badgeContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      gap: 6,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#ffffff',
    },
    actionBar: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 8,
      gap: 8,
    },
    actionButtonPrimary: {
      backgroundColor: colors.primary,
    },
    actionButtonSecondary: {
      backgroundColor: isDarkMode ? '#374151' : '#e5e7eb',
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 16,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
    },
    content: {
      flex: 1,
    },
    section: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    factGrid: {
      gap: 16,
    },
    factItem: {
      flexDirection: 'row',
      gap: 12,
    },
    factIcon: {
      fontSize: 24,
    },
    factContent: {
      flex: 1,
    },
    factLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    factValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    taxonomyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    taxonomyLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    taxonomyValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      fontStyle: 'italic',
    },
    statsCard: {
      backgroundColor: isDarkMode ? '#374151' : '#f3f4f6',
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    climateSection: {
      gap: 16,
    },
    infoRow: {
      marginBottom: 16,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    gaugeContainer: {
      marginBottom: 16,
    },
    gaugeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    gaugeLabel: {
      fontSize: 14,
      fontWeight: '500',
    },
    gaugeValue: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    gaugeTrack: {
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
    },
    gaugeFill: {
      height: '100%',
      borderRadius: 5,
    },
    gaugeLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    gaugeMinMax: {
      fontSize: 11,
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <View style={styles.heroGradient} />
          {species.image_url && (
            <Image source={{ uri: species.image_url }} style={styles.heroImage} resizeMode="cover" />
          )}
          <View style={styles.heroContent}>
            <Text style={styles.speciesName}>{species.scientific_name}</Text>
            {species.common_names && species.common_names.length > 0 && (
              <Text style={styles.commonNames}>{species.common_names.join(', ')}</Text>
            )}
            <View style={styles.badgeContainer}>
              <View style={[styles.badge, { backgroundColor: careLevel.color }]}>
                <Text>{careLevel.icon}</Text>
                <Text style={styles.badgeText}>{careLevel.text}</Text>
              </View>
              {species.type && (
                <View style={[styles.badge, { backgroundColor: '#3b82f6' }]}>
                  <Text>{typeIcon}</Text>
                  <Text style={styles.badgeText}>{species.type}</Text>
                </View>
              )}
              {species.is_verified && (
                <View style={[styles.badge, { backgroundColor: '#8b5cf6' }]}>
                  <Text style={styles.badgeText}>✓ Verified</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
            <Ionicons name="add-circle-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>
              Add to Collection
            </Text>
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity 
              style={[styles.actionButton, styles.actionButtonPrimary]}
              onPress={() => router.push(`/species/${id}/edit` as any)}
            >
              <Ionicons name="pencil-outline" size={20} color="#ffffff" />
              <Text style={[styles.actionButtonText, { color: '#ffffff' }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(['overview', 'husbandry', 'behavior', 'stats'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.content}>
          {activeTab === 'overview' && (
            <>
              {/* Quick Facts */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Facts</Text>
                <View style={styles.factGrid}>
                  {species.adult_size_cm && (
                    <View style={styles.factItem}>
                      <Text style={styles.factIcon}>📏</Text>
                      <View style={styles.factContent}>
                        <Text style={styles.factLabel}>Adult Size</Text>
                        <Text style={styles.factValue}>{species.adult_size_cm} cm leg span</Text>
                      </View>
                    </View>
                  )}
                  {species.growth_rate && (
                    <View style={styles.factItem}>
                      <Text style={styles.factIcon}>📈</Text>
                      <View style={styles.factContent}>
                        <Text style={styles.factLabel}>Growth Rate</Text>
                        <Text style={styles.factValue}>{species.growth_rate}</Text>
                      </View>
                    </View>
                  )}
                  {(species.lifespan_years_min || species.lifespan_years_max) && (
                    <View style={styles.factItem}>
                      <Text style={styles.factIcon}>⏳</Text>
                      <View style={styles.factContent}>
                        <Text style={styles.factLabel}>Lifespan</Text>
                        <Text style={styles.factValue}>
                          {species.lifespan_years_min}-{species.lifespan_years_max} years
                        </Text>
                      </View>
                    </View>
                  )}
                  {species.temperament && (
                    <View style={styles.factItem}>
                      <Text style={styles.factIcon}>😊</Text>
                      <View style={styles.factContent}>
                        <Text style={styles.factLabel}>Temperament</Text>
                        <Text style={styles.factValue}>{species.temperament}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Taxonomy */}
              {(species.genus || species.family) && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Taxonomy</Text>
                  {species.genus && (
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>Genus:</Text>
                      <Text style={styles.taxonomyValue}>{species.genus}</Text>
                    </View>
                  )}
                  {species.species && (
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>Species:</Text>
                      <Text style={styles.taxonomyValue}>{species.species}</Text>
                    </View>
                  )}
                  {species.family && (
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>Family:</Text>
                      <Text style={styles.taxonomyValue}>{species.family}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Community Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Community</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {species.times_kept !== undefined && (
                    <View style={[styles.statsCard, { flex: 1 }]}>
                      <Text style={[styles.statValue, { color: colors.primary }]}>
                        {species.times_kept}
                      </Text>
                      <Text style={styles.statLabel}>Keepers</Text>
                    </View>
                  )}
                  {species.average_rating && (
                    <View style={[styles.statsCard, { flex: 1 }]}>
                      <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                        ⭐ {species.average_rating.toFixed(1)}
                      </Text>
                      <Text style={styles.statLabel}>Rating</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}

          {activeTab === 'husbandry' && (
            <>
              {/* Climate Requirements */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🌡️ Climate Requirements</Text>
                <View style={styles.climateSection}>
                  {species.min_temperature && species.max_temperature && (
                    renderGauge(
                      (species.min_temperature + species.max_temperature) / 2,
                      20,
                      32,
                      'Temperature Range',
                      '°C'
                    )
                  )}
                  {species.min_humidity && species.max_humidity && (
                    renderGauge(
                      (species.min_humidity + species.max_humidity) / 2,
                      40,
                      90,
                      'Humidity Range',
                      '%'
                    )
                  )}
                </View>
              </View>

              {/* Enclosure Setup */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏠 Enclosure Setup</Text>
                {species.enclosure_type && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Type</Text>
                    <Text style={styles.infoValue}>{species.enclosure_type}</Text>
                  </View>
                )}
                {species.substrate_type && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Substrate</Text>
                    <Text style={styles.infoValue}>{species.substrate_type}</Text>
                  </View>
                )}
                {species.substrate_depth_cm && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Substrate Depth</Text>
                    <Text style={styles.infoValue}>{species.substrate_depth_cm} cm</Text>
                  </View>
                )}
              </View>

              {/* Feeding Schedule */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🍽️ Feeding Schedule</Text>
                {species.feeding_frequency_days && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Frequency</Text>
                    <Text style={styles.infoValue}>Every {species.feeding_frequency_days} days</Text>
                  </View>
                )}
                {species.typical_diet && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Diet</Text>
                    <Text style={styles.infoValue}>{species.typical_diet}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {activeTab === 'behavior' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🕷️ Behavior & Temperament</Text>
              {species.temperament && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>General Temperament</Text>
                  <Text style={styles.infoValue}>{species.temperament}</Text>
                </View>
              )}
              {species.defensive_behavior && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Defensive Behavior</Text>
                  <Text style={styles.infoValue}>{species.defensive_behavior}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Urticating Hairs</Text>
                <Text style={styles.infoValue}>
                  {species.urticating_hairs ? '✓ Yes' : '✗ No'}
                </Text>
              </View>
            </View>
          )}

          {activeTab === 'stats' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Species Statistics</Text>
              <View style={{ gap: 12 }}>
                <View style={styles.statsCard}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>
                    {species.times_kept || 0}
                  </Text>
                  <Text style={styles.statLabel}>Total Keepers</Text>
                </View>
                <View style={styles.statsCard}>
                  <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                    {species.average_rating ? species.average_rating.toFixed(1) : 'N/A'}
                  </Text>
                  <Text style={styles.statLabel}>Average Rating</Text>
                </View>
                <View style={styles.statsCard}>
                  <Text style={[styles.statValue, { color: '#10b981' }]}>
                    {careLevel.text}
                  </Text>
                  <Text style={styles.statLabel}>Care Level</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
