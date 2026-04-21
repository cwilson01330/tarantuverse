'use client'

import { useEffect, useState } from 'react'

// Bump this suffix if you ever need to re-show the banner to users who
// already dismissed a previous version (e.g. after rewording).
const DISMISS_KEY = 'herpetoverse_banner_dismissed_v1'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

interface BannerConfig {
  enabled: boolean
  message: string
  url: string
}

interface SystemStatus {
  announcements?: {
    herpetoverse_banner?: BannerConfig
  }
}

/**
 * Splits the admin-configured message on the first em-dash (— or --) so
 * we can bold the lead-in and keep the tail as a subtitle.  Falls back to
 * rendering the whole thing bold when no dash is present.
 */
function splitMessage(msg: string): { headline: string; body: string } {
  const dashIndex = msg.search(/\s[—-]{1,2}\s/)
  if (dashIndex === -1) {
    return { headline: msg.trim(), body: '' }
  }
  const match = msg.slice(dashIndex).match(/\s[—-]{1,2}\s/)
  const dashLen = match ? match[0].length : 3
  return {
    headline: msg.slice(0, dashIndex).trim(),
    body: msg.slice(dashIndex + dashLen).trim(),
  }
}

export default function HerpetoverseBanner() {
  const [config, setConfig] = useState<BannerConfig | null>(null)
  const [dismissed, setDismissed] = useState(true) // start dismissed to avoid SSR flash

  // Check localStorage dismissal flag on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const alreadyDismissed = localStorage.getItem(DISMISS_KEY) === 'true'
    setDismissed(alreadyDismissed)
  }, [])

  // Fetch the feature flag from the public status endpoint.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/v1/system/status`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data: SystemStatus = await res.json()
        const banner = data?.announcements?.herpetoverse_banner
        if (!cancelled && banner) setConfig(banner)
      } catch {
        // Fail silent — banner is non-critical chrome.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, 'true')
    }
    setDismissed(true)
  }

  if (dismissed) return null
  if (!config || !config.enabled) return null
  if (!config.message) return null

  const { headline, body } = splitMessage(config.message)

  return (
    <div
      role="region"
      aria-label="Herpetoverse announcement"
      className="relative bg-gradient-to-r from-purple-600 via-purple-500 to-emerald-500 text-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-xs"
          >
            🦎
          </span>
          <p className="leading-snug">
            <span className="font-semibold">{headline}</span>
            {body && (
              <span className="hidden sm:inline text-white/90"> — {body}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={config.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white text-purple-700 text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Join the waitlist
            <span aria-hidden="true">→</span>
          </a>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="p-1.5 rounded-md hover:bg-white/15 transition-colors focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
