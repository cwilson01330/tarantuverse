/**
 * Per-animal genotype CRUD — `/animals/{id}/genotype` (owner-only).
 *
 * Web twin of the genotype half of apps/mobile-herpetoverse/src/lib/genes.ts.
 * Kept out of `lib/genes.ts` on purpose: that module is imported by the
 * public (server-rendered) morph calculator and must not pull in the
 * client-only authenticated `apiFetch`.
 *
 * The gene catalog itself still comes from `fetchGenesForSpecies` in
 * `lib/genes.ts`.
 */
'use client'

import { apiFetch } from './apiClient'
import type { Gene } from './genes'

/** Mirrors ZYGOSITY_PATTERN in apps/api/app/schemas/animal_genotype.py. */
export type Zygosity = 'het' | 'visual' | 'poss_het' | 'super'

export interface AnimalGenotype {
  id: string
  animal_id: string
  gene_id: string
  zygosity: Zygosity
  poss_het_percentage: number | null
  proven: boolean
  notes: string | null
  created_at: string
}

export interface CreateGenotypePayload {
  gene_id: string
  zygosity: Zygosity
  poss_het_percentage?: number | null
  proven?: boolean
  notes?: string | null
}

/** Mobile falls back to ball python when the animal has no species set —
 *  it's the most complete catalog. Same here. */
export const FALLBACK_GENE_SPECIES = 'Python regius'

/**
 * Zygosity options per gene type. Recessive genes are the ones where "het"
 * is meaningful; a dominant gene is either present or not; a co/incomplete
 * dominant shows with one copy and has a super form with two. Same lists
 * as mobile's GenotypeSection (detail) and AddGenesField (add form).
 */
export function zygosityOptions(g: Pick<Gene, 'gene_type'>): Zygosity[] {
  if (g.gene_type === 'recessive') return ['het', 'visual', 'poss_het']
  if (g.gene_type === 'dominant') return ['visual']
  return ['visual', 'super']
}

/** Add-form ordering (mobile AddGenesField): visual first for recessives. */
export function addFormZygosityOptions(g: Pick<Gene, 'gene_type'>): Zygosity[] {
  if (g.gene_type === 'recessive') return ['visual', 'het', 'poss_het']
  return zygosityOptions(g)
}

export const ZYG_LABEL: Record<Zygosity, string> = {
  visual: 'Visual',
  het: 'Het',
  poss_het: 'Poss het',
  super: 'Super',
}

/** Chip label — "het", "visual", "poss het (66%)". Mirrors mobile zygosityLabel. */
export function zygosityLabel(z: Zygosity, possHetPct?: number | null): string {
  if (z === 'poss_het') {
    return possHetPct != null ? `poss het (${possHetPct}%)` : 'poss het'
  }
  return z
}

export function listAnimalGenotype(animalId: string): Promise<AnimalGenotype[]> {
  return apiFetch<AnimalGenotype[]>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/genotype`,
  )
}

export function addAnimalGenotype(
  animalId: string,
  payload: CreateGenotypePayload,
): Promise<AnimalGenotype> {
  return apiFetch<AnimalGenotype>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/genotype`,
    { method: 'POST', json: payload },
  )
}

export function deleteAnimalGenotype(
  animalId: string,
  genotypeId: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/animals/${encodeURIComponent(animalId)}/genotype/${encodeURIComponent(genotypeId)}`,
    { method: 'DELETE' },
  )
}
