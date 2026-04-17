# Feeding Reminders - Frontend Integration Guide

## Quick Start

Add feeding reminders to your Tarantuverse web app (Next.js) or mobile app (React Native).

## Web Implementation (Next.js + React)

### 1. Create a Custom Hook

**File**: `apps/web/src/hooks/useFeedingReminders.ts`

```typescript
import { useState, useEffect } from 'react'

interface FeedingReminder {
  tarantula_id: string
  tarantula_name: string
  species_name: string | null
  last_fed_at: string | null
  recommended_interval_days: number
  next_feeding_due: string | null
  is_overdue: boolean
  days_difference: number
  status: 'overdue' | 'due_today' | 'due_soon' | 'on_track' | 'never_fed'
}

interface FeedingReminderSummary {
  total_tarantulas: number
  overdue_count: number
  due_today_count: number
  due_soon_count: number
  on_track_count: number
  never_fed_count: number
  reminders: FeedingReminder[]
}

export function useFeedingReminders(token: string) {
  const [reminders, setReminders] = useState<FeedingReminderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReminders() {
      try {
        setLoading(true)
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/feeding-reminders/`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        )

        if (!response.ok) throw new Error('Failed to fetch reminders')

        const data = await response.json()
        setReminders(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setReminders(null)
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchReminders()
      // Refresh every 5 minutes
      const interval = setInterval(fetchReminders, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [token])

  return { reminders, loading, error }
}
```

### 2. Create a Status Badge Component

**File**: `apps/web/src/components/FeedingStatusBadge.tsx`

```typescript
import React from 'react'

interface FeedingStatusBadgeProps {
  status: 'overdue' | 'due_today' | 'due_soon' | 'on_track' | 'never_fed'
  days_difference?: number
}

