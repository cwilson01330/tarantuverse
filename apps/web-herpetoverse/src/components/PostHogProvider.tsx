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
// Route through our own /relay path (see next.config.js rewrites).
// First-party URL survives ad blockers that block us.i.posthog.com.
// We use /relay rather than /ingest because /ingest/* is on some
// blocklists as a known PostHog proxy convention.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "/relay"
const POSTHOG_UI_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com"

// Sitter pass pages carry a live access token in the URL fragment
// (/sit#<token>). posthog-js attaches $current_url — fragment included — to
// every event, and capture_pageleave is on, so a sitter closing the tab would
// ship the token to analytics. PostHog is therefore never started on /sit,
// and no pageview is sent for it. (PRD-shared-keeping, T3.)
function isSitterPage(path: string | null | undefined): boolean {
  // /invite carries a co-keeper invite token in its fragment the same way.
  return !!path && (path === "/sit" || path.startsWith("/sit/") || path === "/invite")
}

let initialized = false

function initPostHog() {
  if (initialized) return
  if (typeof window === "undefined") return
  if (isSitterPage(window.location.pathname)) return
  if (!POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    // We don't use PostHog feature flags (Tarantuverse has its own
    // admin-panel flag system). Disable the flag poll to remove a
    // blocker-targeted request and skip a round-trip.
    advanced_disable_feature_flags: true,
    // Defence in depth for sitter links (/sit#<token>): strip the fragment
    // from every URL property PostHog attaches, on every event, on every
    // page. The /sit guard below stops PostHog starting there on a direct
    // load; this covers any path to /sit it might not.
    sanitize_properties: (props) => {
      for (const k of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
        const v = props[k]
        if (typeof v === "string") props[k] = v.split("#")[0]
      }
      return props
    },
    advanced_disable_feature_flags_on_first_load: true,
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
    if (isSitterPage(pathname)) return
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
