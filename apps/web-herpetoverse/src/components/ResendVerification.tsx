'use client'

/**
 * "Send a new link" for keepers whose email isn't verified yet.
 *
 * Used on sign-in (403 "Email not verified"), right after registration, and
 * on /verify-email when a link has expired. Verification links used to
 * expire after 24h with no way to ask for another, which left keepers stuck.
 *
 * Posts the address as a JSON body — never `?email=` — plus this site's
 * origin, so the email says "Herpetoverse" and links back here rather than
 * to Tarantuverse. The API answers identically whether or not the account
 * exists, so this component never claims more than "on its way".
 */

import { useState } from 'react'
import { apiFetch } from '@/lib/apiClient'

type State = 'idle' | 'sending' | 'sent' | 'error'

export default function ResendVerification({
  email,
  intro,
  showPromptTitle = true,
}: {
  email: string
  /** Lead-in shown before anything is sent. */
  intro?: string
  /** Show the "Confirm your email first" heading before sending. Turn off
   *  where the page already says what's wrong (e.g. /verify-email's "This
   *  link didn't work"), so the two headings don't stack. "New link sent"
   *  always shows — it's the confirmation. */
  showPromptTitle?: boolean
}) {
  const [state, setState] = useState<State>('idle')

  async function send() {
    if (!email.trim() || state === 'sending') return
    setState('sending')
    try {
      await apiFetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        auth: false,
        json: {
          email: email.trim(),
          frontend_url:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      })
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100"
    >
      {(state === 'sent' || showPromptTitle) && (
        <p className="font-semibold text-neutral-100 mb-1">
          {state === 'sent' ? 'New link sent' : 'Confirm your email first'}
        </p>
      )}
      <p className="text-neutral-300">
        {state === 'sent'
          ? `Check the inbox for ${email.trim()} — and the spam folder, just in case. The link works for 3 days.`
          : state === 'error'
            ? "We couldn't send that just now. Check your connection and try again."
            : intro ??
              `We sent a confirmation link to ${email.trim()}. If you can't find it, or it's stopped working, we'll send a fresh one.`}
      </p>
      {state !== 'sent' && (
        <button
          type="button"
          onClick={send}
          disabled={state === 'sending' || !email.trim()}
          className="mt-3 w-full herp-gradient-bg text-herp-dark font-bold py-2 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {state === 'sending' ? 'Sending…' : 'Send a new link'}
        </button>
      )}
    </div>
  )
}