export function FeedingStatusBadge({
  status,
  days_difference = 0,
}: FeedingStatusBadgeProps) {
  const statusConfig = {
    overdue: {
      bgColor: 'bg-red-100 dark:bg-red-900',
      textColor: 'text-red-800 dark:text-red-100',
      label: 'Overdue',
      icon: '🔴',
    },
    due_today: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900',
      textColor: 'text-yellow-800 dark:text-yellow-100',
      label: 'Due Today',
      icon: '🟡',
    },
    due_soon: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900',
      textColor: 'text-yellow-800 dark:text-yellow-100',
      label: 'Due Soon',
      icon: '🟡',
    },
    on_track: {
      bgColor: 'bg-green-100 dark:bg-green-900',
      textColor: 'text-green-800 dark:text-green-100',
      label: 'On Track',
      icon: '🟢',
    },
    never_fed: {
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      textColor: 'text-gray-800 dark:text-gray-100',
      label: 'Never Fed',
      icon: '⚪',
    },
  }

  const config = statusConfig[status]

  let displayText = config.label
  if (status === 'overdue' && days_difference > 0) {
    displayText = `${days_difference} day${days_difference > 1 ? 's' : ''} overdue`
  } else if (status === 'due_today') {
    displayText = 'Due Today'
  } else if (status === 'due_soon') {
    displayText = 'Due Soon'
  } else if (status === 'on_track' && days_difference < 0) {
    displayText = `Due in ${Math.abs(days_difference)} day${Math.abs(days_difference) > 1 ? 's' : ''}`
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${config.bgColor} ${config.textColor}`}
    >
      <span>{config.icon}</span>
      <span>{displayText}</span>
    </span>
  )
}
```

### 3. Create a Reminders Summary Card

**File**: `apps/web/src/components/FeedingRemindersSummary.tsx`

```typescript
import React from 'react'
import { useFeedingReminders } from '@/hooks/useFeedingReminders'
import { useAuth } from '@/hooks/useAuth'  // Your auth hook

export function FeedingRemindersSummary() {
  const { token } = useAuth()
  const { reminders, loading } = useFeedingReminders(token)

  if (loading) {
    return <div className="p-4 text-gray-600 dark:text-gray-400">Loading reminders...</div>
  }

  if (!reminders) {
    return null
  }

  return (
    <div className="grid grid-cols-5 gap-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="text-center">
        <div className="text-3xl font-bold text-red-600 dark:text-red-400">
          {reminders.overdue_count}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Overdue</div>
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
          {reminders.due_today_count}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Due Today</div>
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold text-yellow-500 dark:text-yellow-300">
          {reminders.due_soon_count}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Due Soon</div>
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
          {reminders.on_track_count}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">On Track</div>
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
          {reminders.total_tarantulas}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
      </div>
    </div>
  )
}
```

### 4. Create a Full Reminders List

**File**: `apps/web/src/components/FeedingRemindersList.tsx`

```typescript
import React from 'react'
import Link from 'next/link'
import { FeedingStatusBadge } from './FeedingStatusBadge'
import { useFeedingReminders } from '@/hooks/useFeedingReminders'
import { useAuth } from '@/hooks/useAuth'

export function FeedingRemindersList() {
  const { token } = useAuth()
  const { reminders, loading, error } = useFeedingReminders(token)

  if (loading) return <div>Loading feeding reminders...</div>
  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>
  if (!reminders) return null

  // Sort by urgency: overdue first, then due_today, due_soon, on_track, never_fed
  const statusPriority: Record<string, number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
    on_track: 3,
    never_fed: 4,
  }

  const sorted = [...reminders.reminders].sort(
    (a, b) => statusPriority[a.status] - statusPriority[b.status]
  )

  return (
    <div className="space-y-2">
      {sorted.map((reminder) => (
        <Link
          key={reminder.tarantula_id}
          href={`/dashboard/tarantulas/${reminder.tarantula_id}`}
        >
          <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {reminder.tarantula_name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {reminder.species_name || 'Unknown species'}
              </p>
              {reminder.last_fed_at && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Last fed: {new Date(reminder.last_fed_at).toLocaleDateString()}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Every {reminder.recommended_interval_days} days
                </div>
                {reminder.next_feeding_due && (
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Due: {new Date(reminder.next_feeding_due).toLocaleDateString()}
                  </div>
                )}
              </div>

              <FeedingStatusBadge
                status={reminder.status}
                days_difference={reminder.days_difference}
              />
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
```

### 5. Add to Dashboard

**File**: `apps/web/src/app/dashboard/page.tsx` (update)

```typescript
import { FeedingRemindersSummary } from '@/components/FeedingRemindersSummary'
import { FeedingRemindersList } from '@/components/FeedingRemindersList'

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Existing content */}

      {/* New: Feeding Reminders Section */}
      <section>
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Feeding Reminders
        </h2>
        <FeedingRemindersSummary />
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            All Tarantulas
          </h3>
          <FeedingRemindersList />
        </div>
      </section>
    </div>
  )
}
```

## Mobile Implementation (React Native + Expo)

### 1. Create Custom Hook

**File**: `apps/mobile/src/hooks/useFeedingReminders.ts`

```typescript
import { useState, useEffect } from 'react'
import axios from 'axios'

export function useFeedingReminders(token: string) {
  const [reminders, setReminders] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchReminders() {
      try {
        const response = await axios.get(
          'https://tarantuverse-api.onrender.com/api/v1/feeding-reminders/',
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        setReminders(response.data)
      } catch (error) {
        console.error('Failed to fetch feeding reminders:', error)
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchReminders()
      // Refresh every 5 minutes
      const interval = setInterval(fetchReminders, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [token])

  return { reminders, loading }
}
```

### 2. Create Status Badge Component

**File**: `apps/mobile/src/components/FeedingStatusBadge.tsx`

```typescript
import React from 'react'
import { View, Text } from 'react-native'
import { useTheme } from '@/contexts/ThemeContext'

export function FeedingStatusBadge({ status, days_difference = 0 }) {
  const theme = useTheme()

  const statusConfig = {
    overdue: {
      bg: '#FEE2E2',
      text: '#991B1B',
      label: `${days_difference} days overdue`,
    },
    due_today: {
      bg: '#FEF3C7',
      text: '#92400E',
      label: 'Due Today',
    },
    due_soon: {
      bg: '#FEF3C7',
      text: '#92400E',
      label: 'Due Soon',
    },
    on_track: {
      bg: '#DCFCE7',
      text: '#166534',
      label: `Due in ${Math.abs(days_difference)} days`,
    },
    never_fed: {
      bg: '#F3F4F6',
      text: '#374151',
      label: 'Never Fed',
    },
  }

  const config = statusConfig[status]

  return (
    <View
      style={{
        backgroundColor: config.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
      }}
    >
      <Text style={{ color: config.text, fontSize: 12, fontWeight: '600' }}>
        {config.label}
      </Text>
    </View>
  )
}
```

### 3. Create Reminders Screen

**File**: `apps/mobile/app/(tabs)/reminders.tsx`

```typescript
import React from 'react'
import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useFeedingReminders } from '@/hooks/useFeedingReminders'
import { FeedingStatusBadge } from '@/components/FeedingStatusBadge'

export default function RemindersScreen() {
  const router = useRouter()
  const { token } = useAuth()
  const theme = useTheme()
  const { reminders, loading } = useFeedingReminders(token)

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading reminders...</Text>
      </View>
    )
  }

  if (!reminders) return null

  const sorted = [...reminders.reminders].sort((a, b) => {
    const priority = {
      overdue: 0,
      due_today: 1,
      due_soon: 2,
      on_track: 3,
      never_fed: 4,
    }
    return priority[a.status] - priority[b.status]
  })

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Summary Cards */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#EF4444' }}>
            {reminders.overdue_count}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text }}>Overdue</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#EAB308' }}>
            {reminders.due_today_count}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text }}>Due Today</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#22C55E' }}>
            {reminders.on_track_count}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text }}>On Track</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.tarantula_id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              router.push(`/tarantula/${item.tarantula_id}`)
            }
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>
                  {item.tarantula_name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.mutedText }}>
                  {item.species_name || 'Unknown'}
                </Text>
              </View>
              <FeedingStatusBadge
                status={item.status}
                days_difference={item.days_difference}
              />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}
```

## Testing

### Test Case 1: Overdue Tarantula
```
- Create tarantula linked to species with "every 7 days" feeding
- Add feeding log 10 days ago
- Expected status: "overdue"
- Expected days_difference: 3
```

### Test Case 2: Due Today
```
- Create tarantula, add feeding log exactly 7 days ago
- Expected status: "due_today"
- Expected days_difference: 0
```

### Test Case 3: Never Fed
```
- Create tarantula, no feeding logs
- Expected status: "never_fed"
- Expected next_feeding_due: null
```

### Test Case 4: No Species Linked
```
- Create tarantula without species
- Add recent molt with leg span = 0.5"
- Expected: Uses default sling interval (4 days)
```

---

**Last Updated**: 2026-04-03
