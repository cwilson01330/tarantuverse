import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

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
  medically_significant_venom?: boolean;
  defensive_behavior?: string;
  lifespan_years_min?: number;
  lifespan_years_max?: number;
  image_url?: string;
  is_verified?: boolean;
  times_kept?: number;
  average_rating?: number;
}

export default function SpeciesDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams();
  const [species, setSpecies] = useState<Species | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    overview: true, // Start with overview expanded
  });

  useEffect(() => {
    fetchSpecies();
  }, [id]);

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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getCareLevel = (level?: string) => {
    switch (level) {
      case 'beginner':
        return { color: '#22c55e', text: 'Beginner', icon: '✓', badge: 'Friendly' };
      case 'intermediate':
        return { color: '#eab308', text: 'Intermediate', icon: '⚠', badge: 'Moderate' };
      case 'advanced':
        return { color: '#f97316', text: 'Advanced', icon: '⚡', badge: 'Challenging' };
      case 'expert':
        return { color: '#ef4444', text: 'Expert Only', icon: '☠', badge: 'Difficult' };
      default:
        return { color: colors.textSecondary, text: 'Unknown', icon: '?', badge: 'Unknown' };
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'terrestrial': return { emoji: '🏜️', label: 'Ground Dweller' };
      case 'arboreal': return { emoji: '🌳', label: 'Tree Dweller' };
      case 'fossorial': return { emoji: '⛰️', label: 'Burrower' };
      default: return { emoji: '🕷️', label: 'Tarantula' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>🕷️</Text>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading species...
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
  const typeInfo = getTypeIcon(species.type);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {species.image_url && (
            <Image source={{ uri: species.image_url }} style={styles.heroImage} resizeMode="cover" />
          )}
          <View style={styles.heroGradient} />

          {/* Floating Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.floatingBackButton}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          {/* Hero Content */}
          <View style={styles.heroContent}>
            <Text style={styles.speciesName}>{species.scientific_name}</Text>
            {species.common_names && species.common_names.length > 0 && (
              <Text style={styles.commonNames}>{species.common_names.join(', ')}</Text>
            )}

            {/* Badges */}
            <View style={styles.badgeContainer}>
              <View style={[styles.badge, { backgroundColor: careLevel.color }]}>
                <Text style={styles.badgeText}>{careLevel.icon} {careLevel.text}</Text>
              </View>
              {species.type && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeText}>{typeInfo.emoji} {species.type}</Text>
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

        {/* Content */}
        <View style={{ padding: 16 }}>

          {/* Safety Warnings (if applicable) */}
          {(species.urticating_hairs || species.medically_significant_venom) && (
            <View style={{ marginBottom: 20 }}>
              {species.medically_significant_venom && (
                <View style={[styles.dangerWarning, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <MaterialCommunityIcons name="alert" size={28} color={colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.warningTitle, { color: colors.error }]}>
                        ⚠️ MEDICALLY SIGNIFICANT VENOM
                      </Text>
                      <Text style={[styles.warningText, { color: colors.textPrimary }]}>
                        This species has potent venom. For experienced keepers only.
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {species.urticating_hairs && (
                <View style={[styles.cautionWarning, { backgroundColor: '#f97316' + '20', borderColor: '#f97316', marginTop: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <MaterialCommunityIcons name="alert-circle" size={24} color="#f97316" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.warningTitle, { color: '#f97316' }]}>
                        Urticating Hairs
                      </Text>
                      <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                        Can cause skin/eye irritation
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Quick Stats Card */}
          <View style={[styles.quickStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Stats</Text>
            <View style={styles.statsGrid}>
              {species.adult_size_cm && (
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>📏</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Adult Size</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{species.adult_size_cm} cm</Text>
                </View>
              )}
              {species.growth_rate && (
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>📈</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Growth</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{species.growth_rate}</Text>
                </View>
              )}
              {(species.min_temperature && species.max_temperature) && (
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>🌡️</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Temp</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{species.min_temperature}-{species.max_temperature}°C</Text>
                </View>
              )}
              {(species.min_humidity && species.max_humidity) && (
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>💧</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Humidity</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{species.min_humidity}-{species.max_humidity}%</Text>
                </View>
              )}
            </View>
          </View>

          {/* Accordion Sections */}

          {/* Overview */}
          <AccordionSection
            title="Overview"
            icon="information-circle"
            isExpanded={expandedSections.overview}
            onToggle={() => toggleSection('overview')}
            colors={colors}
          >
            {species.temperament && (
              <InfoRow label="Temperament" value={species.temperament} colors={colors} />
            )}
            {(species.lifespan_years_min || species.lifespan_years_max) && (
              <InfoRow
                label="Lifespan"
                value={`${species.lifespan_years_min}-${species.lifespan_years_max} years`}
                colors={colors}
              />
            )}
            {species.native_region && (
              <InfoRow label="Native Region" value={species.native_region} colors={colors} />
            )}
            {species.genus && (
              <InfoRow label="Genus" value={species.genus} colors={colors} italic />
            )}
            {species.family && (
              <InfoRow label="Family" value={species.family} colors={colors} />
            )}
          </AccordionSection>

          {/* Enclosure Setup */}
          <AccordionSection
            title="Enclosure Setup"
            icon="home"
            isExpanded={expandedSections.enclosure}
            onToggle={() => toggleSection('enclosure')}
            colors={colors}
          >
            {species.enclosure_type && (
              <InfoRow label="Type" value={species.enclosure_type} colors={colors} />
            )}
            {species.substrate_type && (
              <InfoRow label="Substrate" value={species.substrate_type} colors={colors} />
            )}
            {species.substrate_depth_cm && (
              <InfoRow label="Substrate Depth" value={`${species.substrate_depth_cm} cm`} colors={colors} />
            )}
          </AccordionSection>

          {/* Feeding */}
          <AccordionSection
            title="Feeding"
            icon="restaurant"
            isExpanded={expandedSections.feeding}
            onToggle={() => toggleSection('feeding')}
            colors={colors}
          >
            {species.feeding_frequency_days && (
              <InfoRow label="Frequency" value={`Every ${species.feeding_frequency_days} days`} colors={colors} />
            )}
            {species.typical_diet && (
              <InfoRow label="Diet" value={species.typical_diet} colors={colors} />
            )}
          </AccordionSection>

          {/* Behavior */}
          <AccordionSection
            title="Behavior & Safety"
            icon="shield-checkmark"
            isExpanded={expandedSections.behavior}
            onToggle={() => toggleSection('behavior')}
            colors={colors}
          >
            {species.defensive_behavior && (
              <InfoRow label="Defensive Behavior" value={species.defensive_behavior} colors={colors} />
            )}
            <InfoRow
              label="Urticating Hairs"
              value={species.urticating_hairs ? 'Yes (New World)' : 'No (Old World)'}
              colors={colors}
            />
            <InfoRow
              label="Venom"
              value={species.medically_significant_venom ? 'Medically Significant ⚠️' : 'Not significant'}
              colors={colors}
            />
          </AccordionSection>

          {/* Community Stats */}
          <AccordionSection
            title="Community"
            icon="people"
            isExpanded={expandedSections.community}
            onToggle={() => toggleSection('community')}
            colors={colors}
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {species.times_kept !== undefined && (
                <View style={[styles.communityStatCard, { backgroundColor: colors.surfaceElevated, flex: 1 }]}>
                  <Text style={[styles.communityStatValue, { color: colors.primary }]}>{species.times_kept}</Text>
                  <Text style={[styles.communityStatLabel, { color: colors.textSecondary }]}>Keepers</Text>
                </View>
              )}
              {species.average_rating && (
                <View style={[styles.communityStatCard, { backgroundColor: colors.surfaceElevated, flex: 1 }]}>
                  <Text style={[styles.communityStatValue, { color: '#eab308' }]}>⭐ {species.average_rating.toFixed(1)}</Text>
                  <Text style={[styles.communityStatLabel, { color: colors.textSecondary }]}>Rating</Text>
                </View>
              )}
            </View>
          </AccordionSection>

          {/* Bottom Spacing */}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// Accordion Section Component
function AccordionSection({
  title,
  icon,
  isExpanded,
  onToggle,
  colors,
  children
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isExpanded: boolean;
  onToggle: () => void;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.accordionContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.accordionHeader}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={icon} size={24} color={colors.primary} />
          <Text style={[styles.accordionTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={24}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.accordionContent}>
          {children}
        </View>
      )}
    </View>
  );
}

// Info Row Component
function InfoRow({
  label,
  value,
  colors,
  italic = false
}: {
  label: string;
  value: string;
  colors: any;
  italic?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary, fontStyle: italic ? 'italic' : 'normal' }]}>
        {value}
      </Text>
    </View>
  );
}

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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Hero Section
  heroContainer: {
    position: 'relative',
    height: 300,
    backgroundColor: '#1e293b',
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
    height: '70%',
    backgroundColor: 'rgba(0,0,0,0.7)',
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
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Warnings
  dangerWarning: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  cautionWarning: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
  },
  // Quick Stats Card
  quickStatsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
    minWidth: '40%',
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Accordion
  accordionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  accordionContent: {
    padding: 16,
    paddingTop: 0,
  },
  // Info Row
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  // Community Stats
  communityStatCard: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  communityStatValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  communityStatLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
