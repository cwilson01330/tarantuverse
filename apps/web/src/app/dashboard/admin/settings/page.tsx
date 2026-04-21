'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface SettingEntry {
  key: string
  value: string
  value_type: string
  label: string
  description: string | null
  is_sensitive: boolean
  updated_at: string | null
}

type SettingsByCategory = Record<string, SettingEntry[]>

const CATEGORY_META: Record<string, { label: string; icon: string; description: string }> = {
  feature_flags: {
    label: 'Feature Flags',
    icon: '🚩',
    description: 'Toggle platform features on or off globally without redeploying.',
  },
  platform_limits: {
    label: 'Platform Limits',
    icon: '📏',
    description: 'Configure free-tier limits, upload sizes, and rate limits.',
  },
  maintenance: {
    label: 'Maintenance',
    icon: '🔧',
    description: 'Put the platform in read-only mode during updates or incidents.',
  },
  notifications: {
    label: 'Notifications & Email',
    icon: '🔔',
    description: 'Default notification preferences and global quiet hours.',
  },
  announcements: {
    label: 'Announcements',
    icon: '📣',
    description: 'Cross-promo and platform-wide banners shown inside the dashboard.',
  },
}

const CATEGORY_ORDER = ['maintenance', 'announcements', 'feature_flags', 'platform_limits', 'notifications']

export default function AdminSettingsPage() {
  const router = useRouter()
  const { user, token, isLoading, isAuthenticated } = useAuth()
  const [settings, setSettings] = useState<SettingsByCategory>({})
  const [loading, setLoading] = useState(true)
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !user) { router.push('/login'); return }
    if (!user.is_admin && !user.is_superuser) { router.push('/dashboard'); return }
    fetchSettings()
  }, [isLoading, isAuthenticated, user])

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/settings/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load settings')
      const data: SettingsByCategory = await res.json()
      setSettings(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key: string, newValue: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: newValue }))
    setSaveSuccess(false)
  }

  const toggleBool = (key: string, currentRaw: string) => {
    const flipped = currentRaw.toLowerCase() === 'true' ? 'false' : 'true'
    handleChange(key, flipped)
  }

  const getDisplayValue = (key: string, original: string): string => {
    return pendingChanges[key] ?? original
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  const saveAll = async () => {
    setSaving(true)
    setError(null)
    try {
      // Convert string values to appropriate types
      const typedUpdates: Record<string, any> = {}
      for (const [key, rawVal] of Object.entries(pendingChanges)) {
        // Find the setting to know its type
        let vtype = 'string'
        for (const entries of Object.values(settings)) {
          const found = entries.find(e => e.key === key)
          if (found) { vtype = found.value_type; break }
        }
        if (vtype === 'bool') typedUpdates[key] = rawVal.toLowerCase() === 'true'
        else if (vtype === 'int') typedUpdates[key] = parseInt(rawVal, 10)
        else if (vtype === 'float') typedUpdates[key] = parseFloat(rawVal)
        else typedUpdates[key] = rawVal
      }

      const res = await fetch(`${API_URL}/api/v1/admin/settings/bulk/`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: typedUpdates }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || 'Failed to save settings')
      }
      setPendingChanges({})
      setSaveSuccess(true)
      await fetchSettings()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const discardChanges = () => {
    setPendingChanges({})
    setSaveSuccess(false)
  }

  if (isLoading || loading) {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Settings</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Configure platform behavior, feature flags, limits, and maintenance mode.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/admin')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
          >
            ← Back to Admin
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-3 underline text-sm">Dismiss</button>
          </div>
        )}

        {/* Sticky save bar */}
        {hasPendingChanges && (
          <div className="sticky top-0 z-20 mb-6 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex items-center justify-between shadow-lg">
            <span className="text-amber-800 dark:text-amber-200 font-medium">
              You have {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length > 1 ? 's' : ''}
            </span>
            <div className="flex gap-3">
              <button
                onClick={discardChanges}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                Discard
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition font-medium"
              >
                {saving ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Success banner */}
        {saveSuccess && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4 text-green-700 dark:text-green-300">
            Settings saved successfully.
          </div>
        )}

        {/* Settings categories */}
        <div className="space-y-8">
          {CATEGORY_ORDER.map(cat => {
            const meta = CATEGORY_META[cat]
            const entries = settings[cat] || []
            if (!meta || entries.length === 0) return null

            return (
              <section key={cat} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Category header */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>{meta.icon}</span>
                    {meta.label}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{meta.description}</p>
                </div>

                {/* Setting rows */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {entries.map(entry => {
                    const displayVal = getDisplayValue(entry.key, entry.value)
                    const isChanged = entry.key in pendingChanges

                    return (
                      <div
                        key={entry.key}
                        className={`px-6 py-4 flex items-center justify-between gap-4 ${
                          isChanged ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm">
                              {entry.label}
                            </span>
                            {isChanged && (
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                                MODIFIED
                              </span>
                            )}
                          </div>
                          {entry.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {entry.description}
                            </p>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{entry.key}</span>
                        </div>

                        {/* Input based on type */}
                        <div className="flex-shrink-0">
                          {entry.value_type === 'bool' ? (
                            <button
                              onClick={() => toggleBool(entry.key, displayVal)}
                              className={`relative w-12 h-6 rounded-full transition-colors ${
                                displayVal.toLowerCase() === 'true'
                                  ? 'bg-green-500'
                                  : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                  displayVal.toLowerCase() === 'true' ? 'translate-x-6' : ''
                                }`}
                              />
                            </button>
                          ) : entry.value_type === 'int' || entry.value_type === 'float' ? (
                            <input
                              type="number"
                              value={displayVal}
                              onChange={e => handleChange(entry.key, e.target.value)}
                              className="w-28 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={displayVal}
                              onChange={e => handleChange(entry.key, e.target.value)}
                              className="w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* Footer note */}
        <div className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
          Changes take effect immediately after saving. Feature flags and limits are cached in-memory and refresh automatically.
        </div>
      </div>
    </DashboardLayout>
  )
}
