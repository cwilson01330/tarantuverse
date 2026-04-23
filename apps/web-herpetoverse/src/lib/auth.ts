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

const TOKEN_KEY = 'hv_token'
const USER_KEY = 'hv_user'

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

export function setSession(token: string, user: AuthUser): void {
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

export function clearSession(): void {
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
