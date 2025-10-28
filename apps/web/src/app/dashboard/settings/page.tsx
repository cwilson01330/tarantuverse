'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useThemeStore } from '@/stores/themeStore';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useThemeStore();
  const { data: session } = useSession();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string>('');

  useEffect(() => {
    // Use setTimeout to ensure this runs after component mounts
    const timer = setTimeout(() => {
      fetchUser();
    }, 0);

    return () => clearTimeout(timer);
  }, [session]);

  const fetchUser = async () => {
    try {
      // Check if we're in the browser
      if (typeof window === 'undefined') {
        console.log('Settings - Not in browser yet');
        return;
      }

      // Try localStorage first (email/password auth)
      let token = localStorage.getItem('auth_token');

      // If not in localStorage, check NextAuth session (OAuth)
      if (!token && session?.accessToken) {
        console.log('Settings - Using NextAuth session');
        token = session.accessToken as string;
      }

      console.log('Settings - Auth check:', {
        hasToken: !!token,
        isOAuth: !!session,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
      });

      if (!token) {
        setAuthError('No authentication found. Please log in.');
        console.log('Settings - No auth, redirecting to login');
        // Give user a moment to see the error before redirect
        setTimeout(() => {
          router.push('/login');
        }, 1000);
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
        console.log('Settings - User loaded from API:', userData);
        setUser(userData);
        setAuthError('');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-theme flex items-center justify-center">
        <div className="text-center">
          {authError ? (
            <>
              <div className="text-6xl mb-4">⚠️</div>
              <p className="text-theme-primary text-xl mb-2">Authentication Error</p>
              <p className="text-theme-secondary">{authError}</p>
              <p className="text-theme-tertiary mt-4">Redirecting to login...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-theme-secondary">Loading settings...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme">
      {/* Header */}
      <div className="bg-gradient-brand shadow-lg shadow-gradient-brand">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-white hover:text-white/80 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

          <div className="p-4 bg-surface-elevated rounded-lg text-center">
            <p className="text-theme-secondary">Notification preferences coming soon</p>
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
    </div>
  );
}
