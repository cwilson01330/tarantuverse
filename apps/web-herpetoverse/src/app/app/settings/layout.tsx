'use client'

/**
 * Client auth gate for /app/settings.
 *
 * Mirrors /app/reptiles/layout.tsx — the parent /app/layout.tsx gates on
 * the herpetoverse_app_enabled feature flag; this layout adds the "is the
 * user signed in?" gate so the settings page (profile editing, account
 * deletion) is never reachable unauthenticated.
 */

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { token, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return
    if (!token) {
      const next = encodeURIComponent(pathname || '/app/settings')
      router.replace(`/login?next=${next}`)
    }
  }, [isLoading, token, router, pathname])

  if (isLoading || !token) {
    return (
      <div
        className="flex items-center justify-center min-h-[40vh]"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="text-xs uppercase tracking-widest text-neutral-600">
          Checking sign-in…
        </div>
      </div>
    )
  }

  return <>{children}</>
}
