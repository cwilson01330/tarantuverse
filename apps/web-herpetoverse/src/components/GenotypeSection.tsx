'use client'

/**
 * GenotypeSection — per-animal gene chips + add/remove (audit-2 H2).
 *
 * Web twin of apps/mobile-herpetoverse/src/components/GenotypeSection.tsx:
 * same API calls (`/animals/{id}/genotype`, gene catalog from `/genes/`),
 * same 2-step add (pick a gene, then zygosity / poss-het % / proven /
 * notes), same copy. Rendered on the animal detail page for the owner of a
 * snake — the same gate mobile uses. `readOnly` (died or transferred: the
 * record is history and the API answers 409 on genotype writes) shows the
 * genes without the remove / add controls.
 *
 * Editing in place isn't offered (same as mobile): remove and re-add to
 * change a row.
 *
 * HV web is a dark-only palette (no light theme in tailwind.config), so the
 * neutral-9xx surfaces here match every other HV web card.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { type Gene, fetchGenesForSpecies } from '@/lib/genes'
import {
  type AnimalGenotype,
  type CreateGenotypePayload,
  type Zygosity,
  FALLBACK_GENE_SPECIES,
  addAnimalGenotype,
  deleteAnimalGenotype,
  listAnimalGenotype,
  zygosityLabel,
  zygosityOptions,
} from '@/lib/genotype'

export default function GenotypeSection({
  animalId,
  scientificName,
  readOnly = false,
}: {
  animalId: string
  scientificName?: string | null
  /** Died or transferred: show the genes, offer no add / remove. */
  readOnly?: boolean
}) {
  const [rows, setRows] = useState<AnimalGenotype[] | null>(null)
  const [genes, setGenes] = useState<Gene[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const species = scientificName?.trim() || FALLBACK_GENE_SPECIES

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [g, c] = await Promise.all([
          listAnimalGenotype(animalId),
          fetchGenesForSpecies(species),
        ])
        if (cancelled) return
        setRows(g)
        setGenes(c ?? [])
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError("Couldn't load genetics.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [animalId, species])

  const geneById = useMemo(() => {
    const map: Record<string, Gene> = {}
    ;(genes ?? []).forEach((g) => {
      map[g.id] = g
    })
    return map
  }, [genes])

  async function handleRemove(row: AnimalGenotype) {
    const name = geneById[row.gene_id]?.common_name ?? 'this gene'
    if (!window.confirm(`Remove ${name} from this animal?`)) return
    setRemoving(row.id)
    setActionError(null)
    try {
      await deleteAnimalGenotype(animalId, row.id)
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id))
    } catch {
      setActionError("Couldn't remove that gene.")
    } finally {
      setRemoving(null)
    }
  }

  if (rows === null && loadError === null) {
    return <p className="text-sm text-neutral-500">Loading genetics…</p>
  }
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-300">
        {loadError}
      </p>
    )
  }

  const sortedRows = [...(rows ?? [])].sort((a, b) => {
    const an = geneById[a.gene_id]?.common_name ?? ''
    const bn = geneById[b.gene_id]?.common_name ?? ''
    return an.localeCompare(bn)
  })

  return (
    <div className="space-y-3">
      {sortedRows.length === 0 ? (
        <p className="text-sm text-neutral-400 leading-relaxed">
          {readOnly
            ? 'No genes were recorded for this animal.'
            : 'No genes recorded yet. Add what you know to fuel pairing predictions in the morph calculator.'}
        </p>
      ) : readOnly ? (
        <ul className="flex flex-wrap gap-2">
          {sortedRows.map((row) => {
            const name = geneById[row.gene_id]?.common_name ?? 'Unknown gene'
            const zyg = zygosityLabel(row.zygosity, row.poss_het_percentage)
            return (
              <li
                key={row.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-neutral-800 bg-neutral-900"
              >
                <span className="text-sm font-semibold text-neutral-100">{name}</span>
                <span className="text-xs text-neutral-400">{zyg}</span>
                {row.proven && (
                  <span className="text-[10px] font-bold uppercase text-herp-green">
                    proven
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sortedRows.map((row) => {
            const name = geneById[row.gene_id]?.common_name ?? 'Unknown gene'
            const zyg = zygosityLabel(row.zygosity, row.poss_het_percentage)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void handleRemove(row)}
                  disabled={removing === row.id}
                  aria-label={`${name}, ${zyg}. Remove.`}
                  title="Remove this gene"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-neutral-800 bg-neutral-900 hover:border-red-500/50 disabled:opacity-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-neutral-100">{name}</span>
                  <span className="text-xs text-neutral-400">{zyg}</span>
                  {row.proven && (
                    <span className="text-[10px] font-bold uppercase text-herp-green">
                      proven
                    </span>
                  )}
                  <span aria-hidden="true" className="text-xs text-neutral-500">
                    ✕
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {actionError && (
        <p role="alert" className="text-xs text-red-300">
          {actionError}
        </p>
      )}

      {!readOnly && <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 rounded-md border border-herp-teal/60 text-sm font-semibold text-herp-teal hover:bg-herp-teal/10 transition-colors"
        >
          + Add gene
        </button>
        <Link
          href="/app/breeding?tab=calculator"
          className="text-sm text-neutral-400 hover:text-herp-teal transition-colors"
        >
          Open morph calculator →
        </Link>
      </div>}

      {adding && !readOnly && (
        <AddGeneDialog
          animalId={animalId}
          genes={genes ?? []}
          existingRows={rows ?? []}
          onClose={() => setAdding(false)}
          onAdded={(created) => {
            setRows((prev) => [...(prev ?? []), created])
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add-gene dialog — 2-step picker, as on mobile.
// ---------------------------------------------------------------------------

const FIELD_LABEL =
  'text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1'
const INPUT =
  'w-full px-3 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 focus:outline-none focus:border-herp-teal'

function AddGeneDialog({
  animalId,
  genes,
  existingRows,
  onClose,
  onAdded,
}: {
  animalId: string
  genes: Gene[]
  existingRows: AnimalGenotype[]
  onClose: () => void
  onAdded: (row: AnimalGenotype) => void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Gene | null>(null)
  const [zygosity, setZygosity] = useState<Zygosity | null>(null)
  const [possHetPct, setPossHetPct] = useState('')
  const [proven, setProven] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...genes]
    if (q) {
      list = list.filter(
        (g) =>
          g.common_name.toLowerCase().includes(q) ||
          (g.symbol ?? '').toLowerCase().includes(q),
      )
    }
    list.sort((a, b) => a.common_name.localeCompare(b.common_name))
    return list
  }, [genes, query])

  const options = useMemo(() => (picked ? zygosityOptions(picked) : []), [picked])

  function pick(g: Gene) {
    setPicked(g)
    // First legal option pre-selected, so a dominant gene (one option)
    // needs no extra click.
    setZygosity(zygosityOptions(g)[0] ?? null)
    setPossHetPct('')
    setError(null)
  }

  async function handleSave() {
    if (!picked || !zygosity) {
      setError('Pick a gene and zygosity.')
      return
    }
    let possHet: number | null = null
    if (zygosity === 'poss_het') {
      const n = Number(possHetPct)
      if (!Number.isFinite(n) || n < 1 || n > 99) {
        setError('Possible het percentage must be between 1 and 99.')
        return
      }
      possHet = Math.round(n)
    }
    const payload: CreateGenotypePayload = {
      gene_id: picked.id,
      zygosity,
      poss_het_percentage: possHet,
      proven,
      notes: notes.trim() || null,
    }
    setError(null)
    setSubmitting(true)
    try {
      onAdded(await addAnimalGenotype(animalId, payload))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this gene.')
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={picked ? picked.common_name : 'Pick a gene'}
      onClick={() => !submitting && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-3">
          {picked ? (
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Back to gene list"
              className="text-herp-teal hover:text-herp-lime text-sm"
            >
              ←
            </button>
          ) : null}
          <h2 className="flex-1 text-sm font-semibold text-white tracking-wide">
            {picked ? picked.common_name : 'Pick a gene'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-200 text-sm"
          >
            ✕
          </button>
        </div>

        {!picked ? (
          <div className="px-5 py-4 space-y-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — e.g. Pastel, Albino"
              aria-label="Search genes"
              autoFocus
              className={INPUT}
            />
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-400 py-2">
                {genes.length === 0
                  ? 'No genes catalogued for this species yet.'
                  : 'No genes match. Try a different name.'}
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-neutral-800">
                {filtered.map((g) => {
                  const alreadyHave = existingRows.some((r) => r.gene_id === g.id)
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => pick(g)}
                        className="w-full flex items-center gap-2 py-2.5 px-1 text-left hover:bg-neutral-900 transition-colors"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-neutral-100">
                            {g.common_name}
                          </span>
                          <span className="block text-xs text-neutral-500 mt-0.5">
                            {g.gene_type.replace('_', ' ')}
                            {g.lethal_homozygous ? ' · lethal homozygous' : ''}
                            {alreadyHave ? ' · already added' : ''}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-neutral-600">
                          ›
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <div className={FIELD_LABEL}>Zygosity</div>
              <div className="flex flex-wrap gap-2">
                {options.map((z) => {
                  const sel = zygosity === z
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZygosity(z)}
                      aria-pressed={sel}
                      className={`px-3 py-1.5 rounded-md border text-sm font-semibold transition-colors ${
                        sel
                          ? 'border-herp-green bg-herp-green text-neutral-950'
                          : 'border-neutral-700 text-neutral-200 hover:border-neutral-500'
                      }`}
                    >
                      {z === 'poss_het' ? 'poss het' : z}
                    </button>
                  )
                })}
              </div>
            </div>

            {zygosity === 'poss_het' && (
              <div>
                <label htmlFor="gene-poss-het" className={FIELD_LABEL}>
                  Possible het %
                </label>
                <input
                  id="gene-poss-het"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={possHetPct}
                  onChange={(e) => setPossHetPct(e.target.value)}
                  placeholder="66"
                  className={INPUT}
                />
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={proven}
                onChange={(e) => setProven(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-herp-green"
              />
              <span>
                <span className="block text-sm text-neutral-100">Proven</span>
                <span className="block text-xs text-neutral-500 mt-0.5">
                  Verified through breeding (not just visual ID).
                </span>
              </span>
            </label>

            <div>
              <label htmlFor="gene-notes" className={FIELD_LABEL}>
                Notes (optional)
              </label>
              <textarea
                id="gene-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="From breeder X, lineage Y…"
                className={INPUT}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-200"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={submitting}
              className="w-full bg-herp-green hover:bg-herp-lime text-neutral-950 font-semibold text-sm px-4 py-2 rounded-md disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add gene'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
