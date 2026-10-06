'use client'

/**
 * Small inline editor shared by the colony log rows (feeding, molt, substrate,
 * water, event). Field-config driven so each row type stays a few lines.
 */
import { useState } from 'react'

export type EditField = {
  key: string
  label: string
  type: 'date' | 'text' | 'textarea' | 'select' | 'number' | 'toggle'
  options?: { value: string; label: string }[]
  placeholder?: string
  hint?: string
  /** Toggle only: labels for the true / false states. */
  toggleLabels?: [string, string]
}

export type EditValues = Record<string, string | boolean>

const inputCls =
  'w-full px-3 py-2 border border-theme rounded-lg bg-surface text-theme-primary placeholder-theme-tertiary focus:outline-none focus:ring-2 focus:ring-electric-blue-500'

export default function EditPanel({
  title,
  fields,
  initial,
  busy,
  error,
  onSave,
  onCancel,
}: {
  title: string
  fields: EditField[]
  initial: EditValues
  busy: boolean
  error: string
  onSave: (values: EditValues) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<EditValues>(initial)
  const set = (key: string, v: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  return (
    <div className="p-4 rounded-2xl border border-theme bg-surface-elevated space-y-3">
      <h3 className="text-sm font-semibold text-theme-primary">{title}</h3>
      {error && (
        <div
          role="alert"
          className="p-2 text-sm rounded-lg border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `edit-${f.key}`
          const full = f.type === 'textarea'
          return (
            <div key={f.key} className={full ? 'sm:col-span-2' : ''}>
              <label
                htmlFor={id}
                className="block text-sm font-medium text-theme-secondary mb-1"
              >
                {f.label}
              </label>
              {f.type === 'textarea' && (
                <textarea
                  id={id}
                  rows={2}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={inputCls}
                />
              )}
              {(f.type === 'text' || f.type === 'date' || f.type === 'number') && (
                <input
                  id={id}
                  type={f.type}
                  min={f.type === 'number' ? 1 : undefined}
                  value={String(values[f.key] ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={inputCls}
                />
              )}
              {f.type === 'select' && (
                <select
                  id={id}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={inputCls}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {f.type === 'toggle' && (
                <div className="flex gap-2">
                  {[true, false].map((v, i) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={values[f.key] === v}
                      onClick={() => set(f.key, v)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                        values[f.key] === v
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-theme bg-surface text-theme-primary hover:border-primary-400'
                      }`}
                    >
                      {(f.toggleLabels ?? ['Yes', 'No'])[i]}
                    </button>
                  ))}
                </div>
              )}
              {f.hint && <span className="block mt-1 text-xs text-theme-tertiary">{f.hint}</span>}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-lg border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(values)}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
