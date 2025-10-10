import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { KeeperCardSkeleton, CategoryCardSkeleton } from '../../src/components/CommunitySkeletons';

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

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  thread_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export default function CommunityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'keepers' | 'board'>('keepers');

  useEffect(() => {
    fetchKeepers();
    fetchCategories();
  }, []);

  const fetchKeepers = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`${API_URL}/api/v1/keepers${params}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setKeepers(data);
    } catch (error) {
      // Show empty state - user will see "No keepers found"
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const response = await fetch(`${API_URL}/api/v1/forums/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchKeepers();
    fetchCategories();
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

  if (loading && keepers.length === 0 && categories.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <LinearGradient
          colors={['#0066ff', '#ff0099']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View>
            <Text style={styles.headerTitle}>🌐 Community</Text>
            <Text style={styles.headerSubtitle}>Connect with keepers</Text>
          </View>
        </LinearGradient>

        {/* Skeleton loading */}
        <View style={{ padding: 16 }}>
          {activeTab === 'keepers' ? (
            <>
              <KeeperCardSkeleton />
              <KeeperCardSkeleton />
              <KeeperCardSkeleton />
            </>
          ) : (
            <>
              <CategoryCardSkeleton />
              <CategoryCardSkeleton />
              <CategoryCardSkeleton />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0066ff', '#ff0099']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View>
          <Text style={styles.headerTitle}>🌐 Community</Text>
          <Text style={styles.headerSubtitle}>Connect with keepers</Text>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'keepers' && { ...styles.activeTab, borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('keepers')}
        >
          <MaterialCommunityIcons 
            name="account-group" 
            size={20} 
            color={activeTab === 'keepers' ? colors.primary : colors.textSecondary} 
          />
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'keepers' && { color: colors.primary }]}>
            Keepers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'board' && { ...styles.activeTab, borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('board')}
        >
          <MaterialCommunityIcons 
            name="message-text" 
            size={20} 
            color={activeTab === 'board' ? colors.primary : colors.textSecondary} 
          />
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'board' && { color: colors.primary }]}>
            Message Board
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'keepers' ? (
        <>
          {/* Search Bar */}
          <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={24} color={colors.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search keepers..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); fetchKeepers(); }}>
                <MaterialCommunityIcons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Keeper List */}
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
          >
            {keepers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No keepers found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
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
                      style={[styles.keeperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push(`/community/${keeper.username}`)}
                    >
                      <View style={styles.keeperHeader}>
                        <View style={styles.avatarContainer}>
                          {keeper.avatar_url ? (
                            <Image source={{ uri: keeper.avatar_url }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                              <Text style={styles.avatarEmoji}>🕷️</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.keeperInfo}>
                          <Text style={[styles.keeperName, { color: colors.textPrimary }]}>{keeper.display_name}</Text>
                          <Text style={[styles.keeperUsername, { color: colors.textTertiary }]}>@{keeper.username}</Text>
                          {keeper.profile_location && (
                            <Text style={[styles.keeperLocation, { color: colors.textSecondary }]}>📍 {keeper.profile_location}</Text>
                          )}
                        </View>
                      </View>

                      {keeper.profile_bio && (
                        <Text style={[styles.keeperBio, { color: colors.textSecondary }]} numberOfLines={2}>
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
                          <View style={[styles.badge, { backgroundColor: colors.border }]}>
                            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                              {keeper.profile_years_keeping}yr{keeper.profile_years_keeping !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        )}
                      </View>

                      {keeper.profile_specialties && keeper.profile_specialties.length > 0 && (
                        <View style={styles.specialties}>
                          {keeper.profile_specialties.slice(0, 3).map((specialty, index) => (
                            <View key={index} style={[styles.specialtyBadge, { backgroundColor: colors.border }]}>
                              <Text style={[styles.specialtyText, { color: colors.textSecondary }]}>{formatSpecialty(specialty)}</Text>
                            </View>
                          ))}
                          {keeper.profile_specialties.length > 3 && (
                            <View style={[styles.specialtyBadge, { backgroundColor: colors.border }]}>
                              <Text style={[styles.specialtyText, { color: colors.textSecondary }]}>+{keeper.profile_specialties.length - 3}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={[styles.viewProfileButton, { borderTopColor: colors.border }]}>
                        <Text style={[styles.viewProfileText, { color: colors.primary }]}>View Profile</Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
          }
        >
          {categories.length === 0 ? (
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonEmoji}>💬</Text>
              <Text style={[styles.comingSoonTitle, { color: colors.textPrimary }]}>No Categories Yet</Text>
              <Text style={[styles.comingSoonSubtitle, { color: colors.textSecondary }]}>Forum categories will appear here once created</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push(`/community/forums/${category.slug}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryHeader}>
                    {category.icon && <Text style={styles.categoryIcon}>{category.icon}</Text>}
                    <Text style={[styles.categoryName, { color: colors.textPrimary }]}>{category.name}</Text>
                  </View>
                  {category.description && (
                    <Text style={[styles.categoryDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                      {category.description}
                    </Text>
                  )}
                  <View style={styles.categoryStats}>
                    <View style={styles.statItem}>
                      <MaterialCommunityIcons name="message-text" size={16} color={colors.primary} />
                      <Text style={[styles.statText, { color: colors.textTertiary }]}>
                        {category.thread_count} threads
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <MaterialCommunityIcons name="chat" size={16} color={colors.primary} />
                      <Text style={[styles.statText, { color: colors.textTertiary }]}>
                        {category.post_count} posts
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
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
    color: '#bfdbfe',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
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
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
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
    marginBottom: 2,
  },
  keeperUsername: {
    fontSize: 14,
    marginBottom: 4,
  },
  keeperLocation: {
    fontSize: 12,
  },
  keeperBio: {
    fontSize: 14,
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
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  specialtyText: {
    fontSize: 11,
    fontWeight: '500',
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  viewProfileText: {
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
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
    marginBottom: 8,
  },
  comingSoonSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  openBoardButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
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
    borderRadius: 12,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  categoryDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  categoryStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
