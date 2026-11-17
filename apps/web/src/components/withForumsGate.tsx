'use client'

import type { ComponentType } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useFeatures } from '@/lib/features'
import DashboardLayout from '@/components/DashboardLayout'
import ForumsPaused from '@/components/ForumsPaused'

/**
 * Wraps a forum or board page so it never loads (and never fetches) while the forums are paused.
 * - not ready yet: a neutral placeholder (the switch is still being read);
 * - ready and OFF: the paused page, inside the normal dashboard layout;
 * - ready and ON: the page itself, mounted only now, so its data requests start only now.
 */
export default function withForumsGate<P extends object>(Page: ComponentType<P>): ComponentType<P> {
  function ForumsGate(props: P) {
    const { forumsEnabled, ready } = useFeatures()
    const { user } = useAuth()

    if (ready && forumsEnabled) return <Page {...props} />

    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        {ready ? (
          <ForumsPaused />
        ) : (
          <div className="max-w-xl mx-auto py-10 px-4" aria-busy="true">
            <div className="h-24 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        )}
      </DashboardLayout>
    )
  }
  ForumsGate.displayName = `withForumsGate(${Page.displayName || Page.name || 'Page'})`
  return ForumsGate
}
