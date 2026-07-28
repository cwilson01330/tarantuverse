import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { KeeperCardSkeleton, ActivityFeedSkeleton } from '../../src/components/CommunitySkeletons';
import ActivityFeedItem, { ActivityFeedItemData } from '../../src/components/ActivityFeedItem';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

function CommunityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  // NB: a `categories` state + fetchCategories() lived here, left over from
  // when tab two was Forums. Nothing rendered it — it only fed a loading
  // condition. Removed along with its network call.
  const [activities, setActivities] = useState<ActivityFeedItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'keepers' | 'activity'>('keepers');
  const [activityPage, setActivityPage] = useState(1);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);

  useEffect(() => {
    fetchKeepers();
  }, []);

  useEffect(() => {
    if (activeTab === 'activity' && activities.length === 0) {
      fetchActivities(true);
    }
  }, [activeTab]);

  const fetchKeepers = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`${API_URL}/api/v1/keepers/${params}`);
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

  const fetchActivities = async (reset = false) => {
    try {
      setActivityLoading(true);
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com';
      const token = await AsyncStorage.getItem('token');
      const currentPage = reset ? 1 : activityPage;
      
      // Use global feed for now - can switch to personalized if user is logged in
      const endpoint = token ? '/api/v1/activity/feed' : '/api/v1/activity/global';
      
      const response = await fetch(
        `${API_URL}${endpoint}?page=${currentPage}&limit=20`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) throw new Error('Failed to fetch activities');
      
      const data = await response.json();
      
      if (reset) {
        setActivities(data.activities || []);
        setActivityPage(1);
      } else {
        setActivities([...activities, ...(data.activities || [])]);
      }
      
      setHasMoreActivities(data.has_more || false);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadMoreActivities = () => {
    if (!activityLoading && hasMoreActivities) {
      setActivityPage(activityPage + 1);
      fetchActivities();
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'keepers') {
      fetchKeepers();
    } else {
      fetchActivities(true);
    }
    setRefreshing(false);
  };

  const handleSearch = () => {
    fetchKeepers();
  };

  /**
   * Experience badge colours, derived from the theme.
   *
   * These were hardcoded light-mode pairs (#dcfce7 on #166534 and friends)
   * with no theme access, so on the dark background every badge rendered as a
   * pale pastel block — a light-mode component that had never been looked at
   * in dark mode. Tinting the semantic colour at 24/255 alpha gives a badge
   * that reads on either background and follows the theme.
   */
  const getExperienceBadgeColor = (level?: string) => {
    const base =
      level === 'beginner' ? colors.success
        : level === 'intermediate' ? colors.info
          : level === 'advanced' ? colors.primary
            : level === 'expert' ? colors.warning
              : colors.textTertiary;
    return { bg: base + '24', text: base };
  };

  const formatSpecialty = (specialty: string) => {
    return specialty.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Loading gate no longer consults `categories` — this tab hasn't rendered
  // forum categories since tab two became the activity feed, so gating on a
  // list that's always empty made the skeleton depend on a dead variable.
  if (loading && keepers.length === 0 && activities.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ padding: 16 }}>
          {activeTab === 'keepers' ? (
            <>
              <KeeperCardSkeleton />
              <KeeperCardSkeleton />
              <KeeperCardSkeleton />
            </>
          ) : (
            // Was CategoryCardSkeleton — forum-category placeholders standing
            // in for an activity feed, left over from when tab two was Forums.
            // A skeleton that doesn't match what loads is worse than none: it
            // tells the user to expect the wrong thing.
            <>
              <ActivityFeedSkeleton />
              <ActivityFeedSkeleton />
              <ActivityFeedSkeleton />
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          style={[styles.tab, activeTab === 'activity' && { ...styles.activeTab, borderBottomColor: colors.primary }]}
          onPress={() => setActiveTab('activity')}
        >
          <MaterialCommunityIcons 
            name="pulse" 
            size={20} 
            color={activeTab === 'activity' ? colors.primary : colors.textSecondary} 
          />
          <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'activity' && { color: colors.primary }]}>
            Activity Feed
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
                <MaterialCommunityIcons name="account-search-outline" size={48} color={colors.textTertiary} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  {searchQuery ? 'No keepers found' : 'Be the first to go public'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary, marginBottom: 20 }]}>
                  {searchQuery
                    ? 'Try a different search term.'
                    : 'Make your collection public in Settings to connect with other keepers and show off your spiders.'}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity
                    style={[styles.openBoardButton, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/settings')}
                    accessibilityRole="button"
                    accessibilityLabel="Go to settings to make profile public"
                  >
                    <Text style={styles.openBoardButtonText}>Make Profile Public</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.keeperList}>
                {keepers.map((keeper) => {
                  const badgeColor = getExperienceBadgeColor(keeper.profile_experience_level);
                  return (
                    /* Compact row (~88pt) replacing a ~300pt card.
                       The card stacked avatar + name + username + location +
                       2-line bio + experience badge + years badge + up to 4
                       specialty chips + a full-width "View Profile" footer —
                       on a card that was ALREADY tappable, so that footer was
                       pure height restating what tapping already did. Three
                       keepers filled a screen. Full detail lives one tap away
                       at /community/[username]. */
                    <TouchableOpacity
                      key={keeper.id}
                      style={[styles.keeperRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => router.push(`/community/${keeper.username}`)}
                      accessibilityRole="button"
                      accessibilityLabel={[
                        keeper.display_name,
                        `@${keeper.username}`,
                        keeper.profile_experience_level,
                        keeper.profile_location,
                      ].filter(Boolean).join(', ')}
                    >
                      {keeper.avatar_url ? (
                        <Image source={{ uri: keeper.avatar_url }} style={styles.rowAvatar} />
                      ) : (
                        <View style={[styles.rowAvatar, styles.rowAvatarPlaceholder, { backgroundColor: colors.border }]}>
                          <MaterialCommunityIcons name="account" size={22} color={colors.textTertiary} />
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <View style={styles.rowNameLine}>
                          <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {keeper.display_name}
                          </Text>
                          {keeper.profile_experience_level && (
                            <View style={[styles.rowBadge, { backgroundColor: badgeColor.bg }]}>
                              <Text style={[styles.rowBadgeText, { color: badgeColor.text }]}>
                                {keeper.profile_experience_level.charAt(0).toUpperCase() + keeper.profile_experience_level.slice(1)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.rowUsername, { color: colors.textTertiary }]} numberOfLines={1}>
                          @{keeper.username}
                          {keeper.profile_location ? ` · ${keeper.profile_location}` : ''}
                        </Text>
                        {keeper.profile_bio ? (
                          <Text style={[styles.rowBio, { color: colors.textSecondary }]} numberOfLines={1}>
                            {keeper.profile_bio}
                          </Text>
                        ) : null}
                      </View>

                      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        // Activity Feed Tab
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const paddingToBottom = 20;
            if (
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - paddingToBottom
            ) {
              loadMoreActivities();
            }
          }}
          scrollEventThrottle={400}
        >
          {activityLoading && activities.length === 0 ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading activity...
              </Text>
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="pulse" size={48} color={colors.textTertiary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No activity yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary, marginBottom: 20, paddingHorizontal: 24 }]}>
                Follow other keepers to see their feedings, molts, and new tarantulas appear here. Or add your own to start contributing.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                <TouchableOpacity
                  style={[styles.openBoardButton, { backgroundColor: colors.primary, marginBottom: 0 }]}
                  onPress={() => setActiveTab('keepers')}
                  accessibilityRole="button"
                  accessibilityLabel="Browse keepers to follow"
                >
                  <Text style={styles.openBoardButtonText}>Browse Keepers</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.backButton, { borderColor: colors.border }]}
                  onPress={() => router.push('/(tabs)/collection')}
                  accessibilityRole="button"
                  accessibilityLabel="Go to your collection"
                >
                  <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>My Collection</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {activities.map((activity) => (
                <ActivityFeedItem key={activity.id} activity={activity} />
              ))}

              {hasMoreActivities && activityLoading && (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
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
    gap: 8,
  },

  // --- Compact keeper row (replaces keeperCard) ---
  keeperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowAvatar: { width: 44, height: 44, borderRadius: 22 },
  rowAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  rowBadgeText: { fontSize: 10.5, fontWeight: '700' },
  rowUsername: { fontSize: 12, marginTop: 1 },
  rowBio: { fontSize: 12, marginTop: 2 },
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

export default withErrorBoundary(CommunityScreen, 'community');
