'use client'

/**
 * Offspring detail.
 *
 * Inline-editable fields throughout — keepers update one thing at a
 * time as a hatchling moves through its life cycle (status change,
 * sale price added, genotype refined). Notes save on blur, the rest
 * save on change. No submit button.
 *
 * Genotype editor: free-text via JSON-shaped recorded_genotype on
 * offspring without a live snake/lizard FK. v1 doesn't try to
 * surface the species' gene catalog as a dropdown here — that's a
 * v1.x polish. For now keepers can type "pied/het", "albino/hom"
 * style entries and we save them as { gene_key, zygosity }.
 */

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type GenotypeEntry,
  type OffspringStatus,
  type ReptileOffspring,
  type UpdateOffspringPayload,
  OFFSPRING_STATUS_LABEL,
  deleteOffspring,
  getOffspring,
  updateOffspring,
} from '@/lib/breeding'

interface Params {
  id: string
}

export default function OffspringDetailPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [o, setO] = useState<ReptileOffspring | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [labelDraft, setLabelDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [buyerDraft, setBuyerDraft] = useState('')
  const [priceDraft, setPriceDraft] = useState('')
  const [genotypeDraft, setGenotypeDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    getOffspring(id)
      .then((next) => {
        if (cancelled) return
        setO(next)
        setLabelDraft(next.morph_label ?? '')
        setNotesDraft(next.notes ?? '')
        setBuyerDraft(next.buyer_info ?? '')
        setPriceDraft(next.price_sold ?? '')
        setGenotypeDraft(genotypeToText(next.recorded_genotype))
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load this offspring.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function applyUpdate(patch: UpdateOffspringPayload) {
    setUpdating(true)
    setError(null)
    try {
      const next = await updateOffspring(id, patch)
      setO(next)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save changes.",
      )
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this offspring record?')) return
    setDeleting(true)
    try {
      await deleteOffspring(id)
      router.push(o ? `/app/breeding/clutches/${o.clutch_id}` : '/app/breeding')
    } catch (err) {
      setDeleting(false)
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete this offspring.",
      )
    }
  }

  if (!o && error) {
    return (
      <article className="max-w-2xl mx-auto">
        <Link
          href="/app/breeding"
          className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime"
        >
          <span aria-hidden="true">←</span> Breeding
        </Link>
        <div
          role="alert"
          className="mt-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      </article>
    )
  }
  if (!o) return <SkeletonDetail />

  const linkedToLive = !!(o.snake_id || o.lizard_id)

  return (
    <article className="max-w-2xl mx-auto space-y-6">
      <Link
        href={`/app/breeding/clutches/${o.clutch_id}`}
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime"
      >
        <span aria-hidden="true">←</span> Clutch
      </Link>

      <header>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Hatchling
        </p>
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            const trimmed = labelDraft.trim() || null
            if (trimmed !== (o.morph_label ?? null)) {
              applyUpdate({ morph_label: trimmed })
            }
          }}
          placeholder="Hatchling name or morph label"
          className="w-full bg-transparent border-0 border-b border-transparent focus:border-herp-teal/40 focus:outline-none text-2xl sm:text-3xl font-bold text-white tracking-wide pb-1"
        />
      </header>

      {error && o && (
        <div
          role="alert"
          className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Status
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select
              value={o.status}
              disabled={updating}
              onChange={(e) =>
                applyUpdate({ status: e.target.value as OffspringStatus })
              }
              className={INPUT_CLS}
            >
              {(
                Object.keys(OFFSPRING_STATUS_LABEL) as OffspringStatus[]
              ).map((k) => (
                <option key={k} value={k}>
                  {OFFSPRING_STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status date">
            <input
              type="date"
              value={o.status_date ?? ''}
              disabled={updating}
              onChange={(e) =>
                applyUpdate({ status_date: e.target.value || null })
              }
              className={INPUT_CLS}
            />
          </Field>
        </div>
        {linkedToLive && (
          <p className="text-[11px] text-herp-teal/80">
            Linked to a live{' '}
            {o.snake_id ? 'snake' : 'lizard'} record — its own genotype is
            authoritative.
          </p>
        )}
      </section>

      {/* Sale block — only meaningful when status implies it. We render
          unconditionally because keepers sometimes pre-fill price before
          formally marking it sold. */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Sale
        </h2>
        <Field label="Buyer info">
          <input
            value={buyerDraft}
            onChange={(e) => setBuyerDraft(e.target.value)}
            onBlur={() => {
              const trimmed = buyerDraft.trim() || null
              if (trimmed !== (o.buyer_info ?? null)) {
                applyUpdate({ buyer_info: trimmed })
              }
            }}
            placeholder="Name, contact, expo, etc."
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Price sold ($)">
          <input
            type="number"
            min={0}
            step={1}
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => {
              const next = priceDraft.trim() === '' ? null : Number(priceDraft)
              const cur = o.price_sold ? Number(o.price_sold) : null
              if (next !== cur) {
                applyUpdate({ price_sold: next })
              }
            }}
            className={INPUT_CLS}
          />
        </Field>
      </section>

      {/* Genotype editor — disabled when offspring links to a live
          record (the live record's own animal_genotypes are
          authoritative; editing the JSONB version would diverge). */}
      {!linkedToLive && (
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
            Recorded genotype
          </h2>
          <textarea
            value={genotypeDraft}
            onChange={(e) => setGenotypeDraft(e.target.value)}
            onBlur={() => {
              const next = textToGenotype(genotypeDraft)
              if (
                JSON.stringify(next) !==
                JSON.stringify(o.recorded_genotype ?? [])
              ) {
                applyUpdate({ recorded_genotype: next })
              }
            }}
            rows={3}
            placeholder={'pied/hom\nalbino/het'}
            className={INPUT_CLS}
          />
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            One gene per line: <code>name/zygosity</code>. Zygosity is
            <code> wild</code>, <code>het</code>, or <code>hom</code>. Use
            the morph calculator&rsquo;s gene names so future predictions
            line up.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">
          Notes
        </h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            const trimmed = notesDraft.trim() || null
            if (trimmed !== (o.notes ?? null)) {
              applyUpdate({ notes: trimmed })
            }
          }}
          rows={3}
          placeholder="First-feed history, color development, oddities…"
          className={INPUT_CLS}
        />
      </section>

      <section className="pt-4 border-t border-neutral-800/60">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete this offspring record'}
        </button>
      </section>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Genotype <-> text conversion
// ---------------------------------------------------------------------------

const VALID_ZYG = new Set(['wild', 'het', 'hom'])

function genotypeToText(entries: GenotypeEntry[] | null): string {
  if (!entries || entries.length === 0) return ''
  return entries.map((e) => `${e.gene_key}/${e.zygosity}`).join('\n')
}

/** Lossy parse — silently drops malformed lines. The textarea hint
 *  tells keepers the expected shape, but if they fat-finger we'd
 *  rather lose one line than refuse to save. */
function textToGenotype(text: string): GenotypeEntry[] | null {
  const out: GenotypeEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const [name, z] = line.split('/').map((s) => s.trim())
    if (!name || !z) continue
    const zygosity = z.toLowerCase()
    if (!VALID_ZYG.has(zygosity)) continue
    out.push({ gene_key: name, zygosity: zygosity as 'wild' | 'het' | 'hom' })
  }
  return out.length > 0 ? out : null
}

// ---------------------------------------------------------------------------
// Mini-components
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function SkeletonDetail() {
  return (
    <article
      className="max-w-2xl mx-auto space-y-6"
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
