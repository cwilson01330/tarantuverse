'use client'

/**
 * Morph calculator.
 *
 * "Honest" means the math is exposed, not hidden. Every outcome row carries a
 * fractional probability, and any gene the keeper opts into can reveal its
 * literal Punnett grid. Welfare flags and lethal-homozygous results are
 * surfaced as loud, non-dismissible warnings — this page is not a marketing
 * tool for morph production, it's a reference.
 *
 * Scope v1:
 *   - Species picker (currently Python regius only)
 *   - Per-gene genotype picker for two hypothetical parents
 *   - Combined offspring outcomes with probability (fraction + %)
 *   - Per-gene Punnett grid revealed on demand
 *   - Welfare warnings + lethal flags
 *
 * Not in scope v1:
 *   - Linking from a real (owned) snake's genotype — blocked on reptile CRUD
 *   - poss_het percentages (parent's own probability of being het) — separate concept
 *   - Saving / sharing scenarios
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AlleleState,
  CALCULATOR_SPECIES,
  combineOffspring,
  countToState,
  fetchGenesForSpecies,
  formatProbability,
  Gene,
  GeneInput,
  GeneType,
  OffspringOutcome,
  punnett,
  punnettGrid,
  stateLabel,
  stateToCount,
  validStatesForGene,
  WelfareFlag,
} from '@/lib/genes'

// ---------------------------------------------------------------------------
// Labels + styles
// ---------------------------------------------------------------------------

const GENE_TYPE_LABELS: Record<GeneType, string> = {
  recessive: 'Recessive',
  dominant: 'Dominant',
  codominant: 'Codominant',
  incomplete_dominant: 'Incomplete dominant',
}

const GENE_TYPE_HINTS: Record<GeneType, string> = {
  recessive:
    'Two copies to show. One copy is a carrier ("het") with no visible change.',
  dominant:
    'One or two copies both look the same. No distinct "super" form.',
  codominant:
    'One copy is a visible morph. Two copies is a distinct "super" form.',
  incomplete_dominant:
    'One copy is a visible morph. Two copies is a distinct "super" form.',
}

const WELFARE_FLAG_STYLES: Record<WelfareFlag, string> = {
  neurological: 'bg-red-500/15 text-red-300 border-red-500/40',
  structural: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  viability: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
}

const WELFARE_FLAG_LABELS: Record<WelfareFlag, string> = {
  neurological: 'Neurological',
  structural: 'Structural',
  viability: 'Viability',
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function BreedingCalculatorPage() {
  const [speciesName, setSpeciesName] = useState<string>(
    CALCULATOR_SPECIES[0].scientific_name,
  )
  const [genes, setGenes] = useState<Gene[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [parentA, setParentA] = useState<Record<string, AlleleState>>({})
  const [parentB, setParentB] = useState<Record<string, AlleleState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')

  // Reset + fetch when species changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setGenes(null)
    setParentA({})
    setParentB({})
    setExpanded({})

    fetchGenesForSpecies(speciesName).then((result) => {
      if (cancelled) return
      if (result === null) {
        setLoadError(true)
        setLoading(false)
        return
      }
      setGenes(result)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [speciesName])

  // Genes with at least one parent expressing something. These drive the
  // offspring combinatorics; wild-type × wild-type adds nothing.
  const activeInputs: GeneInput[] = useMemo(() => {
    if (!genes) return []
    return genes
      .map((gene) => {
        const aState = parentA[gene.id] ?? 'absent'
        const bState = parentB[gene.id] ?? 'absent'
        const aCount = stateToCount(aState, gene.gene_type)
        const bCount = stateToCount(bState, gene.gene_type)
        return { gene, parentA: aCount, parentB: bCount }
      })
      .filter((g) => g.parentA !== 0 || g.parentB !== 0)
  }, [genes, parentA, parentB])

  const outcomes = useMemo(() => combineOffspring(activeInputs), [activeInputs])

  // Welfare concerns on any active gene — surfaced up top.
  const welfareConcerns = useMemo(
    () => activeInputs.map((i) => i.gene).filter((g) => g.welfare_flag),
    [activeInputs],
  )

  // Any outcome row that's biologically lethal?
  const hasLethal = outcomes.some((o) => o.isLethal)

  const filteredGenes = useMemo(() => {
    if (!genes) return []
    const q = filter.trim().toLowerCase()
    if (!q) return genes
    return genes.filter((g) => {
      return (
        g.common_name.toLowerCase().includes(q) ||
        (g.symbol?.toLowerCase().includes(q) ?? false) ||
        g.gene_type.toLowerCase().includes(q)
      )
    })
  }, [genes, filter])

  const resetAll = () => {
    setParentA({})
    setParentB({})
    setExpanded({})
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-10">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Breeding tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Morph calculator
        </h1>
        <p className="text-neutral-400 max-w-2xl mb-4">
          Cross two hypothetical parents and see offspring probabilities.
          Math uses standard independent-assortment Mendelian genetics —
          same model used by genecalc, MorphMarket, and World of Ball Pythons.
        </p>
        <p className="text-xs text-neutral-500 max-w-2xl leading-relaxed">
          Assumptions: genes assort independently (no linkage), no epistasis.
          Results are probabilities per offspring, not guaranteed clutch
          ratios. Expand any gene row to see its literal Punnett grid.
        </p>
      </header>

      {/* Species picker */}
      <section className="mb-6">
        <label
          htmlFor="species-picker"
          className="block text-xs uppercase tracking-[0.15em] text-neutral-500 mb-2"
        >
          Species
        </label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <select
            id="species-picker"
            value={speciesName}
            onChange={(e) => setSpeciesName(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-white px-3 py-2 rounded-md text-sm focus:outline-none focus:border-herp-teal/50 focus:ring-1 focus:ring-herp-teal/30"
          >
            {CALCULATOR_SPECIES.map((s) => (
              <option key={s.scientific_name} value={s.scientific_name}>
                {s.common_name} ({s.scientific_name})
              </option>
            ))}
          </select>
          {CALCULATOR_SPECIES.length === 1 && (
            <p className="text-xs text-neutral-500">
              More species arrive as their catalogs are seeded.
            </p>
          )}
        </div>
      </section>

      {/* Load states */}
      {loading && <LoadingState />}
      {loadError && <ApiErrorState />}
      {!loading && !loadError && genes && genes.length === 0 && (
        <EmptyCatalogState species={speciesName} />
      )}

      {/* Main calculator */}
      {!loading && !loadError && genes && genes.length > 0 && (
        <>
          {/* Welfare banner */}
          {welfareConcerns.length > 0 && (
            <WelfareBanner genes={welfareConcerns} />
          )}

          {/* Parent selectors */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">
                Parent genotypes
              </h2>
              <button
                onClick={resetAll}
                className="text-xs text-neutral-500 hover:text-herp-teal transition-colors"
              >
                Reset all
              </button>
            </div>

            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${genes.length} genes (name, symbol, inheritance mode)…`}
              className="w-full bg-neutral-900 border border-neutral-800 text-white px-3 py-2 rounded-md text-sm focus:outline-none focus:border-herp-teal/50 focus:ring-1 focus:ring-herp-teal/30 placeholder:text-neutral-600 mb-4"
            />

            <div className="space-y-3">
              {filteredGenes.length === 0 ? (
                <p className="text-sm text-neutral-500 px-4 py-6 text-center border border-dashed border-neutral-800 rounded-md">
                  No genes match &ldquo;{filter}&rdquo;.
                </p>
              ) : (
                filteredGenes.map((gene) => {
                  const aState = parentA[gene.id] ?? 'absent'
                  const bState = parentB[gene.id] ?? 'absent'
                  const aCount = stateToCount(aState, gene.gene_type)
                  const bCount = stateToCount(bState, gene.gene_type)
                  const hasInput = aCount !== 0 || bCount !== 0
                  return (
                    <GeneRow
                      key={gene.id}
                      gene={gene}
                      aState={aState}
                      bState={bState}
                      isActive={hasInput}
                      isExpanded={!!expanded[gene.id]}
                      onAChange={(s) =>
                        setParentA((prev) => ({ ...prev, [gene.id]: s }))
                      }
                      onBChange={(s) =>
                        setParentB((prev) => ({ ...prev, [gene.id]: s }))
                      }
                      onToggleGrid={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [gene.id]: !prev[gene.id],
                        }))
                      }
                    />
                  )
                })
              )}
            </div>
          </section>

          {/* Offspring outcomes */}
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-white mb-3">
              Offspring outcomes
            </h2>
            {activeInputs.length === 0 ? (
              <div className="p-8 border border-dashed border-neutral-800 rounded-lg bg-neutral-900/40 text-center">
                <p className="text-sm text-neutral-500 max-w-md mx-auto">
                  Set at least one parent to carry a morph allele to compute
                  offspring probabilities. With both parents wild-type, all
                  offspring are wild-type.
                </p>
              </div>
            ) : (
              <OutcomesTable
                outcomes={outcomes}
                inputs={activeInputs}
                hasLethal={hasLethal}
              />
            )}
          </section>
        </>
      )}

      {/* Footer disclosures */}
      <footer className="mt-12 pt-8 border-t border-neutral-800 text-xs text-neutral-500 leading-relaxed max-w-2xl">
        <p className="mb-2">
          <span className="text-neutral-400 font-medium">Probability, not guarantee.</span>{' '}
          Each offspring is an independent draw. A 25% outcome in a clutch of
          8 does not guarantee 2 matching offspring — it&rsquo;s a per-animal
          expectation.
        </p>
        <p className="mb-2">
          <span className="text-neutral-400 font-medium">Welfare flags are sourced.</span>{' '}
          Concerns shown here come from published veterinary or husbandry
          references. Open a gene&rsquo;s detail (in-app) for citations.
        </p>
        <p>
          <span className="text-neutral-400 font-medium">Missing a gene?</span>{' '}
          The catalog is seeded gradually. Submit additions in the community
          — each entry requires a verifiable source before publishing.
        </p>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gene row — two parent pickers + optional Punnett grid
// ---------------------------------------------------------------------------

interface GeneRowProps {
  gene: Gene
  aState: AlleleState
  bState: AlleleState
  isActive: boolean
  isExpanded: boolean
  onAChange: (s: AlleleState) => void
  onBChange: (s: AlleleState) => void
  onToggleGrid: () => void
}

function GeneRow({
  gene,
  aState,
  bState,
  isActive,
  isExpanded,
  onAChange,
  onBChange,
  onToggleGrid,
}: GeneRowProps) {
  const validStates = validStatesForGene(gene.gene_type)

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isActive
          ? 'border-herp-teal/30 bg-herp-teal/[0.03]'
          : 'border-neutral-800 bg-neutral-900/30'
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">
                {gene.common_name}
              </h3>
              {gene.symbol && (
                <code className="text-[10px] text-neutral-500 font-mono px-1.5 py-0.5 bg-neutral-800/60 rounded">
                  {gene.symbol}
                </code>
              )}
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 border border-neutral-800 px-1.5 py-0.5 rounded">
                {GENE_TYPE_LABELS[gene.gene_type]}
              </span>
              {gene.welfare_flag && (
                <span
                  className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 rounded ${WELFARE_FLAG_STYLES[gene.welfare_flag]}`}
                  title={gene.welfare_notes ?? 'Welfare concern'}
                >
                  ⚠ {WELFARE_FLAG_LABELS[gene.welfare_flag]}
                </span>
              )}
              {gene.lethal_homozygous && (
                <span
                  className="text-[10px] uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded"
                  title="Two copies is non-viable"
                >
                  Lethal homozygous
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {GENE_TYPE_HINTS[gene.gene_type]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ParentPicker
            id={`${gene.id}-a`}
            label="Parent A"
            value={aState}
            onChange={onAChange}
            validStates={validStates}
            geneType={gene.gene_type}
          />
          <ParentPicker
            id={`${gene.id}-b`}
            label="Parent B"
            value={bState}
            onChange={onBChange}
            validStates={validStates}
            geneType={gene.gene_type}
          />
        </div>

        {isActive && (
          <div className="mt-3">
            <button
              onClick={onToggleGrid}
              className="text-xs text-herp-teal hover:text-herp-lime transition-colors"
            >
              {isExpanded ? '▾' : '▸'} Show Punnett grid
            </button>
          </div>
        )}
      </div>

      {isActive && isExpanded && (
        <div className="px-4 sm:px-5 pb-5 pt-0">
          <PunnettGridView
            gene={gene}
            aState={aState}
            bState={bState}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parent picker — allele state select-box
// ---------------------------------------------------------------------------

interface ParentPickerProps {
  id: string
  label: string
  value: AlleleState
  onChange: (s: AlleleState) => void
  validStates: AlleleState[]
  geneType: GeneType
}

function ParentPicker({
  id,
  label,
  value,
  onChange,
  validStates,
  geneType,
}: ParentPickerProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AlleleState)}
        className="w-full bg-neutral-950 border border-neutral-800 text-white px-3 py-2 rounded-md text-sm focus:outline-none focus:border-herp-teal/50 focus:ring-1 focus:ring-herp-teal/30"
      >
        {validStates.map((s) => (
          <option key={s} value={s}>
            {stateLabel(s, geneType)}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Punnett grid — literal 2×2 display
// ---------------------------------------------------------------------------

interface PunnettGridViewProps {
  gene: Gene
  aState: AlleleState
  bState: AlleleState
}

function PunnettGridView({ gene, aState, bState }: PunnettGridViewProps) {
  const aCount = stateToCount(aState, gene.gene_type)
  const bCount = stateToCount(bState, gene.gene_type)
  const cells = punnettGrid(aCount, bCount)
  const dist = punnett(aCount, bCount)

  // Group cells by parent A allele for a proper 2-column table.
  const allelesA = Array.from(new Set(cells.map((c) => c.parentAAllele)))
  const allelesB = Array.from(new Set(cells.map((c) => c.parentBAllele)))

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
      <p className="text-xs text-neutral-500 mb-3">
        <span className="text-neutral-400">+</span> = wild-type allele ·{' '}
        <span className="text-herp-lime">M</span> = morph allele. Each cell
        is one possible offspring, equally likely.
      </p>

      <table className="text-sm">
        <thead>
          <tr>
            <th className="p-2"></th>
            {allelesB.map((b) => (
              <th
                key={b}
                className="p-2 text-center text-xs text-neutral-400 font-medium"
              >
                Parent B: {b === 'M' ? <span className="text-herp-lime">M</span> : '+'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allelesA.map((a) => (
            <tr key={a}>
              <th className="p-2 text-right text-xs text-neutral-400 font-medium">
                Parent A: {a === 'M' ? <span className="text-herp-lime">M</span> : '+'}
              </th>
              {allelesB.map((b) => {
                const cell = cells.find(
                  (c) => c.parentAAllele === a && c.parentBAllele === b,
                )!
                const state = countToState(cell.offspringCount, gene.gene_type)
                const isLethal =
                  gene.lethal_homozygous && cell.offspringCount === 2
                return (
                  <td
                    key={b}
                    className={`p-2 text-center border border-neutral-800 min-w-[100px] ${
                      isLethal ? 'bg-red-500/10' : ''
                    }`}
                  >
                    <div className="font-mono text-xs text-neutral-300">
                      {a}/{b}
                    </div>
                    <div
                      className={`text-[11px] mt-1 ${
                        isLethal ? 'text-red-300' : 'text-neutral-400'
                      }`}
                    >
                      {isLethal ? 'lethal' : stateLabel(state, gene.gene_type)}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <DistBar label="wild-type" count={0} prob={dist[0]} geneType={gene.gene_type} />
        <DistBar label="1 copy" count={1} prob={dist[1]} geneType={gene.gene_type} />
        <DistBar label="2 copies" count={2} prob={dist[2]} geneType={gene.gene_type} />
      </div>
    </div>
  )
}

function DistBar({
  label,
  count,
  prob,
  geneType,
}: {
  label: string
  count: 0 | 1 | 2
  prob: number
  geneType: GeneType
}) {
  const state = countToState(count, geneType)
  return (
    <div
      className={`p-2 rounded ${
        prob > 0 ? 'bg-neutral-900 border border-neutral-800' : 'opacity-40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="text-xs text-neutral-300 mt-0.5">
        {stateLabel(state, geneType)}
      </div>
      <div className="text-xs text-herp-teal mt-1 font-mono">
        {formatProbability(prob)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Outcomes table — combined across all genes
// ---------------------------------------------------------------------------

interface OutcomesTableProps {
  outcomes: OffspringOutcome[]
  inputs: GeneInput[]
  hasLethal: boolean
}

function OutcomesTable({ outcomes, inputs, hasLethal }: OutcomesTableProps) {
  return (
    <div>
      {hasLethal && (
        <div className="mb-3 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-200">
          <strong className="font-semibold">Lethal combinations detected.</strong>{' '}
          One or more offspring outcomes carry two copies of a gene that is
          non-viable homozygous. Those rows are shown for transparency but
          they do not result in living offspring.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-neutral-800 rounded-lg overflow-hidden">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-400 font-medium">
                Probability
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-400 font-medium">
                Phenotype
              </th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((outcome, idx) => (
              <OutcomeRow
                key={idx}
                outcome={outcome}
                inputs={inputs}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OutcomeRow({
  outcome,
  inputs,
}: {
  outcome: OffspringOutcome
  inputs: GeneInput[]
}) {
  // Build phenotype description by walking counts[] alongside inputs[].
  const phenotypeParts: Array<{
    label: string
    isLethal: boolean
    gene: Gene
  }> = []

  outcome.counts.forEach((count, i) => {
    const gene = inputs[i].gene
    if (count === 0) return // skip wild-type copies — nothing to show
    const state = countToState(count as 0 | 1 | 2, gene.gene_type)
    const label = `${gene.common_name} (${stateLabel(state, gene.gene_type)})`
    phenotypeParts.push({
      label,
      isLethal: gene.lethal_homozygous && count === 2,
      gene,
    })
  })

  const isWildType = phenotypeParts.length === 0

  return (
    <tr
      className={`border-t border-neutral-800 ${
        outcome.isLethal ? 'bg-red-500/[0.04]' : 'hover:bg-neutral-900/40'
      }`}
    >
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <div className={`font-mono text-sm ${outcome.isLethal ? 'text-red-300 line-through' : 'text-herp-teal'}`}>
          {formatProbability(outcome.probability)}
        </div>
        {outcome.isLethal && (
          <div className="text-[10px] uppercase tracking-wider text-red-300 mt-1">
            Not viable
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {isWildType ? (
          <span className="text-neutral-400 italic">wild-type</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {phenotypeParts.map((part, pi) => (
              <span
                key={pi}
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${
                  part.isLethal
                    ? 'bg-red-500/15 text-red-200 border-red-500/40'
                    : part.gene.welfare_flag
                      ? WELFARE_FLAG_STYLES[part.gene.welfare_flag]
                      : 'bg-neutral-800/60 text-neutral-200 border-neutral-700'
                }`}
                title={part.gene.welfare_notes ?? undefined}
              >
                {part.gene.welfare_flag && '⚠ '}
                {part.label}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Welfare banner — sticky, non-dismissible
// ---------------------------------------------------------------------------

function WelfareBanner({ genes }: { genes: Gene[] }) {
  return (
    <div className="mb-8 p-4 sm:p-5 rounded-lg border border-amber-500/30 bg-amber-500/[0.05]">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden="true">⚠</span>
        <div>
          <h2 className="text-sm font-semibold text-amber-200 mb-2">
            Welfare concerns on selected genes
          </h2>
          <ul className="space-y-1.5 text-xs text-amber-100/80">
            {genes.map((g) => (
              <li key={g.id}>
                <span className="font-medium text-amber-200">
                  {g.common_name}
                </span>{' '}
                <span className="text-amber-100/60">
                  ({WELFARE_FLAG_LABELS[g.welfare_flag!]})
                </span>
                {g.welfare_notes && (
                  <span className="text-amber-100/70"> — {g.welfare_notes}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-100/60">
            These concerns don&rsquo;t block the calculation — they&rsquo;re
            shown so you can make an informed breeding decision.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="p-10 rounded-lg border border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-sm text-neutral-400">Loading gene catalog…</div>
    </div>
  )
}

function ApiErrorState() {
  return (
    <div className="p-10 rounded-lg border border-red-500/30 bg-red-500/5 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🛰️
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        Couldn&rsquo;t reach the gene catalog
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto">
        This usually clears up within a minute. Try refreshing — if it
        persists, the backend may be waking up from sleep.
      </p>
    </div>
  )
}

function EmptyCatalogState({ species }: { species: string }) {
  return (
    <div className="p-10 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 text-center">
      <div className="text-4xl mb-4" aria-hidden="true">
        🧬
      </div>
      <h2 className="text-lg font-semibold text-white mb-2">
        No genes seeded for {species}
      </h2>
      <p className="text-sm text-neutral-400 max-w-md mx-auto mb-4">
        The catalog for this species hasn&rsquo;t been populated yet. Come
        back once the content review lands.
      </p>
      <Link
        href="/app/species"
        className="inline-block text-sm text-herp-teal hover:text-herp-lime transition-colors"
      >
        Browse species library →
      </Link>
    </div>
  )
}
