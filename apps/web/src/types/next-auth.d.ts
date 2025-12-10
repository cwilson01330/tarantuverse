import "next-auth"

declare module "next-auth" {
  interface Session {
    accessToken?: string
    isNewUser?: boolean
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      username?: string
      is_admin?: boolean
      is_superuser?: boolean
    }
  }

  interface User {
    id: string
    email?: string | null
    name?: string | null
    image?: string | null
    username?: string
    accessToken?: string
    isNewUser?: boolean
    is_admin?: boolean
    is_superuser?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    id?: string
    username?: string
    isNewUser?: boolean
    is_admin?: boolean
    is_superuser?: boolean
  }
}
