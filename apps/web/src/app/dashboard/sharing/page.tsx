'use client'

/**
 * Sharing — co-keepers (PRD-shared-keeping rung 3).
 *
 * Two halves on one page, because most people are on only one side:
 *  - Shared with me: collections you help keep, and invites waiting for you.
 *  - Your co-keepers: people who help keep YOUR collection (premium to invite).
 *  - Transfers you've sent, and card links (list + turn off; mirrors mobile app/share/cards.tsx).
 *
 * Every button here is a hint; the API enforces every rule on every request.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import UpgradeModal from '@/components/UpgradeModal'
import { useAuth } from '@/hooks/useAuth'
import {
  CoKeeperApiError,
  ROLE_HELP,
  ROLE_LABEL,
  coKeeperApi,
  loadSharedWithMe,
  type InviteCreated,
  type Member,
  type Role,
  type SharedCollection,
  type SharedWithMe,
} from '@/lib/coKeepers'
import { cancelColonyTransfer, listSentTransfers, type ColonyTransferRow } from '@/lib/colonies'

const BTN = 'px-4 py-2 rounded-xl font-medium transition disabled:opacity-50'
const BTN_PRIMARY = `${BTN} bg-gradient-brand text-white shadow-gradient-brand hover:opacity-90`
const BTN_SECONDARY = `${BTN} border border-theme bg-surface text-theme-primary hover:bg-surface-elevated`
const INPUT = 'w-full px-3 py-2 rounded-xl border border-theme bg-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-purple-500'
const ROLES: Role[] = ['viewer', 'logger', 'keeper']

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function SharingPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [shared, setShared] = useState<SharedWithMe | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState<string | null>(null)
  const [justInvited, setJustInvited] = useState<InviteCreated | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const [s, m] = await Promise.all([loadSharedWithMe(token, true), coKeeperApi.members(token)])
      setShared(s)
      setMembers(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sharing.')
    }
  }, [token])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login?redirect=/dashboard/sharing')
      return
    }
    void refresh()
  }, [isLoading, isAuthenticated, token, router, refresh])

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      if (e instanceof CoKeeperApiError && e.status === 402) setUpgrade(e.message)
      else setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-theme-primary">Sharing</h1>
          <p className="text-theme-secondary mt-1">
            Keep a collection together. Everyone uses their own account, and you choose what each person can do.
          </p>
          <p className="text-sm text-theme-secondary mt-1">
            Shared a card? <a href="#card-links" className="text-purple-700 dark:text-purple-300 hover:underline">Your card links</a> are at the bottom of this page.
          </p>
        </header>

        {error && (
          <div role="alert" className="p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── Shared with me ── */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-theme-primary">Shared with me</h2>
          {shared === null && <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />}
          {shared && !shared.email_verified && (
            <p className="text-sm text-theme-secondary">
              Verify your email address to see and accept invites sent to it.
            </p>
          )}
          {shared?.invites.filter((i) => i.app === 'tarantuverse').map((inv) => (
            <div key={inv.id} className="p-4 rounded-2xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 space-y-3">
              <p className="text-theme-primary">
                <strong>{inv.owner.name}</strong> invited you to help keep their collection as a{' '}
                <strong>{ROLE_LABEL[inv.role]}</strong>.
              </p>
              <p className="text-sm text-theme-secondary">{ROLE_HELP[inv.role]}</p>
              <div className="flex gap-2">
                <button className={BTN_PRIMARY} disabled={!!busy}
                  onClick={() => act('accept', async () => { await coKeeperApi.acceptInvite(token!, inv.id) })}>
                  Accept
                </button>
                <button className={BTN_SECONDARY} disabled={!!busy}
                  onClick={() => act('decline', async () => { await coKeeperApi.declineInvite(token!, inv.id) })}>
                  Decline
                </button>
              </div>
            </div>
          ))}
          {shared && shared.collections.filter((c) => c.app === 'tarantuverse').length === 0
            && shared.invites.filter((i) => i.app === 'tarantuverse').length === 0 && (
            <p className="text-theme-secondary">Nothing shared with you yet. Invited by someone? Open the link in the invite email, or enter the code from it below.</p>
          )}
          {shared?.collections.filter((c) => c.app === 'tarantuverse').map((c) => (
            <div key={c.membership_id} className="p-4 rounded-2xl bg-surface border border-theme flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-theme-primary">{c.owner.name}&apos;s collection</p>
                <p className="text-sm text-theme-secondary">
                  You&apos;re a {ROLE_LABEL[c.role]}
                  {c.read_only && ' · read-only for now'}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/shared/${c.owner.id}`} className={BTN_PRIMARY}>Open</Link>
                <button className={BTN_SECONDARY} disabled={!!busy}
                  onClick={() => {
                    if (!confirm(`Leave ${c.owner.name}'s collection? You'll need a new invite to come back.`)) return
                    void act('leave', async () => { await coKeeperApi.leave(token!, c.membership_id) })
                  }}>
                  Leave
                </button>
              </div>
            </div>
          ))}
          {token && <CodeForm token={token} onAccepted={refresh} />}
        </section>

        {/* ── Your co-keepers ── */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-theme-primary">Your co-keepers</h2>
            <p className="text-sm text-theme-secondary">
              People who help keep your collection. Up to 10. Only you can delete or transfer animals, export, or change who has access.
            </p>
          </div>
          {members === null && <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />}
          {members?.length === 0 && <p className="text-theme-secondary">No co-keepers yet.</p>}
          {members?.map((m) => (
            <div key={m.id} className="p-4 rounded-2xl bg-surface border border-theme space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-theme-primary">
                    {m.status === 'active' ? (m.member?.name ?? 'Former member') : m.invited_email}
                  </p>
                  <p className="text-xs text-theme-tertiary">
                    {m.status === 'active' ? `Joined ${fmt(m.accepted_at)}` : `Invited · link works until ${fmt(m.invite_expires_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="sr-only" htmlFor={`role-${m.id}`}>Role</label>
                  <select id={`role-${m.id}`} className={`${INPUT} w-auto`} value={m.role} disabled={!!busy}
                    onChange={(e) => act('role', async () => { await coKeeperApi.changeRole(token!, m.id, e.target.value as Role) })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  {m.status === 'pending' && (
                    <button className={BTN_SECONDARY} disabled={!!busy}
                      onClick={() => act('resend', async () => { setJustInvited(await coKeeperApi.resend(token!, m.id)) })}>
                      Resend
                    </button>
                  )}
                  <button className={`${BTN} border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30`}
                    disabled={!!busy}
                    onClick={() => {
                      const who = m.status === 'active' ? (m.member?.name ?? 'this person') : m.invited_email
                      if (!confirm(m.status === 'active' ? `Remove ${who}? They lose access straight away.` : `Cancel the invite to ${who}?`)) return
                      void act('remove', async () => { await coKeeperApi.remove(token!, m.id) })
                    }}>
                    {m.status === 'active' ? 'Remove' : 'Cancel invite'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {justInvited && (
            <div className="p-4 rounded-2xl border border-theme bg-surface-elevated space-y-2" role="status">
              <p className="text-theme-primary">
                {justInvited.email_sent
                  ? <>Invite sent to <strong>{justInvited.invited_email}</strong>.</>
                  : <>We couldn&apos;t email <strong>{justInvited.invited_email}</strong> — send them this link instead.</>}
              </p>
              <p className="text-xs text-theme-tertiary">
                You can also text them this link. It only works for an account verified with that email address.
              </p>
              <input readOnly className={`${INPUT} font-mono text-xs`} value={justInvited.accept_url} onFocus={(e) => e.currentTarget.select()} />
            <p className="text-sm text-theme-secondary">
              Or they can enter this code on their Sharing page: <span className="font-mono font-semibold tracking-widest">{justInvited.invite_code}</span>
            </p>
              <button className={BTN_SECONDARY} onClick={() => setJustInvited(null)}>Done</button>
            </div>
          )}

          {token && (
            <InviteForm disabled={!!busy} ownEmail={user?.email ?? ''}
              onInvite={(email, role) => act('invite', async () => { setJustInvited(await coKeeperApi.invite(token, email, role)) })} />
          )}
        </section>

        {token && <SentTransfers token={token} />}

        {token && <CardLinks token={token} />}
      </div>
      <UpgradeModal isOpen={upgrade !== null} onClose={() => setUpgrade(null)} source="shared_keeping"
        feature="Co-keepers" description={upgrade ?? ''} />
    </DashboardLayout>
  )
}

function InviteForm({ disabled, ownEmail, onInvite }: {
  disabled: boolean
  ownEmail: string
  onInvite: (email: string, role: Role) => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('logger')
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setErr('Enter a valid email address.')
    if (v === ownEmail.trim().toLowerCase()) return setErr("That's your own email address.")
    setErr(null)
    onInvite(v, role)
    setEmail('')
  }
  return (
    <form onSubmit={submit} className="p-5 rounded-2xl bg-surface border border-theme space-y-3">
      <h3 className="font-semibold text-theme-primary">Invite someone <span className="text-xs font-normal text-theme-tertiary">Premium</span></h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-theme-secondary sm:col-span-2">
          Their email
          <input type="email" className={`${INPUT} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" autoComplete="off" />
        </label>
        <label className="text-sm text-theme-secondary">
          Role
          <select className={`${INPUT} mt-1`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-theme-tertiary">{ROLE_HELP[role]}</p>
      {err && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{err}</p>}
      <button type="submit" className={BTN_PRIMARY} disabled={disabled}>Send invite</button>
    </form>
  )
}

const TRANSFER_STATUS: Record<string, string> = {
  pending: 'Waiting to be claimed',
  claimed: 'Claimed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

/** Claim links this keeper has made, for animals and colonies (whole or part). */
function SentTransfers({ token }: { token: string }) {
  const [rows, setRows] = useState<ColonyTransferRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // Herpetoverse animals ride the same table; they belong on that site.
      setRows((await listSentTransfers(token)).filter((r) => r.kind !== 'animal'))
      setErr(null)
    } catch {
      setErr('Couldn’t load your transfer links.')
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const cancel = async (r: ColonyTransferRow) => {
    if (!confirm('Cancel this transfer link? Anyone holding it won’t be able to claim.')) return
    setBusy(r.token)
    try {
      await cancelColonyTransfer(token, r.token)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not cancel the transfer.')
    } finally {
      setBusy(null)
    }
  }

  const href = (r: ColonyTransferRow): string | null =>
    r.kind === 'colony' && r.colony_id
      ? `/dashboard/colonies/${r.colony_id}`
      : r.invert_id ? `/dashboard/inverts/${r.invert_id}` : null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-theme-primary">Transfers you&apos;ve sent</h2>
        <p className="text-sm text-theme-secondary">
          Claim links you made for animals and colonies. Make a new one from an animal&apos;s or colony&apos;s page.
        </p>
      </div>
      {err && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{err}</p>}
      {rows === null && !err && <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />}
      {rows?.length === 0 && <p className="text-theme-secondary">No transfer links yet.</p>}
      {rows?.map((r) => {
        const link = href(r)
        const name = r.display_name || (r.kind === 'colony' ? 'Colony' : 'Animal')
        return (
          <div key={r.id} className="p-4 rounded-2xl bg-surface border border-theme flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-theme-primary">
                {link ? <Link href={link} className="hover:underline">{name}</Link> : name}
                {r.kind === 'colony' && (
                  <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200">
                    Colony
                  </span>
                )}
              </p>
              {r.kind === 'colony' && r.label && <p className="text-sm text-theme-secondary">{r.label}</p>}
              <p className="text-xs text-theme-tertiary">
                {TRANSFER_STATUS[r.status] ?? r.status}
                {r.status === 'claimed' && r.counterparty ? ` by @${r.counterparty}` : ''}
                {r.status === 'claimed' && r.claimed_at ? ` · ${fmt(r.claimed_at)}` : ''}
                {r.status === 'pending' ? ` · link works until ${fmt(r.expires_at)}` : ''}
              </p>
            </div>
            {r.status === 'pending' && (
              <button className={BTN_SECONDARY} disabled={busy === r.token} onClick={() => cancel(r)}>
                {busy === r.token ? 'Cancelling…' : 'Cancel link'}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/** Mirrors apps/api/app/schemas/share_card.py::CardLinkItem. */
interface CardLinkItem {
  code: string
  app: string
  kind: string
  name: string | null
  url: string
  created_at: string
  revoked_at: string | null
}

/** Same wording as the mobile "Shared cards" screen (apps/mobile/src/lib/share-cards.ts). */
function cardKindLabel(kind: string): string {
  return ({ molt: 'molt', profile: 'profile', colony: 'colony', shed: 'shed', weight: 'weigh-in' } as Record<string, string>)[kind] ?? 'card'
}

/**
 * Card links this keeper made (or that point at their animals), with a way to
 * turn each off. Same API as the mobile "Shared cards" screen:
 * GET /card-links/ and DELETE /card-links/{code}. The API lists both apps;
 * Herpetoverse links belong on that site.
 */
function CardLinks({ token }: { token: string }) {
  const [rows, setRows] = useState<CardLinkItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/card-links/`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) throw new Error()
      const data: CardLinkItem[] = await r.json()
      setRows(data.filter((c) => c.app === 'tarantuverse'))
      setErr(null)
    } catch {
      setErr('Couldn’t load your card links.')
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const turnOff = async (c: CardLinkItem) => {
    if (!confirm('Turn off this link? Anyone with the link will see that the card is no longer shared.')) return
    setBusy(c.code)
    try {
      const r = await fetch(`${API_URL}/api/v1/card-links/${encodeURIComponent(c.code)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok && r.status !== 204) throw new Error()
      await load()
    } catch {
      setErr('Couldn’t turn it off. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3" id="card-links">
      <div>
        <h2 className="text-lg font-semibold text-theme-primary">Card links</h2>
        <p className="text-sm text-theme-secondary">
          Links to share cards you made. Turning one off stops it working for everyone who has it. Make a new card from an animal&apos;s or colony&apos;s page.
        </p>
      </div>
      {err && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {err}{' '}
          <button type="button" className="underline" onClick={() => void load()}>Try again</button>
        </p>
      )}
      {rows === null && !err && <div className="h-16 rounded-xl bg-surface-elevated animate-pulse" />}
      {rows?.length === 0 && <p className="text-theme-secondary">Card links you make appear here.</p>}
      {rows?.map((c) => {
        const name = c.name || (c.kind === 'colony' ? 'Colony' : 'Specimen')
        return (
          <div key={c.code} className="p-4 rounded-2xl bg-surface border border-theme flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-theme-primary">
                {name} <span className="font-normal text-theme-secondary">· {cardKindLabel(c.kind)}</span>
              </p>
              <p className="text-xs text-theme-tertiary truncate">
                {fmt(c.created_at)} ·{' '}
                {c.revoked_at
                  ? `Off since ${fmt(c.revoked_at)}`
                  : <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.url}</a>}
              </p>
            </div>
            {!c.revoked_at && (
              <button className={BTN_SECONDARY} disabled={busy === c.code} onClick={() => turnOff(c)}
                aria-label={`Turn off link for ${name}`}>
                {busy === c.code ? 'Turning off…' : 'Turn off'}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** For invite emails whose links a mail filter blocked: type the code instead. */
function CodeForm({ token, onAccepted }: { token: string; onAccepted: () => Promise<void> }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [joined, setJoined] = useState<SharedCollection | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.replace(/[^a-z0-9]/gi, '').length < 10) return setErr('Enter the 10-character code from your invite email.')
    setBusy(true)
    setErr(null)
    try {
      setJoined(await coKeeperApi.acceptCode(token, code))
      setCode('')
      await onAccepted()
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'That code didn\'t work.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="p-4 rounded-2xl bg-surface border border-theme space-y-2">
      <h3 className="font-semibold text-theme-primary">Have an invite code?</h3>
      <p className="text-sm text-theme-secondary">If the link in your invite email won&apos;t open, enter the code printed under it.</p>
      <div className="flex gap-2 flex-wrap">
        <label className="sr-only" htmlFor="invite-code">Invite code</label>
        <input id="invite-code" className={`${INPUT} font-mono uppercase tracking-widest max-w-xs`} value={code}
          onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="one-time-code"
          autoCapitalize="characters" spellCheck={false} maxLength={20} />
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Checking…' : 'Accept'}</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{err}</p>}
      {joined && (
        <p role="status" className="text-sm text-green-700 dark:text-green-300">
          You joined {joined.owner.name}&apos;s collection.{' '}
          <Link href={`/dashboard/shared/${joined.owner.id}`} className="underline">Open it</Link>
        </p>
      )}
    </form>
  )
}
