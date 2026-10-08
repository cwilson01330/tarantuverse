'use client'

/**
 * The viewer's display units (imperial: in, °F / metric: cm, °C).
 *
 * The setting is per keeper and shared with Tarantuverse (one
 * `users.measurement_units` column), so choosing metric on either app shows
 * metric on both.
 *
 *  - Signed in: the keeper's `measurement_units` from /auth/me. If they have
 *    never chosen (null), the browser region decides and is saved ONCE so it
 *    follows them to their phone and to Tarantuverse.
 *  - Signed out (public pages such as /a/{id}, care sheets): browser region.
 *
 * Display only — storage never changes (see lib/units.ts). Same contract as
 * apps/web/src/components/UnitsProvider.tsx, on Herpetoverse's own auth.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useAuth } from '@/lib/auth'
import { browserDefaultUnits, isUnits, type Units } from '@/lib/units'

const CACHE_KEY = 'hv_measurement_units'

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

async function saveUnits(u: Units): Promise<boolean> {
  try {
    await apiFetch('/api/v1/auth/me/profile', { method: 'PUT', json: { measurement_units: u } })
    return true
  } catch {
    return false
  }
}

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()
  // Deterministic first render (server + client agree); the effects below
  // settle the real value straight after hydration.
  const [units, setUnitsState] = useState<Units>('imperial')

  useEffect(() => {
    if (isLoading) {
      // Last signed-in choice on this browser, for a flicker-free first paint.
      setUnitsState(readCache() ?? browserDefaultUnits())
      return
    }
    if (!token) {
      writeCache(null)
      setUnitsState(browserDefaultUnits())
      return
    }
    const cached = readCache()
    if (cached) setUnitsState(cached)

    let cancelled = false
    ;(async () => {
      try {
        const me = await apiFetch<{ measurement_units?: string | null }>('/api/v1/auth/me')
        if (cancelled || !me) return
        if (isUnits(me.measurement_units)) {
          setUnitsState(me.measurement_units)
          writeCache(me.measurement_units)
        } else if ('measurement_units' in me) {
          // Never chosen: use this browser's region and save it once. Only
          // when the API knows the field, so an older API isn't sent it.
          const guess = browserDefaultUnits()
          setUnitsState(guess)
          writeCache(guess)
          await saveUnits(guess)
        } else {
          setUnitsState(cached ?? browserDefaultUnits())
        }
      } catch {
        /* offline or signed out mid-request: keep what we have */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLoading, token])

  const setUnits = useCallback(
    async (u: Units) => {
      setUnitsState(u)
      if (!token) return true
      writeCache(u)
      return saveUnits(u)
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
