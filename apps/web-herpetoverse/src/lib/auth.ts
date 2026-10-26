/**
 * Client-side auth for Herpetoverse.
 *
 * The Herpetoverse web app reuses the Tarantuverse user table — same API,
 * same credentials. This module is the thin localStorage-backed token
 * store + a React hook so client components can react to sign-in/out.
 *
 * Token storage key is `hv_token` (not `token`) so the user can be signed
 * in to both apps in the same browser without collisions. Same rule for
 * the cached user blob (`hv_user`).
 *
 * Server components should NOT import this — there's no SSR user here.
 * Authenticated pages are client components gated by the layout in
 * `/app/reptiles/layout.tsx`.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { shouldRefreshToken } from './tokenRefresh'

const TOKEN_KEY = 'hv_token'
const USER_KEY = 'hv_user'
// Same default as apiClient.ts. Not imported from there: apiClient imports this
// module, and a cycle for one string isn't worth it.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

export interface AuthUser {
  id: string
  email: string
  username: string
  display_name?: string | null
  avatar_url?: string | null
}

// ---------------------------------------------------------------------------
// Raw storage helpers. Safe to call from event handlers.
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getCachedUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

// Bumped by every sign-in and sign-out in this tab. A token refresh takes it
// before it starts and saves its result only if it is unchanged, so a refresh
// that lands just after sign-out can't put the old session back.
let sessionEpoch = 0

function writeSession(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
    // Notify same-tab subscribers — `storage` only fires cross-tab.
    window.dispatchEvent(new Event('hv-auth-change'))
  } catch {
    // ignore — private mode or quota
  }
}

export function setSession(token: string, user: AuthUser): void {
  sessionEpoch++
  writeSession(token, user)
}

export function clearSession(): void {
  sessionEpoch++
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(USER_KEY)
    window.dispatchEvent(new Event('hv-auth-change'))
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Token refresh. The API token lasts 14 days; swap it for a fresh one once it
// is a day old (on app load and when the tab comes back) so a keeper who keeps
// using the app is never signed out by the clock.
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<void> | null = null
let lastRefreshFailedAt: number | null = null
// A cold API can take 30 s+ to answer; don't leave the refresh (and its
// single-flight slot) hanging that long. A timeout is a non-401 failure: the
// keeper keeps the token and the normal backoff applies.
const REFRESH_TIMEOUT_MS = 15_000

export function refreshTokenIfStale(): Promise<void> {
  const token = getToken()
  if (!token || !shouldRefreshToken(token, Date.now(), lastRefreshFailedAt)) {
    return Promise.resolve()
  }
  if (refreshInFlight) return refreshInFlight

  const epoch = sessionEpoch
  refreshInFlight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
    // Another tab may have refreshed, or this tab signed out / in again, while
    // the request was in flight; only act if the session we asked about is
    // still the current one. Always re-checked synchronously before a write.
    const stillCurrent = () => sessionEpoch === epoch && getToken() === token
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (res.status === 401) {
        // Expired or revoked: it can never recover. Same effect as any other
        // 401 in apiFetch — the app guard sends the keeper to sign in.
        if (stillCurrent()) clearSession()
        return
      }
      if (!res.ok) {
        // 429, API asleep, 5xx: not a verdict on the token. Keep it and don't
        // ask again for a few minutes.
        lastRefreshFailedAt = Date.now()
        return
      }
      const data = (await res.json()) as { access_token?: unknown; user?: AuthUser }
      // The body read above is the last await: no sign-out can slip in between
      // this check and the write.
      if (typeof data.access_token !== 'string' || !stillCurrent()) return
      const user = data.user ?? getCachedUser()
      if (user) {
        writeSession(data.access_token, user)
      } else {
        window.localStorage.setItem(TOKEN_KEY, data.access_token)
        window.dispatchEvent(new Event('hv-auth-change'))
      }
    } catch {
      // Offline / blocked / timed out: keep the token, retry later.
      lastRefreshFailedAt = Date.now()
    } finally {
      clearTimeout(timer)
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// ---------------------------------------------------------------------------
// React hook. Components can read `{ user, token, isLoading }` + `logout()`.
// Renders null during SSR to avoid hydration mismatch.
// ---------------------------------------------------------------------------

export interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  logout: () => void
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)

  const sync = useCallback(() => {
    setTokenState(getToken())
    setUser(getCachedUser())
    setLoading(false)
  }, [])

  useEffect(() => {
    sync()
    const onChange = () => sync()
    window.addEventListener('hv-auth-change', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('hv-auth-change', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [sync])

  const logout = useCallback(() => {
    clearSession()
  }, [])

  return { user, token, isLoading, logout }
}
