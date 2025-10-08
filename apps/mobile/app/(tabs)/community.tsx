import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Keeper {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  profile_bio?: string;
  profile_location?: string;
  profile_experience_level?: string;
  profile_years_keeping?: number;
  profile_specialties?: string[];
  collection_visibility: string;
}

export default function CommunityScreen() {
  const router = useRouter();
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'keepers' | 'board'>('keepers');

  useEffect(() => {
    fetchKeepers();
  }, []);

  const fetchKeepers = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`${API_URL}/api/v1/keepers${params}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setKeepers(data);
    } catch (error) {
      console.error('Failed to fetch keepers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchKeepers();
  };

  const handleSearch = () => {
    fetchKeepers();
  };

  const getExperienceBadgeColor = (level?: string) => {
    switch (level) {
      case 'beginner': return { bg: '#dcfce7', text: '#166534' };
      case 'intermediate': return { bg: '#dbeafe', text: '#1e40af' };
      case 'advanced': return { bg: '#f3e8ff', text: '#6b21a8' };
      case 'expert': return { bg: '#fef3c7', text: '#92400e' };
      default: return { bg: '#f3f4f6', text: '#374151' };
    }
  };

  const formatSpecialty = (specialty: string) => {
    return specialty.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (loading && keepers.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingEmoji}>🕷️</Text>
        <Text style={styles.loadingText}>Loading community...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🌐 Community</Text>
          <Text style={styles.headerSubtitle}>Connect with keepers</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'keepers' && styles.activeTab]}
          onPress={() => setActiveTab('keepers')}
        >
          <MaterialCommunityIcons 
            name="account-group" 
            size={20} 
            color={activeTab === 'keepers' ? '#7c3aed' : '#6b7280'} 
          />
          <Text style={[styles.tabText, activeTab === 'keepers' && styles.activeTabText]}>
            Keepers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'board' && styles.activeTab]}
          onPress={() => setActiveTab('board')}
        >
          <MaterialCommunityIcons 
            name="message-text" 
            size={20} 
            color={activeTab === 'board' ? '#7c3aed' : '#6b7280'} 
          />
          <Text style={[styles.tabText, activeTab === 'board' && styles.activeTabText]}>
            Message Board
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'keepers' ? (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={24} color="#9ca3af" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search keepers..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); fetchKeepers(); }}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Keeper List */}
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7c3aed" />
            }
          >
            {keepers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyTitle}>No keepers found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery ? 'Try a different search' : 'Be the first to make your profile public!'}
                </Text>
              </View>
            ) : (
              <View style={styles.keeperList}>
                {keepers.map((keeper) => {
                  const badgeColor = getExperienceBadgeColor(keeper.profile_experience_level);
                  return (
                    <TouchableOpacity
                      key={keeper.id}
                      style={styles.keeperCard}
                      onPress={() => router.push(`/community/${keeper.username}`)}
                    >
                      <View style={styles.keeperHeader}>
                        <View style={styles.avatarContainer}>
                          {keeper.avatar_url ? (
                            <Image source={{ uri: keeper.avatar_url }} style={styles.avatar} />
                          ) : (
                            <View style={styles.avatarPlaceholder}>
                              <Text style={styles.avatarEmoji}>🕷️</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.keeperInfo}>
                          <Text style={styles.keeperName}>{keeper.display_name}</Text>
                          <Text style={styles.keeperUsername}>@{keeper.username}</Text>
                          {keeper.profile_location && (
                            <Text style={styles.keeperLocation}>📍 {keeper.profile_location}</Text>
                          )}
                        </View>
                      </View>

                      {keeper.profile_bio && (
                        <Text style={styles.keeperBio} numberOfLines={2}>
                          {keeper.profile_bio}
                        </Text>
                      )}

                      <View style={styles.keeperMeta}>
                        {keeper.profile_experience_level && (
                          <View style={[styles.badge, { backgroundColor: badgeColor.bg }]}>
                            <Text style={[styles.badgeText, { color: badgeColor.text }]}>
                              {keeper.profile_experience_level.charAt(0).toUpperCase() + keeper.profile_experience_level.slice(1)}
                            </Text>
                          </View>
                        )}
                        {keeper.profile_years_keeping && keeper.profile_years_keeping > 0 && (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                              {keeper.profile_years_keeping}yr{keeper.profile_years_keeping !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>

                      {keeper.profile_specialties && keeper.profile_specialties.length > 0 && (
                        <View style={styles.specialties}>
                          {keeper.profile_specialties.slice(0, 3).map((specialty, index) => (
                            <View key={index} style={styles.specialtyBadge}>
                              <Text style={styles.specialtyText}>{formatSpecialty(specialty)}</Text>
                            </View>
                          ))}
                          {keeper.profile_specialties.length > 3 && (
                            <View style={styles.specialtyBadge}>
                              <Text style={styles.specialtyText}>+{keeper.profile_specialties.length - 3}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.viewProfileButton}>
                        <Text style={styles.viewProfileText}>View Profile</Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#7c3aed" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonEmoji}>💬</Text>
          <Text style={styles.comingSoonTitle}>Message Board</Text>
          <Text style={styles.comingSoonSubtitle}>Share your thoughts with the community!</Text>
          <TouchableOpacity 
            style={styles.openBoardButton}
            onPress={() => router.push('/community/board')}
          >
            <Text style={styles.openBoardButtonText}>Open Message Board</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setActiveTab('keepers')}
          >
            <Text style={styles.backButtonText}>← Back to Keepers</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#7c3aed',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#e9d5ff',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#7c3aed',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#7c3aed',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  keeperList: {
    padding: 16,
    gap: 12,
  },
  keeperCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  keeperHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  keeperInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  keeperName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  keeperUsername: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  keeperLocation: {
    fontSize: 12,
    color: '#9ca3af',
  },
  keeperBio: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 12,
    lineHeight: 20,
  },
  keeperMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  specialties: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  specialtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f3e8ff',
  },
  specialtyText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7c3aed',
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  viewProfileText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: '#6b7280',
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  comingSoonEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  comingSoonSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  openBoardButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  openBoardButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
