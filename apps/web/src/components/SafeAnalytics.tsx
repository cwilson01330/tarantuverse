'use client'

/**
 * Vercel Analytics, minus anything that could carry an access token.
 *
 * Sitter pass pages keep a live token in the URL fragment (/sit#<token>).
 * Events for /sit are dropped entirely, and every other event has its
 * fragment stripped too — no page on this site should ever send one.
 * (PRD-shared-keeping, T3.)
 */
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'

function scrub(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const u = new URL(event.url)
    if (u.pathname === '/sit' || u.pathname.startsWith('/sit/') || u.pathname === '/invite' || u.pathname.startsWith('/c/')) return null  // /c/<code>: unlisted card links
    u.hash = ''
    return { ...event, url: u.toString() }
  } catch {
    // An unparseable URL can't be proven safe.
    return null
  }
}

export default function SafeAnalytics() {
  return <Analytics beforeSend={scrub} />
}
