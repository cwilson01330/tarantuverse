'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useWhatsNew } from '@/lib/whatsNew'
import DashboardLayout from '@/components/DashboardLayout'
import WhatsNewList from '@/components/WhatsNewList'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Week of Oct 19" from a YYYY-MM-DD Monday. Built from the string's own parts with fixed English
 * month names (same on every app, no browser locale, no UTC-midnight day shift).
 */
function weekLabel(weekOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekOf)
  if (!m) return `Week of ${weekOf}`
  const month = Number(m[2])
  if (month < 1 || month > 12) return `Week of ${weekOf}`
  return `Week of ${MONTHS[month - 1]} ${Number(m[3])}`
}

export default function WhatsNewPage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()
  // Read-only: opening the history never marks anything seen.
  const { feed, loading } = useWhatsNew()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  const weeks = feed?.weeks ?? []

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-theme-primary mb-6">What&apos;s new</h1>

        {loading || isLoading ? (
          <p className="text-theme-secondary">Loading...</p>
        ) : !feed ? (
          <p className="text-theme-secondary">Couldn&apos;t load what&apos;s new right now.</p>
        ) : weeks.length === 0 ? (
          <p className="text-theme-secondary">Nothing new yet.</p>
        ) : (
          <div className="space-y-6">
            {weeks.map((week) => (
              <section
                key={week.week_of}
                aria-labelledby={`week-${week.week_of}`}
                className="bg-surface rounded-2xl shadow-lg border border-theme p-5"
              >
                <h2
                  id={`week-${week.week_of}`}
                  className="text-sm font-semibold uppercase tracking-wide text-theme-secondary mb-3"
                >
                  {weekLabel(week.week_of)}
                </h2>
                <WhatsNewList entries={week.entries} onAction={(route) => router.push(route)} />
              </section>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
