'use client'

/**
 * Clutch detail page.
 *
 * Three sections:
 *   1. Header — laid/pulled/expected/hatch dates, plus an inline-edit
 *      stats grid for counts + incubation conditions.
 *   2. Predicted outcomes — runs combineOffspring on the parents'
 *      recorded zygosities. Reuses the morph calculator's math
 *      verbatim so the predictions on this page match what the keeper
 *      sees on the calculator tab. The panel surfaces a friendly
 *      empty-state when one or both parents lack a genotype.
 *   3. Offspring — list of recorded hatchlings with a quick-add row.
 *
 * Notes inline-save on blur to keep the interaction count minimal —
 * keepers usually update one field at a time as observations come in.
 */

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type Clutch,
  type ClutchParentGenotypes,
  type ReptileOffspring,
  type UpdateClutchPayload,
  OFFSPRING_STATUS_LABEL,
  deleteClutch,
  getClutch,
  getClutchParentGenotypes,
  listOffspringForClutch,
  updateClutch,
} from '@/lib/breeding'
import {
  type Gene,
  type GeneInput,
  combineOffspring,
  fetchGenesForSpecies,
  formatProbability,
} from '@/lib/genes'
import { getLizard } from '@/lib/lizards'
import { getSnake } from '@/lib/snakes'

interface Params {
  id: string
}

