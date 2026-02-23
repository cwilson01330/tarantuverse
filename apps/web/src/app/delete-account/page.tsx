'use client'

import { useState } from 'react'
import Link from 'next/link'

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

    if (confirm !== 'DELETE') {
      setError('Please type DELETE to confirm.')
      return
    }

    setLoading(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      // First login to get token
      const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
      })

      if (!loginRes.ok) {
        throw new Error('Invalid email or password.')
      }

      const loginData = await loginRes.json()
      const token = loginData.access_token

      // Delete account
      const deleteRes = await fetch(`${API_URL}/api/v1/auth/me`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!deleteRes.ok) {
        throw new Error('Failed to delete account. Please try again or contact support.')
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Deleted</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your account and all associated data have been permanently deleted. This action cannot be undone.
          </p>
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
            Return to Tarantuverse
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            ← Back to Tarantuverse
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Delete Your Account</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Tarantuverse by Tarantuverse LLC
          </p>

          {/* What gets deleted */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">How to Delete Your Account</h2>
            <ol className="list-decimal pl-6 text-gray-700 dark:text-gray-300 space-y-2">
              <li>Enter the email address and password associated with your Tarantuverse account below.</li>
              <li>Type <strong>DELETE</strong> in the confirmation field.</li>
              <li>Click the &quot;Permanently Delete My Account&quot; button.</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Data That Will Be Deleted</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-3">The following data will be <strong>permanently deleted</strong> immediately upon request:</p>
            <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-1">
              <li>Your account profile (username, email, display name, avatar, bio)</li>
              <li>Your tarantula collection and all associated records</li>
              <li>Feeding logs, molt logs, and substrate change logs</li>
              <li>Photos and thumbnails</li>
              <li>Breeding records (pairings, egg sacs, offspring)</li>
              <li>Forum posts and replies</li>
              <li>Direct messages</li>
              <li>Follow relationships</li>
              <li>Activity feed history</li>
              <li>Notification preferences</li>
              <li>Subscription and billing information</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Data Retention</h2>
            <p className="text-gray-700 dark:text-gray-300">
              All personal data is deleted immediately. Anonymous, aggregated analytics data (e.g., total species kept counts)
              may be retained but cannot be linked back to your account. No personal data is retained after deletion.
            </p>
          </section>

          {/* Delete form */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
              <p className="text-red-700 dark:text-red-400 font-medium">
                Warning: This action is permanent and cannot be undone. All your data will be immediately and irreversibly deleted.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter your password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type <strong>DELETE</strong> to confirm
                </label>
                <input
                  type="text"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="DELETE"
                />
              </div>

              <button
                type="submit"
                disabled={loading || confirm !== 'DELETE'}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Deleting...' : 'Permanently Delete My Account'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          Questions? Contact us at <a href="mailto:support@tarantuverse.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@tarantuverse.com</a>
        </p>
      </div>
    </div>
  )
}
