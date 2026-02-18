'use client'

import { useState, useEffect } from 'react'

interface Announcement {
  id: string
  title: string
  message: string
  banner_type: 'info' | 'sale' | 'update' | 'coupon'
  link_url?: string | null
  link_text?: string | null
  coupon_code?: string | null
}

const typeConfig = {
  sale: { icon: '🏷️', accent: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  coupon: { icon: '🎟️', accent: 'border-l-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  update: { icon: '📢', accent: 'border-l-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  info: { icon: 'ℹ️', accent: 'border-l-gray-500', bg: 'bg-gray-50 dark:bg-gray-800' },
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchAnnouncement()
  }, [])

  const fetchAnnouncement = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/announcements/active`)
      if (!res.ok) return
      const data = await res.json()
      if (!data) return

      // Check if dismissed
      const dismissedKey = `dismissed_announcement_${data.id}`
      if (typeof window !== 'undefined' && localStorage.getItem(dismissedKey)) return

      setAnnouncement(data)
    } catch {
      // Silently fail — banner is non-critical
    }
  }

  const handleDismiss = () => {
    if (announcement) {
      localStorage.setItem(`dismissed_announcement_${announcement.id}`, 'true')
    }
    setDismissed(true)
  }

  const handleCopy = async () => {
    if (announcement?.coupon_code) {
      await navigator.clipboard.writeText(announcement.coupon_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!announcement || dismissed) return null

  const config = typeConfig[announcement.banner_type] || typeConfig.info

  return (
    <div className={`${config.bg} border border-theme border-l-4 ${config.accent} rounded-xl px-4 py-3 mb-6`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg flex-shrink-0">{config.icon}</span>

        <div className="flex-1 min-w-0">
          <span className="font-semibold text-theme-primary text-sm">{announcement.title}</span>
          <span className="text-theme-secondary text-sm ml-2">{announcement.message}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {announcement.coupon_code && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-theme rounded-lg text-xs font-mono font-bold text-theme-primary hover:bg-surface-elevated transition-colors"
              title="Copy coupon code"
            >
              {announcement.coupon_code}
              <svg className="w-3.5 h-3.5 text-theme-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied && <span className="text-green-500 text-xs">Copied!</span>}
            </button>
          )}

          {announcement.link_url && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-gradient-brand text-white rounded-lg text-xs font-semibold hover:brightness-90 transition whitespace-nowrap"
            >
              {announcement.link_text || 'Learn More'}
            </a>
          )}

          <button
            onClick={handleDismiss}
            className="p-1 text-theme-tertiary hover:text-theme-primary transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
