import NextAuth, { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import AppleProvider from "next-auth/providers/apple"
import CredentialsProvider from "next-auth/providers/credentials"
import axios from "axios"
import jwt from "jsonwebtoken"
import { cookies } from "next/headers"
import { shouldRefreshToken } from "@/lib/tokenRefresh"
import {
  LOGIN_ONLY_COOKIE,
  PENDING_COOKIE,
  encodePending,
  isOAuthProvider,
  noAccountFromDetail,
} from "@/lib/oauthNoAccount"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// The API access token lasts 14 days (ACCESS_TOKEN_EXPIRE_MINUTES); the web
// session lives as long, and every session read re-issues the cookie, so an
// active keeper's session rolls forward. The API token inside it is swapped
// for a fresh one once it is a day old (see the `jwt` callback).
const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60

type RefreshOutcome =
  | { kind: "ok"; accessToken: string; user?: { is_admin?: boolean; is_superuser?: boolean } }
  | { kind: "dead" } // 401: expired / revoked / unknown user — can never recover
  | { kind: "failed" } // anything else (API asleep, 429, network): keep the token

// Concurrent session reads (several tabs, the API client's getSession() per
// request) all see the same old cookie; share one refresh call among them.
const inflightRefresh = new Map<string, Promise<RefreshOutcome>>()

function refreshApiToken(accessToken: string): Promise<RefreshOutcome> {
  const existing = inflightRefresh.get(accessToken)
  if (existing) return existing

  const attempt = (async (): Promise<RefreshOutcome> => {
    try {
      // Short timeout: this runs inside the session read, which every
      // authenticated request waits on. A cold API gets another try later
      // (see REFRESH_RETRY_AFTER_MS) rather than freezing the UI.
      const response = await axios.post(
        `${API_URL}/api/v1/auth/refresh`,
        undefined,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 }
      )
      if (typeof response.data?.access_token === "string") {
        return { kind: "ok", accessToken: response.data.access_token, user: response.data.user }
      }
      return { kind: "failed" }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return { kind: "dead" }
      }
      console.error("[nextauth] token refresh failed; keeping the current token")
      return { kind: "failed" }
    }
  })().finally(() => {
    inflightRefresh.delete(accessToken)
  })

  inflightRefresh.set(accessToken, attempt)
  return attempt
}

/**
 * True when the sign-in began on the LOGIN page: the page sets
 * LOGIN_ONLY_COOKIE just before `signIn()`, and an account must not be created
 * without the keeper confirming. No cookie (register page, old tabs, a browser
 * that dropped it) keeps the old behaviour. See lib/oauthNoAccount.ts.
 *
 * The cookie is one-shot: it is removed as soon as it has been read, so it
 * can't linger for ten minutes after a successful sign-in (or a refused one)
 * and silently stop some later OAuth entry point from creating accounts.
 */
async function signInIsLoginOnly(): Promise<boolean> {
  try {
    const jar = await cookies()
    const loginOnly = jar.get(LOGIN_ONLY_COOKIE)?.value === "1"
    if (jar.has(LOGIN_ONLY_COOKIE)) {
      try {
        const secure = process.env.NODE_ENV === "production"
        // Same attributes the page set it with (SameSite=None needs Secure).
        jar.set(LOGIN_ONLY_COOKIE, "", {
          maxAge: 0,
          path: "/",
          sameSite: secure ? "none" : "lax",
          secure,
        })
      } catch {
        // Read-only cookie store: it still expires on its own after 10 minutes.
      }
    }
    return loginOnly
  } catch {
    return false
  }
}

