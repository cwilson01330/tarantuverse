'use client'

/**
 * Sharing — co-keepers (PRD-shared-keeping rung 3). Mirrors TV's
 * /dashboard/sharing so a keeper who uses both apps finds the same page.
 *
 *  - Shared with me: collections you help keep, and invites waiting for you.
 *  - Your co-keepers: people who help keep YOUR collection (premium to invite).
 *
 * Every button here is a hint; the API enforces every rule on every request.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import UpgradeModal from '@/components/UpgradeModal'
import { useAuth } from '@/lib/auth'
import {
  CoKeeperApiError,
  MEMBER_APP,
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

const BTN = 'px-4 py-2 rounded-xl font-medium transition disabled:opacity-50'
const BTN_PRIMARY = `${BTN} herp-gradient-bg text-herp-dark hover:opacity-90`
const BTN_SECONDARY = `${BTN} border border-neutral-800 bg-neutral-900 text-neutral-100 hover:bg-neutral-800`
const BTN_DANGER = `${BTN} border border-red-500/40 text-red-300 hover:bg-red-500/10`
const INPUT = 'w-full px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-herp-teal/50'
const CARD = 'p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40'
const ROLES: Role[] = ['viewer', 'logger', 'keeper']

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function SharingPage() {
  const router = useRouter()
  const { user, token, isLoading } = useAuth()
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
    if (!token) {
      router.replace('/login?next=/app/sharing')
      return
    }
    void refresh()
  }, [isLoading, token, router, refresh])

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

  const invites = shared?.invites.filter((i) => i.app === MEMBER_APP) ?? []
  const collections = shared?.collections.filter((c) => c.app === MEMBER_APP) ?? []

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <header>
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime font-medium mb-2">Sharing</p>
        <h1 className="text-3xl font-bold text-white">Keep a collection together</h1>
        <p className="text-neutral-400 mt-2">
          Everyone uses their own account, and you choose what each person can do.
        </p>
      </header>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Shared with me ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">Shared with me</h2>
        {shared === null && <div className="h-16 rounded-xl bg-neutral-900 animate-pulse" />}
        {shared && !shared.email_verified && (
          <p className="text-sm text-neutral-400">Verify your email address to see and accept invites sent to it.</p>
        )}
        {invites.map((inv) => (
          <div key={inv.id} className="p-4 rounded-2xl border border-herp-teal/40 bg-herp-teal/10 space-y-3">
            <p className="text-neutral-100">
              <strong>{inv.owner.name}</strong> invited you to help keep their collection as a{' '}
              <strong>{ROLE_LABEL[inv.role]}</strong>.
            </p>
            <p className="text-sm text-neutral-400">{ROLE_HELP[inv.role]}</p>
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
        {shared && collections.length === 0 && invites.length === 0 && (
          <p className="text-neutral-400">Nothing shared with you yet. Invited by someone? Open the link in the invite email, or enter the code from it below.</p>
        )}
        {collections.map((c) => (
          <div key={c.membership_id} className={`${CARD} flex items-center justify-between gap-3 flex-wrap`}>
            <div>
              <p className="font-semibold text-neutral-100">{c.owner.name}&apos;s collection</p>
              <p className="text-sm text-neutral-400">
                You&apos;re a {ROLE_LABEL[c.role]}
                {c.read_only && ' · read-only for now'}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/app/shared/${c.owner.id}`} className={BTN_PRIMARY}>Open</Link>
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
          <h2 className="text-sm uppercase tracking-[0.2em] text-herp-lime font-medium">Your co-keepers</h2>
          <p className="text-sm text-neutral-400 mt-1">
            People who help keep your collection. Up to 10. Only you can delete or transfer animals, export, or change who has access.
          </p>
        </div>
        {members === null && <div className="h-16 rounded-xl bg-neutral-900 animate-pulse" />}
        {members?.length === 0 && <p className="text-neutral-400">No co-keepers yet.</p>}
        {members?.map((m) => (
          <div key={m.id} className={`${CARD} flex items-center justify-between gap-3 flex-wrap`}>
            <div>
              <p className="font-semibold text-neutral-100">
                {m.status === 'active' ? (m.member?.name ?? 'Former member') : m.invited_email}
              </p>
              <p className="text-xs text-neutral-500">
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
              <button className={BTN_DANGER} disabled={!!busy}
                onClick={() => {
                  const who = m.status === 'active' ? (m.member?.name ?? 'this person') : m.invited_email
                  if (!confirm(m.status === 'active' ? `Remove ${who}? They lose access straight away.` : `Cancel the invite to ${who}?`)) return
                  void act('remove', async () => { await coKeeperApi.remove(token!, m.id) })
                }}>
                {m.status === 'active' ? 'Remove' : 'Cancel invite'}
              </button>
            </div>
          </div>
        ))}

        {justInvited && (
          <div className={`${CARD} space-y-2`} role="status">
            <p className="text-neutral-100">
              {justInvited.email_sent
                ? <>Invite sent to <strong>{justInvited.invited_email}</strong>.</>
                : <>We couldn&apos;t email <strong>{justInvited.invited_email}</strong> — send them this link instead.</>}
            </p>
            <p className="text-xs text-neutral-500">
              You can also text them this link. It only works for an account verified with that email address.
            </p>
            <input readOnly className={`${INPUT} font-mono text-xs`} value={justInvited.accept_url} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-sm text-neutral-400">
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

      <UpgradeModal isOpen={upgrade !== null} onClose={() => setUpgrade(null)} source="shared_keeping" message={upgrade} />
    </div>
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
    <form onSubmit={submit} className={`${CARD} space-y-3`}>
      <h3 className="font-semibold text-neutral-100">
        Invite someone <span className="text-xs font-normal text-neutral-500">Premium</span>
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-neutral-400 sm:col-span-2">
          Their email
          <input type="email" className={`${INPUT} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" autoComplete="off" />
        </label>
        <label className="text-sm text-neutral-400">
          Role
          <select className={`${INPUT} mt-1`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-500">{ROLE_HELP[role]}</p>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      <button type="submit" className={BTN_PRIMARY} disabled={disabled}>Send invite</button>
    </form>
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
    <form onSubmit={submit} className="p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-2">
      <h3 className="font-semibold text-neutral-100">Have an invite code?</h3>
      <p className="text-sm text-neutral-400">If the link in your invite email won&apos;t open, enter the code printed under it.</p>
      <div className="flex gap-2 flex-wrap">
        <label className="sr-only" htmlFor="invite-code">Invite code</label>
        <input id="invite-code" className={`${INPUT} font-mono uppercase tracking-widest max-w-xs`} value={code}
          onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="one-time-code"
          autoCapitalize="characters" spellCheck={false} maxLength={20} />
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? 'Checking…' : 'Accept'}</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {joined && (
        <p role="status" className="text-sm text-herp-lime">
          You joined {joined.owner.name}&apos;s collection.{' '}
          <Link href={`/app/shared/${joined.owner.id}`} className="underline text-herp-teal">Open it</Link>
        </p>
      )}
    </form>
  )
}
