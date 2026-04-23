"use client"

/**
 * PostHog analytics provider for Herpetoverse web.
 *
 * Wraps the app to:
 *   - Initialize PostHog once on mount (NEXT_PUBLIC_POSTHOG_KEY).
 *   - Capture $pageview on every App Router navigation. We drive
 *     pageviews from `usePathname` because PostHog's built-in history
 *     listener is unreliable on Next App Router.
 *   - Identify the signed-in keeper using the local `useAuth()` hook —
 *     Herpetoverse stores its session in localStorage (`hv_token`) and
 *     reuses the shared Tarantuverse user table, so the `id` here is
 *     the same person as the Tarantuverse PostHog identity.
 *
 * Failing open:
 *   If NEXT_PUBLIC_POSTHOG_KEY is unset, this provider is a pure
 *   pass-through — no network calls, no warnings. This lets us ship
 *   the plumbing before the PostHog project exists.
 *
 * Privacy:
 *   `autocapture` is off so only events we explicitly send get
 *   recorded. Pageviews send the pathname only; query/hash are
 *   stripped so upload-session tokens and reset tokens never leave
 *   the browser inside a URL.
 */

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { useAuth } from "@/lib/auth"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
// Route through our own /ingest path (see next.config.js rewrites).
// First-party URL survives ad blockers that block us.i.posthog.com.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest"
const POSTHOG_UI_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com"

let initialized = false

function initPostHog() {
  if (initialized) return
  if (typeof window === "undefined") return
  if (!POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  })
  initialized = true
}

function PostHogPageviews() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isLoading } = useAuth()

  // Pageview on route change.
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return
    if (!pathname) return
    void searchParams // fire on query changes too, but don't log them
    posthog.capture("$pageview", { $pathname: pathname })
  }, [pathname, searchParams])

  // Identify / reset on auth change.
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return
    if (isLoading) return

    if (user?.id) {
      posthog.identify(user.id, {
        email: user.email,
        username: user.username,
        display_name: user.display_name || undefined,
        app: "herpetoverse-web",
      })
    } else {
      posthog.reset()
    }
  }, [isLoading, user?.id, user?.email, user?.username, user?.display_name])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      {/* Suspense required: PostHogPageviews reads useSearchParams.
          Without this boundary, Next.js opts the whole subtree into
          CSR and breaks SSR for the landing page. */}
      <Suspense fallback={null}>
        <PostHogPageviews />
      </Suspense>
      {children}
    </>
  )
}
