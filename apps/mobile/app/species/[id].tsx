import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  CareSheetHero,
  QuickStatsRow,
  SafetyLine,
  CareAccordion,
  CareFact,
  careLevelMeta,
  previewOf,
  shareSpecies,
} from '../../src/components/caresheet';
import { useShortlistToggle } from '../../src/hooks/useShortlistToggle';

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus?: string;
  family?: string;
  care_level?: string;
  temperament?: string;
  native_region?: string;
  adult_size?: string; // "7-8 inches"
  growth_rate?: string;
  type?: string;

  // Temperature/Humidity (matches API field names)
  temperature_min?: number;
  temperature_max?: number;
  humidity_min?: number;
  humidity_max?: number;

  // Enclosure sizes by life stage
  enclosure_size_sling?: string;
  enclosure_size_juvenile?: string;
  enclosure_size_adult?: string;

  // Substrate
  substrate_depth?: string;
  substrate_type?: string;

  // Feeding by life stage
  prey_size?: string;
  feeding_frequency_sling?: string;
  feeding_frequency_juvenile?: string;
  feeding_frequency_adult?: string;

  // Additional care
  water_dish_required?: boolean;
  webbing_amount?: string;
  burrowing?: boolean;

  // Safety
  urticating_hairs?: boolean;
  medically_significant_venom?: boolean;

  // Documentation
  care_guide?: string;
  image_url?: string;
  // Photo credit line — rendered under the hero so CC-BY attribution
  // is visible on the species detail page.
  image_attribution?: string;
  source_url?: string;
  is_verified?: boolean;
  times_kept?: number;
  community_rating?: number;
}

