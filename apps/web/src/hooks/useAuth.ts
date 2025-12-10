import { useSession } from 'next-auth/react'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
  username?: string
  is_admin?: boolean
  is_superuser?: boolean
}

export interface UseAuthReturn {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Unified authentication hook that wraps NextAuth session
 * Provides consistent interface for accessing auth state across the app
 *
 * @returns {UseAuthReturn} Auth state including user, token, and loading status
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, token, isAuthenticated, isLoading } = useAuth()
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (!isAuthenticated) return <div>Please log in</div>
 *
 *   return <div>Welcome, {user?.name}!</div>
 * }
 * ```
 */
export function useAuth(): UseAuthReturn {
  const { data: session, status } = useSession()

  return {
    user: session?.user ? {
      id: session.user.id || '',
      email: session.user.email || null,
      name: session.user.name || null,
      image: session.user.image || null,
      is_admin: session.user.is_admin || false,
      is_superuser: session.user.is_superuser || false,
    } : null,
    token: session?.accessToken || null,
    isAuthenticated: !!session?.user,
    isLoading: status === 'loading',
  }
}
