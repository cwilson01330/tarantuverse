"use client"

/**
 * Renders nothing. Reacts to the NextAuth session settling:
 *
 *  - keeps `localStorage.auth_token` equal to the session's API token (the
 *    session swaps that token for a fresh one when it is a day old — see the
 *    `jwt` callback — and `lib/api.ts` reads `auth_token` first);
 *  - once a session exists, records a pending Google/Apple button press as the
 *    "last sign-in method" (see lib/lastSignInMethod.ts).
 *
 * Mounted inside <SessionProvider> in components/Providers.tsx.
 */

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { syncStoredAuthToken } from "@/lib/api"
import { promotePendingSignInMethod } from "@/lib/lastSignInMethod"

export default function SessionTokenSync() {
  const { data: session, status } = useSession()
  const token = session?.accessToken ?? null

  useEffect(() => {
    if (status === "loading") return
    syncStoredAuthToken(status === "authenticated" ? token : null)
    if (status === "authenticated") promotePendingSignInMethod()
  }, [status, token])

  return null
}
