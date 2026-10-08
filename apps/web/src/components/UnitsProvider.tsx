"use client"

/**
 * The viewer's display units (imperial: in, °F / metric: cm, °C).
 *
 *  - Signed in: the keeper's `measurement_units` from /auth/me. If they have
 *    never chosen (null), the browser region decides and is saved ONCE so it
 *    follows them to their phone.
 *  - Signed out (public pages /t, /i, /col, care sheets): the browser region.
 *
 * Display only — storage never changes (see lib/units.ts).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { browserDefaultUnits, isUnits, type Units } from '@/lib/units'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const CACHE_KEY = 'tv_measurement_units'

interface UnitsContextValue {
  units: Units
  /** Save a new choice (optimistic; persists to the account when signed in). */
  setUnits: (u: Units) => Promise<boolean>
}

const UnitsContext = createContext<UnitsContextValue>({
  units: 'imperial',
  setUnits: async () => false,
})

function readCache(): Units | null {
  try {
    const v = window.localStorage.getItem(CACHE_KEY)
    return isUnits(v) ? v : null
  } catch {
    return null
  }
}

function writeCache(u: Units | null) {
  try {
    if (u) window.localStorage.setItem(CACHE_KEY, u)
    else window.localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode — fine */
  }
}

async function saveUnits(token: string, u: Units): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ measurement_units: u }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null
  // Deterministic first render (server + client agree); the effects below
  // settle the real value straight after hydration.
  const [units, setUnitsState] = useState<Units>('imperial')

  useEffect(() => {
    if (status === 'loading') {
      // Last signed-in choice on this browser, for a flicker-free first paint.
      setUnitsState(readCache() ?? browserDefaultUnits())
      return
    }
    if (status === 'unauthenticated' || !token) {
      writeCache(null)
      setUnitsState(browserDefaultUnits())
      return
    }
    const cached = readCache()
    if (cached) setUnitsState(cached)

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return
        const me = await res.json()
        if (cancelled) return
        if (isUnits(me?.measurement_units)) {
          setUnitsState(me.measurement_units)
          writeCache(me.measurement_units)
        } else if (me && 'measurement_units' in me) {
          // Never chosen: use this browser's region and save it once. Only
          // when the API knows the field, so an older API isn't sent it.
          const guess = browserDefaultUnits()
          setUnitsState(guess)
          writeCache(guess)
          await saveUnits(token, guess)
        } else {
          setUnitsState(cached ?? browserDefaultUnits())
        }
      } catch {
        /* offline: keep what we have */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, token])

  const setUnits = useCallback(
    async (u: Units) => {
      setUnitsState(u)
      if (!token) return true
      writeCache(u)
      return saveUnits(token, u)
    },
    [token],
  )

  const value = useMemo(() => ({ units, setUnits }), [units, setUnits])
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}

/** `const { units, setUnits } = useUnits()` */
export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext)
}
