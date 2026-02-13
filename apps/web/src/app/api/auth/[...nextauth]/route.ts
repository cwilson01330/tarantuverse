import NextAuth, { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import AppleProvider from "next-auth/providers/apple"
import CredentialsProvider from "next-auth/providers/credentials"
import axios from "axios"
import jwt from "jsonwebtoken"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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
          console.error("Auth error:", error)
          return null
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

          // Get email - Apple might hide it, fall back to user.email from NextAuth
          const email = profile?.email || user.email

          if (!email) {
            return false
          }

          // Send user info to our backend (NextAuth has already completed OAuth)
          const response = await axios.post(
            `${API_URL}/api/v1/auth/oauth-login`,
            {
              provider: account.provider,
              email: email,
              name: userName || email.split("@")[0], // Fallback to email prefix
              picture: (profile as any)?.picture || user.image || null,
              id: (profile as any)?.sub || (profile as any)?.id,
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
        } catch {
          return false
        }
      }
      
      return true
    },
    
    async jwt({ token, user, account }) {
      if (user) {
        token.accessToken = user.accessToken
        token.id = user.id
        token.isNewUser = user.isNewUser
        token.is_admin = user.is_admin
        token.is_superuser = user.is_superuser
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
