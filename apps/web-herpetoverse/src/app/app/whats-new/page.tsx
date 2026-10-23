'use client'

/**
 * What's new — history (spec 2026-10-23 §2). Every live entry grouped by week,
 * newest first, each with its Premium label and (when this app has the screen)
 * its button. Opening this page never marks anything seen; only the Home card's
 * ✕ and buttons do.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WhatsNewList from '@/components/WhatsNewList'
import { useAuth } from '@/lib/auth'
import { useWhatsNew } from '@/lib/whatsNew'

export default function WhatsNewPage() {
  const router = useRouter()
  const { token, isLoading } = useAuth()
  const { feed, loading } = useWhatsNew()

  useEffect(() => {
    if (isLoading) return
    if (!token) router.replace('/login?next=/app/whats-new')
  }, [isLoading, token, router])

  const weeks = feed?.weeks ?? []

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">Updates</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide">What&apos;s new</h1>
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : feed === null ? (
        <p className="text-sm text-neutral-400">Couldn&apos;t load what&apos;s new right now.</p>
      ) : weeks.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
          Nothing new yet.
        </p>
      ) : (
        <WhatsNewList weeks={weeks} onAction={(route) => router.push(route)} />
      )}
    </div>
  )
}
