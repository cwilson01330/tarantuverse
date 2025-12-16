'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

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

export default function ReferralSettingsPage() {
  const router = useRouter();
  const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferredUser[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      router.push('/login');
      return;
    }

    loadReferralData();
  }, [authLoading, isAuthenticated, token]);

  const loadReferralData = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // First try to get referral stats (only works for premium users)
      const statsResponse = await fetch(`${API_URL}/api/v1/referrals/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (statsResponse.status === 403) {
        // User is not premium
        setIsPremium(false);
        setLoading(false);
        return;
      }

      if (statsResponse.ok) {
        setIsPremium(true);
        const statsData = await statsResponse.json();
        setStats(statsData);

        // Load referrals list
        const referralsResponse = await fetch(`${API_URL}/api/v1/referrals/list`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (referralsResponse.ok) {
          const referralsData = await referralsResponse.json();
          setReferrals(referralsData);
        }

        // Load rewards list
        const rewardsResponse = await fetch(`${API_URL}/api/v1/referrals/rewards`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (rewardsResponse.ok) {
          const rewardsData = await rewardsResponse.json();
          setRewards(rewardsData);
        }
      }
    } catch (err) {
      console.error('Failed to load referral data:', err);
      setError('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Non-premium user view
  if (!isPremium) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Refer Friends & Earn Free Months
          </h1>

          <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl p-8 text-white text-center">
            <div className="text-5xl mb-4">🎁</div>
            <h2 className="text-2xl font-bold mb-4">Unlock the Referral Program</h2>
            <p className="text-lg opacity-90 mb-6">
              Upgrade to Premium to start referring friends and earn up to 6 free months of subscription!
            </p>
            <p className="text-sm opacity-75 mb-6">
              For every 5 friends who create accounts using your referral link, you'll earn 1 free month.
            </p>
            <button
              onClick={() => router.push('/pricing')}
              className="bg-white text-purple-600 font-bold px-8 py-3 rounded-lg hover:bg-gray-100 transition"
            >
              View Premium Plans
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Refer Friends & Earn Free Months
        </h1>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Share Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Share Your Referral Link
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Referral Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={stats.referral_link}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={() => copyToClipboard(stats.referral_link)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Or share your code
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-lg">
                    {stats.referral_code}
                  </span>
                  <button
                    onClick={() => copyToClipboard(stats.referral_code)}
                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Copy code
                  </button>
                </div>
              </div>
            </div>

            {/* Progress Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Your Progress
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {stats.total_referrals}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Referrals</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {stats.successful_referrals}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Verified</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-3xl font-bold text-pink-600 dark:text-pink-400">
                    {stats.rewards_earned}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Months Earned</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
                    {stats.rewards_remaining}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Months Available</div>
                </div>
              </div>

              {/* Progress bar */}
              {stats.rewards_remaining > 0 && (
                <div>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>Progress to next reward</span>
                    <span>{stats.next_reward_progress}/5 referrals</span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                      style={{ width: `${(stats.next_reward_progress / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {stats.next_reward_at} more verified referral{stats.next_reward_at !== 1 ? 's' : ''} until your next free month!
                  </p>
                </div>
              )}

              {stats.rewards_remaining === 0 && (
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                  <span className="text-2xl">🎉</span>
                  <p className="text-green-700 dark:text-green-400 font-medium mt-2">
                    You've earned the maximum 6 free months! Thank you for spreading the word!
                  </p>
                </div>
              )}
            </div>

            {/* Referred Users Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Friends You've Referred ({referrals.length})
              </h2>

              {referrals.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-4xl mb-2">👥</p>
                  <p>No referrals yet. Share your link to get started!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                            <span className="text-purple-600 dark:text-purple-400 font-bold">
                              {user.username[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            @{user.username}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Joined {formatDate(user.referred_at)}
                          </div>
                        </div>
                      </div>
                      <div>
                        {user.is_verified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm rounded-full">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-sm rounded-full">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rewards History */}
            {rewards.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Rewards History
                </h2>

                <div className="space-y-3">
                  {rewards.map((reward) => (
                    <div
                      key={reward.id}
                      className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🎁</span>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            1 Free Month
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Milestone: {reward.referral_milestone} referrals
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(reward.free_month_start)} - {formatDate(reward.free_month_end)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Earned {formatDate(reward.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How it works</h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Share your referral link with friends</li>
                <li>• When they create and verify their account, it counts toward your rewards</li>
                <li>• For every 5 verified referrals, you earn 1 free month of subscription</li>
                <li>• You can earn up to 6 free months total (30 referrals)</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