export default function ClutchDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [clutch, setClutch] = useState<Clutch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  // Initial clutch load
  useEffect(() => {
    let cancelled = false
    getClutch(id)
      .then((c) => {
        if (cancelled) return
        setClutch(c)
        setNotesDraft(c.notes ?? '')
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load this clutch.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function applyUpdate(patch: UpdateClutchPayload) {
    setUpdating(true)
    setError(null)
    try {
      const next = await updateClutch(id, patch)
      setClutch(next)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save changes.",
      )
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        'Delete this clutch? Its offspring records will be removed too.',
      )
    )
      return
    setDeleting(true)
    try {
      await deleteClutch(id)
      router.push(
        clutch
          ? `/app/breeding/pairings/${clutch.pairing_id}`
          : '/app/breeding',
      )
    } catch (err) {
      setDeleting(false)
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete this clutch.",
      )
    }
  }

  if (!clutch && error) {
    return (
      <article className="max-w-3xl mx-auto">
        <BackLink fallback="/app/breeding" />
        <div
          role="alert"
          className="mt-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      </article>
    )
  }
  if (!clutch) return <ClutchSkeleton />

  return (
    <article className="max-w-3xl mx-auto space-y-8">
      <BackLink fallback={`/app/breeding/pairings/${clutch.pairing_id}`} />

      <header>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Clutch
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide mb-2">
          Laid {formatDate(clutch.laid_date)}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Detail
            label="Pulled"
            value={
              clutch.pulled_date ? formatDate(clutch.pulled_date) : '—'
            }
          />
          <Detail
            label="Expected hatch"
            value={
              clutch.expected_hatch_date
                ? formatDate(clutch.expected_hatch_date)
                : '—'
            }
          />
          <Detail
            label="Hatched"
            value={clutch.hatch_date ? formatDate(clutch.hatch_date) : '—'}
          />
          <Detail
            label="Eggs"
            value={clutch.expected_count != null ? String(clutch.expected_count) : '—'}
          />
        </dl>
      </header>

      {error && clutch && (
        <div
          role="alert"
          className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {/* Editable counts + lifecycle dates */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Counts &amp; conditions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CountField
            label="Eggs"
            value={clutch.expected_count}
            disabled={updating}
            onChange={(v) => applyUpdate({ expected_count: v })}
          />
          <CountField
            label="Fertile"
            value={clutch.fertile_count}
            disabled={updating}
            onChange={(v) => applyUpdate({ fertile_count: v })}
          />
          <CountField
            label="Slugs"
            value={clutch.slug_count}
            disabled={updating}
            onChange={(v) => applyUpdate({ slug_count: v })}
          />
          <CountField
            label="Hatched"
            value={clutch.hatched_count}
            disabled={updating}
            onChange={(v) => applyUpdate({ hatched_count: v })}
          />
          <CountField
            label="Viable"
            value={clutch.viable_count}
            disabled={updating}
            onChange={(v) => applyUpdate({ viable_count: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField
            label="Hatch date"
            value={clutch.hatch_date}
            disabled={updating}
            onChange={(v) => applyUpdate({ hatch_date: v })}
          />
          <DateField
            label="Pulled date"
            value={clutch.pulled_date}
            disabled={updating}
            onChange={(v) => applyUpdate({ pulled_date: v })}
          />
        </div>
      </section>

      {/* Predicted outcomes — separate component because it has its
          own data lifecycle (parent genotypes + gene catalog). */}
      <PredictedOutcomes clutchId={id} />

      {/* Offspring */}
      <Offspring clutchId={id} />

      {/* Notes */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Notes
        </h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const trimmed = notesDraft.trim() || null
            if (trimmed !== (clutch.notes ?? null)) {
              applyUpdate({ notes: trimmed })
            }
          }}
          rows={3}
          placeholder="Candling observations, retained eggs, troubled hatches…"
          disabled={updating}
          className={INPUT_CLS}
        />
        <p className="text-[11px] text-neutral-500">
          Saved when you click away.
        </p>
      </section>

      <section className="pt-4 border-t border-neutral-800/60">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete this clutch'}
        </button>
        <p className="mt-1 text-[11px] text-neutral-600">
          Removes the clutch and all its offspring records. The pairing
          stays.
        </p>
      </section>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Predicted outcomes panel
// ---------------------------------------------------------------------------

function PredictedOutcomes({ clutchId }: { clutchId: string }) {
  const [bundle, setBundle] = useState<ClutchParentGenotypes | null>(null)
  const [genes, setGenes] = useState<Gene[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const b = await getClutchParentGenotypes(clutchId)
        if (cancelled) return
        setBundle(b)

        // Need a scientific_name to fetch the gene catalog. Pull it from
        // whichever parent has one — both should be the same species
        // since pairings are taxon-locked, and species linkage is on
        // the snake/lizard record itself.
        const parentId = b.male.animal_id
        const parent = b.taxon === 'snake'
          ? await getSnake(parentId)
          : await getLizard(parentId)
        if (cancelled) return

        if (!parent.scientific_name) {
          setGenes([])
          return
        }
        const cat = await fetchGenesForSpecies(parent.scientific_name)
        if (cancelled) return
        setGenes(cat ?? [])
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load predicted outcomes.",
        )
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [clutchId])

  // Build GeneInput[] from the overlap. Genes the catalog doesn't know
  // about (e.g. catalog drift, typos) silently skip — better empty
  // panel than a noisy partial calc.
  const inputs = useMemo<GeneInput[]>(() => {
    if (!bundle || !genes) return []
    const byName = new Map(genes.map((g) => [g.common_name, g]))
    const result: GeneInput[] = []
    for (const key of bundle.overlapping_gene_keys) {
      const gene = byName.get(key)
      if (!gene) continue
      const a = bundle.male.genotypes.find((g) => g.gene_key === key)
      const b = bundle.female.genotypes.find((g) => g.gene_key === key)
      if (!a || !b) continue
      result.push({
        gene,
        parentA: ZYGOSITY_TO_COUNT[a.zygosity],
        parentB: ZYGOSITY_TO_COUNT[b.zygosity],
      })
    }
    return result
  }, [bundle, genes])

  const outcomes = useMemo(
    () => (inputs.length > 0 ? combineOffspring(inputs) : []),
    [inputs],
  )

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Predicted outcomes
        </h2>
        <Link
          href="/app/breeding?tab=calculator"
          className="text-xs text-neutral-500 hover:text-herp-lime"
        >
          Open calculator →
        </Link>
      </div>

      {loadError && (
        <p className="text-xs text-red-300">{loadError}</p>
      )}

      {!loadError && bundle?.note && (
        <div className="p-3 rounded-md border border-neutral-800 bg-neutral-950/50 text-xs text-neutral-400 leading-relaxed">
          {bundle.note}
        </div>
      )}

      {bundle && genes !== null && inputs.length === 0 && !bundle.note && (
        <div className="p-3 rounded-md border border-neutral-800 bg-neutral-950/50 text-xs text-neutral-400 leading-relaxed">
          We couldn&rsquo;t match either parent&rsquo;s recorded genes to
          the species&rsquo; gene catalog yet. The calculator tab covers
          all currently-supported genes.
        </div>
      )}

      {outcomes.length > 0 && (
        <ul className="divide-y divide-neutral-800/60 rounded-md border border-neutral-800 overflow-hidden">
          {outcomes.map((o, idx) => {
            // Build a hobby-readable label like "Pied · het Albino · super Pastel".
            // Wild-type rows for any given gene drop out of the label so a
            // pure-wild outcome surfaces as "Wild-type" rather than a long
            // dash-string.
            const parts: string[] = []
            inputs.forEach((g, i) => {
              const count = o.counts[i]
              if (count === 0) return // wild — skip
              const isCoOrInc =
                g.gene.gene_type === 'codominant' ||
                g.gene.gene_type === 'incomplete_dominant'
              let prefix = ''
              if (count === 1 && !isCoOrInc) prefix = 'het '
              if (count === 2 && isCoOrInc) prefix = 'super '
              parts.push(`${prefix}${g.gene.common_name}`)
            })
            const label = parts.length > 0 ? parts.join(' · ') : 'Wild-type'
            return (
              <li
                key={idx}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                  o.isLethal ? 'opacity-50' : ''
                }`}
              >
                <span className="text-neutral-100 truncate">{label}</span>
                <span className="text-xs text-neutral-400 tabular-nums whitespace-nowrap">
                  {o.isLethal ? 'Lethal' : formatProbability(o.probability)}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {bundle && genes === null && !loadError && (
        <p className="text-xs text-neutral-500 italic">Loading…</p>
      )}
    </section>
  )
}

// Helpers for the predictor.
const ZYGOSITY_TO_COUNT: Record<'wild' | 'het' | 'hom', 0 | 1 | 2> = {
  wild: 0,
  het: 1,
  hom: 2,
}

// ---------------------------------------------------------------------------
// Offspring section
// ---------------------------------------------------------------------------

function Offspring({ clutchId }: { clutchId: string }) {
  const [items, setItems] = useState<ReptileOffspring[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const next = await listOffspringForClutch(clutchId)
      setItems(next)
      setError(null)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't load offspring.",
      )
    }
  }

  useEffect(() => {
    let cancelled = false
    listOffspringForClutch(clutchId)
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load offspring.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [clutchId])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Offspring
        </h2>
        <Link
          href={`/app/breeding/clutches/${clutchId}/offspring/new`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-herp-lime hover:border-herp-teal/40 transition-colors"
        >
          <span aria-hidden="true">＋</span> Add hatchling
        </Link>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {items === null && !error && (
        <ul className="space-y-2" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <li
              key={i}
              className="h-12 rounded-md border border-neutral-800 bg-neutral-900/30 animate-pulse"
            />
          ))}
        </ul>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-sm text-neutral-500 italic px-1">
          No offspring recorded yet. Add the first one as eggs hatch.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/app/breeding/offspring/${o.id}`}
                className="block rounded-md border border-neutral-800 bg-neutral-900/40 hover:border-herp-teal/40 p-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm text-white">
                    {o.morph_label || 'Hatchling'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                    {OFFSPRING_STATUS_LABEL[o.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Mini-components
// ---------------------------------------------------------------------------

function CountField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number | null
  disabled: boolean
  onChange: (v: number | null) => void
}) {
  const [draft, setDraft] = useState<string>(
    value != null ? String(value) : '',
  )
  useEffect(() => {
    setDraft(value != null ? String(value) : '')
  }, [value])
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </label>
      <input
        type="number"
        min={0}
        max={200}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim() === '' ? null : parseInt(draft, 10)
          if (next === value) return
          if (next != null && !Number.isFinite(next)) return
          onChange(next)
        }}
        disabled={disabled}
        className={INPUT_CLS}
      />
    </div>
  )
}

function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string | null
  disabled: boolean
  onChange: (v: string | null) => void
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </label>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className={INPUT_CLS}
      />
    </div>
  )
}

function BackLink({ fallback }: { fallback: string }) {
  return (
    <Link
      href={fallback}
      className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime"
    >
      <span aria-hidden="true">←</span> Back
    </Link>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-100">{value}</dd>
    </div>
  )
}

function ClutchSkeleton() {
  return (
    <article
      className="max-w-3xl mx-auto space-y-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-4 w-20 bg-neutral-900 rounded animate-pulse" />
      <div className="h-8 w-2/3 bg-neutral-900 rounded animate-pulse" />
      <div className="h-32 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      <div className="h-32 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
    </article>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-sm text-neutral-100 placeholder-neutral-600 disabled:opacity-60'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
