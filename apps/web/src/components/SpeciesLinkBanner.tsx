'use client'
/**
 * Suggest a care sheet (and, for a mis-filed animal, a taxon) on an animal's
 * page when its typed species name matches something we list. Mirrors
 * apps/mobile/src/components/SpeciesLinkBanner.tsx — see there for why.
 *
 * Offers, strongest first: link a same-taxon care sheet; switch taxon and
 * link (change-taxon keeps every log); file an "Other" under its genus's
 * taxon. Dismissing is remembered per animal + suggestion in this browser.
 */
import { useEffect, useState } from 'react'
import { taxonLabel, useSpeciesMatch } from '@/components/SpeciesSuggestion'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const dismissKey = (animalId: string, what: string) => `species-suggestion-dismissed:${animalId}:${what}`

export default function SpeciesLinkBanner({
  animalId, taxon, scientificName, speciesId, died, canEdit, token, onChanged,
}: {
  animalId: string
  taxon: string
  scientificName: string | null | undefined
  speciesId: string | null | undefined
  died?: boolean
  canEdit: boolean
  token: string | null
  /** Called with the animal's taxon after the change. */
  onChanged: (newTaxon: string) => void
}) {
  const eligible = canEdit && !speciesId && !died && !!scientificName?.trim() && !!token
  const res = useSpeciesMatch(eligible ? scientificName ?? '' : '', taxon)
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const m = res?.match ?? null
  const lc = (t: string) => taxonLabel(t).toLowerCase()
  const offer = m
    ? m.taxon === taxon
      ? { key: `link:${m.id}`, title: `Link the ${m.scientific_name} care sheet`, detail: 'Adds its care guide and feeding cadence to this animal.', action: 'Link care sheet', taxon: m.taxon, speciesId: m.id as string | null, name: m.scientific_name as string | null }
      : { key: `switch:${m.id}`, title: `This looks like a ${lc(m.taxon)}`, detail: `${m.scientific_name} is in our list as a ${lc(m.taxon)}. Switching keeps every feeding, molt and photo.`, action: 'Switch & link', taxon: m.taxon, speciesId: m.id as string | null, name: m.scientific_name as string | null }
    : taxon === 'other' && res?.genus_taxon && res.genus_taxon !== 'other'
      ? { key: `genus:${res.genus_taxon}`, title: `${res.genus} is a ${lc(res.genus_taxon)} genus`, detail: `Filed as a ${lc(res.genus_taxon)} it gets the feeding card and the right care tools. Every log is kept.`, action: `File as ${lc(res.genus_taxon)}`, taxon: res.genus_taxon, speciesId: null, name: null }
      : null

  useEffect(() => {
    if (!offer) return
    try { setDismissed(window.localStorage.getItem(dismissKey(animalId, offer.key)) === '1') } catch { setDismissed(false) }
  }, [animalId, offer?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!offer || dismissed !== false) return null

  const call = async (path: string, method: string, body: unknown) => {
    const r = await fetch(`${API_URL}/api/v1${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => null)
      throw new Error(typeof d?.detail === 'string' ? d.detail : "Couldn't update this animal. Try again.")
    }
  }
  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      if (offer.taxon !== taxon) await call(`/inverts/${animalId}/change-taxon`, 'POST', { taxon: offer.taxon, species_id: offer.speciesId })
      // The keeper confirmed this species, so take the catalog spelling too.
      if (offer.speciesId) await call(`/inverts/${animalId}`, 'PUT', { species_id: offer.speciesId, scientific_name: offer.name })
      onChanged(offer.taxon)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update this animal. Try again.")
    } finally {
      setBusy(false)
    }
  }
  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(dismissKey(animalId, offer.key), '1') } catch { /* private mode */ }
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4" role="status">
      <p className="font-semibold text-gray-900 dark:text-white">{offer.title}</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{offer.detail}</p>
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={dismiss} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Not this one</button>
        <button onClick={accept} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-60">
          {busy ? 'Updating…' : offer.action}
        </button>
      </div>
    </div>
  )
}
