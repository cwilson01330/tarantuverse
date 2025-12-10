import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, Linking, Alert, ActionSheetIOS, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/contexts/ThemeContext';
import ReportModal from '../../src/components/ReportModal';
import { apiClient } from '../../src/services/api';

interface KeeperProfile {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  profile_bio?: string;
  profile_location?: string;
  profile_experience_level?: string;
  profile_years_keeping?: number;
  profile_specialties?: string[];
  social_links?: {
    instagram?: string;
    youtube?: string;
    website?: string;
  };
  collection_visibility: string;
}

interface Tarantula {
  id: string;
  name: string;
  species_name?: string;
  sex?: string;
  photo_url?: string;
  age_months?: number;
}

interface Stats {
  username: string;
  total_public: number;
  unique_species: number;
  sex_distribution: {
    male: number;
    female: number;
    unknown: number;
  };
}

interface FollowStats {
  followers_count: number;
  following_count: number;
}

export default function KeeperProfileScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const username = params.username as string;
  const { colors } = useTheme();

  const [profile, setProfile] = useState<KeeperProfile | null>(null);
  const [collection, setCollection] = useState<Tarantula[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'collection' | 'about'>('collection');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [username]);

  const checkAuth = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (userJson) {
        const userData = JSON.parse(userJson);
        setCurrentUser(userData);
        checkFollowingStatus();
      }
    } catch (error) {
      // Silently fail - will show login prompt if needed
    }
  };

  const checkFollowingStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/follows/${username}/is-following`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsFollowing(data.is_following);
      }
    } catch (error) {
      // Silently fail - follow status will default to false
    }
  };

  const fetchData = async () => {
    try {
      await Promise.all([fetchProfile(), fetchCollection(), fetchStats(), fetchFollowStats()]);
    } catch (err) {
      // Errors are handled in individual fetch functions
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const token = await AsyncStorage.getItem('auth_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/`, {
        headers
      });
      if (!response.ok) {
        throw new Error('Profile not found or private');
      }
      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchCollection = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const token = await AsyncStorage.getItem('auth_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/collection/`, {
        headers
      });
      if (response.ok) {
        const data = await response.json();
        setCollection(data);
      }
    } catch (err) {
      // Silently fail - collection is optional
    }
  };

  const fetchStats = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const token = await AsyncStorage.getItem('auth_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/v1/keepers/${username}/stats/`, {
        headers
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      // Silently fail - stats are optional
    }
  };

  const fetchFollowStats = async () => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/follows/${username}/stats`);
      if (response.ok) {
        const data = await response.json();
        setFollowStats(data);
      }
    } catch (error) {
      // Silently fail - follow stats are optional
    }
  };

  const handleFollowToggle = async () => {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const method = isFollowing ? 'DELETE' : 'POST';
      const response = await fetch(`${API_URL}/api/v1/follows/${username}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setIsFollowing(!isFollowing);
        fetchFollowStats();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const handleBlockUser = async () => {
    if (blocking || !profile) return;

    Alert.alert(
      'Block User',
      `Block ${profile.display_name}? They will no longer be able to message you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              await apiClient.post('/blocks/', {
                blocked_id: profile.id,
                reason: 'Blocked from profile',
              });
              Alert.alert('User Blocked', 'You will no longer see content from this user.', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to block user');
            } finally {
              setBlocking(false);
            }
          },
        },
      ]
    );
  };

  const showActions = () => {
    if (!profile) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Report User', 'Block User'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            setReportModalVisible(true);
          } else if (buttonIndex === 2) {
            handleBlockUser();
          }
        }
      );
    } else {
      Alert.alert(
        'Actions',
        '',
        [
          { text: 'Report User', onPress: () => setReportModalVisible(true) },
          { text: 'Block User', onPress: handleBlockUser, style: 'destructive' },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleMessage = async () => {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }
    router.push(`/messages/${username}`);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getExperienceBadge = (level?: string) => {
    const badges = {
      beginner: { label: 'Beginner', bg: '#dcfce7', text: '#166534' },
      intermediate: { label: 'Intermediate', bg: '#dbeafe', text: '#1e40af' },
      advanced: { label: 'Advanced', bg: '#f3e8ff', text: '#6b21a8' },
      expert: { label: 'Expert', bg: '#fef3c7', text: '#92400e' }
    };
    return badges[level as keyof typeof badges] || { label: level, bg: '#f3f4f6', text: '#374151' };
  };

  const formatSpecialty = (specialty: string) => {
    return specialty.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 32,
    },
    profileHeader: {
      backgroundColor: colors.surface,
      marginBottom: 16,
    },
    headerBackground: {
      height: 120,
      backgroundColor: colors.primary,
    },
    profileContent: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    avatarSection: {
      marginTop: -56,
      marginBottom: 16,
    },
    avatar: {
      width: 112,
      height: 112,
      borderRadius: 56,
      borderWidth: 4,
      borderColor: colors.surface,
    },
    avatarPlaceholder: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: colors.surface,
    },
    avatarEmoji: {
      fontSize: 48,
    },
    displayName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    username: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
      width: '100%',
      paddingHorizontal: 20,
    },
    followButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 12,
    },
    followButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    followingButton: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    followingButtonText: {
      color: colors.primary,
    },
    messageButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 12,
    },
    messageButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    profileInfo: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 16,
    },
    infoBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.border,
    },
    infoBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    specialtiesSection: {
      width: '100%',
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textTertiary,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    specialties: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    specialtyBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.primary + '33',
    },
    specialtyText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.primary,
    },
    socialLinks: {
      flexDirection: 'row',
      gap: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      width: '100%',
      justifyContent: 'center',
    },
    socialLink: {
      padding: 8,
    },
    statsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    statCard: {
      minWidth: '30%',
      maxWidth: '48%',
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 16,
      alignItems: 'center',
    },
    activeTab: {
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    activeTabText: {
      color: colors.primary,
    },
    tabContent: {
      padding: 16,
    },
    collectionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    tarantulaCard: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    tarantulaImage: {
      width: '100%',
      height: 120,
    },
    tarantulaPlaceholder: {
      width: '100%',
      height: 120,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tarantulaEmoji: {
      fontSize: 40,
    },
    tarantulaInfo: {
      padding: 12,
    },
    tarantulaName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    tarantulaSpecies: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 8,
    },
    tarantulaMeta: {
      flexDirection: 'row',
      gap: 4,
    },
    tarantulaBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    femaleBadge: {
      backgroundColor: '#fce7f3',
    },
    maleBadge: {
      backgroundColor: '#dbeafe',
    },
    unknownBadge: {
      backgroundColor: colors.border,
    },
    ageBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    badgeTextSmall: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    aboutContent: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
    },
    bioText: {
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    loadingEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    loadingText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    errorEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    backButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 12,
    },
    backButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingEmoji}>🕷️</Text>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorEmoji}>🔒</Text>
        <Text style={styles.errorTitle}>Profile Not Available</Text>
        <Text style={styles.errorText}>{error || 'Keeper not found'}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badge = getExperienceBadge(profile.profile_experience_level);

  return (
    <>
      <Stack.Screen
        options={{
          title: profile.display_name,
          headerBackTitle: 'Community',
          headerRight: () => (
            <TouchableOpacity onPress={showActions} style={{ marginRight: 8 }}>
              <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.headerBackground} />
          <View style={styles.profileContent}>
            <View style={styles.avatarSection}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarEmoji}>🕷️</Text>
                </View>
              )}
            </View>

            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>

            {/* Action Buttons */}
            {currentUser && currentUser.username !== username && (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.followButton, isFollowing && styles.followingButton]}
                  onPress={handleFollowToggle}
                >
                  <MaterialCommunityIcons
                    name={isFollowing ? "account-check" : "account-plus"}
                    size={20}
                    color={isFollowing ? colors.primary : "#ffffff"}
                  />
                  <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                  <MaterialCommunityIcons name="message" size={20} color={colors.primary} />
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Profile Info */}
            <View style={styles.profileInfo}>
              <View style={[styles.infoBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.infoBadgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>

              {profile.profile_location && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>📍 {profile.profile_location}</Text>
                </View>
              )}

              {profile.profile_years_keeping && (
                <View style={styles.infoBadge}>
                  <Text style={styles.infoBadgeText}>
                    🕰️ {profile.profile_years_keeping} {profile.profile_years_keeping === 1 ? 'year' : 'years'}
                  </Text>
                </View>
              )}
            </View>

            {/* Specialties */}
            {profile.profile_specialties && profile.profile_specialties.length > 0 && (
              <View style={styles.specialtiesSection}>
                <Text style={styles.sectionLabel}>SPECIALTIES</Text>
                <View style={styles.specialties}>
                  {profile.profile_specialties.map((specialty, index) => (
                    <View key={index} style={styles.specialtyBadge}>
                      <Text style={styles.specialtyText}>{formatSpecialty(specialty)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Social Links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <View style={styles.socialLinks}>
                {profile.social_links.instagram && (
                  <TouchableOpacity
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(profile.social_links!.instagram!)}
                  >
                    <MaterialCommunityIcons name="instagram" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )}
                {profile.social_links.youtube && (
                  <TouchableOpacity
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(profile.social_links!.youtube!)}
                  >
                    <MaterialCommunityIcons name="youtube" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )}
                {profile.social_links.website && (
                  <TouchableOpacity
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(profile.social_links!.website!)}
                  >
                    <MaterialCommunityIcons name="web" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        {(stats || followStats) && (
          <View style={styles.statsContainer}>
            {followStats && (
              <>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{followStats.followers_count}</Text>
                  <Text style={styles.statLabel}>Followers</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{followStats.following_count}</Text>
                  <Text style={styles.statLabel}>Following</Text>
                </View>
              </>
            )}
            {stats && (
              <>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.total_public}</Text>
                  <Text style={styles.statLabel}>Tarantulas</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.unique_species}</Text>
                  <Text style={styles.statLabel}>Species</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.sex_distribution.female}</Text>
                  <Text style={styles.statLabel}>Females</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{stats.sex_distribution.male}</Text>
                  <Text style={styles.statLabel}>Males</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'collection' && styles.activeTab]}
            onPress={() => setActiveTab('collection')}
          >
            <Text style={[styles.tabText, activeTab === 'collection' && styles.activeTabText]}>
              Collection ({collection.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'about' && styles.activeTab]}
            onPress={() => setActiveTab('about')}
          >
            <Text style={[styles.tabText, activeTab === 'about' && styles.activeTabText]}>
              About
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'collection' ? (
            collection.length > 0 ? (
              <View style={styles.collectionGrid}>
                {collection.map((tarantula) => (
                  <View key={tarantula.id} style={styles.tarantulaCard}>
                    {tarantula.photo_url ? (
                      <Image source={{ uri: tarantula.photo_url }} style={styles.tarantulaImage} />
                    ) : (
                      <View style={styles.tarantulaPlaceholder}>
                        <Text style={styles.tarantulaEmoji}>🕷️</Text>
                      </View>
                    )}
                    <View style={styles.tarantulaInfo}>
                      <Text style={styles.tarantulaName} numberOfLines={1}>{tarantula.name}</Text>
                      {tarantula.species_name && (
                        <Text style={styles.tarantulaSpecies} numberOfLines={1}>{tarantula.species_name}</Text>
                      )}
                      <View style={styles.tarantulaMeta}>
                        {tarantula.sex && (
                          <View style={[
                            styles.tarantulaBadge,
                            tarantula.sex === 'female' ? styles.femaleBadge :
                              tarantula.sex === 'male' ? styles.maleBadge : styles.unknownBadge
                          ]}>
                            <Text style={styles.badgeTextSmall}>
                              {tarantula.sex === 'female' ? '♀' : tarantula.sex === 'male' ? '♂' : '?'}
                            </Text>
                          </View>
                        )}
                        {tarantula.age_months !== undefined && (
                          <View style={styles.ageBadge}>
                            <Text style={styles.badgeTextSmall}>{tarantula.age_months}mo</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📦</Text>
                <Text style={styles.emptyText}>No public tarantulas</Text>
              </View>
            )
          ) : (
            <View style={styles.aboutContent}>
              {profile.profile_bio ? (
                <Text style={styles.bioText}>{profile.profile_bio}</Text>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No bio added yet</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Report Modal */}
      {profile && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reportType="user_profile"
          contentId={profile.id.toString()}
          reportedUserId={profile.id.toString()}
        />
      )}
    </>
  );
}
