'use client'

/**
 * "Sign in with Google" for Herpetoverse web (Google Identity Services).
 *
 * Renders Google's official button; on success it POSTs the RAW ID token to
 * the shared, app-agnostic `/auth/oauth-login` (same endpoint the mobile apps
 * use), which verifies it server-side against Google's JWKS before resolving
 * an account. Then persists the session and redirects.
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

/**
 * Whether the Google button will actually render. Exported so callers can hide
 * their "or" divider too — otherwise an unset client id leaves a separator
 * floating above nothing.
 *
 * NOTE: this is inlined at BUILD time (NEXT_PUBLIC_*), so adding the env var
 * in Vercel does nothing until the app is redeployed.
 */
export const googleSignInEnabled = Boolean(CLIENT_ID)

interface OAuthLoginResponse {
  access_token: string
  user: AuthUser
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
    try {
      // Send the RAW signed ID token. The backend verifies it against Google's
      // JWKS (signature, issuer, audience, expiry) and derives the identity
      // from the verified claims — we deliberately send no email/sub of our
      // own, because anything the client asserts is attacker-controllable.
      const data = await apiFetch<OAuthLoginResponse>('/api/v1/auth/oauth-login', {
        method: 'POST',
        auth: false,
        json: {
          provider: 'google',
          id_token: resp.credential,
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
      {/* Google renders this button itself (inside an iframe), so it's the
          official control and its interior can't be restyled — that's the
          point, and it's what keeps us inside Google's branding terms.
          `width` only takes a px string, so the wrapper caps it to the form
          width (max-w-md = 28rem = 448px) instead of the old fixed 320px,
          which left it visibly narrower than the fields above it. */}
      <div
        className={`flex justify-center [&>div]:!w-full ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
        aria-busy={busy}
      >
        <GoogleLogin
          onSuccess={handleCredential}
          onError={() => onError?.('Google sign-in was cancelled or failed.')}
          theme="filled_black"
          text="continue_with"
          shape="rectangular"
          size="large"
          logo_alignment="center"
          width="448"
        />
      </div>
    </GoogleOAuthProvider>
  )
}
