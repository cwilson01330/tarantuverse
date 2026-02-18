'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Announcement {
  id: string
  title: string
  message: string
  banner_type: string
  link_url?: string | null
  link_text?: string | null
  coupon_code?: string | null
  is_active: boolean
  priority: number
  starts_at?: string | null
  expires_at?: string | null
  created_at: string
}

const typeOptions = [
  { value: 'info', label: 'Info', icon: 'ℹ️' },
  { value: 'sale', label: 'Sale', icon: '🏷️' },
  { value: 'update', label: 'Update', icon: '📢' },
  { value: 'coupon', label: 'Coupon', icon: '🎟️' },
]

const emptyForm = {
  title: '',
  message: '',
  banner_type: 'info',
  link_url: '',
  link_text: '',
  coupon_code: '',
  priority: 0,
  starts_at: '',
  expires_at: '',
}

export default function AdminAnnouncements() {
  const router = useRouter()
  const { user, token, isLoading, isAuthenticated } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated || !user) { router.push('/login'); return }
    if (!user.is_admin && !user.is_superuser) { router.push('/dashboard'); return }
  }, [isLoading, isAuthenticated, user, router])

  useEffect(() => {
    if (token && user && (user.is_admin || user.is_superuser)) {
      fetchAnnouncements()
    } else if (!isLoading) {
      setLoading(false)
    }
  }, [token, user, isLoading])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_URL}/api/v1/announcements/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setAnnouncements(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch announcements:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const body: Record<string, unknown> = {
        title: form.title,
        message: form.message,
        banner_type: form.banner_type,
        priority: form.priority,
        link_url: form.link_url || null,
        link_text: form.link_text || null,
        coupon_code: form.coupon_code || null,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
      }

      const url = editingId
        ? `${API_URL}/api/v1/announcements/${editingId}`
        : `${API_URL}/api/v1/announcements/`

      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to save')
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      fetchAnnouncements()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (a: Announcement) => {
    setForm({
      title: a.title,
      message: a.message,
      banner_type: a.banner_type,
      link_url: a.link_url || '',
      link_text: a.link_text || '',
      coupon_code: a.coupon_code || '',
      priority: a.priority,
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : '',
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    })
    setEditingId(a.id)
    setShowForm(true)
    setError('')
  }

  const handleToggleActive = async (a: Announcement) => {
    await fetch(`${API_URL}/api/v1/announcements/${a.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    fetchAnnouncements()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return
    await fetch(`${API_URL}/api/v1/announcements/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchAnnouncements()
  }

  if (isLoading || !user) return null

  const typeIcon = (type: string) => typeOptions.find(t => t.value === type)?.icon || 'ℹ️'

  return (
    <DashboardLayout
      userName={user.name || user.username}
      userEmail={user.email || undefined}
      userAvatar={user.image || undefined}
    >
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-theme-primary">Announcements</h1>
            <p className="text-sm text-theme-secondary mt-1">
              Create banners for sales, coupons, updates, and more. Active announcements show on all user dashboards.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); setError('') }}
            className="px-4 py-2 bg-gradient-brand text-white rounded-xl font-semibold text-sm hover:brightness-90 transition"
          >
            + New Announcement
          </button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="bg-surface border border-theme rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-bold text-theme-primary mb-4">
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </h2>

            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    required
                    maxLength={200}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="Big Sale at XYZ Reptiles!"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Type</label>
                  <select
                    value={form.banner_type}
                    onChange={e => setForm(f => ({ ...f, banner_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  >
                    {typeOptions.map(t => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">Message *</label>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  required
                  maxLength={500}
                  rows={2}
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  placeholder="20% off all feeders this weekend only!"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={form.coupon_code}
                    onChange={e => setForm(f => ({ ...f, coupon_code: e.target.value }))}
                    maxLength={50}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary font-mono"
                    placeholder="SAVE20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Link URL</label>
                  <input
                    type="url"
                    value={form.link_url}
                    onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="https://example.com/sale"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Link Text</label>
                  <input
                    type="text"
                    value={form.link_text}
                    onChange={e => setForm(f => ({ ...f, link_text: e.target.value }))}
                    maxLength={100}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                    placeholder="Shop Now"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Priority</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  />
                  <p className="text-xs text-theme-tertiary mt-1">Higher = shown first</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Starts At</label>
                  <input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Expires At</label>
                  <input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-gradient-brand text-white rounded-xl font-semibold text-sm hover:brightness-90 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm) }}
                  className="px-6 py-2 bg-surface-elevated border border-theme text-theme-secondary rounded-xl font-semibold text-sm hover:bg-surface transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Announcements List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
            <p className="text-theme-secondary text-sm">Loading announcements...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-theme">
            <div className="text-4xl mb-3">📢</div>
            <p className="text-theme-secondary font-medium">No announcements yet</p>
            <p className="text-sm text-theme-tertiary mt-1">Create one to display a banner on all user dashboards.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => (
              <div
                key={a.id}
                className={`bg-surface border border-theme rounded-xl p-4 flex items-start gap-4 ${
                  !a.is_active ? 'opacity-50' : ''
                }`}
              >
                <span className="text-2xl">{typeIcon(a.banner_type)}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-theme-primary">{a.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-theme-tertiary">
                      {a.banner_type}
                    </span>
                    {a.priority > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        Priority: {a.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-theme-secondary mt-1">{a.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-theme-tertiary">
                    {a.coupon_code && <span className="font-mono font-bold">Code: {a.coupon_code}</span>}
                    {a.link_url && <span>Link: {a.link_text || a.link_url}</span>}
                    {a.expires_at && <span>Expires: {new Date(a.expires_at).toLocaleDateString()}</span>}
                    <span>Created: {new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(a)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      a.is_active
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                    }`}
                  >
                    {a.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleEdit(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
