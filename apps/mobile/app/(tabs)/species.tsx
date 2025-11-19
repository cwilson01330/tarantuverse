import { View, Text, StyleSheet, TextInput, TouchableOpacity, RefreshControl, Image, FlatList, Dimensions } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with padding

interface Species {
  id: string;
  scientific_name: string;
  common_names: string[];
  genus: string;
  species: string;
  type: string;
  native_region: string | null;
  care_level: string;
  min_temperature: number | null;
  max_temperature: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  adult_size_cm: number | null;
  growth_rate: string | null;
  temperament: string | null;
  is_verified: boolean;
  image_url: string | null;
  urticating_hairs?: boolean;
  medically_significant_venom?: boolean;
}

export default function SpeciesScreen() {
  const { colors } = useTheme();
  const [species, setSpecies] = useState<Species[]>([]);
  const [filteredSpecies, setFilteredSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

  useEffect(() => {
    fetchSpecies();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [species, searchTerm, selectedFilter]);

  const fetchSpecies = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/species`);
      const data = await response.json();
      setSpecies(data);
    } catch (error) {
      console.error('Error fetching species:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSpecies();
  };

  const applyFilters = () => {
    let filtered = [...species];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.scientific_name.toLowerCase().includes(search) ||
          s.common_names?.some(name => name.toLowerCase().includes(search))
      );
    }

    // Care level filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(s => s.care_level === selectedFilter);
    }

    setFilteredSpecies(filtered);
  };

  const getCareLevel = (level: string) => {
    switch (level) {
      case 'beginner':
        return { color: '#22c55e', text: 'Beginner', icon: '✓' };
      case 'intermediate':
        return { color: '#eab308', text: 'Intermediate', icon: '⚠' };
      case 'advanced':
        return { color: '#f97316', text: 'Advanced', icon: '⚡' };
      case 'expert':
        return { color: '#ef4444', text: 'Expert', icon: '☠' };
      default:
        return { color: colors.textSecondary, text: 'Unknown', icon: '?' };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'terrestrial': return '🏜️';
      case 'arboreal': return '🌳';
      case 'fossorial': return '⛰️';
      default: return '🕷️';
    }
  };

  const renderSpeciesCard = ({ item, index }: { item: Species; index: number }) => {
    const careLevel = getCareLevel(item.care_level);
    const typeIcon = getTypeIcon(item.type);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/species/${item.id}` as any)}
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          index % 2 === 0 ? { marginRight: 8 } : { marginLeft: 8 }
        ]}
        activeOpacity={0.8}
      >
        {/* Image with Gradient Overlay */}
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.placeholderImage, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={styles.placeholderEmoji}>{typeIcon}</Text>
            </View>
          )}

          {/* Gradient overlay for better badge visibility */}
          <View style={styles.imageGradient} />

          {/* Top Badges */}
          <View style={styles.topBadges}>
            {item.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
              </View>
            )}
            {item.medically_significant_venom && (
              <View style={[styles.warningBadge, { backgroundColor: '#ef4444' }]}>
                <MaterialCommunityIcons name="alert" size={14} color="#ffffff" />
              </View>
            )}
          </View>

          {/* Care Level Badge */}
          <View style={[styles.careLevelBadge, { backgroundColor: careLevel.color }]}>
            <Text style={styles.careLevelText}>{careLevel.icon}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.commonName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.common_names && item.common_names.length > 0 ? item.common_names[0] : item.scientific_name.split(' ')[1]}
          </Text>
          <Text style={[styles.scientificName, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.scientific_name}
          </Text>

          {/* Quick Info */}
          <View style={styles.quickInfo}>
            <View style={[styles.infoChip, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.infoChipText, { color: colors.textSecondary }]}>
                {typeIcon}
              </Text>
            </View>
            {item.adult_size_cm && (
              <View style={[styles.infoChip, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.infoChipText, { color: colors.textSecondary }]}>
                  {item.adult_size_cm}cm
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const FilterChip = ({ label, value, isActive, onPress }: { label: string; value: string; isActive: boolean; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: isActive ? colors.primary : colors.surfaceElevated,
          borderColor: isActive ? colors.primary : colors.border,
        }
      ]}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.filterChipText,
        { color: isActive ? '#ffffff' : colors.textPrimary }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>🕷️</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Loading species...</Text>
        </View>
      </View>
    );
  }

  const ListHeader = () => (
    <View>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Species Database</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {species.length} tarantula species
        </Text>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surfaceElevated }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search species..."
          placeholderTextColor={colors.textTertiary}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Care Level:</Text>
        <View style={styles.filterChips}>
          <FilterChip
            label="All"
            value="all"
            isActive={selectedFilter === 'all'}
            onPress={() => setSelectedFilter('all')}
          />
          <FilterChip
            label="Beginner"
            value="beginner"
            isActive={selectedFilter === 'beginner'}
            onPress={() => setSelectedFilter('beginner')}
          />
          <FilterChip
            label="Intermediate"
            value="intermediate"
            isActive={selectedFilter === 'intermediate'}
            onPress={() => setSelectedFilter('intermediate')}
          />
          <FilterChip
            label="Advanced"
            value="advanced"
            isActive={selectedFilter === 'advanced'}
            onPress={() => setSelectedFilter('advanced')}
          />
        </View>
      </View>

      {/* Results Count */}
      <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
        {filteredSpecies.length} {filteredSpecies.length === 1 ? 'species' : 'species'} found
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {filteredSpecies.length === 0 && !loading ? (
        <>
          <ListHeader />
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No species found</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Try adjusting your search or filters
            </Text>
          </View>
        </>
      ) : (
        <FlatList
          data={filteredSpecies}
          renderItem={renderSpeciesCard}
          keyExtractor={item => item.id}
          ListHeaderComponent={ListHeader}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  header: {
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  filterContainer: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resultCount: {
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'flex-start',
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    height: 160,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 48,
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  topBadges: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  careLevelBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  careLevelText: {
    fontSize: 14,
    color: '#ffffff',
  },
  cardContent: {
    padding: 12,
  },
  commonName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  scientificName: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  quickInfo: {
    flexDirection: 'row',
    gap: 6,
  },
  infoChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  infoChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