// Generate Apple client secret dynamically
// This creates a fresh JWT on each server start, avoiding expiration issues
function generateAppleClientSecret(): string | undefined {
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_KEY_ID
  const privateKey = process.env.APPLE_PRIVATE_KEY
  const clientId = process.env.APPLE_CLIENT_ID

  // If we have all components, generate the JWT dynamically
  if (teamId && keyId && privateKey && clientId) {
    try {
      const now = Math.floor(Date.now() / 1000)
      const secret = jwt.sign(
        {
          iss: teamId,
          iat: now,
          exp: now + 86400 * 180, // 180 days (max allowed by Apple)
          aud: "https://appleid.apple.com",
          sub: clientId,
        },
        privateKey.replace(/\\n/g, "\n"), // Handle escaped newlines from env
        {
          algorithm: "ES256",
          keyid: keyId,
        }
      )
      return secret
    } catch (error) {
      console.error("[Apple] Failed to generate client secret:", error)
      return undefined
    }
  }

  // Fall back to pre-generated secret if provided
  return process.env.APPLE_CLIENT_SECRET
}

const authOptions: AuthOptions = {
  providers: [
    // Google OAuth (only if credentials are configured)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "consent",
                access_type: "offline",
                response_type: "code"
              }
            }
          })
        ]
      : []),

    // Apple OAuth (only if credentials are configured)
    // Supports both dynamic JWT generation (preferred) and pre-generated secret
    ...(() => {
      const clientId = process.env.APPLE_CLIENT_ID
      const clientSecret = generateAppleClientSecret()

      if (clientId && clientSecret) {
        return [
          AppleProvider({
            clientId,
            clientSecret,
            // Apple uses cross-origin form POST callback - no cookie-based checks work
            // SameSite=Lax cookies aren't sent on cross-origin POST requests
            checks: [],
          })
        ]
      }
      return []
    })(),

    // Email/Password (existing auth)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/login`, {
            email: credentials?.email,
            password: credentials?.password
          })
          
          if (response.data.access_token) {
            return {
              id: response.data.user?.id || "",
              email: response.data.user?.email || credentials?.email || "",
              name: response.data.user?.display_name || credentials?.email || "",
              image: response.data.user?.avatar_url,
              accessToken: response.data.access_token,
              is_admin: response.data.user?.is_admin || false,
              is_superuser: response.data.user?.is_superuser || false
            }
          }
          return null
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const detail =
              typeof error.response?.data?.detail === "string"
                ? error.response.data.detail
                : undefined

            console.error("Auth error:", detail || error.message)
            throw new Error(detail || "Invalid email or password")
          }

          console.error("Auth error:", error)
          throw new Error("Invalid email or password")
        }
      }
    })
  ],
  
  callbacks: {
    async signIn({ user, account, profile }) {
      // Handle OAuth providers
      if (account?.provider === "google" || account?.provider === "apple") {
        try {
          // Handle Apple's different profile format
          // Apple's name is an object {firstName, lastName} and only on first login
          let userName = user.name
          if (account.provider === "apple" && profile) {
            const appleProfile = profile as any
            if (appleProfile.name) {
              // Apple provides name as object on first login only
              const firstName = appleProfile.name.firstName || ""
              const lastName = appleProfile.name.lastName || ""
              userName = `${firstName} ${lastName}`.trim() || user.name
            }
          } else if (profile?.name) {
            // Google and others provide name as string
            userName = profile.name as string
          }

          // The backend verifies this token against the provider's JWKS and
          // derives the account identity from the VERIFIED claims. We must not
          // send our own email/sub — /auth/oauth-login is a public endpoint, so
          // asserted claims are forgeable and were previously a full auth
          // bypass. NextAuth surfaces the raw OIDC token on `account`.
          const idToken = account.id_token
          if (!idToken) {
            console.error(
              `[nextauth] ${account.provider} returned no id_token; cannot verify sign-in`
            )
            return false
          }

          // From the login page, an unknown email must not silently become a
          // new account (a keeper who signed up with another address would
          // get a second, empty one) — the API answers 409 oauth_no_account
          // and the page asks. Everywhere else: create, as before.
          const loginOnly = await signInIsLoginOnly()

          const response = await axios.post(
            `${API_URL}/api/v1/auth/oauth-login`,
            {
              provider: account.provider,
              id_token: idToken,
              // Cosmetic only; Apple omits the name from the token.
              name: userName || undefined,
              allow_create: !loginOnly,
            }
          )

          if (response.data.access_token) {
            user.accessToken = response.data.access_token
            user.id = response.data.user.id
            user.email = response.data.user.email
            user.name = response.data.user.display_name
            user.image = response.data.user.avatar_url
            user.isNewUser = response.data.is_new_user
            user.is_admin = response.data.user.is_admin || false
            user.is_superuser = response.data.user.is_superuser || false
            return true
          }
          return false
        } catch (error) {
          // 409 oauth_no_account: this provider email has no account and the
          // keeper signed in from the login page. Hand the email to the page
          // through a short-lived cookie (never the URL — PostHog and Vercel
          // Analytics record URLs) and send them back to ask what to do.
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            const missing = noAccountFromDetail(error.response.data?.detail)
            if (missing && isOAuthProvider(account.provider)) {
              const provider = account.provider
              if (missing.email) {
                try {
                  ;(await cookies()).set(
                    PENDING_COOKIE,
                    encodePending({ email: missing.email, provider }),
                    {
                      maxAge: 300,
                      path: "/",
                      sameSite: "lax",
                      secure: process.env.NODE_ENV === "production",
                      httpOnly: false, // the login page reads it once, then deletes it
                    }
                  )
                } catch {
                  // The page still asks, just without naming the email.
                }
              }
              return `/login?oauth=no_account&provider=${provider}`
            }
          }
          return false
        }
      }

      return true
    },

    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken
        token.id = user.id
        token.isNewUser = user.isNewUser
        token.is_admin = user.is_admin
        token.is_superuser = user.is_superuser
        delete token.refreshFailedAt
        return token
      }

      // Later reads of the session (the client's getSession / useSession).
      // Swap the API token for a fresh one once it is a day old so a keeper
      // who keeps using the site never meets the 14-day wall.
      const current = token.accessToken
      if (current && shouldRefreshToken(current, Date.now(), token.refreshFailedAt)) {
        const outcome = await refreshApiToken(current)
        if (outcome.kind === "ok") {
          token.accessToken = outcome.accessToken
          delete token.refreshFailedAt
          if (outcome.user) {
            token.is_admin = outcome.user.is_admin ?? token.is_admin
            token.is_superuser = outcome.user.is_superuser ?? token.is_superuser
          }
        } else if (outcome.kind === "dead") {
          // The API says this token can never work again (expired or logged
          // out elsewhere). Throwing makes next-auth's session route clear the
          // session cookie and answer "signed out", so the keeper is sent to
          // sign in instead of holding a session whose every call fails.
          throw new Error("API access token is no longer valid")
        } else {
          // Not a verdict on the token: keep it, and don't ask again for a
          // few minutes (stored in the token so it survives between reads).
          token.refreshFailedAt = Date.now()
        }
      }
      return token
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.user.id = token.id as string
      session.isNewUser = token.isNewUser as boolean
      session.user.is_admin = token.is_admin as boolean
      session.user.is_superuser = token.is_superuser as boolean
      return session
    },

    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after successful sign in
      // This handles Apple OAuth which loses callbackUrl due to cross-origin POST
      if (!url || url === "/" || url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/dashboard`
      }

      if (url.startsWith("/")) {
        return `${baseUrl}${url}`
      }

      if (url.startsWith(baseUrl)) {
        return url
      }

      return `${baseUrl}/dashboard`
    }
  },
  
  pages: {
    signIn: "/login",
    signOut: "/",
    error: "/login",
  },
  
  session: {
    strategy: "jwt" as const,
    // Matches the API token (14 days). Was 24 h, which signed keepers out daily.
    maxAge: SESSION_MAX_AGE_SECONDS,
  },

  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
