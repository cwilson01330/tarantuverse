import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, RefreshControl, Image, FlatList } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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

  const getCareColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return { bg: '#10b98120', text: '#10b981' };
      case 'intermediate':
        return { bg: '#f59e0b20', text: '#f59e0b' };
      case 'advanced':
        return { bg: '#ef444420', text: '#ef4444' };
      default:
        return { bg: colors.border, text: colors.textSecondary };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'terrestrial':
        return '🏜️';
      case 'arboreal':
        return '🌳';
      case 'fossorial':
        return '⛰️';
      default:
        return '🕷️';
    }
  };

  const renderSpeciesCard = ({ item }: { item: Species }) => {
    const careColors = getCareColor(item.care_level);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/species/${item.id}` as any)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {/* Image */}
        <View style={[styles.imageContainer, { backgroundColor: colors.border }]}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderEmoji}>{getTypeIcon(item.type)}</Text>
            </View>
          )}
          {item.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.scientificName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.scientific_name}
          </Text>
          {item.common_names && item.common_names.length > 0 && (
            <Text style={[styles.commonName, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.common_names[0]}
            </Text>
          )}

          <View style={styles.tags}>
            <View style={[styles.tag, { backgroundColor: careColors.bg }]}>
              <Text style={[styles.tagText, { color: careColors.text }]}>{item.care_level}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                {getTypeIcon(item.type)} {item.type}
              </Text>
            </View>
          </View>

          {item.adult_size_cm && (
            <Text style={[styles.sizeText, { color: colors.textSecondary }]}>
              Size: {item.adult_size_cm} cm
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      padding: 16,
      paddingTop: 50,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 26,
      fontWeight: 'bold',
      marginBottom: 4,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 10,
      marginHorizontal: 16,
      marginTop: 10,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
    },
    filterContainer: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    filterChip: {
      height: 36,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    filterChipText: {
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 16,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    resultCount: {
      paddingHorizontal: 16,
      marginTop: 16,
      marginBottom: 20,
      fontSize: 14,
      color: colors.textSecondary,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    card: {
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
      borderWidth: 1,
    },
    imageContainer: {
      height: 180,
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
      fontSize: 64,
    },
    verifiedBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10b98140',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
    },
    verifiedText: {
      color: '#10b981',
      fontSize: 12,
      fontWeight: '600',
    },
    cardContent: {
      padding: 12,
    },
    scientificName: {
      fontSize: 18,
      fontWeight: '600',
      fontStyle: 'italic',
      marginBottom: 4,
    },
    commonName: {
      fontSize: 14,
      marginBottom: 8,
    },
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    tag: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    tagText: {
      fontSize: 12,
      fontWeight: '600',
    },
    sizeText: {
      fontSize: 12,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
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
      color: colors.textPrimary,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Loading...</Text>
      </View>
    );
  }

  const ListHeader = () => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Species Database</Text>
        <Text style={styles.subtitle}>Browse care guides for tarantula species</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search species..."
          placeholderTextColor={colors.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {/* Filter Chips */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {(['all', 'beginner', 'intermediate', 'advanced'] as const).map(filter => (
          <TouchableOpacity
            key={filter}
            onPress={() => setSelectedFilter(filter)}
            style={[
              styles.filterChip,
              {
                backgroundColor: selectedFilter === filter ? '#f97316' : '#1e293b',
                borderColor: selectedFilter === filter ? '#f97316' : '#374151',
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.filterChipText,
                { color: selectedFilter === filter ? '#ffffff' : '#e5e7eb' },
              ]}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results Count */}
      <Text style={styles.resultCount}>
        {filteredSpecies.length} species found
      </Text>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Species List */}
      {filteredSpecies.length === 0 ? (
        <>
          <ListHeader />
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyTitle}>No species found</Text>
            <Text style={styles.emptyText}>Try adjusting your search or filters</Text>
          </View>
        </>
      ) : (
        <FlatList
          data={filteredSpecies}
          renderItem={renderSpeciesCard}
          keyExtractor={item => item.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}
