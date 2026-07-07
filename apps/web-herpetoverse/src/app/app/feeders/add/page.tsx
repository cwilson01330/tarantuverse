'use client'

/**
 * Add feeder stock — thin wrapper around the shared FeederStockForm
 * (ADR-012). The form handles create vs edit based on whether a `stock`
 * prop is passed; here we pass none and optionally pre-select a species
 * from the `?species=` query param (set by a care sheet's "Add to my
 * stock" CTA).
 *
 * useSearchParams needs a Suspense boundary or the Vercel build fails the
 * static prerender pass — hence the shell.
 */

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import FeederStockForm from '../FeederStockForm'

function AddFeederStockInner() {
  const searchParams = useSearchParams()
  const speciesId = searchParams.get('species')
  return <FeederStockForm initialSpeciesId={speciesId} />
}

export default function AddFeederStockPage() {
  return (
    <Suspense fallback={null}>
      <AddFeederStockInner />
    </Suspense>
  )
}
