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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Hero Section
  heroContainer: {
    position: 'relative',
    height: 300,
    backgroundColor: '#1e293b', // Fallback background
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
    padding: 20,
  },
  floatingBackButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  speciesName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
    fontStyle: 'italic',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  commonNames: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 12,
    opacity: 0.95,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  backButton: {
    padding: 4,
  },
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonPrimary: {
    backgroundColor: '#3b82f6',
  },
  actionButtonSecondary: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#1f2937',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  tabTextActive: {
    color: '#3b82f6',
  },
  // Content
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  // Quick Facts
  factGrid: {
    gap: 16,
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 12,
  },
  factIcon: {
    fontSize: 28,
  },
  factContent: {
    flex: 1,
  },
  factLabel: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  factValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Info Rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  infoLabel: {
    fontSize: 15,
    color: '#9ca3af',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    fontStyle: 'italic',
  },
  // Gauges
  gaugeContainer: {
    marginBottom: 16,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gaugeLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e5e7eb',
  },
  gaugeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3b82f6',
  },
  gaugeTrack: {
    height: 10,
    backgroundColor: '#1f2937',
    borderRadius: 5,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  gaugeMinMax: {
    fontSize: 12,
    color: '#6b7280',
  },
  // Stats
  statsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1f2937',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  statValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#3b82f6',
  },
  statLabel: {
    fontSize: 14,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Taxonomy
  taxonomyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  taxonomyLabel: {
    fontSize: 14,
    color: '#9ca3af',
  },
  taxonomyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    fontStyle: 'italic',
  },
  climateSection: {
    gap: 16,
  },
});

export default function SpeciesDetailScreen() {
  const { colors } = useTheme();
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
        <View style={[styles.gaugeHeader]}>
          <Text style={[styles.gaugeLabel]}>{label}</Text>
          <Text style={[styles.gaugeValue]}>{value}{unit}</Text>
        </View>
        <View style={styles.gaugeTrack}>
          <View 
            style={[styles.gaugeFill, { width: `${percentage}%`, backgroundColor: colors.primary }]} 
          />
        </View>
        <View style={styles.gaugeLabels}>
          <Text style={[styles.gaugeMinMax]}>{min}{unit}</Text>
          <Text style={[styles.gaugeMinMax]}>{max}{unit}</Text>
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
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <View style={styles.heroGradient} />
          {species.image_url && (
            <Image source={{ uri: species.image_url }} style={styles.heroImage} resizeMode="cover" />
          )}
          
          {/* Floating Back Button */}
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.floatingBackButton}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>

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
        <View style={[styles.actionBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
            <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
            <Text style={[styles.actionButtonText, { color: '#ffffff' }]}>
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

