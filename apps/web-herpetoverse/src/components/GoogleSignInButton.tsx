'use client'

/**
 * "Sign in with Google" for Herpetoverse web (Google Identity Services).
 *
 * Renders Google's official button; on success it decodes the returned ID
 * token, POSTs the profile to the shared, app-agnostic `/auth/oauth-login`
 * (same endpoint the mobile apps use), persists the session, and redirects.
 *
 * Reads the WEB OAuth client id from `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. If that
 * env var isn't set, the component renders nothing — so the page degrades to
 * email/password rather than showing a broken button.
 */
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiFetch, ApiError } from '@/lib/apiClient'
import { type AuthUser, setSession } from '@/lib/auth'

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface OAuthLoginResponse {
  access_token: string
  user: AuthUser
}

/** Decode a JWT payload (no verification — backend receives the fields). */
function decodeJwt(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export default function GoogleSignInButton({
  next,
  onError,
}: {
  next: string
  onError?: (message: string) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // No client id configured → don't render (keeps the page working on
  // email/password until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set in the env).
  if (!CLIENT_ID) return null

  async function handleCredential(resp: CredentialResponse) {
    if (busy || !resp.credential) return
    setBusy(true)
    const payload = decodeJwt(resp.credential)
    if (!payload?.email) {
      onError?.('Could not read your Google account. Please try again.')
      setBusy(false)
      return
    }
    try {
      const data = await apiFetch<OAuthLoginResponse>('/api/v1/auth/oauth-login', {
        method: 'POST',
        auth: false,
        json: {
          provider: 'google',
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
          id: payload.sub,
        },
      })
      setSession(data.access_token, data.user)
      router.replace(next)
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Google sign-in failed.')
      setBusy(false)
    }
  }

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={handleCredential}
          onError={() => onError?.('Google sign-in was cancelled or failed.')}
          theme="filled_black"
          text="continue_with"
          shape="rectangular"
          width="320"
        />
      </div>
    </GoogleOAuthProvider>
  )
}
