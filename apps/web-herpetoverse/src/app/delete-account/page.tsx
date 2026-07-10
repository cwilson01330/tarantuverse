'use client'

/**
 * Standalone, PUBLIC account-deletion page for Herpetoverse.
 *
 * This is the canonical "Delete account URL" handed to the Play Console Data
 * Safety form and the App Store. It works WITHOUT the app: the visitor enters
 * their credentials, we log in fresh to obtain a token, then call
 * DELETE /api/v1/auth/me. It mirrors the in-app deletion in /app/settings but
 * is reachable by a reviewer (or any user) straight from a browser, and it
 * documents exactly what is removed and what is retained.
 *
 * The account is shared with Tarantuverse (one user table), so deleting here
 * deletes the single underlying account across both apps — stated plainly
 * below so nobody is surprised.
 */

import { useState } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SUPPORT_EMAIL = 'support@tarantuverse.com'

export default function DeleteAccountPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (confirm.trim().toUpperCase() !== 'DELETE') {
      setError('Please type DELETE to confirm.')
      return
    }

    setLoading(true)
    try {
      // Log in fresh to obtain a token (HV auth takes JSON email+password).
      const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (!loginRes.ok) {
        throw new Error('Incorrect email or password.')
      }
      const loginData = await loginRes.json()
      const token = loginData.access_token

      const deleteRes = await fetch(`${API_URL}/api/v1/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!deleteRes.ok) {
        throw new Error('Could not delete your account. Please try again or contact support.')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Account deleted</h1>
          <p className="text-neutral-400 mb-6">
            Your account and all associated data have been permanently deleted.
            This action cannot be undone.
          </p>
          <Link href="/" className="text-herp-teal hover:text-herp-lime transition-colors">
            Return to Herpetoverse
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="text-sm text-herp-teal hover:text-herp-lime transition-colors">
            ← Back to Herpetoverse
          </Link>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8">
          <h1 className="text-3xl font-bold mb-2">Delete your account</h1>
          <p className="text-neutral-400 mb-8">
            Herpetoverse, operated by Appalachian Tarantulas, LLC
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">How to delete your account</h2>
            <ol className="list-decimal pl-6 text-neutral-300 space-y-2">
              <li>Enter the email address and password for your Herpetoverse account below.</li>
              <li>Type <strong>DELETE</strong> in the confirmation field.</li>
              <li>Click &quot;Permanently delete my account.&quot;</li>
            </ol>
            <p className="text-sm text-neutral-500 mt-4">
              You can also delete your account from inside the app, under{' '}
              <span className="text-neutral-300">Settings → Delete account</span>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Data that will be deleted</h2>
            <p className="text-neutral-300 mb-3">
              The following is <strong>permanently deleted</strong> immediately upon request:
            </p>
            <ul className="list-disc pl-6 text-neutral-300 space-y-1">
              <li>Your account profile (username, email, display name, avatar, bio)</li>
              <li>Your animal collection and all associated records</li>
              <li>Feeding logs, molt/shed logs, and substrate/enclosure change logs</li>
              <li>Feeder stock and feeder logs</li>
              <li>Photos and thumbnails</li>
              <li>Breeding records</li>
              <li>Forum posts, replies, and direct messages</li>
              <li>Follow relationships and activity history</li>
              <li>Notification preferences and push tokens</li>
              <li>Subscription and billing information</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Shared account note</h2>
            <p className="text-neutral-300">
              Your Herpetoverse login is the same account you use for Tarantuverse.
              Deleting it here removes that single account and its data across both
              apps. If you keep animals in Tarantuverse too, export first.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">Data retention</h2>
            <p className="text-neutral-300">
              All personal data is deleted immediately. Anonymous, aggregated
              analytics (e.g. total species-kept counts) may be retained but cannot
              be linked back to you. No personal data is retained after deletion.
            </p>
          </section>

          <section className="mb-8">
            <div className="rounded-lg border border-herp-teal/40 bg-herp-teal/10 p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📦</span>
                <div>
                  <h3 className="font-semibold mb-1">Download your data first?</h3>
                  <p className="text-sm text-neutral-300 mb-3">
                    Before deleting, you can export everything — collection, logs,
                    photos, breeding records, and more. Once your account is deleted,
                    this data cannot be recovered.
                  </p>
                  <Link
                    href="/app/settings"
                    className="inline-block px-4 py-2 rounded-md herp-gradient-bg text-herp-dark font-bold text-sm"
                  >
                    Export my data
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-neutral-800 pt-8">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 mb-6">
              <p className="text-red-300 font-medium">
                Warning: this action is permanent and cannot be undone. All your
                data will be immediately and irreversibly deleted.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 text-neutral-100 placeholder-neutral-600"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 text-neutral-100 placeholder-neutral-600"
                  placeholder="Enter your password"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Type DELETE to confirm
                </label>
                <input
                  id="confirm"
                  type="text"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/50 text-neutral-100 placeholder-neutral-600"
                  placeholder="DELETE"
                />
              </div>

              <button
                type="submit"
                disabled={loading || confirm.trim().toUpperCase() !== 'DELETE'}
                className="w-full py-3 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Deleting…' : 'Permanently delete my account'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-neutral-500 mt-8">
          Questions? Contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-herp-teal hover:text-herp-lime transition-colors">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  )
}
