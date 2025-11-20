'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface NotificationPreferences {
  feeding_reminders_enabled: boolean;
  feeding_reminder_hours: number;
  substrate_reminders_enabled: boolean;
  substrate_reminder_days: number;
  molt_predictions_enabled: boolean;
  maintenance_reminders_enabled: boolean;
  maintenance_reminder_days: number;
  push_notifications_enabled: boolean;
  direct_messages_enabled: boolean;
  forum_replies_enabled: boolean;
  new_followers_enabled: boolean;
  community_activity_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    feeding_reminders_enabled: true,
    feeding_reminder_hours: 24,
    substrate_reminders_enabled: true,
    substrate_reminder_days: 90,
    molt_predictions_enabled: true,
    maintenance_reminders_enabled: true,
    maintenance_reminder_days: 30,
    push_notifications_enabled: true,
    direct_messages_enabled: true,
    forum_replies_enabled: true,
    new_followers_enabled: true,
    community_activity_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || !token) {
      router.push('/login');
      return;
    }

    loadPreferences();
  }, [authLoading, isAuthenticated, token]);

  const loadPreferences = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/notification-preferences/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/notification-preferences/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setSuccessMessage('Notification preferences saved successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        alert('Failed to save preferences');
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={authUser?.name ?? undefined}
        userEmail={authUser?.email ?? undefined}
        userAvatar={authUser?.image ?? undefined}
      >
        <div className="flex items-center justify-center py-12">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
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
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="text-purple-600 dark:text-purple-400 hover:underline mb-4 flex items-center gap-2"
          >
            ← Back to Settings
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🔔 Notification Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage your notification preferences for tarantula care reminders and community activity
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-700 dark:text-green-400">
            ✓ {successMessage}
          </div>
        )}

        {/* Local Notifications - Tarantula Care */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🕷️</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tarantula Care Reminders</h2>
          </div>

          <div className="space-y-4">
            {/* Feeding Reminders */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Feeding Reminders</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get notified when it's time to feed your tarantulas (based on their last feeding)
                </p>
              </div>
              <button
                onClick={() => togglePreference('feeding_reminders_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.feeding_reminders_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.feeding_reminders_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Substrate Reminders */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Substrate Change Reminders</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Reminders to change substrate (default: every 90 days)
                </p>
              </div>
              <button
                onClick={() => togglePreference('substrate_reminders_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.substrate_reminders_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.substrate_reminders_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Molt Predictions */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Molt Predictions</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get notified when a tarantula might be approaching a molt
                </p>
              </div>
              <button
                onClick={() => togglePreference('molt_predictions_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.molt_predictions_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.molt_predictions_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Maintenance Reminders */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Maintenance Reminders</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  General maintenance reminders (water dishes, enclosure cleaning)
                </p>
              </div>
              <button
                onClick={() => togglePreference('maintenance_reminders_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.maintenance_reminders_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.maintenance_reminders_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Push Notifications - Community */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">💬</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Community Notifications</h2>
          </div>

          <div className="space-y-4">
            {/* Direct Messages */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Direct Messages</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  When someone sends you a message
                </p>
              </div>
              <button
                onClick={() => togglePreference('direct_messages_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.direct_messages_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.direct_messages_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Forum Replies */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Forum Replies</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  When someone replies to your forum posts
                </p>
              </div>
              <button
                onClick={() => togglePreference('forum_replies_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.forum_replies_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.forum_replies_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* New Followers */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">New Followers</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  When someone follows you
                </p>
              </div>
              <button
                onClick={() => togglePreference('new_followers_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.new_followers_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.new_followers_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Community Activity */}
            <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Community Activity</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updates from keepers you follow
                </p>
              </div>
              <button
                onClick={() => togglePreference('community_activity_enabled')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                  preferences.community_activity_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    preferences.community_activity_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Quiet Hours */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🌙</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quiet Hours</h2>
          </div>

          <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Enable Quiet Hours</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pause notifications during nighttime (10 PM - 8 AM by default)
              </p>
            </div>
            <button
              onClick={() => togglePreference('quiet_hours_enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                preferences.quiet_hours_enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  preferences.quiet_hours_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all font-medium"
          >
            Cancel
          </button>
        </div>

        {/* Info Banner */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Note:</strong> Local notifications (feeding, substrate, molt predictions) are only available on the mobile app.
            Community notifications (messages, forum replies, followers) work on both web and mobile.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
