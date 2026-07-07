'use client'

/**
 * Edit feeder stock — loads the stock client-side (token in localStorage)
 * then hands it to the shared FeederStockForm, which switches into edit
 * mode when given a `stock` prop.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { type FeederStock, getFeederStock } from '@/lib/feeders'
import FeederStockForm from '../../FeederStockForm'

export default function FeederStockEditClient({ stockId }: { stockId: string }) {
  const [stock, setStock] = useState<FeederStock | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getFeederStock(stockId)
      .then((s) => {
        if (!cancelled) setStock(s)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError ? err.message : 'Could not load this stock.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [stockId])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/app/feeders/${stockId}`}
          className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          ← Back
        </Link>
        <div
          role="alert"
          className="mt-4 p-4 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
        >
          {error}
        </div>
      </div>
    )
  }

  if (!stock) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-8 bg-neutral-800 rounded w-1/3 mb-6 animate-pulse" />
        <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    )
  }

  return <FeederStockForm stock={stock} />
}
