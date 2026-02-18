'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/stores/themeStore';
import DashboardLayout from '@/components/DashboardLayout';
import { resetDashboardTour } from '@/components/DashboardTour';

interface LinkedAccount {
  id: string;
  provider: string;
  provider_email: string | null;
  provider_name: string | null;
  provider_avatar: string | null;
  created_at: string | null;
}

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
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(true);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      router.push('/login');
      return;
    }

    fetchUser();
    fetchLinkedAccounts();
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

  const fetchLinkedAccounts = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/auth/linked-accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const accounts = await response.json();
        setLinkedAccounts(accounts);
      }
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
    } finally {
      setLinkedAccountsLoading(false);
    }
  };

  const handleUnlinkAccount = async (provider: string) => {
    if (!confirm(`Are you sure you want to unlink your ${provider.charAt(0).toUpperCase() + provider.slice(1)} account? You will no longer be able to sign in with this provider unless you link it again.`)) {
      return;
    }

    setUnlinkingProvider(provider);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/auth/unlink-account/${provider}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Remove the account from the list
        setLinkedAccounts(prev => prev.filter(acc => acc.provider !== provider));
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to unlink account');
      }
    } catch (error) {
      console.error('Error unlinking account:', error);
      alert('Failed to unlink account. Please try again.');
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        );
      case 'apple':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
        );
      default:
        return <span className="w-5 h-5 rounded-full bg-gray-400"></span>;
    }
  };

  const hasPassword = user?.hashed_password !== null;
  const canUnlink = linkedAccounts.length > 1 || hasPassword;

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

        {/* Linked Accounts Section */}
        <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🔗</span>
            <h2 className="text-xl font-bold text-theme-primary">Linked Accounts</h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-theme-secondary">
              Link multiple sign-in methods to your account. This allows you to access your account from any device and ensures your subscription works across all platforms.
            </p>

            {linkedAccountsLoading ? (
              <div className="p-4 bg-surface-elevated rounded-lg text-center">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-theme-secondary mt-2">Loading linked accounts...</p>
              </div>
            ) : linkedAccounts.length === 0 ? (
              <div className="p-4 bg-surface-elevated rounded-lg text-center">
                <p className="text-theme-secondary">No OAuth accounts linked yet.</p>
                <p className="text-sm text-theme-tertiary mt-1">
                  Sign in with Google or Apple to automatically link that account.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {linkedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 bg-surface-elevated rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getProviderIcon(account.provider)}
                      <div>
                        <h3 className="font-semibold text-theme-primary capitalize">
                          {account.provider}
                        </h3>
                        <p className="text-sm text-theme-secondary">
                          {account.provider_email || 'Email not available'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkAccount(account.provider)}
                      disabled={!canUnlink || unlinkingProvider === account.provider}
                      className={`px-3 py-1.5 text-sm rounded-lg transition ${
                        canUnlink
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                      }`}
                      title={!canUnlink ? 'Cannot unlink the only sign-in method' : undefined}
                    >
                      {unlinkingProvider === account.provider ? 'Unlinking...' : 'Unlink'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Available providers to link */}
            {!linkedAccountsLoading && (
              <div className="pt-4 border-t border-theme">
                <h3 className="font-semibold text-theme-primary mb-3">Link Additional Accounts</h3>
                <div className="space-y-2">
                  {!linkedAccounts.find(a => a.provider === 'google') && (
                    <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-lg">
                      <div className="flex items-center gap-3">
                        {getProviderIcon('google')}
                        <span className="text-theme-primary">Google</span>
                      </div>
                      <span className="text-xs text-theme-tertiary">
                        Sign in with Google to link
                      </span>
                    </div>
                  )}
                  {!linkedAccounts.find(a => a.provider === 'apple') && (
                    <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-lg">
                      <div className="flex items-center gap-3">
                        {getProviderIcon('apple')}
                        <span className="text-theme-primary">Apple</span>
                      </div>
                      <span className="text-xs text-theme-tertiary">
                        Sign in with Apple to link
                      </span>
                    </div>
                  )}
                  {linkedAccounts.find(a => a.provider === 'google') && linkedAccounts.find(a => a.provider === 'apple') && (
                    <p className="text-sm text-green-600 dark:text-green-400 text-center py-2">
                      All available providers are linked
                    </p>
                  )}
                </div>
              </div>
            )}

            {!canUnlink && linkedAccounts.length > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  You cannot unlink your only sign-in method. Set a password or link another account first.
                </p>
              </div>
            )}
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

        {/* Help & About Section */}
        <section className="bg-surface rounded-xl border border-theme p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🌐</span>
            <h2 className="text-xl font-bold text-theme-primary">Help & About</h2>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                resetDashboardTour()
                router.push('/dashboard')
              }}
              className="w-full flex items-center justify-between p-4 bg-surface-elevated rounded-lg hover:bg-surface transition-colors group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🎓</span>
                <div className="text-left">
                  <h3 className="font-semibold text-theme-primary">Replay Tutorial</h3>
                  <p className="text-sm text-theme-secondary">Take the guided tour of the dashboard again</p>
                </div>
              </div>
              <span className="text-theme-tertiary group-hover:text-theme-primary transition-colors">→</span>
            </button>

            <div className="space-y-3 text-sm text-theme-secondary pt-2">
              <p>Tarantuverse v1.0.0</p>
              <p>A comprehensive tarantula husbandry tracking platform</p>
              <p className="text-xs text-theme-tertiary">© 2025 Tarantuverse. All rights reserved.</p>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
