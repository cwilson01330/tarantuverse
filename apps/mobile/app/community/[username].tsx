import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, Linking, Alert, ActionSheetIOS, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import ReportModal from '../../src/components/ReportModal';
import { apiClient } from '../../src/services/api';
import { socialUrl } from '../../src/utils/social-links';

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
    tiktok?: string;
    facebook?: string;
    morphmarket?: string;
    arachnoboards?: string;
  };
  collection_visibility: string;
}

interface Tarantula {
  id: string;
  name: string;
  // The keeper collection endpoint returns full TarantulaResponse, so
  // common_name and scientific_name are both available here. We use
  // them as fallbacks when pet name is missing — otherwise the card
  // would render as a blank title with just the sex badge.
  common_name?: string;
  scientific_name?: string;
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
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

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
  const [isBlocked, setIsBlocked] = useState(false);

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
        checkBlockStatus();
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

  const checkBlockStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token || !profile?.id) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/blocks/check/${profile.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsBlocked(data.you_blocked_them);
      }
    } catch (error) {
      // Silently fail
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
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Unblock ${profile.display_name}?`
        : `Block ${profile.display_name}? They will no longer be able to message you and their content will be hidden.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlocking(true);
            try {
              if (isBlocked) {
                // Unblock
                await apiClient.delete(`/blocks/${profile.id}`);
                setIsBlocked(false);
                Alert.alert('User Unblocked', 'You will now see content from this user.');
              } else {
                // Block
                await apiClient.post('/blocks/', {
                  blocked_id: profile.id,
                  reason: 'Blocked from profile',
                });
                setIsBlocked(true);
                Alert.alert('User Blocked', 'You will no longer see content from this user.', [
                  { text: 'OK', onPress: () => router.back() }
                ]);
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to update block status');
            } finally {
              setBlocking(false);
            }
          },
        },
      ]
    );
  };

  const handleMessage = async () => {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }
    router.push(`/messages/${username}`);
  };

  // Overflow menu replaces the standalone Block / Report buttons. Uses
  // the platform-native sheet on iOS and Alert.alert on Android so the
  // destructive "Block" action gets the right visual weight everywhere.
  const handleOverflowMenu = () => {
    const blockLabel = isBlocked ? 'Unblock User' : 'Block User';
    const reportLabel = 'Report User';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [blockLabel, reportLabel, 'Cancel'],
          destructiveButtonIndex: isBlocked ? undefined : 0,
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) handleBlockUser();
          else if (buttonIndex === 1) setReportModalVisible(true);
        },
      );
    } else {
      Alert.alert('Profile options', undefined, [
        {
          text: blockLabel,
          onPress: handleBlockUser,
          style: isBlocked ? 'default' : 'destructive',
        },
        { text: reportLabel, onPress: () => setReportModalVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Tapping a tarantula card takes the visitor to that tarantula's
  // public profile. Uses the existing /tarantula/public/[username]/[name]
  // route. Pet name is URL-encoded to tolerate spaces and special chars.
  const openTarantulaProfile = (tarantula: Tarantula) => {
    const slug = tarantula.name || tarantula.id;
    router.push(`/tarantula/public/${username}/${encodeURIComponent(slug)}` as never);
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

  const isViewingOwnProfile = currentUser && (
    currentUser.username === username ||
    currentUser.email?.split('@')[0] === username
  );

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
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
    },
    backButtonText: {
      fontSize: 16,
      color: colors.primary,
      marginLeft: 4,
      fontWeight: '600',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    iconButton: {
      padding: 8,
    },
    profileHeader: {
      backgroundColor: colors.surface,
      marginBottom: 16,
    },
    headerBackground: {
      height: 140,
    },
    headerGradient: {
      flex: 1,
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
      gap: 8,
      marginBottom: 16,
      width: '100%',
      paddingHorizontal: 20,
      alignItems: 'stretch',
    },
    followButton: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    followButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
    followingButton: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
      shadowOpacity: 0,
      elevation: 0,
    },
    followingButtonText: {
      color: colors.primary,
    },
    messageButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      borderRadius: 12,
    },
    messageButtonText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    overflowButton: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
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
      flexWrap: 'wrap',
      gap: 10,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      width: '100%',
      justifyContent: 'center',
    },
    socialLink: {
      padding: 8,
    },
    socialIconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    statsSection: {
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    statsGroupLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textTertiary,
      marginBottom: 8,
      marginTop: 8,
      letterSpacing: 0.8,
    },
    statsRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    statCell: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    statCellDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginVertical: 8,
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
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
      borderRadius: 14,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
    },
    tarantulaCardPressed: {
      opacity: 0.7,
    },
    tarantulaImageWrap: {
      position: 'relative',
    },
    tarantulaImage: {
      width: '100%',
      height: 140,
    },
    tarantulaPlaceholder: {
      width: '100%',
      height: 140,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sexBadgeOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
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
    errorBackButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 12,
    },
    errorBackButtonText: {
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
          style={styles.errorBackButton}
          onPress={() => router.back()}
        >
          <Text style={styles.errorBackButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badge = getExperienceBadge(profile.profile_experience_level);

  return (
    <>
      <AppHeader
        title={profile.display_name || profile.username}
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.headerBackground}>
            <LinearGradient
              colors={[colors.primary, colors.secondary || colors.accent || colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGradient}
            />
          </View>
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

            {/* Action Buttons - Show for other users */}
            {currentUser && !isViewingOwnProfile && (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.followButton, isFollowing && styles.followingButton]}
                  onPress={handleFollowToggle}
                  accessibilityLabel={isFollowing ? 'Unfollow this keeper' : 'Follow this keeper'}
                >
                  <MaterialCommunityIcons
                    name={isFollowing ? 'account-check' : 'account-plus'}
                    size={18}
                    color={isFollowing ? colors.primary : '#ffffff'}
                  />
                  <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={handleMessage}
                  accessibilityLabel="Send a message"
                >
                  <MaterialCommunityIcons name="message-outline" size={18} color={colors.textPrimary} />
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.overflowButton}
                  onPress={handleOverflowMenu}
                  accessibilityLabel="More profile options"
                >
                  <MaterialCommunityIcons
                    name="dots-horizontal"
                    size={22}
                    color={colors.textSecondary}
                  />
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

            {/* Social Links — brand-colored circles so each platform
                is recognizable at a glance. Any link with a value
                renders; otherwise the whole section collapses. */}
            {profile.social_links && Object.values(profile.social_links).some(v => v) && (
              <View style={styles.socialLinks}>
                {profile.social_links.instagram && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#E1306C' }]}
                    onPress={() => Linking.openURL(socialUrl('instagram', profile.social_links!.instagram)!)}
                    accessibilityLabel="Instagram"
                  >
                    <MaterialCommunityIcons name="instagram" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.youtube && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#FF0000' }]}
                    onPress={() => Linking.openURL(socialUrl('youtube', profile.social_links!.youtube)!)}
                    accessibilityLabel="YouTube"
                  >
                    <MaterialCommunityIcons name="youtube" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.tiktok && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#000000' }]}
                    onPress={() => Linking.openURL(socialUrl('tiktok', profile.social_links!.tiktok)!)}
                    accessibilityLabel="TikTok"
                  >
                    <MaterialCommunityIcons name="music-note" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.facebook && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#1877F2' }]}
                    onPress={() => Linking.openURL(socialUrl('facebook', profile.social_links!.facebook)!)}
                    accessibilityLabel="Facebook"
                  >
                    <MaterialCommunityIcons name="facebook" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.morphmarket && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#F47C1F' }]}
                    onPress={() => Linking.openURL(socialUrl('morphmarket', profile.social_links!.morphmarket)!)}
                    accessibilityLabel="MorphMarket"
                  >
                    <MaterialCommunityIcons name="storefront" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.arachnoboards && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: '#5E3023' }]}
                    onPress={() => Linking.openURL(socialUrl('arachnoboards', profile.social_links!.arachnoboards)!)}
                    accessibilityLabel="Arachnoboards"
                  >
                    <MaterialCommunityIcons name="spider-web" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                {profile.social_links.website && (
                  <TouchableOpacity
                    style={[styles.socialIconButton, { backgroundColor: colors.surfaceRaised || '#374151' }]}
                    onPress={() => Linking.openURL(socialUrl('website', profile.social_links!.website)!)}
                    accessibilityLabel="Website"
                  >
                    <MaterialCommunityIcons name="web" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Stats — grouped into two unified rows instead of six separate cards */}
        {(stats || followStats) && (
          <View style={styles.statsSection}>
            {followStats && (
              <>
                <Text style={styles.statsGroupLabel}>COMMUNITY</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{followStats.followers_count}</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </View>
                  <View style={styles.statCellDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{followStats.following_count}</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </View>
                </View>
              </>
            )}
            {stats && (
              <>
                <Text style={styles.statsGroupLabel}>COLLECTION</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{stats.total_public}</Text>
                    <Text style={styles.statLabel}>Spiders</Text>
                  </View>
                  <View style={styles.statCellDivider} />
                  <View style={styles.statCell}>
                    <Text style={styles.statValue}>{stats.unique_species}</Text>
                    <Text style={styles.statLabel}>Species</Text>
                  </View>
                  <View style={styles.statCellDivider} />
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: '#ec4899' }]}>
                      {stats.sex_distribution.female}
                    </Text>
                    <Text style={styles.statLabel}>♀ Female</Text>
                  </View>
                  <View style={styles.statCellDivider} />
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: '#3b82f6' }]}>
                      {stats.sex_distribution.male}
                    </Text>
                    <Text style={styles.statLabel}>♂ Male</Text>
                  </View>
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
                  <TouchableOpacity
                    key={tarantula.id}
                    style={styles.tarantulaCard}
                    activeOpacity={0.85}
                    onPress={() => openTarantulaProfile(tarantula)}
                    accessibilityRole="link"
                    accessibilityLabel={`View ${tarantula.name} profile`}
                  >
                    <View style={styles.tarantulaImageWrap}>
                      {tarantula.photo_url ? (
                        <Image source={{ uri: tarantula.photo_url }} style={styles.tarantulaImage} />
                      ) : (
                        <View style={styles.tarantulaPlaceholder}>
                          <Text style={styles.tarantulaEmoji}>🕷️</Text>
                        </View>
                      )}
                      {/* Sex badge overlaid on the image corner — frees up
                          the footer for the name + species + age row. */}
                      {tarantula.sex && (
                        <View
                          style={[
                            styles.sexBadgeOverlay,
                            {
                              backgroundColor:
                                tarantula.sex === 'female'
                                  ? '#ec4899'
                                  : tarantula.sex === 'male'
                                    ? '#3b82f6'
                                    : '#9ca3af',
                            },
                          ]}
                        >
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                            {tarantula.sex === 'female'
                              ? '♀'
                              : tarantula.sex === 'male'
                                ? '♂'
                                : '?'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.tarantulaInfo}>
                      {/* Title fallback chain: pet name -> common name
                          -> scientific name -> "Unnamed". This way a
                          nameless sling still shows its species in the
                          primary slot instead of rendering an empty
                          row next to the sex badge. */}
                      <Text style={styles.tarantulaName} numberOfLines={1}>
                        {tarantula.name ||
                          tarantula.common_name ||
                          tarantula.scientific_name ||
                          tarantula.species_name ||
                          'Unnamed'}
                      </Text>
                      {/* Secondary line: show the species only when it
                          adds information (i.e., pet name is set and
                          the species differs). Otherwise we'd be
                          rendering the same string twice. */}
                      {tarantula.name &&
                        (tarantula.common_name ||
                          tarantula.scientific_name ||
                          tarantula.species_name) && (
                          <Text style={styles.tarantulaSpecies} numberOfLines={1}>
                            {tarantula.common_name ||
                              tarantula.scientific_name ||
                              tarantula.species_name}
                          </Text>
                        )}
                      {tarantula.age_months !== undefined && (
                        <View style={styles.tarantulaMeta}>
                          <View style={styles.ageBadge}>
                            <Text style={styles.badgeTextSmall}>{tarantula.age_months}mo</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
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
