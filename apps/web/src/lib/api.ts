/**
 * API Client
 */
import axios from 'axios'
import { getSession } from 'next-auth/react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Endpoints where a 401 means "bad credentials" / "bad reset token" rather
 * than "session expired". A 401 from these must NOT force logout — let the
 * calling form surface the error normally.
 */
const AUTH_ENDPOINTS_NO_AUTO_LOGOUT = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
]

/**
 * Browser paths where the user is already in an unauthenticated flow — do
 * not redirect to /login from these even if a rogue request 401s.
 */
const UNAUTHED_PATHS = [
  '/login',
  '/register',
  '/reset-password',
  '/forgot-password',
  '/verify-email',
]

// Guard against multiple parallel 401s all trying to kick off a redirect.
let redirectingToLogin = false

/**
 * Keep `localStorage.auth_token` in step with the NextAuth session.
 *
 * The request interceptor below prefers `auth_token` over the session, so a
 * stale copy (written by older versions of the site, or left behind after the
 * session's API token was refreshed) would keep sending a token the session no
 * longer holds. Called by `SessionTokenSync` whenever the session settles:
 * a signed-in session overwrites an existing copy (it never creates one — the
 * session is the source of truth), a signed-out one removes it.
 */
export function syncStoredAuthToken(sessionToken: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const stored = window.localStorage.getItem('auth_token')
    if (stored === null) return
    if (sessionToken) {
      if (stored !== sessionToken) window.localStorage.setItem('auth_token', sessionToken)
    } else {
      window.localStorage.removeItem('auth_token')
    }
  } catch {
    // private mode / blocked storage — the interceptor falls back to the session
  }
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    // First try localStorage (for email/password login)
    let token = localStorage.getItem('auth_token')

    // If not found, check NextAuth session (for OAuth login)
    if (!token) {
      const session = await getSession()
      if (session?.accessToken) {
        token = session.accessToken as string
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? ''

      // A 401 from login/register/forgot/reset means "bad credentials" or
      // "bad reset token" — let the calling form surface it. Do not nuke
      // the session or redirect.
      const isCredentialCheckEndpoint = AUTH_ENDPOINTS_NO_AUTO_LOGOUT.some(
        (endpoint) => url.includes(endpoint)
      )
      if (isCredentialCheckEndpoint) {
        return Promise.reject(error)
      }

      // Only redirect if we're on an authenticated page AND we haven't
      // already started a redirect. This prevents a wave of parallel 401s
      // from clobbering each other or bouncing the user mid-flow on
      // /reset-password or /verify-email pages.
      const currentPath = window.location.pathname
      const isOnUnauthedPage = UNAUTHED_PATHS.some(
        (authPath) => currentPath.includes(authPath)
      )

      if (!isOnUnauthedPage && !redirectingToLogin) {
        redirectingToLogin = true
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user')
        // End the NextAuth session too: it now lasts 14 days, so a token that
        // died early (deactivated account, revoked elsewhere) would otherwise
        // keep reporting "signed in" until the next refresh check.
        import('next-auth/react')
          .then(({ signOut }) => signOut({ redirect: false }))
          .catch(() => undefined)
          .finally(() => {
            window.location.href = '/login'
          })
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
