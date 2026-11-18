'use client'

/**
 * Saves this browser's time zone to the keeper's notification preferences
 * (HV day one, 2026-11-18), so the daily reminder hour is their LOCAL hour
 * even if they never open Notification settings. Once per browser session
 * (sessionStorage `hv_tz_synced`); failures are silent and retried next
 * session. Mounted by AppShell, so every signed-in page has it.
 */
import { useEffect } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useAuth } from '@/lib/auth'

const SYNCED_KEY = 'hv_tz_synced'

export default function TimezoneSync() {
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    try {
      if (window.sessionStorage.getItem(SYNCED_KEY)) return
      // Set first: one attempt per session, even if it fails or two pages mount.
      window.sessionStorage.setItem(SYNCED_KEY, '1')
    } catch {
      // Storage blocked: still try once per mount below.
    }
    apiFetch('/api/v1/notification-preferences/', {
      method: 'PUT',
      json: { tz_offset_minutes: new Date().getTimezoneOffset() },
    }).catch(() => {
      // Silent.
    })
  }, [token])

  return null
}
