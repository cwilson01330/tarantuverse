'use client'

/**
 * New pairing form.
 *
 * Two-step layout: pick the taxon, then pick the parents from the
 * keeper's owned reptiles of that taxon. Parent dropdowns filter by
 * sex (male slot accepts male+unknown, female slot accepts
 * female+unknown) — `unknown` is allowed in both because not every
 * reptile is sexed before pairing decisions are made.
 *
 * is_private is on by default — that's the v1 design call to protect
 * unannounced morph projects. Keepers can flip it off explicitly.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError } from '@/lib/apiClient'
import {
  type CreatePairingPayload,
  type ReptilePairingType,
  PAIRING_TYPE_LABEL,
  type Taxon,
  createPairing,
} from '@/lib/breeding'
// ADR-011: one collection fetch; the taxon picker is built from the groups
// the keeper actually owns, in registry order.
import {
  type Animal,
  type AnimalTaxon,
  ANIMAL_TAXA,
  ANIMAL_TAXON_ORDER,
  listAnimals,
} from '@/lib/animals'

interface ParentOption {
  id: string
  taxon: AnimalTaxon
  display_name: string
  sex: 'male' | 'female' | 'unknown' | null
  scientific_name: string | null
  /** Herp species FK. Drives the cross-species pair guard; null when
   *  the keeper hasn't linked a species record, in which case we fall
   *  back to scientific_name string comparison (see speciesMatches). */
  herp_species_id: string | null
}

function animalToOption(a: Animal): ParentOption {
  return {
    id: a.id,
    taxon: a.taxon,
    display_name:
      a.name || a.common_name || a.scientific_name || 'Unnamed reptile',
    sex: a.sex,
    scientific_name: a.scientific_name,
    herp_species_id: a.herp_species_id,
  }
}

/**
 * Cross-species check with graceful fallback. Mirrors the helper used
 * on HV mobile and on TV web/mobile. Keep all four in sync.
 *
 *   1. herp_species_id match — canonical comparison when both
 *      parents were picked from the species autocomplete.
 *   2. scientific_name match — fallback for keepers who typed names
 *      freely. Trim + lowercase normalize so casing differences don't
 *      false-positive.
 *   3. Insufficient data — return true (allow). Can't enforce.
 */
function speciesMatches(a: ParentOption, b: ParentOption): boolean {
  if (a.herp_species_id && b.herp_species_id) {
    return a.herp_species_id === b.herp_species_id
  }
  const aName = a.scientific_name?.trim().toLowerCase()
  const bName = b.scientific_name?.trim().toLowerCase()
  if (aName && bName) {
    return aName === bName
  }
  return true
}

