'use client'

/**
 * Notification preferences — Herpetoverse web (audit-2 M9).
 *
 * Same row and API as HV mobile's app/notification-preferences.tsx and TV
 * web's /dashboard/settings/notifications (one notification_preferences row
 * per keeper, shared by both apps). Every switch here changes something:
 *   - daily feeding digest + hour: the server's digest (services/digest_service.py),
 *     which counts HV animals too. The hour is local, so the browser's zone is
 *     saved with it.
 *   - per-animal reminders + refusal restart (smart reminders, saved at once).
 *     The old phone-side "reminder after a feeding" was removed 2026-11-18:
 *     the server digest replaced it (HV mobile no longer schedules it).
 *   - sitter activity: server push when a sitter starts logging.
 *   - quiet hours: enforced server-side on every push (notification_service).
 *
 * The PUT sends only the fields this page edits, so it can't overwrite
 * settings Tarantuverse owns. Renders inside the settings auth gate.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, ApiError } from '@/lib/apiClient'
import { FIRST_FEEDING_COPY } from '@/lib/firstFeeding'

interface PrefsResponse {
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  sitter_activity_enabled?: boolean | null
  daily_digest_enabled?: boolean | null
  email_digest_enabled?: boolean | null
  digest_hour?: number | null
  /** Smart reminders. Older API builds omit them (treated as off). */
  smart_reminders_enabled?: boolean | null
  refusal_restarts_wait?: boolean | null
}

type ReminderSwitchKey = 'smart_reminders_enabled' | 'refusal_restarts_wait'

// Same two switches as Tarantuverse, minus the post-molt one (Herpetoverse has
// no pause around sheds).
const REMINDER_SWITCHES: { key: ReminderSwitchKey; title: string; line: string }[] = [
  {
    key: 'smart_reminders_enabled',
    title: 'Reminders for each animal',
    line: 'When 1–3 animals are due, get a reminder for each with Fed, Refused and Tomorrow buttons. With more due, you get one summary.',
  },
  {
    key: 'refusal_restarts_wait',
    title: 'A refusal restarts the wait',
    line: "A refused meal counts as an offer, so you're not reminded again until the next normal feeding time.",
  },
]

const CARD_CLS = 'p-6 rounded-lg border border-neutral-800 bg-neutral-900/50'
const SECTION_HDR_CLS = 'text-lg font-semibold text-white'
const ROW_TITLE_CLS = 'text-sm font-medium text-neutral-200'
const ROW_HINT_CLS = 'text-sm text-neutral-500 mt-0.5'
const INPUT_CLS =
  'px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark]'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const HHMM_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/

/** "9:00 AM" from 9. */
function formatHour(h: number): string {
  const hour = ((h % 24) + 24) % 24
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

/** Same rule as the server's notification_service.in_quiet_hours. */
function hourIsQuiet(hour: number, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = String(s ?? '').split(':').map((x) => Number(x))
    return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null
  }
  const a = toMin(start)
  const b = toMin(end)
  if (a == null || b == null || a === b) return false
  const t = hour * 60
  return a < b ? t >= a && t < b : t >= a || t < b
}

/** <input type="time"> wants zero-padded "08:00"; the server accepts "8:00". */
function padClock(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return h && m ? `${h.padStart(2, '0')}:${m}` : hhmm
}

