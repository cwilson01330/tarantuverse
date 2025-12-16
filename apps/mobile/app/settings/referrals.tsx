import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiClient } from '../../src/services/api';

interface ReferralStats {
  referral_code: string;
  referral_link: string;
  total_referrals: number;
  successful_referrals: number;
  rewards_earned: number;
  rewards_remaining: number;
  next_reward_at: number;
  next_reward_progress: number;
}

interface ReferredUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  referred_at: string;
  is_verified: boolean;
}

interface ReferralReward {
  id: string;
  referral_milestone: number;
  free_month_start: string;
  free_month_end: string;
  created_at: string;
}

export default function ReferralScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferredUser[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadReferralData();
  }, []);

  const loadReferralData = async () => {
    try {
      // First try to get referral stats (only works for premium users)
      const statsResponse = await apiClient.get('/referrals/stats');
      setIsPremium(true);
      setStats(statsResponse.data);

      // Load referrals list
      const referralsResponse = await apiClient.get('/referrals/list');
      setReferrals(referralsResponse.data);

      // Load rewards list
      const rewardsResponse = await apiClient.get('/referrals/rewards');
      setRewards(rewardsResponse.data);
    } catch (error: any) {
      if (error.response?.status === 403) {
        setIsPremium(false);
      } else {
        console.error('Failed to load referral data:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('Copied!', 'Referral link copied to clipboard');
  };

  const shareReferralLink = async () => {
    if (!stats) return;

    try {
      await Share.share({
        message: `Join me on Tarantuverse! Use my referral code ${stats.referral_code} when signing up: ${stats.referral_link}`,
        title: 'Join Tarantuverse',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    upgradeCard: {
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
    },
    upgradeEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    upgradeTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: 'white',
      marginBottom: 8,
      textAlign: 'center',
    },
    upgradeText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      marginBottom: 16,
    },
    upgradeButton: {
      backgroundColor: 'white',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    upgradeButtonText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    codeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    codeText: {
      fontSize: 20,
      fontWeight: '700',
      fontFamily: 'monospace',
      color: colors.primary,
    },
    copyButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
    },
    copyButtonText: {
      color: 'white',
      fontWeight: '600',
      fontSize: 14,
    },
    shareButton: {
      borderRadius: 8,
      overflow: 'hidden',
    },
    shareButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    shareButtonText: {
      color: 'white',
      fontWeight: '700',
      fontSize: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    statItem: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
    },
    statLabel: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
    progressContainer: {
      marginTop: 8,
    },
    progressLabel: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    progressText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    progressBar: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressHint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 8,
    },
    maxRewardsBanner: {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      borderRadius: 8,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    maxRewardsText: {
      flex: 1,
      fontSize: 13,
      color: '#22c55e',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyEmoji: {
      fontSize: 40,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    referralItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    referralInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
    },
    referralName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    referralDate: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeVerified: {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
    },
    badgePending: {
      backgroundColor: 'rgba(234, 179, 8, 0.1)',
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    rewardItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    rewardInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rewardEmoji: {
      fontSize: 24,
    },
    rewardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rewardMilestone: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    rewardDates: {
      alignItems: 'flex-end',
    },
    rewardPeriod: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    rewardEarned: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    howItWorks: {
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    howItWorksTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    howItWorksItem: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Refer Friends</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Refer Friends</Text>
        </View>
        <View style={styles.content}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.upgradeCard}
          >
            <Text style={styles.upgradeEmoji}>🎁</Text>
            <Text style={styles.upgradeTitle}>Unlock the Referral Program</Text>
            <Text style={styles.upgradeText}>
              Upgrade to Premium to start referring friends and earn up to 6 free months of subscription!
            </Text>
            <Text style={[styles.upgradeText, { fontSize: 12 }]}>
              For every 5 friends who create accounts, you'll earn 1 free month.
            </Text>
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/pricing' as any)}
            >
              <Text style={styles.upgradeButtonText}>View Premium Plans</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer Friends</Text>
      </View>

      <ScrollView style={styles.content}>
        {stats && (
          <>
            {/* Share Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your Referral Code</Text>
              <View style={styles.codeContainer}>
                <Text style={styles.codeText}>{stats.referral_code}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => copyToClipboard(stats.referral_link)}
                >
                  <Text style={styles.copyButtonText}>{copied ? 'Copied!' : 'Copy Link'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.shareButton} onPress={shareReferralLink}>
                <LinearGradient
                  colors={[colors.primary, colors.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shareButtonGradient}
                >
                  <MaterialCommunityIcons name="share-variant" size={20} color="white" />
                  <Text style={styles.shareButtonText}>Share with Friends</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Progress Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your Progress</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>
                    {stats.total_referrals}
                  </Text>
                  <Text style={styles.statLabel}>Total Referrals</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#22c55e' }]}>
                    {stats.successful_referrals}
                  </Text>
                  <Text style={styles.statLabel}>Verified</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.secondary }]}>
                    {stats.rewards_earned}
                  </Text>
                  <Text style={styles.statLabel}>Months Earned</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.textTertiary }]}>
                    {stats.rewards_remaining}
                  </Text>
                  <Text style={styles.statLabel}>Available</Text>
                </View>
              </View>

              {stats.rewards_remaining > 0 ? (
                <View style={styles.progressContainer}>
                  <View style={styles.progressLabel}>
                    <Text style={styles.progressText}>Progress to next reward</Text>
                    <Text style={styles.progressText}>{stats.next_reward_progress}/5</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <LinearGradient
                      colors={[colors.primary, colors.secondary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.progressFill,
                        { width: `${(stats.next_reward_progress / 5) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressHint}>
                    {stats.next_reward_at} more verified referral{stats.next_reward_at !== 1 ? 's' : ''} until your next free month!
                  </Text>
                </View>
              ) : (
                <View style={styles.maxRewardsBanner}>
                  <Text style={{ fontSize: 20 }}>🎉</Text>
                  <Text style={styles.maxRewardsText}>
                    You've earned the maximum 6 free months! Thank you for spreading the word!
                  </Text>
                </View>
              )}
            </View>

            {/* Referred Users */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Friends You've Referred ({referrals.length})</Text>
              {referrals.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>👥</Text>
                  <Text style={styles.emptyText}>No referrals yet. Share your link!</Text>
                </View>
              ) : (
                referrals.map((user) => (
                  <View key={user.id} style={styles.referralItem}>
                    <View style={styles.referralInfo}>
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{user.username[0].toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={styles.referralName}>@{user.username}</Text>
                        <Text style={styles.referralDate}>Joined {formatDate(user.referred_at)}</Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        user.is_verified ? styles.badgeVerified : styles.badgePending,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={user.is_verified ? 'check-circle' : 'clock-outline'}
                        size={14}
                        color={user.is_verified ? '#22c55e' : '#eab308'}
                      />
                      <Text
                        style={[
                          styles.badgeText,
                          { color: user.is_verified ? '#22c55e' : '#eab308' },
                        ]}
                      >
                        {user.is_verified ? 'Verified' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Rewards History */}
            {rewards.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rewards History</Text>
                {rewards.map((reward) => (
                  <LinearGradient
                    key={reward.id}
                    colors={[colors.primary + '10', colors.secondary + '10']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.rewardItem}
                  >
                    <View style={styles.rewardInfo}>
                      <Text style={styles.rewardEmoji}>🎁</Text>
                      <View>
                        <Text style={styles.rewardTitle}>1 Free Month</Text>
                        <Text style={styles.rewardMilestone}>
                          Milestone: {reward.referral_milestone} referrals
                        </Text>
                      </View>
                    </View>
                    <View style={styles.rewardDates}>
                      <Text style={styles.rewardPeriod}>
                        {formatDate(reward.free_month_start)}
                      </Text>
                      <Text style={styles.rewardEarned}>
                        Earned {formatDate(reward.created_at)}
                      </Text>
                    </View>
                  </LinearGradient>
                ))}
              </View>
            )}

            {/* How it works */}
            <View style={styles.howItWorks}>
              <Text style={styles.howItWorksTitle}>How it works</Text>
              <Text style={styles.howItWorksItem}>• Share your referral link with friends</Text>
              <Text style={styles.howItWorksItem}>
                • When they create and verify their account, it counts toward your rewards
              </Text>
              <Text style={styles.howItWorksItem}>
                • For every 5 verified referrals, you earn 1 free month
              </Text>
              <Text style={styles.howItWorksItem}>
                • You can earn up to 6 free months total (30 referrals)
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
