'use client'

/**
 * Saves this browser's time zone to the keeper's notification preferences
 * (Day-one, 2026-10-27), so the daily reminder hour is their LOCAL hour even
 * if they never open Notification settings. Once per browser session
 * (sessionStorage `tz_synced`); failures are silent and retried next session.
 * Mounted by DashboardLayout, so every signed-in dashboard page has it.
 */
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SYNCED_KEY = 'tz_synced'

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
    fetch(`${API_URL}/api/v1/notification-preferences/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tz_offset_minutes: new Date().getTimezoneOffset() }),
    }).catch(() => {
      // Silent.
    })
  }, [token])

  return null
}
