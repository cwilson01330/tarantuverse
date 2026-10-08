'use client'

/**
 * AddGenesField — pick a snake's genes while ADDING it (audit-2 H2).
 *
 * Web twin of apps/mobile-herpetoverse/src/components/forms/AddGenesField.tsx.
 * The genotype endpoint needs an animal that already exists, so this is
 * purely local state: the add form gets a list of picks and attaches them
 * (POST /animals/{id}/genotype) after the animal is created. Nothing here
 * touches the network except loading the species' gene catalog.
 *
 * Genes are species-scoped, so this only offers a picker once a scientific
 * name is known.
 */

import { useEffect, useMemo, useState } from 'react'
import { type Gene, fetchGenesForSpecies } from '@/lib/genes'
import {
  type CreateGenotypePayload,
  type Zygosity,
  ZYG_LABEL,
  addFormZygosityOptions,
} from '@/lib/genotype'

/** A locally-picked gene, before the animal exists. */
export interface PickedGene {
  gene: Gene
  zygosity: Zygosity
}

export function pickedGenesToPayloads(picked: PickedGene[]): CreateGenotypePayload[] {
  return picked.map((p) => ({ gene_id: p.gene.id, zygosity: p.zygosity }))
}

export default function AddGenesField({
  scientificName,
  picked,
  onChange,
}: {
  scientificName: string
  picked: PickedGene[]
  onChange: (next: PickedGene[]) => void
}) {
  const [catalog, setCatalog] = useState<Gene[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const sci = scientificName.trim()

  useEffect(() => {
    if (!sci) {
      setCatalog(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchGenesForSpecies(sci)
      .then((g) => {
        if (!cancelled) setCatalog(g)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sci])

  const results = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    const pickedIds = new Set(picked.map((p) => p.gene.id))
    return catalog
      .filter((g) => !pickedIds.has(g.id))
      .filter(
        (g) =>
          !q ||
          g.common_name.toLowerCase().includes(q) ||
          (g.symbol ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [catalog, query, picked])

  function add(g: Gene) {
    // First valid zygosity for the gene's type, not a blanket "visual" —
    // the keeper can change it on the chip.
    onChange([...picked, { gene: g, zygosity: addFormZygosityOptions(g)[0] }])
    setQuery('')
    setOpen(false)
  }

  function cycleZygosity(id: string) {
    onChange(
      picked.map((p) => {
        if (p.gene.id !== id) return p
        const opts = addFormZygosityOptions(p.gene)
        const i = opts.indexOf(p.zygosity)
        return { ...p, zygosity: opts[(i + 1) % opts.length] }
      }),
    )
  }

  if (!sci) {
    return <p className="text-xs text-neutral-500">Pick a species above to choose genes.</p>
  }
  if (loading && catalog === null) {
    return <p className="text-xs text-neutral-500">Loading genes…</p>
  }
  if (catalog === null) {
    return (
      <p className="text-xs text-neutral-500">
        Couldn&rsquo;t load the gene catalog. You can add genes later from the
        animal&rsquo;s Genetics section.
      </p>
    )
  }
  if (catalog.length === 0) {
    return <p className="text-xs text-neutral-500">No genes catalogued for {sci} yet.</p>
  }

  return (
    <div className="space-y-2">
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <li
              key={p.gene.id}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-herp-green/40 bg-herp-green/10"
            >
              {/* Clicking the label cycles zygosity — one click, not a dialog. */}
              <button
                type="button"
                onClick={() => cycleZygosity(p.gene.id)}
                aria-label={`${p.gene.common_name}, ${ZYG_LABEL[p.zygosity]}. Click to change zygosity.`}
                className="text-xs font-bold text-neutral-100"
              >
                {p.gene.common_name}
                <span className="ml-2 text-herp-teal">{ZYG_LABEL[p.zygosity]}</span>
              </button>
              <button
                type="button"
                onClick={() => onChange(picked.filter((x) => x.gene.id !== p.gene.id))}
                aria-label={`Remove ${p.gene.common_name}`}
                className="text-xs text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search genes — Pastel, Clown…"
            aria-label="Search genes"
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none text-sm text-neutral-100 placeholder-neutral-600"
          />
          <ul className="divide-y divide-neutral-800">
            {results.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => add(g)}
                  aria-label={`Add ${g.common_name}`}
                  className="w-full flex items-center justify-between py-2 px-1 text-left hover:bg-neutral-900 transition-colors"
                >
                  <span className="text-sm font-semibold text-neutral-100">{g.common_name}</span>
                  <span className="text-xs text-neutral-500 capitalize">
                    {g.gene_type.replace('_', ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 && <p className="text-xs text-neutral-500">No matches.</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setQuery('')
            }}
            className="text-xs font-semibold text-neutral-400 hover:text-neutral-200 py-1"
          >
            Done
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-neutral-700 text-xs font-bold text-herp-teal hover:border-herp-teal transition-colors"
        >
          + Add gene
        </button>
      )}
    </div>
  )
}
