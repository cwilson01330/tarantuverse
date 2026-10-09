'use client'

/**
 * Change an animal's taxon — HV web mirror of Tarantuverse's ChangeTaxonDialog
 * (and the HV mobile ChangeTaxonSheet). Audit-2 M10.
 *
 * WHY A DIALOG RATHER THAN A SELECT ON THE EDIT FORM
 * ---------------------------------------------------
 * Taxon is not an ordinary field: it's off AnimalUpdate on purpose, and the
 * species link doesn't survive the move (a corn snake's care sheet on a gecko
 * drives the wrong prey sizes and cadence, so the server clears it unless a
 * new one is picked). So: two steps, an explicit confirm, and the species
 * re-pick built into the same flow rather than left as homework.
 *
 * "Everything stays" is a promise the server keeps — every log, photo, gene
 * and breeding row hangs off the animal's id, which doesn't change. Don't
 * hedge it; hedging a safe operation just makes keepers distrust it.
 *
 * The taxon list comes from the registry (ANIMAL_TAXON_ORDER), not a copy.
 */
import { useEffect, useRef, useState } from 'react'
import { ANIMAL_TAXA, ANIMAL_TAXON_ORDER, type AnimalTaxon } from '@/lib/animals'
import { searchReptileSpecies, type ReptileSpeciesSearchResult } from '@/lib/reptileSpecies'

interface Props {
  open: boolean
  /** Current taxon — rendered as the disabled row so it can't be re-picked. */
  current: AnimalTaxon
  animalName: string
  /** The animal carries a CGD diet override that the change will reset. */
  hasDietOverride?: boolean
  onClose: () => void
  /** Resolve to close; reject with a message to show and stay open. */
  onConfirm: (taxon: AnimalTaxon, speciesId: string | null) => Promise<void>
}

export default function ChangeTaxonDialog({
  open,
  current,
  animalName,
  hasDietOverride = false,
  onClose,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState<AnimalTaxon | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ReptileSpeciesSearchResult[]>([])
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setPicked(null)
    setQuery('')
    setHits([])
    setSpeciesId(null)
    setError(null)
  }

  // Fresh state every open. A dialog that reopens holding the last attempt's
  // destination is how someone confirms a change they didn't mean.
  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current)
  }, [])

  if (!open) return null

  const onQueryChange = (text: string) => {
    setQuery(text)
    setSpeciesId(null)
    if (debounce.current) clearTimeout(debounce.current)
    if (text.trim().length < 2 || !picked) {
      setHits([])
      return
    }
    const taxon = picked
    debounce.current = setTimeout(async () => {
      try {
        setHits(await searchReptileSpecies(text.trim(), 8, taxon))
      } catch {
        setHits([])
      }
    }, 250)
  }

  const confirm = async () => {
    if (!picked || saving) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(picked, speciesId)
    } catch (err) {
      // Refusals change nothing server-side — stay open and say why.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Your animal was not changed.',
      )
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    if (!saving) onClose()
  }

  const pickedMeta = picked ? ANIMAL_TAXA[picked] : null

  return (
    <div
      role="presentation"
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change animal type"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        {picked === null ? (
          <>
            <div className="px-5 py-4 border-b border-neutral-800">
              <h2 className="text-sm font-semibold text-white tracking-wide">Change type</h2>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Filed the wrong kind of animal? Pick what {animalName} really is.
                Feedings, sheds, weigh-ins, photos, genes and breeding records all stay.
              </p>
            </div>
            <div className="px-5 py-2 divide-y divide-neutral-800">
              {ANIMAL_TAXON_ORDER.map((key) => {
                const meta = ANIMAL_TAXA[key]
                const isCurrent = key === current
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setPicked(key)}
                    aria-label={isCurrent ? `${meta.label} (current)` : `Change to ${meta.label.toLowerCase()}`}
                    className={`w-full flex items-center gap-3 py-3 text-left rounded-md px-2 -mx-2 transition-colors ${
                      isCurrent ? 'opacity-45 cursor-default' : 'hover:bg-neutral-900'
                    }`}
                  >
                    <span className="text-xl w-8 text-center" aria-hidden="true">{meta.glyph}</span>
                    <span className="flex-1 text-sm font-semibold text-neutral-100">{meta.label}</span>
                    {isCurrent ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Current
                      </span>
                    ) : (
                      <span className="text-neutral-600" aria-hidden="true">›</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="px-5 py-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={close}
                className="w-full text-sm text-neutral-500 hover:text-neutral-300 px-4 py-2 transition"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-neutral-800">
              <h2 className="text-sm font-semibold text-white tracking-wide">
                {ANIMAL_TAXA[current].label} → {pickedMeta?.label}
              </h2>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="relative">
                <label
                  htmlFor="retaxon-species"
                  className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1"
                >
                  Species{' '}
                  <span className="font-normal normal-case text-neutral-600">(optional)</span>
                </label>
                <input
                  id="retaxon-species"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={`Search ${pickedMeta?.label.toLowerCase()} species…`}
                  autoComplete="off"
                  className="w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:border-herp-teal"
                />
                {hits.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSpeciesId(h.id)
                            setQuery(h.scientific_name)
                            setHits([])
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800"
                        >
                          <span className="block text-sm text-neutral-100 italic">{h.scientific_name}</span>
                          {h.common_names?.[0] && (
                            <span className="block text-xs text-neutral-500">{h.common_names[0]}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!speciesId && (
                  <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                    The old species won&rsquo;t carry over, so leaving this blank
                    means no care sheet or prey suggestions until you set one.
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-herp-teal/30 bg-herp-teal/10 px-3 py-2">
                <span className="text-herp-teal" aria-hidden="true">✓</span>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  Every feeding, shed, weigh-in, photo and gene stays with {animalName},
                  and so do its pairings, clutches and offspring.
                  {hasDietOverride && ' Its CGD diet setting goes back to following the species.'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200"
                >
                  {error}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-neutral-800 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={saving}
                className="herp-gradient-bg text-herp-dark font-bold text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Changing…' : `Change to ${pickedMeta?.label.toLowerCase()}`}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={saving}
                className="text-sm text-neutral-500 hover:text-neutral-300 px-4 py-2 transition disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
