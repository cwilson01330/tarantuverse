"use client"

import { useEffect, useRef } from "react"

/**
 * "No account for {email}" — shown on the login page when a Google/Apple
 * sign-in used an email that has no Tarantuverse account. Creating an account
 * is a deliberate choice here, not a side effect of tapping the wrong button.
 * Copy is fixed by the sign-in fixes plan; "Go back" is the default action.
 *
 * Keyboard: focus moves to "Go back" when it opens, Escape = Go back, and on
 * close focus returns to whatever had it before (the sign-in button that was
 * pressed). After an OAuth redirect nothing had focus, so `fallbackFocus`
 * names where to land instead.
 */

interface NoAccountConfirmProps {
  /** The provider's email, or null when it couldn't be carried over. */
  email: string | null
  busy?: boolean
  onGoBack: () => void
  onCreate: () => void
  /** Where focus goes on close when it had no owner before the dialog opened. */
  fallbackFocus?: () => HTMLElement | null
}

export default function NoAccountConfirm({
  email,
  busy = false,
  onGoBack,
  onCreate,
  fallbackFocus,
}: NoAccountConfirmProps) {
  const goBackRef = useRef<HTMLButtonElement>(null)
  const fallbackRef = useRef(fallbackFocus)
  fallbackRef.current = fallbackFocus

  useEffect(() => {
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    goBackRef.current?.focus()
    return () => {
      const target = opener && opener.isConnected ? opener : fallbackRef.current?.() ?? null
      target?.focus()
    }
  }, [])

  return (
    <div
      role="alertdialog"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation()
          onGoBack()
        }
      }}
      aria-labelledby="no-account-title"
      aria-describedby="no-account-body"
      className="mb-4 p-4 rounded-xl border border-theme bg-surface"
    >
      <h2 id="no-account-title" className="text-base font-semibold text-theme-primary break-words">
        {email ? `No account for ${email}` : "No account for this email"}
      </h2>
      <p id="no-account-body" className="mt-1 text-sm text-theme-secondary">
        Create a new account, or go back and sign in the way you did before.
      </p>
      <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="px-4 py-2 rounded-xl border border-theme text-theme-primary hover:bg-surface-elevated transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creating..." : "Create account"}
        </button>
        <button
          type="button"
          ref={goBackRef}
          onClick={onGoBack}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-white hover:bg-gradient-brand-hover transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
