'use client'

/**
 * Dashboard feeding nudge (HV day one, 2026-11-18): one status fetch feeds
 * (a) the "First meal not logged" card for animals the server flags
 * `needs_first_feeding` and (b) the once-only "something is due" email ask.
 * Renders nothing when there is nothing to show; every failure is silent.
 */
import { useCallback, useEffect, useState } from 'react'
import { listAnimalFeedingStatus } from '@/lib/animals'
import { getToken } from '@/lib/auth'
import { firstFeedingRows } from '@/lib/firstFeeding'
import EmailReminderDialog, { decideAskWhenDue } from './EmailReminderDialog'
import FirstFeedingCard from './FirstFeedingCard'

export default function DashboardFeedingNudge() {
  const [items, setItems] = useState<{ id: string; name: string }[]>([])
  const [askOpen, setAskOpen] = useState(false)

  const load = useCallback(async (askIfDue: boolean) => {
    // Signed out = no request (the dashboard redirects anyway).
    if (!getToken()) return
    try {
      const rows = await listAnimalFeedingStatus(new Date().getTimezoneOffset())
      setItems(
        firstFeedingRows(rows).map((r) => ({
          id: r.id,
          name: r.name || r.common_name || r.scientific_name || 'Unnamed animal',
        })),
      )
      if (askIfDue) {
        // Due = overdue, not paused/resting, and with a schedule (plant-eaters without one never are).
        const anyDue = rows.some(
          (r) =>
            r.is_overdue &&
            !r.is_feeding_paused &&
            !r.is_brumating &&
            !r.no_schedule &&
            r.status_mode !== 'daily',
        )
        if (await decideAskWhenDue(anyDue)) setAskOpen(true)
      }
    } catch {
      // Silent: the dashboard works without it.
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])

  return (
    <>
      <FirstFeedingCard items={items} onLogged={() => void load(false)} />
      <EmailReminderDialog open={askOpen} variant="due" onClose={() => setAskOpen(false)} />
    </>
  )
}
