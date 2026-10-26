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
import { detailOfBody, noAccountFromDetail } from '@/lib/oauthNoAccount'
import { setLastSignInMethod } from '@/lib/lastSignInMethod'

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

/** Handed to the page when Google's email has no account (login mode only). */
export interface NoAccountInfo {
  email: string
  /**
   * Repeat the sign-in with account creation allowed (the "Create account"
   * button). Resolves to an error message when it failed, or null on success
   * (the page is navigating away) - it does NOT go through `onError`, which
   * dismisses the confirm.
   */
  createAccount: () => Promise<string | null>
}

export default function GoogleSignInButton({
  next,
  onError,
  mode = 'register',
  onNoAccount,
}: {
  next: string
  onError?: (message: string) => void
  /**
   * `login`: an email with no account is NOT turned into a new account — the
   * API refuses (`allow_create: false`) and `onNoAccount` lets the page ask.
   * `register` (default, the old behaviour): create it.
   */
  mode?: 'login' | 'register'
  onNoAccount?: (info: NoAccountInfo) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // No client id configured → don't render (keeps the page working on
  // email/password until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set in the env).
  if (!CLIENT_ID) return null

  async function postCredential(credential: string, allowCreate: boolean | undefined) {
    // Send the RAW signed ID token. The backend verifies it against Google's
    // JWKS (signature, issuer, audience, expiry) and derives the identity
    // from the verified claims — we deliberately send no email/sub of our
    // own, because anything the client asserts is attacker-controllable.
    const data = await apiFetch<OAuthLoginResponse>('/api/v1/auth/oauth-login', {
      method: 'POST',
      auth: false,
      json: {
        provider: 'google',
        id_token: credential,
        // Omitted = the API's default (create), which old pages relied on.
        ...(allowCreate === undefined ? {} : { allow_create: allowCreate }),
      },
    })
    setSession(data.access_token, data.user)
    setLastSignInMethod('google')
    router.replace(next)
  }

  async function handleCredential(resp: CredentialResponse) {
    if (busy || !resp.credential) return
    const credential = resp.credential
    setBusy(true)
    try {
      await postCredential(credential, mode === 'login' && onNoAccount ? false : undefined)
    } catch (err) {
      const missing =
        mode === 'login' && onNoAccount && err instanceof ApiError && err.status === 409
          ? noAccountFromDetail(detailOfBody(err.body))
          : null
      if (missing) {
        // The same Google token is reused if they choose to create the
        // account (nothing was consumed by the refusal).
        onNoAccount?.({
          email: missing.email,
          createAccount: async () => {
            setBusy(true)
            try {
              await postCredential(credential, true)
              return null
            } catch (retryErr) {
              setBusy(false)
              return retryErr instanceof ApiError ? retryErr.message : 'Google sign-in failed.'
            }
          },
        })
        setBusy(false)
        return
      }
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
