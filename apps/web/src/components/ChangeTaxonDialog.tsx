'use client'

/**
 * Change an animal's taxon — web counterpart of the mobile ChangeTaxonSheet.
 *
 * WHY A DIALOG RATHER THAN A SELECT ON THE EDIT FORM
 * ---------------------------------------------------
 * Taxon looks like a field, so the cheap build is a <select> next to Sex. That
 * would be wrong twice over:
 *
 *  - Server-side it isn't a field. POST /inverts/{id}/change-taxon deletes a
 *    legacy mirror row and rewrites foreign keys across every log table.
 *    Firing that from "Save changes", alongside a nickname edit, means someone
 *    can trigger it by mis-clicking an option and never know.
 *  - The species link doesn't survive the move — a tarantula's species_id is
 *    meaningless on a jumping spider, so it's cleared unless a new one is
 *    picked. Silently blanking a field reads as data loss even when nothing
 *    was lost, so the re-pick belongs in this flow, not left as homework.
 *
 * Two steps, explicit confirm, species search built in.
 *
 * The "history stays" promise is one the backend actually enforces — it
 * re-counts child rows and rolls back on mismatch. Don't hedge it into
 * "should be preserved"; hedging a guaranteed operation just makes keepers
 * distrust a safe one.
 */
import { useEffect, useRef, useState } from 'react'
import { INVERT_TAXA, type InvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const TAXON_ORDER: InvertTaxon[] = [
  'tarantula', 'scorpion', 'centipede', 'whip_spider', 'vinegaroon',
  'true_spider', 'millipede', 'mantis', 'roach', 'other',
]

interface SpeciesHit {
  id: string
  scientific_name: string
  common_names?: string[] | null
}

interface Props {
  open: boolean
  /** Current taxon — rendered as the disabled row so it can't be re-picked. */
  current: InvertTaxon
  animalName: string
  onClose: () => void
  onConfirm: (taxon: InvertTaxon, speciesId: string | null) => Promise<void>
}

/* No `token` prop: /invert-species/search is public, same as the add page's
   species lookup. The change-taxon call itself is authenticated, but that
   happens in onConfirm, on the page that owns the token. */
export default function ChangeTaxonDialog({
  open, current, animalName, onClose, onConfirm,
}: Props) {
  const [picked, setPicked] = useState<InvertTaxon | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpeciesHit[]>([])
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setPicked(null)
    setQuery('')
    setHits([])
    setSpeciesId(null)
  }

  // Reset whenever the dialog closes. A dialog that reopens still holding the
  // last attempt's destination taxon is how someone confirms a change they
  // didn't mean.
  useEffect(() => {
    if (!open) reset()
  }, [open])

  // Escape closes — expected of any modal, and the only keyboard exit here.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const onQueryChange = (text: string) => {
    setQuery(text)
    setSpeciesId(null)
    if (debounce.current) clearTimeout(debounce.current)
    if (!text.trim() || !picked) {
      setHits([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/invert-species/search?q=${encodeURIComponent(text.trim())}&taxon=${picked}&limit=8`,
        )
        setHits(res.ok ? await res.json() : [])
      } catch {
        setHits([])
      }
    }, 250)
  }

  const confirm = async () => {
    if (!picked) return
    setSaving(true)
    try {
      await onConfirm(picked, speciesId)
    } finally {
      setSaving(false)
    }
  }

  const pickedMeta = picked ? INVERT_TAXA[picked] : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !saving && onClose()}
      role="presentation"
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Change animal type"
      >
        {picked === null ? (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Change type</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 mb-4">
              Filed the wrong kind of animal? Pick what {animalName} really is.
              Feedings, molts, photos and notes all stay.
            </p>

            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {TAXON_ORDER.map((key) => {
                const meta = INVERT_TAXA[key]
                const isCurrent = key === current
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setPicked(key)}
                    aria-label={meta.label}
                    className={`w-full flex items-center gap-3 py-3 text-left ${
                      isCurrent
                        ? 'opacity-45 cursor-default'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-2 -mx-2'
                    }`}
                  >
                    <span className="text-xl w-8 text-center" aria-hidden="true">{meta.glyph}</span>
                    <span className="flex-1 font-semibold text-gray-900 dark:text-white">{meta.label}</span>
                    {isCurrent && (
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Current
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {INVERT_TAXA[current].label} → {pickedMeta?.label}
            </h2>

            {picked !== 'other' && (
              <div className="mt-4 relative">
                <label
                  htmlFor="retaxon-species"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5"
                >
                  Species
                </label>
                <input
                  id="retaxon-species"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={`Search ${pickedMeta?.label.toLowerCase()} species…`}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-electric-blue-500"
                />
                {hits.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSpeciesId(h.id)
                            setQuery(h.scientific_name)
                            setHits([])
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <span className="block text-sm font-medium text-gray-900 dark:text-white italic">
                            {h.scientific_name}
                          </span>
                          {h.common_names?.[0] && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {h.common_names[0]}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!speciesId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    Optional — but the old species won&apos;t carry over, so leaving
                    this blank means no care sheet until you set one.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <span className="text-green-600 dark:text-green-400" aria-hidden="true">✓</span>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                Every feeding, molt, substrate change and photo stays with {animalName}.
              </p>
            </div>

            <button
              type="button"
              onClick={confirm}
              disabled={saving}
              className="w-full mt-5 py-3 rounded-xl bg-gradient-brand text-white font-semibold disabled:opacity-60"
            >
              {saving ? 'Changing…' : `Change to ${pickedMeta?.label.toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="w-full mt-2 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-60"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Human-readable reason a taxon change was refused.
 *
 * The 409 body is `{message, orphan_rows}` rather than a bare string, so the
 * usual "detail is a string" path would show a keeper "[object Object]".
 */
export async function describeTaxonChangeFailure(res: Response): Promise<string> {
  try {
    const body = await res.json()
    const detail = body?.detail
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      return detail.message
    }
    if (typeof detail === 'string' && detail.trim()) return detail
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return 'Something went wrong. Your animal was not changed.'
}
