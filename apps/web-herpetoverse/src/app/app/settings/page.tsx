'use client'

/**
 * Herpetoverse web settings.
 *
 * The keeper account is shared with Tarantuverse (one login, one
 * profile), so this edits the same `users` record. Sections: profile
 * editor, support + legal links, and account actions (sign out, delete
 * account). In-app account deletion is an App Store / Play requirement
 * on the mobile side; keeping web and mobile at parity means the same
 * controls live here.
 *
 * Avatar upload, username change (30-day cooldown), and notification
 * preferences are tracked for later bundles. Data export is live below
 * (reptile-aware — the shared exporter now includes animals + sheds +
 * weights + reptile breeding).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, ApiError } from '@/lib/apiClient'
import { clearSession, getToken, setSession } from '@/lib/auth'

// HV-owned legal pages, served from this same app at herpetoverse.com — so the
// URLs baked into the mobile build never break if brand hosting changes.
const PRIVACY_URL = 'https://herpetoverse.com/privacy-policy'
const TERMS_URL = 'https://herpetoverse.com/terms'
const SUPPORT_EMAIL = 'support@tarantuverse.com'
const DELETE_CONFIRM_WORD = 'DELETE'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-md bg-neutral-950 border border-neutral-800 focus:border-herp-teal focus:outline-none focus:ring-1 focus:ring-herp-teal/50 text-neutral-100 placeholder-neutral-600 disabled:opacity-50'
const LABEL_CLS =
  'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'
const CARD_CLS = 'p-6 rounded-lg border border-neutral-800 bg-neutral-900/50'
const SECTION_HDR_CLS = 'text-lg font-semibold text-white'

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
]

interface MeResponse {
  id: string
  email: string
  username: string
  display_name: string | null
  avatar_url: string | null
  profile_bio: string | null
  profile_location: string | null
  profile_experience_level: string | null
  profile_years_keeping: number | null
  collection_visibility: string | null
}

interface FormState {
  displayName: string
  bio: string
  location: string
  experience: string
  yearsKeeping: string
  visibility: string
}

const EMPTY_FORM: FormState = {
  displayName: '',
  bio: '',
  location: '',
  experience: '',
  yearsKeeping: '',
  visibility: 'private',
}

export default function SettingsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [exporting, setExporting] = useState<'json' | 'csv' | 'full' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const me = await apiFetch<MeResponse>('/api/v1/auth/me')
      setEmail(me.email)
      setUsername(me.username)
      setForm({
        displayName: me.display_name ?? '',
        bio: me.profile_bio ?? '',
        location: me.profile_location ?? '',
        experience: me.profile_experience_level ?? '',
        yearsKeeping:
          me.profile_years_keeping != null
            ? String(me.profile_years_keeping)
            : '',
        visibility: me.collection_visibility === 'public' ? 'public' : 'private',
      })
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setProfileSaved(false)
    setProfileError(null)
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (savingProfile) return
    setSavingProfile(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      const years = parseInt(form.yearsKeeping, 10)
      const payload: Record<string, unknown> = {
        display_name: form.displayName.trim() || null,
        profile_bio: form.bio.trim() || null,
        profile_location: form.location.trim() || null,
        profile_years_keeping:
          Number.isFinite(years) && years >= 0 ? years : null,
        collection_visibility: form.visibility,
      }
      // The endpoint 400s if experience_level is present but not one of
      // beginner/intermediate/advanced/expert — only send it when set.
      if (form.experience) {
        payload.profile_experience_level = form.experience
      }
      const updated = await apiFetch<MeResponse>('/api/v1/auth/me/profile', {
        method: 'PUT',
        json: payload,
      })
      // Refresh the cached user so the TopBar/Sidebar pick up the new name.
      const token = getToken()
      if (token) {
        setSession(token, {
          id: updated.id,
          email: updated.email,
          username: updated.username,
          display_name: updated.display_name,
          avatar_url: updated.avatar_url,
        })
      }
      setProfileSaved(true)
    } catch (err) {
      setProfileError(
        err instanceof ApiError
          ? err.message
          : 'Could not save. Check your connection and try again.',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleExport(format: 'json' | 'csv' | 'full') {
    if (exporting) return
    setExporting(format)
    setExportError(null)
    try {
      const token = getToken()
      const res = await fetch(`${API_URL}/api/v1/export/${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const ext = format === 'json' ? 'json' : 'zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `herpetoverse-export-${new Date().toISOString().slice(0, 10)}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Could not generate your export. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  function handleSignOut() {
    clearSession()
    router.replace('/login')
  }

  function closeDeleteModal() {
    if (deleting) return
    setDeleteOpen(false)
    setConfirmText('')
    setDeleteError(null)
  }

  async function handleDeleteAccount() {
    if (confirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD || deleting) {
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiFetch('/api/v1/auth/me', { method: 'DELETE' })
      clearSession()
      router.replace('/login')
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : 'Could not delete account. Please try again.',
      )
      setDeleting(false)
    }
  }

  const canDelete =
    confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD && !deleting

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-herp-lime mb-3 font-medium">
          Account
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-wide mb-2 text-white">
          Settings
        </h1>
        <p className="text-neutral-400 text-sm">
          Your Herpetoverse account is shared with Tarantuverse — one login,
          one profile across both apps.
        </p>
      </header>

      {loading ? (
        <div className="text-xs uppercase tracking-widest text-neutral-600 py-12 text-center">
          Loading…
        </div>
      ) : loadError ? (
        <div className={`${CARD_CLS} text-center`}>
          <p className="text-sm text-neutral-400 mb-4">
            Couldn&apos;t load your profile.
          </p>
          <button
            onClick={load}
            className="text-sm text-herp-teal hover:text-herp-lime transition-colors underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ---------- Subscription ---------- */}
          <SubscriptionCard />

          {/* ---------- Profile ---------- */}
          <form onSubmit={handleSaveProfile} className={`${CARD_CLS} space-y-5`} noValidate>
            <div>
              <h2 className={SECTION_HDR_CLS}>Profile</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Signed in as{' '}
                <span className="text-neutral-300">{username}</span> ·{' '}
                <span className="text-neutral-300">{email}</span>
              </p>
            </div>

            <div>
              <label className={LABEL_CLS} htmlFor="displayName">
                Display name
              </label>
              <input
                id="displayName"
                className={INPUT_CLS}
                value={form.displayName}
                onChange={(e) => update('displayName', e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </div>

            <div>
              <label className={LABEL_CLS} htmlFor="bio">
                Bio
              </label>
              <textarea
                id="bio"
                className={`${INPUT_CLS} min-h-[96px] resize-y`}
                value={form.bio}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="A little about you and your animals"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL_CLS} htmlFor="location">
                  Location
                </label>
                <input
                  id="location"
                  className={INPUT_CLS}
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                  placeholder="City, country"
                  maxLength={255}
                />
              </div>
              <div>
                <label className={LABEL_CLS} htmlFor="yearsKeeping">
                  Years keeping
                </label>
                <input
                  id="yearsKeeping"
                  className={INPUT_CLS}
                  value={form.yearsKeeping}
                  onChange={(e) =>
                    update(
                      'yearsKeeping',
                      e.target.value.replace(/[^0-9]/g, '').slice(0, 3),
                    )
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL_CLS} htmlFor="experience">
                  Experience level
                </label>
                <select
                  id="experience"
                  className={INPUT_CLS}
                  value={form.experience}
                  onChange={(e) => update('experience', e.target.value)}
                >
                  {EXPERIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS} htmlFor="visibility">
                  Collection visibility
                </label>
                <select
                  id="visibility"
                  className={INPUT_CLS}
                  value={form.visibility}
                  onChange={(e) => update('visibility', e.target.value)}
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <button
                type="submit"
                disabled={savingProfile}
                className="herp-gradient-bg text-herp-dark font-bold px-6 py-2.5 rounded-md tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
              {profileSaved && (
                <span className="text-sm text-herp-lime" role="status">
                  Saved.
                </span>
              )}
              {profileError && (
                <span className="text-sm text-rose-400" role="alert">
                  {profileError}
                </span>
              )}
            </div>
          </form>

          {/* ---------- Support & legal ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Support &amp; legal</h2>
            <div className="mt-4 divide-y divide-neutral-800">
              <SupportLink
                href={`mailto:${SUPPORT_EMAIL}?subject=Herpetoverse%20support`}
                label="Contact support"
              />
              <SupportLink href={PRIVACY_URL} label="Privacy policy" external />
              <SupportLink href={TERMS_URL} label="Terms of service" external />
            </div>
          </div>

          {/* ---------- Data export ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Data export</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Download everything in your account — animals, feeding, shed and
              weight logs, breeding records, and photo metadata. Your data is
              yours to keep.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => handleExport('json')}
                disabled={exporting !== null}
                className="px-4 py-2 rounded-md border border-neutral-700 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {exporting === 'json' ? 'Preparing…' : 'JSON'}
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting !== null}
                className="px-4 py-2 rounded-md border border-neutral-700 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {exporting === 'csv' ? 'Preparing…' : 'CSV (spreadsheets)'}
              </button>
              <button
                onClick={() => handleExport('full')}
                disabled={exporting !== null}
                className="px-4 py-2 rounded-md border border-neutral-700 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {exporting === 'full' ? 'Preparing…' : 'Full backup + photos (ZIP)'}
              </button>
            </div>
            {exportError && (
              <p className="text-sm text-rose-400 mt-3" role="alert">
                {exportError}
              </p>
            )}
          </div>

          {/* ---------- Account ---------- */}
          <div className={CARD_CLS}>
            <h2 className={SECTION_HDR_CLS}>Account</h2>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-200">Sign out</p>
                <p className="text-sm text-neutral-500">
                  End your session on this device.
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 rounded-md border border-neutral-700 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                Sign out
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-rose-300">
                  Delete account
                </p>
                <p className="text-sm text-neutral-500 max-w-md">
                  Permanently removes your account and every animal, log,
                  photo, and breeding record — across Herpetoverse and
                  Tarantuverse. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-4 py-2 rounded-md border border-rose-800 text-sm font-medium text-rose-300 hover:bg-rose-950/50 transition-colors"
              >
                Delete account
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-600 text-center pt-2">
            Herpetoverse · Appalachian Tarantulas, LLC
          </p>
        </div>
      )}

      {/* ---------- Delete confirmation modal ---------- */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={closeDeleteModal}
          role="presentation"
        >
          <div
            className="w-full max-w-md p-6 rounded-lg border border-neutral-800 bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h3
              id="delete-title"
              className="text-lg font-semibold text-white mb-2"
            >
              Delete your account?
            </h3>
            <p className="text-sm text-neutral-400 mb-4">
              This permanently deletes your account and every animal, log,
              photo, and breeding record tied to it — across Herpetoverse and
              Tarantuverse. This cannot be undone.
            </p>
            <label
              className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5"
              htmlFor="deleteConfirm"
            >
              Type {DELETE_CONFIRM_WORD} to confirm
            </label>
            <input
              id="deleteConfirm"
              className={INPUT_CLS}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={deleting}
              placeholder={DELETE_CONFIRM_WORD}
            />
            {deleteError && (
              <p className="text-sm text-rose-400 mt-3" role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 rounded-md border border-neutral-700 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!canDelete}
                className="px-4 py-2 rounded-md bg-rose-600 text-sm font-bold text-white hover:bg-rose-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SupportLink({
  href,
  label,
  external = false,
}: {
  href: string
  label: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      {...(external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
      className="flex items-center justify-between py-3 group"
    >
      <span className="text-sm text-neutral-200 group-hover:text-white transition-colors">
        {label}
      </span>
      <span className="text-neutral-600 group-hover:text-herp-teal transition-colors">
        {external ? '↗' : '→'}
      </span>
    </a>
  )
}

interface AppSubStatus {
  is_premium: boolean
  tier: 'free' | 'premium' | 'all_access'
  plan_display_name: string
  expires_at: string | null
  source: 'apple' | 'google' | 'stripe' | null
  app_scope: 'herpetoverse' | 'both' | null
}

/**
 * App-scoped subscription status card. Reads /subscriptions/app-status?app=
 * herpetoverse, so a Tarantuverse-only sub never reads as HV premium and
 * All-Access shows as covering both apps. No purchase button on web yet — the
 * buy path is the mobile app (IAP); web shows status + where it's managed.
 */
function SubscriptionCard() {
  const [status, setStatus] = useState<AppSubStatus | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    apiFetch<AppSubStatus>('/api/v1/subscriptions/app-status?app=herpetoverse')
      .then((s) => {
        setStatus(s)
        setState('ok')
      })
      .catch(() => setState('error'))
  }, [])

  const sourceLabel = (s: string | null) =>
    s === 'apple'
      ? 'the App Store'
      : s === 'google'
        ? 'Google Play'
        : s === 'stripe'
          ? 'the web'
          : null

  return (
    <div className={CARD_CLS}>
      <h2 className={SECTION_HDR_CLS}>Subscription</h2>

      {state === 'loading' && (
        <p className="text-sm text-neutral-500 mt-2">Loading…</p>
      )}

      {state === 'error' && (
        <p className="text-sm text-neutral-500 mt-2">
          Couldn&apos;t load your subscription status.
        </p>
      )}

      {state === 'ok' && status && status.is_premium && (
        <div className="mt-2 space-y-1">
          <p className="text-sm text-neutral-200">
            <span className="text-herp-lime font-semibold">
              {status.plan_display_name}
            </span>{' '}
            — active
          </p>
          {status.tier === 'all_access' && (
            <p className="text-xs text-neutral-500">
              Covers Herpetoverse and Tarantuverse.
            </p>
          )}
          {status.expires_at && (
            <p className="text-xs text-neutral-500">
              {'Renews or expires '}
              {new Date(status.expires_at).toLocaleDateString()}.
            </p>
          )}
          {sourceLabel(status.source) && (
            <p className="text-xs text-neutral-500">
              Managed through {sourceLabel(status.source)} — change or cancel there.
            </p>
          )}
        </div>
      )}

      {state === 'ok' && status && !status.is_premium && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-neutral-300">Free plan — up to 5 animals.</p>
          <p className="text-xs text-neutral-500">
            Premium unlocks unlimited animals, breeding, feeder tracking, and detailed
            analytics. Upgrade in the Herpetoverse app on your phone.
          </p>
        </div>
      )}
    </div>
  )
}
