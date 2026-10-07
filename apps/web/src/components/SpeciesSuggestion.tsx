'use client'
/**
 * "Did you mean…?" for a species name typed by hand (web). Mirrors
 * apps/mobile/src/components/SpeciesSuggestion.tsx.
 *
 * 2026-10-07: most animals with no care sheet, and most filed as "Other",
 * were a species we already list, typed freehand. This asks the server's
 * matcher (GET /invert-species/match) and offers the catalog species. It
 * never changes anything by itself.
 */
import { useEffect, useRef, useState } from 'react'
import { INVERT_TAXA, type InvertTaxon } from '@/lib/inverts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface SpeciesNameMatch {
  match: { id: string; scientific_name: string; common_name: string | null; taxon: InvertTaxon; slug: string | null; kind: 'exact' | 'close' | 'epithet' } | null
  genus: string | null
  genus_taxon: InvertTaxon | null
}

export async function matchSpeciesName(name: string, taxon?: string | null): Promise<SpeciesNameMatch> {
  const q = new URLSearchParams({ name })
  if (taxon) q.set('taxon', taxon)
  const r = await fetch(`${API_URL}/api/v1/invert-species/match?${q}`)
  if (!r.ok) throw new Error('match failed')
  return r.json()
}

/** Debounced matcher result for `text`; `taxon` resolves a bare epithet. */
export function useSpeciesMatch(text: string, taxon?: string | null): SpeciesNameMatch | null {
  const [res, setRes] = useState<SpeciesNameMatch | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const t = text.trim()
    const mine = ++seq.current
    if (t.length < 3) { setRes(null); return }
    const timer = setTimeout(() => {
      matchSpeciesName(t, taxon ?? null)
        .then((r) => { if (mine === seq.current) setRes(r) })
        .catch(() => { if (mine === seq.current) setRes(null) })
    }, 450)
    return () => clearTimeout(timer)
  }, [text, taxon])
  return res
}

export const taxonLabel = (t: string) => (INVERT_TAXA as Record<string, { label: string }>)[t]?.label ?? t

export default function SpeciesSuggestion({
  match, onUse, currentTaxon, busy = false,
}: {
  match: NonNullable<SpeciesNameMatch['match']>
  onUse: () => void
  /** When set and different, say the taxon changes too. */
  currentTaxon?: string | null
  busy?: boolean
}) {
  const switching = !!currentTaxon && currentTaxon !== match.taxon
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5" role="status">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{match.kind === 'exact' ? 'In our species list' : 'Did you mean'}</p>
        <p className="text-sm font-semibold italic text-gray-900 dark:text-white truncate">{match.scientific_name}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          {[match.common_name, taxonLabel(match.taxon)].filter(Boolean).join(' · ')}
          {switching ? ` — files it as a ${taxonLabel(match.taxon).toLowerCase()}` : ''}
        </p>
      </div>
      <button
        type="button" onClick={onUse} disabled={busy}
        className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Use this'}
      </button>
    </div>
  )
}
