'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/stores/themeStore';
import DashboardLayout from '@/components/DashboardLayout';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useThemeStore();
  const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string>('');
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [subscriptionLimits, setSubscriptionLimits] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      router.push('/login');
      return;
    }

    fetchUser();
  }, [authLoading, isAuthenticated, token]);

  const fetchUser = async () => {
    try {
      if (!token) {
        setAuthError('No authentication found. Please log in.');
        router.push('/login');
        return;
      }

      // Fetch fresh user data from API to ensure accuracy
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user profile');
        }

        const userData = await response.json();
        setUser(userData);
        setAuthError('');

        // Fetch subscription limits
        const limitsResponse = await fetch(`${API_URL}/api/v1/promo-codes/me/limits`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (limitsResponse.ok) {
          const limits = await limitsResponse.json();
          setSubscriptionLimits(limits);
        }
      } catch (apiError) {
        console.error('Settings - API fetch failed:', apiError);
        setAuthError('Failed to load user data. Please try again.');
      }
    } catch (error) {
      console.error('Settings - Failed to fetch user:', error);
      setAuthError('Authentication error: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemPromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) {
      setPromoMessage({ type: 'error', text: 'Please enter a promo code' });
      return;
    }

    setPromoLoading(true);
    setPromoMessage(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/promo-codes/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (response.ok) {
        setPromoMessage({ type: 'success', text: '🎉 Promo code redeemed successfully! Premium access activated.' });
        setPromoCode('');
        // Refresh subscription limits
        fetchUser();
      } else {
        setPromoMessage({ type: 'error', text: data.detail || 'Invalid or expired promo code' });
      }
    } catch (error) {
      console.error('Error redeeming promo code:', error);
      setPromoMessage({ type: 'error', text: 'Failed to redeem promo code. Please try again.' });
    } finally {
      setPromoLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            {authError ? (
              <>
                <div className="text-6xl mb-4">⚠️</div>
                <p className="text-gray-900 dark:text-white text-xl mb-2">Authentication Error</p>
                <p className="text-gray-600 dark:text-gray-400">{authError}</p>
                <p className="text-gray-500 dark:text-gray-500 mt-4">Redirecting to login...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
              </>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      userName={authUser?.name ?? undefined}
      userEmail={authUser?.email ?? undefined}
      userAvatar={authUser?.image ?? undefined}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">⚙️ Settings</h1>
        {/* Appearance Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
            <h2 className="text-xl font-bold text-theme-primary">Appearance</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-lg">
              <div>
                <h3 className="font-semibold text-theme-primary mb-1">Theme</h3>
                <p className="text-sm text-theme-secondary">
                  Switch between light and dark mode
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-gradient-brand' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform flex items-center justify-center ${
                    theme === 'dark' ? 'translate-x-7' : 'translate-x-1'
                  }`}
                >
                  <span className="text-xs">
                    {theme === 'dark' ? '🌙' : '☀️'}
                  </span>
                </span>
              </button>
            </div>

            <div className="text-sm text-theme-secondary p-4 bg-surface-elevated rounded-lg">
              Current theme: <span className="font-semibold capitalize text-theme-primary">{theme}</span>
            </div>

            <button
              onClick={() => router.push('/dashboard/settings/appearance')}
              className="w-full px-4 py-3 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium shadow-lg shadow-gradient-brand"
            >
              Customize Theme Colors
            </button>
          </div>
        </section>

        {/* Profile Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">👤</span>
            <h2 className="text-xl font-bold text-theme-primary">Profile</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-surface-elevated rounded-lg">
              <p className="text-sm text-theme-secondary mb-1">Username</p>
              <p className="font-semibold text-theme-primary">@{user?.username}</p>
            </div>
            <div className="p-4 bg-surface-elevated rounded-lg">
              <p className="text-sm text-theme-secondary mb-1">Display Name</p>
              <p className="font-semibold text-theme-primary">{user?.display_name}</p>
            </div>
            <div className="p-4 bg-surface-elevated rounded-lg">
              <p className="text-sm text-theme-secondary mb-1">Email</p>
              <p className="font-semibold text-theme-primary">{user?.email}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/settings/profile')}
              className="w-full px-4 py-3 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium shadow-lg shadow-gradient-brand"
            >
              Edit Profile Details
            </button>
          </div>
        </section>

        {/* Privacy Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🔒</span>
            <h2 className="text-xl font-bold text-theme-primary">Privacy</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-lg">
              <div>
                <h3 className="font-semibold text-theme-primary mb-1">Public Profile</h3>
                <p className="text-sm text-theme-secondary">
                  Make your profile visible to other keepers
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                user?.collection_visibility === 'public'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}>
                {user?.collection_visibility === 'public' ? 'Public' : 'Private'}
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard/settings/profile')}
              className="w-full px-4 py-3 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium shadow-lg shadow-gradient-brand"
            >
              Change Privacy Settings
            </button>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🔔</span>
            <h2 className="text-xl font-bold text-theme-primary">Notifications</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-surface-elevated rounded-lg">
              <h3 className="font-semibold text-theme-primary mb-1">Notification Preferences</h3>
              <p className="text-sm text-theme-secondary">
                Manage feeding reminders, molt predictions, maintenance alerts, and community notifications
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/settings/notifications')}
              className="w-full px-4 py-3 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium shadow-lg shadow-gradient-brand"
            >
              Configure Notifications
            </button>
          </div>
        </section>

        {/* Referral Program Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🎁</span>
            <h2 className="text-xl font-bold text-theme-primary">Referral Program</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-surface-elevated rounded-lg">
              <h3 className="font-semibold text-theme-primary mb-1">Refer Friends & Earn</h3>
              <p className="text-sm text-theme-secondary">
                {subscriptionLimits?.is_premium
                  ? 'Share your referral link and earn up to 6 free months of subscription!'
                  : 'Upgrade to Premium to unlock the referral program and start earning free months!'}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/settings/referrals')}
              className="w-full px-4 py-3 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium shadow-lg shadow-gradient-brand"
            >
              {subscriptionLimits?.is_premium ? 'View Referral Dashboard' : 'Learn More'}
            </button>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">💎</span>
            <h2 className="text-xl font-bold text-theme-primary">Subscription</h2>
          </div>

          <div className="space-y-4">
            {/* Current Plan */}
            <div className="p-4 bg-surface-elevated rounded-lg">
              <h3 className="font-semibold text-theme-primary mb-2">Current Plan</h3>
              <div className="flex items-center justify-between mb-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  subscriptionLimits?.is_premium
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {subscriptionLimits?.is_premium ? '✨ Premium' : 'Free'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-theme-secondary">Tarantulas</p>
                  <p className="font-semibold text-theme-primary">
                    {subscriptionLimits?.max_tarantulas === -1 ? 'Unlimited' : `${subscriptionLimits?.max_tarantulas ?? 15} max`}
                  </p>
                </div>
                <div>
                  <p className="text-theme-secondary">Photos per tarantula</p>
                  <p className="font-semibold text-theme-primary">
                    {subscriptionLimits?.max_photos_per_tarantula === -1 ? 'Unlimited' : `${subscriptionLimits?.max_photos_per_tarantula ?? 5} max`}
                  </p>
                </div>
                <div>
                  <p className="text-theme-secondary">Breeding Module</p>
                  <p className="font-semibold text-theme-primary">
                    {subscriptionLimits?.can_use_breeding ? '✓ Enabled' : '✗ Disabled'}
                  </p>
                </div>
                <div>
                  <p className="text-theme-secondary">Priority Support</p>
                  <p className="font-semibold text-theme-primary">
                    {subscriptionLimits?.has_priority_support ? '✓ Enabled' : '✗ Disabled'}
                  </p>
                </div>
              </div>
            </div>

            {/* Promo Code Redemption */}
            {!subscriptionLimits?.is_premium && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Have a Promo Code?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Redeem your code to unlock premium features
                </p>
                <form onSubmit={handleRedeemPromoCode} className="space-y-3">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="ENTER-CODE-HERE"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                    disabled={promoLoading}
                  />
                  {promoMessage && (
                    <div className={`p-3 rounded-lg text-sm ${
                      promoMessage.type === 'success'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    }`}>
                      {promoMessage.text}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={promoLoading || !promoCode.trim()}
                    className="w-full px-4 py-2 bg-gradient-brand text-white rounded-lg hover:brightness-90 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {promoLoading ? 'Redeeming...' : 'Redeem Code'}
                  </button>
                </form>
              </div>
            )}

            {/* Upgrade Button */}
            {!subscriptionLimits?.is_premium && (
              <button
                onClick={() => router.push('/pricing')}
                className="w-full px-4 py-3 bg-gradient-brand hover:brightness-90 text-white rounded-lg transition-all font-semibold shadow-lg"
              >
                View Premium Plans
              </button>
            )}

            {/* Premium Badge */}
            {subscriptionLimits?.is_premium && (
              <div className="p-4 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 border-2 border-purple-300 dark:border-purple-700 rounded-lg text-center">
                <p className="text-lg font-bold text-gradient-brand">
                  ✨ Thank you for being a Premium member! ✨
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  You have unlimited access to all features
                </p>
              </div>
            )}
          </div>
        </section>

        {/* About Section */}
        <section className="bg-surface rounded-xl border border-theme p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🌐</span>
            <h2 className="text-xl font-bold text-theme-primary">About</h2>
          </div>

          <div className="space-y-3 text-sm text-theme-secondary">
            <p>Tarantuverse v1.0.0</p>
            <p>A comprehensive tarantula husbandry tracking platform</p>
            <p className="text-xs text-theme-tertiary">© 2025 Tarantuverse. All rights reserved.</p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
