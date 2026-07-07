'use client'

/**
 * Transfers — sent / received rehome records.
 *
 * Lists the keeper's outgoing (sent) and incoming (received) animal
 * transfers. Sent rows can be cancelled while pending and expose the private
 * sale price; received rows show who sent the animal. Ported from the
 * Tarantuverse transfer surface onto the animal-aware backend list endpoint.
 *
 * This route sits under /app (AppShell) but OUTSIDE /app/reptiles, so the
 * shared client auth gate in /app/reptiles/layout.tsx doesn't cover it — we
 * gate inline, redirecting unauthenticated visitors to /login.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/lib/apiClient'
import { useAuth } from '@/lib/auth'
import {
  type TransferListItem,
  type TransferRole,
  type TransferStatus,
  TRANSFER_STATUS_LABEL,
  cancelTransfer,
  listTransfers,
} from '@/lib/transfers'
import { ANIMAL_TAXA, type AnimalTaxon } from '@/lib/animals'

const TABS: { role: TransferRole; label: string }[] = [
  { role: 'sent', label: 'Sent' },
  { role: 'received', label: 'Received' },
]

function taxonGlyph(taxon: string): string {
  const meta = ANIMAL_TAXA[taxon as AnimalTaxon]
  return meta ? meta.glyph : '🦎'
}

function statusChipClasses(status: TransferStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/15 text-amber-300'
    case 'claimed':
      return 'bg-herp-teal/15 text-herp-lime'
    case 'cancelled':
      return 'bg-neutral-800 text-neutral-400'
    case 'expired':
      return 'bg-red-500/15 text-red-300'
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function TransfersPage() {
  const router = useRouter()
  const { token, isLoading: authLoading } = useAuth()

  const [role, setRole] = useState<TransferRole>('sent')
  const [items, setItems] = useState<TransferListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Inline auth gate — this route isn't covered by the reptiles layout.
  useEffect(() => {
    if (authLoading) return
    if (!token) router.replace('/login?next=%2Fapp%2Ftransfers')
  }, [authLoading, token, router])

  const load = useCallback(
    async (r: TransferRole) => {
      setLoading(true)
      setError(null)
      try {
        const data = await listTransfers(r)
        setItems(data)
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your transfers. Check your connection and try again.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (authLoading || !token) return
    load(role)
  }, [authLoading, token, role, load])

  const handleCancel = useCallback(
    async (item: TransferListItem) => {
      if (!window.confirm('Cancel this transfer link? The buyer will no longer be able to claim it.')) {
        return
      }
      try {
        await cancelTransfer(item.token)
        // Optimistically flip the row to cancelled, then refetch to stay honest.
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'cancelled' } : i)),
        )
        load(role)
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Could not cancel this transfer.',
        )
      }
    },
    [role, load],
  )

  if (authLoading || !token) {
    return (
      <div
        className="flex items-center justify-center min-h-[40vh]"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="text-xs uppercase tracking-widest text-neutral-600">
          Checking sign-in…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/app/reptiles"
        className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        ← Back to collection
      </Link>

      <h1 className="text-3xl font-bold tracking-wide text-white mt-2 mb-1">
        Transfers
      </h1>
      <p className="text-neutral-400 mb-6">
        Rehome records — animals you&apos;ve handed off and ones sent to you.
      </p>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Transfer direction"
        className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-neutral-800 bg-neutral-900/40 mb-6"
      >
        {TABS.map((tab) => (
          <button
            key={tab.role}
            role="tab"
            aria-selected={role === tab.role}
            onClick={() => setRole(tab.role)}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              role === tab.role
                ? 'herp-gradient-bg text-herp-dark'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-sm"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg border border-neutral-800 bg-neutral-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/20 text-center">
          <div className="text-4xl mb-3" aria-hidden="true">
            {role === 'sent' ? '📤' : '📥'}
          </div>
          <p className="text-neutral-300 font-medium mb-1">
            {role === 'sent' ? 'No transfers sent yet' : 'No transfers received yet'}
          </p>
          <p className="text-sm text-neutral-500">
            {role === 'sent'
              ? 'Generate a claim link from any animal to hand it off to a new keeper.'
              : 'When someone sends you an animal, it will show up here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40 flex items-start gap-3"
            >
              <span className="text-2xl flex-shrink-0" aria-hidden="true">
                {taxonGlyph(item.taxon)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white truncate">
                    {item.display_name || <span className="italic text-neutral-500">Unnamed animal</span>}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusChipClasses(
                      item.status,
                    )}`}
                  >
                    {TRANSFER_STATUS_LABEL[item.status]}
                  </span>
                </div>

                <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
                  {item.counterparty && (
                    <div>
                      {role === 'sent' ? 'To' : 'From'}{' '}
                      <span className="text-neutral-300">{item.counterparty}</span>
                    </div>
                  )}
                  {/* sale_price only comes back on sent rows, and is private. */}
                  {role === 'sent' && item.sale_price != null && (
                    <div>
                      Sale price{' '}
                      <span className="text-neutral-300">${item.sale_price}</span>{' '}
                      <span className="text-neutral-600">(private)</span>
                    </div>
                  )}
                  {item.note && (
                    <div className="text-neutral-400 truncate">&ldquo;{item.note}&rdquo;</div>
                  )}
                  <div>
                    Created {fmtDate(item.created_at)}
                    {item.status === 'claimed' && item.claimed_at
                      ? ` · Claimed ${fmtDate(item.claimed_at)}`
                      : item.status === 'pending' && item.expires_at
                        ? ` · Expires ${fmtDate(item.expires_at)}`
                        : ''}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-2 flex items-center gap-3">
                  {/* Link back to the animal detail. On sent+claimed the
                      original record is now a transferred historical one; on
                      received+claimed the claimed animal is in our collection. */}
                  {role === 'received' && item.claimed_animal_id && (
                    <Link
                      href={`/app/reptiles/${item.claimed_animal_id}`}
                      className="text-xs text-herp-teal hover:text-herp-lime transition-colors"
                    >
                      View animal →
                    </Link>
                  )}
                  {role === 'sent' && item.animal_id && (
                    <Link
                      href={`/app/reptiles/${item.animal_id}`}
                      className="text-xs text-herp-teal hover:text-herp-lime transition-colors"
                    >
                      View record →
                    </Link>
                  )}
                  {role === 'sent' && item.status === 'pending' && (
                    <>
                      <Link
                        href={`/claim/${item.token}`}
                        className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                      >
                        Open claim link
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleCancel(item)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