export default function SpeciesDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const [species, setSpecies] = useState<Species | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // `id` is the invert_species id for shortlist purposes — the tarantula
  // catalog is mirrored into invert_species with the same primary key by the
  // ADR-005 backfill, so one shortlist table serves every taxon.
  const { isBookmarked, bookmarkBusy, toggle: toggleBookmark } = useShortlistToggle(
    typeof id === 'string' ? id : undefined,
  );
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    // Enclosure, not overview — it's the section people actually open a care
    // sheet for. The taxonomy/temperament content in Overview is already
    // summarised by the hero and badges above.
    enclosure: true,
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <MaterialCommunityIcons name="spider-web" size={52} color={colors.textTertiary} style={{ marginBottom: 16 }} />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading species...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !species) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
      </SafeAreaView>
    );
  }

  const careLevel = careLevelMeta(species.care_level, colors.textSecondary);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        <CareSheetHero
          imageUrl={species.image_url}
          imageAttribution={species.image_attribution}
          commonName={species.common_names?.[0]}
          scientificName={species.scientific_name}
          isVerified={species.is_verified}
          fallbackIcon="spider"
          badges={[
            { label: careLevel.text, color: careLevel.color },
            ...(species.medically_significant_venom
              ? [{ label: 'Hot venom', color: '#ef4444' }]
              : []),
            ...(species.type ? [{ label: species.type }] : []),
          ]}
          topInset={insets.top}
          onBack={() => router.back()}
          onShare={() =>
            shareSpecies(species.scientific_name, species.common_names?.[0], species.id)
          }
          onToggleBookmark={toggleBookmark}
          isBookmarked={isBookmarked}
          bookmarkBusy={bookmarkBusy}
          colors={colors}
        />

        {/* The CC-BY photo credit moved INTO the header's full-screen photo
            viewer, so it travels with the image rather than sitting under a
            hero that no longer exists. See CareSheetHero. */}

        {/* Content */}
        <View style={{ padding: 16 }}>

          {/* Quick stats — four across, always four slots so the row doesn't
              reflow between species. A missing value shows "—" rather than
              collapsing the column. */}
          <QuickStatsRow
            colors={colors}
            stats={[
              { icon: 'arrow-expand-horizontal', value: species.adult_size, label: 'Size' },
              {
                icon: 'thermometer',
                value:
                  species.temperature_min && species.temperature_max
                    ? `${species.temperature_min}–${species.temperature_max}°F`
                    : null,
                label: 'Temp',
              },
              {
                icon: 'water-percent',
                value:
                  species.humidity_min && species.humidity_max
                    ? `${species.humidity_min}–${species.humidity_max}%`
                    : null,
                label: 'Humidity',
              },
              { icon: 'trending-up', value: species.growth_rate, label: 'Growth' },
            ]}
          />

          {/* Safety — ONE line combining both hazards. This was two stacked
              warning blocks (~150px) repeating what the hero badges and the
              Behavior section already say. */}
          {(species.urticating_hairs || species.medically_significant_venom) && (
            <SafetyLine
              accent={species.medically_significant_venom ? '#ef4444' : '#f97316'}
              title={
                species.medically_significant_venom && species.urticating_hairs
                  ? 'Medically significant venom · Urticating hairs'
                  : species.medically_significant_venom
                  ? 'Medically significant venom'
                  : 'Urticating hairs'
              }
              body={
                species.medically_significant_venom
                  ? 'A bite from this species can require medical attention. Experienced keepers only — check local legality and have a protocol before you buy.'
                  : 'Flicked hairs can cause skin and eye irritation. Wash your hands after working in the enclosure and keep your face clear of it.'
              }
              colors={colors}
            />
          )}

          {/* Accordion Sections */}

          {/* Overview */}
          <CareAccordion
            title="Overview"
            icon="information-circle"
            isExpanded={expandedSections.overview}
            onToggle={() => toggleSection('overview')}
            colors={colors}
            preview={previewOf(species.native_region, species.temperament)}
          >
            {species.temperament && (
              <CareFact label="Temperament" value={species.temperament} colors={colors} />
            )}
            {species.native_region && (
              <CareFact label="Native Region" value={species.native_region} colors={colors} />
            )}
            {species.genus && (
              <CareFact label="Genus" value={species.genus} colors={colors} italic />
            )}
            {species.family && (
              <CareFact label="Family" value={species.family} colors={colors} />
            )}
          </CareAccordion>

          {/* Enclosure Setup */}
          <CareAccordion
            title="Enclosure Setup"
            icon="home"
            isExpanded={expandedSections.enclosure}
            onToggle={() => toggleSection('enclosure')}
            colors={colors}
            preview={previewOf(species.enclosure_size_adult, species.substrate_depth)}
          >
            {species.type && (
              <CareFact label="Type" value={species.type} colors={colors} />
            )}
            {species.enclosure_size_sling && (
              <CareFact label="Sling Enclosure" value={species.enclosure_size_sling} colors={colors} />
            )}
            {species.enclosure_size_juvenile && (
              <CareFact label="Juvenile Enclosure" value={species.enclosure_size_juvenile} colors={colors} />
            )}
            {species.enclosure_size_adult && (
              <CareFact label="Adult Enclosure" value={species.enclosure_size_adult} colors={colors} />
            )}
            {species.substrate_type && (
              <CareFact label="Substrate" value={species.substrate_type} colors={colors} />
            )}
            {species.substrate_depth && (
              <CareFact label="Substrate Depth" value={species.substrate_depth} colors={colors} />
            )}
            {species.water_dish_required !== undefined && (
              <CareFact label="Water Dish" value={species.water_dish_required ? 'Required' : 'Optional'} colors={colors} />
            )}
            {species.webbing_amount && (
              <CareFact label="Webbing Amount" value={species.webbing_amount} colors={colors} />
            )}
            {species.burrowing !== undefined && (
              <CareFact label="Burrowing" value={species.burrowing ? 'Yes' : 'No'} colors={colors} />
            )}
          </CareAccordion>

          {/* Feeding */}
          <CareAccordion
            title="Feeding"
            icon="restaurant"
            isExpanded={expandedSections.feeding}
            onToggle={() => toggleSection('feeding')}
            colors={colors}
            preview={previewOf(
              species.feeding_frequency_adult ? `Adult ${species.feeding_frequency_adult}` : null,
              species.prey_size,
            )}
          >
            {species.prey_size && (
              <CareFact label="Prey Size" value={species.prey_size} colors={colors} />
            )}
            {species.feeding_frequency_sling && (
              <CareFact label="Sling Frequency" value={species.feeding_frequency_sling} colors={colors} />
            )}
            {species.feeding_frequency_juvenile && (
              <CareFact label="Juvenile Frequency" value={species.feeding_frequency_juvenile} colors={colors} />
            )}
            {species.feeding_frequency_adult && (
              <CareFact label="Adult Frequency" value={species.feeding_frequency_adult} colors={colors} />
            )}
          </CareAccordion>

          {/* Behavior */}
          <CareAccordion
            title="Behavior & Safety"
            icon="shield-checkmark"
            isExpanded={expandedSections.behavior}
            onToggle={() => toggleSection('behavior')}
            colors={colors}
            preview={previewOf(
              species.webbing_amount ? `${species.webbing_amount} webbing` : null,
              species.burrowing ? 'Burrows' : null,
            )}
          >
            <CareFact
              label="Urticating Hairs"
              value={species.urticating_hairs ? 'Yes (New World)' : 'No (Old World)'}
              colors={colors}
            />
            <CareFact
              label="Venom"
              value={species.medically_significant_venom ? 'Medically significant' : 'Not significant'}
              colors={colors}
            />
          </CareAccordion>

          {/* Community Stats */}
          <CareAccordion
            title="Community"
            icon="people"
            isExpanded={expandedSections.community}
            onToggle={() => toggleSection('community')}
            colors={colors}
            preview={previewOf(
              species.times_kept ? `${species.times_kept} keepers` : null,
              species.community_rating ? `${species.community_rating.toFixed(1)} rating` : null,
            )}
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {species.times_kept !== undefined && (
                <View style={[styles.communityStatCard, { backgroundColor: colors.surfaceElevated, flex: 1 }]}>
                  <Text style={[styles.communityStatValue, { color: colors.primary }]}>{species.times_kept}</Text>
                  <Text style={[styles.communityStatLabel, { color: colors.textSecondary }]}>Keepers</Text>
                </View>
              )}
              {species.community_rating !== undefined && (
                <View style={[styles.communityStatCard, { backgroundColor: colors.surfaceElevated, flex: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="star" size={15} color="#eab308" />
                    <Text style={[styles.communityStatValue, { color: '#eab308' }]}>{species.community_rating.toFixed(1)}</Text>
                  </View>
                  <Text style={[styles.communityStatLabel, { color: colors.textSecondary }]}>Rating</Text>
                </View>
              )}
            </View>
          </CareAccordion>

          {/* Source Attribution */}
          {species.source_url && (
            <View style={[styles.sourceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="book-open-page-variant" size={14} color={colors.textSecondary} />
                <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>Source</Text>
              </View>
              <Text
                style={[styles.sourceLink, { color: colors.primary }]}
                onPress={() => {
                  import('expo-linking').then(Linking => Linking.default.openURL(species.source_url!));
                }}
              >
                {species.source_url}
              </Text>
            </View>
          )}

          {/* Bottom Spacing — clears the pinned action bar below. */}
          <View style={{ height: 96 }} />
        </View>
      </ScrollView>

      {/* Pinned action bar. The care sheet had no call to action: a keeper who
          decided to buy this species had to back out, find Collection, tap the
          FAB, choose a taxon and retype the name they were just reading. This
          hands the species straight to the add form. */}
      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.actionPrimary, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Add ${species.scientific_name} to your collection`}
          onPress={() =>
            router.push({
              pathname: '/tarantula/add',
              params: {
                speciesId: species.id,
                scientificName: species.scientific_name,
                commonName: species.common_names?.[0] ?? '',
              },
            } as any)
          }
        >
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.actionPrimaryText}>Add to collection</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// The presentational pieces this screen used to define locally —
// QuickStat, AccordionSection, InfoRow, previewOf — now live in
// src/components/caresheet and are shared with the invert care sheet.

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Pinned "Add to collection" bar
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 13,
  },
  actionPrimaryText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#fff',
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
    paddingVertical: 16,
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
  // Quick stats — four across, directly under the hero
  // Consolidated safety line
  // Warnings
  // Quick Stats Card
  // Accordion
  // Info Row
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
  // Source Attribution
  sourceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  sourceLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  sourceLink: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
