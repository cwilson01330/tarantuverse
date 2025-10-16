import { DefaultSession, DefaultUser } from "next-auth"
import { JWT, DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    isNewUser?: boolean
    user: {
      id: string
      email: string
      name: string
      image?: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    accessToken?: string
    isNewUser?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    accessToken?: string
    userId?: string
    isNewUser?: boolean
  }
}
