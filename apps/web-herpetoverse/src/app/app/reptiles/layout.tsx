'use client'

/**
 * Client auth gate for /app/reptiles/*.
 *
 * The parent /app/layout.tsx is a server component that gates on the
 * herpetoverse_app_enabled feature flag. This layout is nested inside it
 * and adds a second gate: "is the user signed in?". Unauthenticated
 * visitors are redirected to /login with `next` set to their original
 * target URL.
 */

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'

export default function ReptilesLayout({
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
      const next = encodeURIComponent(pathname || '/app/reptiles')
      router.replace(`/login?next=${next}`)
    }
  }, [isLoading, token, router, pathname])

  if (isLoading || !token) {
    // Minimal skeleton — prevents a flash of unauthed content during the
    // redirect decision. Matches the dark palette of AppShell.
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
