import "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    isNewUser?: boolean
    user: {
      id?: string
      email?: string | null
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    accessToken?: string
    isNewUser?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    id?: string
    isNewUser?: boolean
  }
}
