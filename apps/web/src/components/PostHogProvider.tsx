"use client"

/**
 * PostHog analytics provider for Tarantuverse web.
 *
 * Wraps the app to:
 *   - Initialize PostHog once on mount (using NEXT_PUBLIC_POSTHOG_KEY).
 *   - Capture $pageview on every App Router navigation. PostHog's own
 *     `capture_pageview: "history_change"` does not fire reliably on
 *     Next App Router, so we drive pageviews from `usePathname` manually.
 *   - Identify the signed-in NextAuth user (id, email, name, admin flags)
 *     and reset the PostHog identity on sign-out.
 *
 * Failing open:
 *   If NEXT_PUBLIC_POSTHOG_KEY is unset (local dev, first deploy), the
 *   provider is a pure pass-through — no network calls, no warnings.
 *   This lets us ship the plumbing before the PostHog project exists.
 *
 * Privacy:
 *   We set `autocapture: false` so PostHog only records the events we
 *   explicitly send. Pageviews are sent with the pathname only (query
 *   and hash stripped) to avoid leaking reset-password tokens, upload
 *   session tokens, etc.
 */

import { Suspense, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import posthog from "posthog-js"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
// Route through our own /relay path (see next.config.js rewrites).
// First-party URL survives ad blockers that block us.i.posthog.com.
// We use /relay rather than /ingest because /ingest/* is on some
// blocklists as a known PostHog proxy convention.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "/relay"
// Where the PostHog dashboard lives — used so "view in PostHog" links
// in the debug toolbar point to the real UI, not our proxy path.
const POSTHOG_UI_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://us.posthog.com"

// Sitter pass pages carry a live access token in the URL fragment
// (/sit#<token>). posthog-js attaches $current_url — fragment included — to
// every event, and capture_pageleave is on, so a sitter closing the tab would
// ship the token to analytics. PostHog is therefore never started on /sit,
// and no pageview is sent for it. (PRD-shared-keeping, T3.)
function isSitterPage(path: string | null | undefined): boolean {
  // /invite carries a co-keeper invite token in its fragment the same way.
  // /c/<code> is an unlisted card link: the code IS the access, so it stays
  // out of analytics too.
  return !!path && (path === "/sit" || path.startsWith("/sit/") || path === "/invite" || path.startsWith("/c/"))
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
    // We send pageviews manually from PostHogPageviews below.
    capture_pageview: false,
    capture_pageleave: true,
    // Only events we explicitly capture — no DOM-wide autocapture.
    autocapture: false,
    // Sensible session recording defaults; off until we turn it on in
    // the PostHog project settings.
    disable_session_recording: true,
    // We don't use PostHog feature flags (Tarantuverse has its own admin
    // panel flag system via /api/v1/system/settings). Disabling the flag
    // poll removes a request that some ad blockers target and shaves a
    // round-trip on every page load.
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
    // Don't create a distinct_id until we have real telemetry to send.
    loaded: () => {
      // no-op
    },
  })
  initialized = true
}

/**
 * Child component: captures a $pageview on every route change.
 *
 * Separated so we can also use the NextAuth session to identify the
 * user without fighting the search-params suspense boundary.
 */
function PostHogPageviews() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  // Pageview on every navigation.
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return
    if (!pathname) return
    if (isSitterPage(pathname)) return
    // Intentionally ignore searchParams in the URL we send — they can
    // contain reset tokens, upload session tokens, etc. We still depend
    // on them so pageviews fire when only the query changes.
    void searchParams
    posthog.capture("$pageview", { $pathname: pathname })
  }, [pathname, searchParams])

  // Identify / reset on auth state changes.
  useEffect(() => {
    if (!POSTHOG_KEY || typeof window === "undefined") return
    if (status === "loading") return

    if (status === "authenticated" && session?.user?.id) {
      posthog.identify(session.user.id, {
        email: session.user.email || undefined,
        name: session.user.name || undefined,
        is_admin: session.user.is_admin || false,
        is_superuser: session.user.is_superuser || false,
        app: "tarantuverse-web",
      })
    } else if (status === "unauthenticated") {
      // Cut the identity so the next session starts clean.
      posthog.reset()
    }
  }, [status, session?.user?.id, session?.user?.email, session?.user?.name, session?.user?.is_admin, session?.user?.is_superuser])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      {/* Suspense required: PostHogPageviews reads useSearchParams.
          Keeping the boundary local to the pageview tracker so the
          rest of the tree never Suspends. */}
      <Suspense fallback={null}>
        <PostHogPageviews />
      </Suspense>
      {children}
    </>
  )
}
