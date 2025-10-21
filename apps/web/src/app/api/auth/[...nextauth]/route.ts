import NextAuth, { AuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import AppleProvider from "next-auth/providers/apple"
import CredentialsProvider from "next-auth/providers/credentials"
import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [
          AppleProvider({
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
          })
        ]
      : []),

    // Email/Password (existing auth)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const response = await axios.post(`${API_URL}/auth/login`, {
            email: credentials?.email,
            password: credentials?.password
          })
          
          if (response.data.access_token) {
            return {
              id: response.data.user?.id || "",
              email: response.data.user?.email || credentials?.email || "",
              name: response.data.user?.display_name || credentials?.email || "",
              image: response.data.user?.avatar_url,
              accessToken: response.data.access_token
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
          console.log("[OAuth Debug] Provider:", account.provider)
          console.log("[OAuth Debug] Profile data:", JSON.stringify(profile, null, 2))

          // Send user info to our backend (NextAuth has already completed OAuth)
          const response = await axios.post(
            `${API_URL}/api/v1/auth/oauth-login`,
            {
              provider: account.provider,
              email: profile?.email || user.email,
              name: profile?.name || user.name,
              picture: profile?.picture || profile?.image || user.image,
              id: profile?.sub || profile?.id,
            }
          )

          if (response.data.access_token) {
            // Store our backend token
            user.accessToken = response.data.access_token
            user.id = response.data.user.id
            user.email = response.data.user.email
            user.name = response.data.user.display_name
            user.image = response.data.user.avatar_url
            user.isNewUser = response.data.is_new_user
            return true
          }
          return false
        } catch (error: any) {
          console.error(`${account.provider} OAuth error:`, error)
          console.error("Error details:", error.response?.data)
          return false
        }
      }
      
      return true
    },
    
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.accessToken = user.accessToken
        token.id = user.id
        token.isNewUser = user.isNewUser
      }
      return token
    },
    
    async session({ session, token }) {
      // Add access token and user ID to session
      session.accessToken = token.accessToken as string
      session.user.id = token.id as string
      session.isNewUser = token.isNewUser as boolean
      return session
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
