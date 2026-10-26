'use client'

import { useEffect, useRef } from 'react'

/**
 * "No account for {email}" — shown on the sign-in page when a Google sign-in
 * used an email that has no Herpetoverse/Tarantuverse account. Creating an
 * account is a deliberate choice here, not a side effect of tapping the wrong
 * button. Copy is fixed by the sign-in fixes plan; "Go back" is the default.
 *
 * Keyboard: focus moves to "Go back" when it opens, Escape = Go back, and on
 * close focus returns to whatever had it before (the sign-in control that was
 * used).
 */

interface NoAccountConfirmProps {
  email: string
  busy?: boolean
  onGoBack: () => void
  onCreate: () => void
}

export default function NoAccountConfirm({ email, busy = false, onGoBack, onCreate }: NoAccountConfirmProps) {
  const goBackRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    goBackRef.current?.focus()
    return () => {
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      role="alertdialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) {
          e.stopPropagation()
          onGoBack()
        }
      }}
      aria-labelledby="no-account-title"
      aria-describedby="no-account-body"
      className="p-4 rounded-md border border-neutral-700 bg-neutral-950"
    >
      <h2 id="no-account-title" className="text-sm font-semibold text-neutral-100 break-words">
        {email ? `No account for ${email}` : 'No account for this email'}
      </h2>
      <p id="no-account-body" className="mt-1 text-sm text-neutral-400">
        Create a new account, or go back and sign in the way you did before.
      </p>
      <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="px-4 py-2 rounded-md border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <button
          type="button"
          ref={goBackRef}
          onClick={onGoBack}
          disabled={busy}
          className="px-4 py-2 rounded-md herp-gradient-bg text-herp-dark text-sm font-bold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
