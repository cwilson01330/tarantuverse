'use client'

/**
 * "When did it last eat?" for the add-animal forms (Day-one, 2026-10-27).
 * Chips Today / Yesterday / Pick a date / Not sure, plus a native date input
 * (no future days) when "Pick a date" is chosen. Default is "Not sure": nothing
 * is logged and the First feeding card asks later.
 *
 * Controlled. The parent turns the value into an ISO time with
 * `lastFedFromField` (local noon of the chosen day, or null = log nothing).
 */
import {
  FIRST_FEEDING_COPY,
  dateFromInputValue,
  lastFedIso,
  todayInputValue,
  type LastFedChoice,
} from '@/lib/firstFeeding'

export interface LastFedValue {
  choice: LastFedChoice
  /** `YYYY-MM-DD` from the date input; only used when choice is 'pick'. */
  picked: string
}

export const NOT_SURE_LAST_FED: LastFedValue = { choice: 'not_sure', picked: '' }

/** The earliest day the date input accepts (same floor as the First feeding card). */
export const EARLIEST_LAST_FED = '1990-01-01'

/** Local noon of the chosen day as an ISO string, or null when nothing should be logged. */
export function lastFedFromField(v: LastFedValue, now: Date = new Date()): string | null {
  // A date before 1990 (a typo like 0202-03-04) is treated as no feeding, so the
  // add never posts a nonsense log; the First feeding card asks again later.
  if (v.choice === 'pick' && v.picked < EARLIEST_LAST_FED) return null
  return lastFedIso(v.choice, v.choice === 'pick' ? dateFromInputValue(v.picked) : null, now)
}

/**
 * Log the first feeding for a just-created animal (`id` is the invert id; a
 * tarantula's create id is the same). Never throws: the animal is already
 * saved, and the First feeding card asks again if this didn't land.
 */
export async function postFirstFeeding(token: string, id: string, fedAtIso: string): Promise<boolean> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const r = await fetch(`${apiUrl}/api/v1/inverts/${encodeURIComponent(id)}/feedings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fed_at: fedAtIso, accepted: true }),
    })
    return r.ok
  } catch {
    return false
  }
}

const CHIPS: Array<[LastFedChoice, string]> = [
  ['today', FIRST_FEEDING_COPY.chipToday],
  ['yesterday', FIRST_FEEDING_COPY.chipYesterday],
  ['pick', FIRST_FEEDING_COPY.chipPickDate],
  ['not_sure', FIRST_FEEDING_COPY.chipNotSure],
]

export default function LastFedField({
  value,
  onChange,
}: {
  value: LastFedValue
  onChange: (next: LastFedValue) => void
}) {
  return (
    <div>
      <p id="last-fed-label" className="block text-sm font-medium mb-1.5 text-theme-primary">
        {FIRST_FEEDING_COPY.lastFedLabel}
      </p>
      <div role="radiogroup" aria-labelledby="last-fed-label" className="flex gap-2 flex-wrap">
        {CHIPS.map(([choice, label]) => {
          const on = value.choice === choice
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() =>
                onChange({
                  choice,
                  picked: choice === 'pick' && !value.picked ? todayInputValue() : value.picked,
                })
              }
              className={`px-4 py-2 rounded-full text-sm font-semibold ${
                on
                  ? 'bg-gradient-brand text-white'
                  : 'bg-surface border border-theme text-theme-secondary hover:bg-surface-elevated'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {value.choice === 'pick' && (
        <input
          type="date"
          aria-label={FIRST_FEEDING_COPY.lastFedLabel}
          min={EARLIEST_LAST_FED}
          max={todayInputValue()}
          value={value.picked}
          onChange={(e) => onChange({ choice: 'pick', picked: e.target.value })}
          className="mt-3 w-full sm:w-auto px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <p className="mt-1.5 text-xs text-theme-tertiary">{FIRST_FEEDING_COPY.lastFedHint}</p>
    </div>
  )
}