export default function NewPairingPage() {
  const router = useRouter()

  const [taxon, setTaxon] = useState<Taxon>('snake')
  const [all, setAll] = useState<ParentOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [maleId, setMaleId] = useState<string>('')
  const [femaleId, setFemaleId] = useState<string>('')
  const [pairedDate, setPairedDate] = useState<string>(todayISO)
  const [separatedDate, setSeparatedDate] = useState<string>('')
  const [pairingType, setPairingType] =
    useState<ReptilePairingType>('natural')
  const [isPrivate, setIsPrivate] = useState<boolean>(true)
  const [notes, setNotes] = useState<string>('')

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load the keeper's whole collection once; the taxon picker then scopes
  // the parent dropdowns in-memory (ADR-011 — any group can be paired).
  useEffect(() => {
    let cancelled = false
    listAnimals()
      .then((rows) => {
        if (cancelled) return
        setAll(rows.map(animalToOption))
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load your collection.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Taxa the keeper actually owns, in registry order — drives the picker.
  const ownedTaxa = useMemo(
    () => ANIMAL_TAXON_ORDER.filter((t) => all.some((o) => o.taxon === t)),
    [all],
  )

  // Once the collection loads, default the picker to the first owned taxon
  // (so a keeper with only tortoises doesn't land on an empty "snakes" tab).
  useEffect(() => {
    if (ownedTaxa.length > 0 && !ownedTaxa.includes(taxon)) {
      setTaxon(ownedTaxa[0])
    }
  }, [ownedTaxa, taxon])

  // Reset selected parents when the taxon flips so we never end up
  // submitting a cross-taxon pair.
  useEffect(() => {
    setMaleId('')
    setFemaleId('')
  }, [taxon])

  const allOfTaxon = useMemo(
    () => all.filter((o) => o.taxon === taxon),
    [all, taxon],
  )
  const baseMales = useMemo(
    () => allOfTaxon.filter((p) => p.sex === 'male' || p.sex === 'unknown'),
    [allOfTaxon],
  )
  const baseFemales = useMemo(
    () =>
      allOfTaxon.filter((p) => p.sex === 'female' || p.sex === 'unknown'),
    [allOfTaxon],
  )

  // Cross-filters applied when the OTHER slot is populated:
  //   1. Exclude the same animal (no self-pairings).
  //   2. Exclude cross-species candidates via speciesMatches() — which
  //      compares herp_species_id first, falls back to
  //      scientific_name, and allows when neither side has enough info.
  //      A gargoyle gecko and a bearded dragon shouldn't tempt the
  //      keeper as valid pair candidates.
  const femaleOption = useMemo(
    () => baseFemales.find((p) => p.id === femaleId) ?? null,
    [baseFemales, femaleId],
  )
  const maleOption = useMemo(
    () => baseMales.find((p) => p.id === maleId) ?? null,
    [baseMales, maleId],
  )
  const males = useMemo(
    () =>
      baseMales.filter((p) => {
        if (femaleOption && p.id === femaleOption.id) return false
        if (femaleOption && !speciesMatches(p, femaleOption)) return false
        return true
      }),
    [baseMales, femaleOption],
  )
  const females = useMemo(
    () =>
      baseFemales.filter((p) => {
        if (maleOption && p.id === maleOption.id) return false
        if (maleOption && !speciesMatches(p, maleOption)) return false
        return true
      }),
    [baseFemales, maleOption],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitError(null)
    if (!maleId || !femaleId) {
      setSubmitError('Pick both parents before saving.')
      return
    }
    if (maleId === femaleId) {
      setSubmitError('Male and female must be different reptiles.')
      return
    }
    // Defensive cross-species check — the picker filters already
    // exclude cross-species candidates, but a keeper could pick the
    // female first, then change the male via the dropdown to a stale
    // option. speciesMatches() also covers free-typed scientific names.
    if (maleOption && femaleOption && !speciesMatches(maleOption, femaleOption)) {
      const a = maleOption.scientific_name || 'this male'
      const b = femaleOption.scientific_name || 'this female'
      setSubmitError(
        `${a} and ${b} are different species — they can't pair. Update one parent's species or pick a matching mate.`,
      )
      return
    }

    setSubmitting(true)
    try {
      const payload: CreatePairingPayload = {
        taxon,
        male_id: maleId,
        female_id: femaleId,
        paired_date: pairedDate,
        separated_date: separatedDate || null,
        pairing_type: pairingType,
        is_private: isPrivate,
        notes: notes.trim() || null,
      }
      const created = await createPairing(payload)
      router.push(`/app/breeding/pairings/${created.id}`)
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save this pairing.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="max-w-2xl mx-auto">
      <Link
        href="/app/breeding"
        className="inline-flex items-center gap-1.5 text-sm text-herp-teal hover:text-herp-lime mb-6"
      >
        <span aria-hidden="true">←</span> Pairings
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide mb-1">
          New pairing
        </h1>
        <p className="text-sm text-neutral-400">
          Record a male × female mating attempt. You can add clutches
          (and their offspring) later as the season progresses.
        </p>
      </header>

      {loadError && (
        <div
          role="alert"
          className="p-3 mb-4 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
        >
          {loadError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Taxon picker — one choice per group the keeper owns (registry
            order). Same-taxon parents are enforced below + on the backend. */}
        {ownedTaxa.length > 0 && (
          <Field label="Taxon">
            <div className="grid grid-cols-2 gap-2">
              {ownedTaxa.map((t) => (
                <TaxonChoice
                  key={t}
                  active={taxon === t}
                  onClick={() => setTaxon(t)}
                  icon={ANIMAL_TAXA[t].glyph}
                  label={ANIMAL_TAXA[t].plural}
                />
              ))}
            </div>
          </Field>
        )}

        <Field
          label="Male parent"
          hint={
            males.length === 0
              ? `No ${taxon}s with male or unknown sex in your collection yet.`
              : 'Male or unknown-sex reptiles only.'
          }
        >
          <ParentSelect
            options={males}
            value={maleId}
            onChange={setMaleId}
            placeholder="Pick the male"
          />
        </Field>

        <Field
          label="Female parent"
          hint={
            females.length === 0
              ? `No ${taxon}s with female or unknown sex in your collection yet.`
              : 'Female or unknown-sex reptiles only.'
          }
        >
          <ParentSelect
            options={females}
            value={femaleId}
            onChange={setFemaleId}
            placeholder="Pick the female"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Paired date">
            <input
              type="date"
              value={pairedDate}
              onChange={(e) => setPairedDate(e.target.value)}
              required
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Separated (optional)">
            <input
              type="date"
              value={separatedDate}
              onChange={(e) => setSeparatedDate(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>

        <Field label="Pairing type">
          <select
            value={pairingType}
            onChange={(e) =>
              setPairingType(e.target.value as ReptilePairingType)
            }
            className={INPUT_CLS}
          >
            {(Object.keys(PAIRING_TYPE_LABEL) as ReptilePairingType[]).map(
              (k) => (
                <option key={k} value={k}>
                  {PAIRING_TYPE_LABEL[k]}
                </option>
              ),
            )}
          </select>
        </Field>

        <label className="flex items-start gap-3 p-3 rounded-md border border-neutral-800 bg-neutral-900/40 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-herp-teal cursor-pointer"
          />
          <div>
            <div className="text-sm font-medium text-white">
              Keep this pairing private
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              Hidden from other keepers regardless of your collection
              visibility setting. Toggle off when you&rsquo;re ready to
              share progress publicly.
            </p>
          </div>
        </label>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Pairing strategy, observations…"
            className={INPUT_CLS}
          />
        </Field>

        {submitError && (
          <div
            role="alert"
            className="p-3 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-300"
          >
            {submitError}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || males.length === 0 || females.length === 0}
            className="flex-1 px-4 py-2.5 rounded-md herp-gradient-bg text-herp-dark text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save pairing'}
          </button>
          <Link
            href="/app/breeding"
            className="px-4 py-2.5 rounded-md border border-neutral-800 text-neutral-300 text-sm font-medium hover:text-neutral-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Mini-components
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>
      )}
    </div>
  )
}

function TaxonChoice({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md border text-sm font-medium transition-colors ${
        active
          ? 'border-herp-teal/60 bg-herp-teal/10 text-herp-lime'
          : 'border-neutral-800 bg-neutral-900/30 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  )
}

function ParentSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: ParentOption[]
  value: string
  onChange: (id: string) => void
  placeholder: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS}
    >
      <option value="">{placeholder}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.display_name}
          {p.sex === 'unknown' ? ' (sex unknown)' : ''}
          {p.scientific_name ? ` — ${p.scientific_name}` : ''}
        </option>
      ))}
    </select>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-sm text-neutral-100 placeholder-neutral-600'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
