'use client'

import { useState, FormEvent } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function Home() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body?.error || 'Something went wrong. Try again in a moment.')
        setStatus('error')
        return
      }

      setStatus('success')
      setEmail('')
    } catch {
      setErrorMsg('Network error. Try again in a moment.')
      setStatus('error')
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 py-16 overflow-hidden">
      {/* Ambient brand glow, sits behind content */}
      <div
        aria-hidden="true"
        className="herp-hero-glow absolute inset-0 pointer-events-none"
      />

      <div className="relative w-full max-w-xl">
        {/* Herpetoverse mark — gecko inside the brand ring, gradient green→teal.
            The SVG ring is part of the mark itself, no extra container needed. */}
        <div className="mb-10 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Herpetoverse"
            width={96}
            height={100}
            className="h-24 w-auto select-none"
            style={{ imageRendering: 'auto' }}
            draggable={false}
          />
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-herp-teal/90 font-medium">
              Same universe
            </p>
            <p className="text-xs tracking-[0.2em] uppercase text-herp-green/90 font-medium">
              Different species
            </p>
          </div>
        </div>

        <div className="mb-12">
          <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-4 font-medium">
            Coming soon
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-wide leading-tight mb-6">
            <span className="herp-gradient-text">Herpetoverse</span>
          </h1>
          <p className="text-lg sm:text-xl text-neutral-300 leading-relaxed">
            A husbandry platform for reptile keepers. Track environments, record
            sheds and feedings, plan pairings, and explore care research — all in
            one place.
          </p>
        </div>

        <div className="mb-12">
          <p className="text-neutral-400 mb-4">
            Be first to know when we open the doors.
          </p>

          {status === 'success' ? (
            <div
              role="status"
              aria-live="polite"
              className="p-4 rounded-md border border-herp-green/40 bg-herp-green/10 text-herp-lime"
            >
              You&rsquo;re on the list. Watch your inbox — we&rsquo;ll let you know
              the moment Herpetoverse is live.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'submitting'}
                className="flex-1 px-4 py-3 rounded-md bg-neutral-900 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-herp-teal focus:border-transparent disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="herp-gradient-bg px-6 py-3 rounded-md font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'submitting' ? 'Signing up…' : 'Notify me'}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-3 text-sm text-red-400"
            >
              {errorMsg}
            </p>
          )}

          <p className="mt-3 text-xs text-neutral-500">
            We&rsquo;ll only email you about the launch. No newsletters, no
            sharing, ever.
          </p>
        </div>

        <footer className="pt-8 border-t border-neutral-800 text-sm text-neutral-400">
          <p>
            Built by the team behind{' '}
            <a
              href="https://tarantuverse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-herp-teal hover:text-herp-lime underline underline-offset-4 transition-colors"
            >
              Tarantuverse
            </a>
            . Shared account, one login — bring your keeper profile with you.
          </p>
        </footer>
      </div>
    </main>
  )
}