function Toggle({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-herp-teal' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-neutral-950 transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function NotificationPreferencesPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [digestEnabled, setDigestEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [digestHour, setDigestHour] = useState(9)
  const [reminderSwitches, setReminderSwitches] = useState<Record<ReminderSwitchKey, boolean>>({
    smart_reminders_enabled: false,
    refusal_restarts_wait: false,
  })
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [sitterEnabled, setSitterEnabled] = useState(true)
  const [quietEnabled, setQuietEnabled] = useState(false)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await apiFetch<PrefsResponse>('/api/v1/notification-preferences/')
      // Older rows can lack the newer columns — fall back to the server defaults.
      setDigestEnabled(data.daily_digest_enabled ?? true)
      setEmailEnabled(data.email_digest_enabled === true)
      setDigestHour(typeof data.digest_hour === 'number' ? data.digest_hour : 9)
      setReminderSwitches({
        smart_reminders_enabled: data.smart_reminders_enabled === true,
        refusal_restarts_wait: data.refusal_restarts_wait === true,
      })
      setSitterEnabled(data.sitter_activity_enabled ?? true)
      setQuietEnabled(data.quiet_hours_enabled)
      setQuietStart(padClock(data.quiet_hours_start || '22:00'))
      setQuietEnd(padClock(data.quiet_hours_end || '08:00'))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  /** Wrap a setter so any edit clears the last save's status. */
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setSaved(false)
      setSaveError(null)
      setter(v)
    }
  }

  /** Optimistic: flip now, PUT just this field (the API applies only fields
   *  sent), revert with a short line on failure. */
  async function toggleReminderSwitch(key: ReminderSwitchKey, value: boolean) {
    const previous = reminderSwitches[key]
    setSwitchError(null)
    setReminderSwitches((p) => ({ ...p, [key]: value }))
    try {
      await apiFetch('/api/v1/notification-preferences/', {
        method: 'PUT',
        json: { [key]: value },
      })
    } catch {
      setReminderSwitches((p) => ({ ...p, [key]: previous }))
      setSwitchError("Couldn't save that change. Please try again.")
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (quietEnabled && (!HHMM_RE.test(quietStart) || !HHMM_RE.test(quietEnd))) {
      setSaveError('Quiet hours need a start and an end time.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      // Only the fields this page edits — Tarantuverse shares this row.
      await apiFetch('/api/v1/notification-preferences/', {
        method: 'PUT',
        json: {
          daily_digest_enabled: digestEnabled,
          email_digest_enabled: emailEnabled,
          digest_hour: digestHour,
          // The digest hour is a local hour: save this browser's zone with it.
          tz_offset_minutes: new Date().getTimezoneOffset(),
          sitter_activity_enabled: sitterEnabled,
          quiet_hours_enabled: quietEnabled,
          quiet_hours_start: quietStart,
          quiet_hours_end: quietEnd,
        },
      })
      setSaved(true)
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? err.message
          : 'Could not save. Check your connection and try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  const digestInQuiet =
    digestEnabled && quietEnabled && hourIsQuiet(digestHour, quietStart, quietEnd)

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <Link
          href="/app/settings"
          className="inline-block text-sm text-herp-teal hover:text-herp-lime transition-colors mb-4"
        >
          ← Settings
        </Link>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Account
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Notifications
        </h1>
        <p className="text-neutral-400 text-sm">
          What we notify you about and when. These settings are shared with
          Tarantuverse and apply on every device. Push notifications go to the
          phone app you signed in to most recently; everything also lands in
          your{' '}
          <Link
            href="/app/notifications"
            className="text-herp-teal hover:text-herp-lime underline underline-offset-4"
          >
            notifications list
          </Link>
          .
        </p>
      </header>

      {loading ? (
        <div className="text-xs uppercase tracking-widest text-neutral-600 py-12 text-center">
          Loading…
        </div>
      ) : loadError ? (
        <div className={`${CARD_CLS} text-center`}>
          <p className="text-sm text-neutral-400 mb-4">
            Couldn&apos;t load your notification settings.
          </p>
          <button
            onClick={load}
            className="text-sm text-herp-teal hover:text-herp-lime transition-colors underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-8" noValidate>
          {/* ---------- Feeding ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Feeding reminders</h2>

            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className={ROW_TITLE_CLS}>Daily feeding digest</p>
                <p className={ROW_HINT_CLS}>
                  One notification a day saying how many animals are due, using
                  the same schedule as Feeding Day. Nothing is sent on days when
                  nothing is due.
                </p>
              </div>
              <Toggle
                on={digestEnabled}
                onChange={edit(setDigestEnabled)}
                label="Daily feeding digest"
              />
            </div>

            <div
              className={`mt-4 flex items-start justify-between gap-4 ${
                digestEnabled ? '' : 'opacity-50'
              }`}
            >
              <div>
                <p className={ROW_TITLE_CLS}>{FIRST_FEEDING_COPY.dailyEmailSwitch}</p>
                <p className={ROW_HINT_CLS}>{FIRST_FEEDING_COPY.dailyEmailHelp}</p>
              </div>
              <Toggle
                on={emailEnabled}
                onChange={edit(setEmailEnabled)}
                label={FIRST_FEEDING_COPY.dailyEmailSwitch}
                disabled={!digestEnabled}
              />
            </div>

            <div
              className={`mt-4 flex flex-wrap items-start justify-between gap-4 ${
                digestEnabled ? '' : 'opacity-50'
              }`}
            >
              <div className="flex-1 min-w-[12rem]">
                <label htmlFor="digest-hour" className={`block ${ROW_TITLE_CLS}`}>
                  Digest time
                </label>
                <p className={ROW_HINT_CLS}>
                  Your local time. Saving here uses this browser&apos;s time zone.
                  {digestInQuiet &&
                    ' This is inside your quiet hours, so the digest will wait in your notifications list instead of buzzing your phone.'}
                </p>
              </div>
              <select
                id="digest-hour"
                className={INPUT_CLS}
                value={digestHour}
                disabled={!digestEnabled}
                onChange={(e) => edit(setDigestHour)(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>

            {REMINDER_SWITCHES.map((item) => {
              // Per-animal reminders go out from the daily digest run, so that
              // one does nothing while the digest is off.
              const locked = item.key === 'smart_reminders_enabled' && !digestEnabled
              return (
                <div
                  key={item.key}
                  className={`mt-4 flex items-start justify-between gap-4 ${
                    locked ? 'opacity-50' : ''
                  }`}
                >
                  <div>
                    <p className={ROW_TITLE_CLS}>{item.title}</p>
                    <p className={ROW_HINT_CLS}>{item.line}</p>
                  </div>
                  <Toggle
                    on={reminderSwitches[item.key]}
                    onChange={(v) => void toggleReminderSwitch(item.key, v)}
                    label={item.title}
                    disabled={locked}
                  />
                </div>
              )
            })}
            {switchError && (
              <p className="mt-3 text-sm text-rose-400" role="alert">
                {switchError}
              </p>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              These reminder and email settings also apply to Tarantuverse if you use it.
            </p>

          </div>

          {/* ---------- Sitter links ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Sitter links</h2>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className={ROW_TITLE_CLS}>Sitter activity</p>
                <p className={ROW_HINT_CLS}>
                  When a sitter starts logging feedings on one of your links
                  (once per round). Lockouts always notify you.
                </p>
              </div>
              <Toggle
                on={sitterEnabled}
                onChange={edit(setSitterEnabled)}
                label="Sitter activity notifications"
              />
            </div>
          </div>

          {/* ---------- Quiet hours ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Quiet hours</h2>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className={ROW_TITLE_CLS}>Don&apos;t buzz me at night</p>
                <p className={ROW_HINT_CLS}>
                  No push notifications in this window, your local time. They
                  still wait in your notifications list. Sitter-link lockouts
                  still come through.
                </p>
              </div>
              <Toggle
                on={quietEnabled}
                onChange={edit(setQuietEnabled)}
                label="Quiet hours"
              />
            </div>
            {quietEnabled && (
              <div className="mt-4 grid grid-cols-2 gap-4 max-w-sm">
                <div>
                  <label
                    htmlFor="quiet-start"
                    className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5"
                  >
                    Start
                  </label>
                  <input
                    id="quiet-start"
                    type="time"
                    className={`${INPUT_CLS} w-full`}
                    value={quietStart}
                    onChange={(e) => edit(setQuietStart)(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="quiet-end"
                    className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5"
                  >
                    End
                  </label>
                  <input
                    id="quiet-end"
                    type="time"
                    className={`${INPUT_CLS} w-full`}
                    value={quietEnd}
                    onChange={(e) => edit(setQuietEnd)(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
            {saved && (
              <span className="text-sm text-herp-lime" role="status">
                Saved.
              </span>
            )}
            {saveError && (
              <span className="text-sm text-rose-400" role="alert">
                {saveError}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
