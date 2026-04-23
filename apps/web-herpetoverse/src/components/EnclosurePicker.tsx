'use client'

/**
 * EnclosurePicker — minimal `<select>` of the keeper's non-feeder enclosures.
 *
 * v1 intentionally doesn't open the "create enclosure inline" can of worms —
 * keepers who haven't set up an enclosure yet can ship a reptile without one
 * and attach it later from the detail page. The empty-state copy below is
 * what tells them that.
 *
 * Filtering: we request `purpose=tarantula` which, on the backend, returns
 * enclosures tagged "tarantula" *or* NULL (legacy rows before the purpose
 * column existed). Feeder bins are excluded. No dedicated "reptile" tag
 * exists yet — when it does, flip the filter to include it. See
 * apps/web-herpetoverse/src/lib/enclosures.ts for the rationale.
 *
 * Styling: we keep it dead simple — a native select styled to match the form
 * INPUT_CLS used in /reptiles/add. Takes the same `className` override so the
 * parent can inject any tweaks without us reinventing the look.
 */

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { type EnclosureSummary, listEnclosures } from '@/lib/enclosures'

export default function EnclosurePicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null
  onChange: (enclosureId: string | null) => void
  className?: string
  disabled?: boolean
}) {
  const [enclosures, setEnclosures] = useState<EnclosureSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listEnclosures('tarantula')
      .then((items) => {
        if (!cancelled) {
          setEnclosures(items)
          setLoadError(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        // 401 is handled by the apiClient via redirect; everything else we
        // surface so the keeper at least knows the list is stale.
        if (err instanceof ApiError && err.status === 401) return
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'Could not load enclosures.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = enclosures == null && loadError == null

  return (
    <div className="space-y-1.5">
      <select
        value={value ?? ''}
        onChange={(e) => {
          const next = e.target.value
          onChange(next === '' ? null : next)
        }}
        disabled={disabled || loading}
        className={className}
        aria-label="Enclosure"
      >
        <option value="">— None —</option>
        {enclosures?.map((enc) => (
          <option key={enc.id} value={enc.id}>
            {formatOptionLabel(enc)}
          </option>
        ))}
      </select>

      {loading && (
        <p className="text-[11px] text-neutral-500">Loading enclosures…</p>
      )}
      {loadError && (
        <p
          role="alert"
          className="text-[11px] text-red-300"
          title={loadError}
        >
          {loadError}
        </p>
      )}
      {enclosures != null && enclosures.length === 0 && !loadError && (
        <p className="text-[11px] text-neutral-500">
          No enclosures yet — you can leave this as None and attach one later.
        </p>
      )}
    </div>
  )
}

/**
 * Render "Name · 10g · 2 inhabitants" — rich enough to disambiguate without
 * overflowing a native <option> (which on most browsers can't do multiline).
 */
function formatOptionLabel(enc: EnclosureSummary): string {
  const parts: string[] = [enc.name]
  if (enc.enclosure_type) parts.push(enc.enclosure_type)
  if (enc.inhabitant_count > 0) {
    parts.push(
      `${enc.inhabitant_count} inhabitant${enc.inhabitant_count === 1 ? '' : 's'}`,
    )
  }
  return parts.join(' · ')
}
