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
  getClutch,
  getOffspring,
  getPairing,
  updateOffspring,
} from '@/lib/breeding'
import { createSnake, getSnake, type CreateSnakePayload } from '@/lib/snakes'
import { createLizard, getLizard, type CreateLizardPayload } from '@/lib/lizards'

/**
 * Parent species + lifecycle data we pre-fill into the hold-back form.
 * Lazy-loaded the first time the keeper opens the modal — most offspring
 * end up sold or traded, so we'd rather not pay the round-trip on every
 * detail load.
 */
interface HoldBackPrefill {
  taxon: 'snake' | 'lizard'
  scientific_name: string | null
  reptile_species_id: string | null
  hatch_date: string | null
}

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

  // Hold-back / Add-to-collection modal state. The prefill (parent
  // species + taxon + hatch date) is lazy-fetched the first time the
  // keeper opens the modal — most offspring don't end up held back, so
  // we don't want to pay the round-trip on every detail load.
  const [holdBackOpen, setHoldBackOpen] = useState(false)
  const [holdBackPrefill, setHoldBackPrefill] =
    useState<HoldBackPrefill | null>(null)
  const [holdBackLoading, setHoldBackLoading] = useState(false)
  const [holdBackPrefillError, setHoldBackPrefillError] = useState<
    string | null
  >(null)
  const [holdBackName, setHoldBackName] = useState('')
  const [holdBackSex, setHoldBackSex] = useState<'male' | 'female' | 'unknown'>(
    'unknown',
  )
  const [holdBackCreating, setHoldBackCreating] = useState(false)
  const [holdBackError, setHoldBackError] = useState<string | null>(null)
  const [linkedRecordName, setLinkedRecordName] = useState<string | null>(null)

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

  /**
   * Lazy-fetch parent species + taxon for the hold-back modal prefill.
   * Chains: offspring → clutch → pairing → male animal (snake or
   * lizard). Falls back to the female if the male fetch fails. Failure
   * still lets the modal open with empty prefills — the keeper can
   * type the species manually.
   */
  async function openHoldBack() {
    setHoldBackOpen(true)
    setHoldBackError(null)
    if (holdBackPrefill || holdBackLoading || !o) return
    setHoldBackLoading(true)
    setHoldBackPrefillError(null)
    try {
      const clutch = await getClutch(o.clutch_id)
      const pairing = await getPairing(clutch.pairing_id)
      const taxon = pairing.taxon
      // Pick whichever parent ID matches the pairing's taxon. Falls back
      // to female if the male fetch fails — both should match species
      // after the cross-species fix.
      let scientific_name: string | null = null
      let reptile_species_id: string | null = null
      try {
        if (taxon === 'snake' && pairing.male_snake_id) {
          const m = await getSnake(pairing.male_snake_id)
          scientific_name = m.scientific_name
          reptile_species_id = m.reptile_species_id
        } else if (taxon === 'lizard' && pairing.male_lizard_id) {
          const m = await getLizard(pairing.male_lizard_id)
          scientific_name = m.scientific_name
          reptile_species_id = m.reptile_species_id
        }
      } catch {
        // fall through to female fetch
      }
      if (!scientific_name) {
        try {
          if (taxon === 'snake' && pairing.female_snake_id) {
            const f = await getSnake(pairing.female_snake_id)
            scientific_name = f.scientific_name
            reptile_species_id = f.reptile_species_id
          } else if (taxon === 'lizard' && pairing.female_lizard_id) {
            const f = await getLizard(pairing.female_lizard_id)
            scientific_name = f.scientific_name
            reptile_species_id = f.reptile_species_id
          }
        } catch {
          // Soft-fail; keeper can still proceed without prefill.
        }
      }
      setHoldBackPrefill({
        taxon,
        scientific_name,
        reptile_species_id,
        hatch_date: clutch.hatch_date,
      })
    } catch (err) {
      setHoldBackPrefillError(
        err instanceof ApiError
          ? err.message
          : 'Could not load parent species info for prefill.',
      )
    } finally {
      setHoldBackLoading(false)
    }
  }

  /**
   * Promote this hatchling into the keeper's live collection. Creates a
   * snake or lizard record (per parent taxon), then links it back to
   * this offspring via PUT — also flipping status to 'kept' if it
   * isn't already, since the keeper has made the call.
   *
   * If the link step fails after the create succeeded we surface the
   * error but leave the new record in place — better than deleting a
   * fresh record. Keeper can manually link via the API or edit form.
   */
  async function handleHoldBackSubmit() {
    if (!o || holdBackCreating) return
    if (!holdBackName.trim()) {
      setHoldBackError('Give your new reptile a name first.')
      return
    }
    setHoldBackError(null)
    setHoldBackCreating(true)
    try {
      const morphLabelLine = o.morph_label ? `Morph: ${o.morph_label}.` : null
      const hatchedLine = holdBackPrefill?.hatch_date
        ? `Hatched ${holdBackPrefill.hatch_date}.`
        : 'Hatched from this clutch.'
      const noteLines = [hatchedLine, morphLabelLine].filter(
        (l): l is string => Boolean(l),
      )

      let newId: string
      if (holdBackPrefill?.taxon === 'lizard') {
        const payload: CreateLizardPayload = {
          name: holdBackName.trim(),
          sex: holdBackSex,
          source: 'bred',
          hatch_date: holdBackPrefill?.hatch_date ?? null,
          scientific_name: holdBackPrefill?.scientific_name ?? null,
          reptile_species_id: holdBackPrefill?.reptile_species_id ?? null,
          notes: noteLines.join('\n'),
          current_weight_g: o.hatch_weight_g ?? null,
          current_length_in: o.hatch_length_in ?? null,
        }
        const created = await createLizard(payload)
        newId = created.id
        await updateOffspring(o.id, {
          lizard_id: newId,
          status: o.status === 'kept' ? undefined : 'kept',
        })
      } else {
        // Default to snake if taxon prefill failed (taxon is required
        // by the pairing, so this is a paranoid fallback).
        const payload: CreateSnakePayload = {
          name: holdBackName.trim(),
          sex: holdBackSex,
          source: 'bred',
          hatch_date: holdBackPrefill?.hatch_date ?? null,
          scientific_name: holdBackPrefill?.scientific_name ?? null,
          reptile_species_id: holdBackPrefill?.reptile_species_id ?? null,
          notes: noteLines.join('\n'),
          current_weight_g: o.hatch_weight_g ?? null,
          current_length_in: o.hatch_length_in ?? null,
        }
        const created = await createSnake(payload)
        newId = created.id
        await updateOffspring(o.id, {
          snake_id: newId,
          status: o.status === 'kept' ? undefined : 'kept',
        })
      }
      // Refetch so the page reflects the new link + status.
      const refreshed = await getOffspring(o.id)
      setO(refreshed)
      setLinkedRecordName(holdBackName.trim())
      setHoldBackOpen(false)
      setHoldBackName('')
      setHoldBackSex('unknown')
    } catch (err) {
      setHoldBackError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong creating the record.',
      )
    } finally {
      setHoldBackCreating(false)
    }
  }

  // Fetch the linked record's name when offspring is loaded with a
  // snake_id or lizard_id, so the "linked to" card can show what it's
  // linked to rather than a generic indicator.
  useEffect(() => {
    if (!o) {
      setLinkedRecordName(null)
      return
    }
    if (o.snake_id) {
      getSnake(o.snake_id)
        .then((s) =>
          setLinkedRecordName(
            s.name || s.common_name || s.scientific_name || 'Snake record',
          ),
        )
        .catch(() => setLinkedRecordName(null))
    } else if (o.lizard_id) {
      getLizard(o.lizard_id)
        .then((l) =>
          setLinkedRecordName(
            l.name || l.common_name || l.scientific_name || 'Lizard record',
          ),
        )
        .catch(() => setLinkedRecordName(null))
    } else {
      setLinkedRecordName(null)
    }
  }, [o?.snake_id, o?.lizard_id])

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
        {linkedToLive ? (
          <div className="rounded-md border border-herp-teal/30 bg-herp-teal/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-herp-teal/80 font-medium mb-1">
              Linked to collection
            </p>
            {(() => {
              const linkedHref = o.snake_id
                ? `/app/reptiles/${o.snake_id}`
                : `/app/reptiles/lizards/${o.lizard_id}`
              const taxonLabel = o.snake_id ? 'snake' : 'lizard'
              return (
                <>
                  <Link
                    href={linkedHref}
                    className="text-sm font-medium text-herp-lime hover:underline"
                  >
                    {linkedRecordName ?? `Open ${taxonLabel} record`} ›
                  </Link>
                  <p className="text-[11px] text-herp-teal/70 mt-1">
                    The live {taxonLabel}&rsquo;s own genotype is authoritative.
                  </p>
                </>
              )
            })()}
          </div>
        ) : showHoldBackCta(o.status) ? (
          /* Hold-back / Add-to-collection CTA. Surfaces when the
             offspring hasn't been disposed of yet — keeper might still
             want to pull this hatchling into their own collection. The
             reptile world calls this a "hold back" so we lean on that
             language in the title. */
          <div className="rounded-md border border-herp-lime/40 bg-herp-lime/5 p-3 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-herp-lime">
                Holding this one back?
              </p>
              <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                Promote this hatchling to a live reptile record. Species,
                hatch date, and weight prefill from this clutch.
              </p>
            </div>
            <button
              type="button"
              onClick={openHoldBack}
              className="px-3 py-2 rounded-md herp-gradient-bg text-herp-dark text-xs font-semibold flex-shrink-0"
            >
              + Add to collection
            </button>
          </div>
        ) : null}
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

      {/* Hold-back modal — opens from the CTA above. Parent species
          info is fetched on first open and cached. Click outside or
          press Cancel to close.

          On submit: creates a snake or lizard (per parent taxon),
          links it back to this offspring via tarantula_id/lizard_id,
          and flips status to 'kept' if it isn't already. */}
      {holdBackOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !holdBackCreating && setHoldBackOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg bg-neutral-950 border border-neutral-800 shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-neutral-800">
              <h3 className="text-base font-semibold text-white">
                Add hatchling to collection
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Creates a live{' '}
                {holdBackPrefill?.taxon ?? 'reptile'} record and links it
                back to this offspring entry.
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Prefill summary */}
              <div className="rounded-md border border-neutral-800 bg-neutral-900/50 p-3 text-xs space-y-1">
                {holdBackLoading ? (
                  <p className="text-neutral-500">Loading parent info…</p>
                ) : holdBackPrefillError ? (
                  <p className="text-amber-400">
                    {holdBackPrefillError} You can still create the record
                    — it just won&rsquo;t auto-fill the species.
                  </p>
                ) : (
                  <>
                    <PrefillLine
                      label="Taxon"
                      value={
                        holdBackPrefill?.taxon === 'lizard'
                          ? '🦎 Lizard'
                          : '🐍 Snake'
                      }
                    />
                    <PrefillLine
                      label="Species"
                      value={
                        holdBackPrefill?.scientific_name ??
                        'Not set on parents'
                      }
                      muted={!holdBackPrefill?.scientific_name}
                    />
                    <PrefillLine
                      label="Hatch date"
                      value={holdBackPrefill?.hatch_date ?? 'Not recorded'}
                      muted={!holdBackPrefill?.hatch_date}
                    />
                    <PrefillLine label="Source" value="Bred" />
                  </>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={holdBackName}
                  onChange={(e) => setHoldBackName(e.target.value)}
                  placeholder={
                    o.morph_label
                      ? `${o.morph_label} hold-back`
                      : 'e.g. Hold-back #1'
                  }
                  disabled={holdBackCreating}
                  autoFocus
                  className={INPUT_CLS}
                />
              </div>

              {/* Sex */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1.5">
                  Sex
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['male', 'female', 'unknown'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setHoldBackSex(s)}
                      disabled={holdBackCreating}
                      className={`px-3 py-2 text-xs rounded-md border capitalize transition ${
                        holdBackSex === s
                          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime font-semibold'
                          : 'border-neutral-800 bg-neutral-900/30 text-neutral-400 hover:text-neutral-200'
                      } disabled:opacity-50`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-500 mt-1.5">
                  Set to <code>unknown</code> if it&rsquo;s too young to
                  sex — you can update on the reptile detail page later.
                </p>
              </div>

              {holdBackError && (
                <div
                  role="alert"
                  className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  {holdBackError}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHoldBackOpen(false)}
                disabled={holdBackCreating}
                className="px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleHoldBackSubmit}
                disabled={holdBackCreating || !holdBackName.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-md herp-gradient-bg text-herp-dark disabled:opacity-50"
              >
                {holdBackCreating ? 'Creating…' : 'Create & link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

/**
 * Visibility predicate for the hold-back CTA. Shows on statuses where
 * the keeper hasn't disposed of the hatchling — sold/traded/gifted/
 * deceased mean the offspring is gone and creating a collection
 * record from it would be confusing.
 */
function showHoldBackCta(status: OffspringStatus): boolean {
  return (
    status === 'hatched' ||
    status === 'kept' ||
    status === 'available' ||
    status === 'unknown'
  )
}

function PrefillLine({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-500 font-medium">{label}</span>
      <span
        className={`text-right ${
          muted ? 'text-neutral-500 italic' : 'text-neutral-200'
        }`}
      >
        {value}
      </span>
    </div>
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
