'use client';

/**
 * Notification settings (TV web). Every switch here changes something the
 * server does (audit-2 H4). The old "Animal Care Reminders" switches (feeding,
 * substrate, molt prediction, maintenance) were read only by retired mobile
 * screens and controlled nothing; animal-care reminders are the server's daily
 * feeding digest (services/digest_service.py), so that is what this page sets.
 * Kept in step with apps/mobile/app/settings/notifications.tsx.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface NotificationPreferences {
  daily_digest_enabled: boolean;
  digest_hour: number;
  push_notifications_enabled: boolean;
  direct_messages_enabled: boolean;
  forum_replies_enabled: boolean;
  new_followers_enabled: boolean;
  sitter_activity_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

type BoolKey = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean ? K : never
}[keyof NotificationPreferences];

/** "9:00 AM" from 9. */
function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "22:00" → "10:00 PM"; the raw string if it doesn't parse. */
function formatClock(hhmm: string | null | undefined): string {
  const [h, m] = String(hhmm ?? '').split(':').map((x) => Number(x));
  if (!Number.isInteger(h) || !Number.isInteger(m)) return String(hhmm ?? '');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Same rule as the server's notification_service.in_quiet_hours. */
function hourIsQuiet(hour: number, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = String(s ?? '').split(':').map((x) => Number(x));
    return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null || a === b) return false;
  const t = hour * 60;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ml-4 ${
        on ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    daily_digest_enabled: true,
    digest_hour: 9,
    push_notifications_enabled: true,
    direct_messages_enabled: true,
    forum_replies_enabled: true,
    new_followers_enabled: true,
    sitter_activity_enabled: true,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setPreferences((prev) => ({
          ...prev,
          ...data,
          // Older API builds don't return these; keep the server's defaults.
          daily_digest_enabled: data.daily_digest_enabled ?? true,
          digest_hour: typeof data.digest_hour === 'number' ? data.digest_hour : 9,
          sitter_activity_enabled: data.sitter_activity_enabled ?? true,
        }));
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
      if (!token) {
        alert('You must be logged in to save preferences');
        setSaving(false);
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Only the fields this page edits — Herpetoverse shares this row and has
      // its own settings, which a full echo could overwrite.
      const updatePayload = {
        daily_digest_enabled: preferences.daily_digest_enabled,
        digest_hour: preferences.digest_hour,
        // The digest hour is a local hour: save this browser's zone with it.
        tz_offset_minutes: new Date().getTimezoneOffset(),
        direct_messages_enabled: preferences.direct_messages_enabled,
        forum_replies_enabled: preferences.forum_replies_enabled,
        new_followers_enabled: preferences.new_followers_enabled,
        sitter_activity_enabled: preferences.sitter_activity_enabled ?? true,
        quiet_hours_enabled: preferences.quiet_hours_enabled,
      };

      const response = await fetch(`${API_URL}/api/v1/notification-preferences/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      if (response.ok) {
        setSuccessMessage('Notification preferences saved.');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('Save failed:', response.status, errorData);
        alert(`Failed to save preferences: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert(`Failed to save preferences: ${error instanceof Error ? error.message : 'Network error'}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = (key: BoolKey) => {
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

  const digestOn = preferences.daily_digest_enabled;
  const digestInQuiet =
    preferences.quiet_hours_enabled &&
    hourIsQuiet(preferences.digest_hour, preferences.quiet_hours_start, preferences.quiet_hours_end);

  const row = 'flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg';
  const title = 'font-semibold text-gray-900 dark:text-white mb-1';
  const desc = 'text-sm text-gray-600 dark:text-gray-400';

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
            Choose what the app notifies you about and when.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-700 dark:text-green-400">
            ✓ {successMessage}
          </div>
        )}

        {/* Feeding reminders — the server's daily digest */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🕷️</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Feeding reminders</h2>
          </div>

          <div className="space-y-4">
            <div className={row}>
              <div className="flex-1">
                <h3 className={title}>Daily feeding digest</h3>
                <p className={desc}>
                  One notification a day saying how many animals are due, using the same schedule as Feeding Day.
                  Nothing is sent on days when nothing is due.
                </p>
              </div>
              <Toggle on={digestOn} onClick={() => togglePreference('daily_digest_enabled')} label="Daily feeding digest" />
            </div>

            <div className={`${row} ${digestOn ? '' : 'opacity-50'}`}>
              <div className="flex-1">
                <label htmlFor="digest-hour" className={`block ${title}`}>Time</label>
                <p className={desc}>
                  Your local time. Saving here uses this browser&apos;s time zone.
                  {digestInQuiet && ' This is inside your quiet hours, so the digest will wait in your notifications list instead of buzzing your phone.'}
                </p>
              </div>
              <select
                id="digest-hour"
                value={preferences.digest_hour}
                disabled={!digestOn}
                onChange={(e) => setPreferences((p) => ({ ...p, digest_hour: Number(e.target.value) }))}
                className="ml-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600 disabled:cursor-not-allowed"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
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
            <div className={row}>
              <div className="flex-1">
                <h3 className={title}>Direct Messages</h3>
                <p className={desc}>When someone sends you a message</p>
              </div>
              <Toggle on={preferences.direct_messages_enabled} onClick={() => togglePreference('direct_messages_enabled')} label="Direct message notifications" />
            </div>

            <div className={row}>
              <div className="flex-1">
                <h3 className={title}>Forum Replies</h3>
                <p className={desc}>When someone replies to your forum posts</p>
              </div>
              <Toggle on={preferences.forum_replies_enabled} onClick={() => togglePreference('forum_replies_enabled')} label="Forum reply notifications" />
            </div>

            <div className={row}>
              <div className="flex-1">
                <h3 className={title}>New Followers</h3>
                <p className={desc}>When someone follows you</p>
              </div>
              <Toggle on={preferences.new_followers_enabled} onClick={() => togglePreference('new_followers_enabled')} label="New follower notifications" />
            </div>

            <div className={row}>
              <div className="flex-1">
                <h3 className={title}>Sitter activity</h3>
                <p className={desc}>
                  When a sitter starts logging feedings on one of your links (once per round). Lockouts always notify you.
                </p>
              </div>
              <Toggle on={preferences.sitter_activity_enabled ?? true} onClick={() => togglePreference('sitter_activity_enabled')} label="Sitter activity notifications" />
            </div>
          </div>
        </section>

        {/* Quiet Hours */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🌙</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quiet Hours</h2>
          </div>

          <div className={row}>
            <div className="flex-1">
              <h3 className={title}>Enable Quiet Hours</h3>
              <p className={desc}>
                No push notifications from {formatClock(preferences.quiet_hours_start)} to {formatClock(preferences.quiet_hours_end)},
                your local time. They still wait in your notifications list. Sitter-link lockouts still come through.
              </p>
            </div>
            <Toggle on={preferences.quiet_hours_enabled} onClick={() => togglePreference('quiet_hours_enabled')} label="Quiet hours" />
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gradient-brand hover:brightness-90 text-white rounded-lg transition-all font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
            <strong>Note:</strong> Push notifications go to the Tarantuverse mobile app, so sign in there with notifications
            allowed to receive them. These settings apply on every device.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
