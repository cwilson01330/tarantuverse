'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

export default function ProfileSettingsPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()
  const [formData, setFormData] = useState({
    display_name: '',
    avatar_url: '',
    profile_bio: '',
    profile_location: '',
    profile_experience_level: '',
    profile_years_keeping: '',
    profile_specialties: [] as string[],
    social_links: {
      instagram: '',
      youtube: '',
      website: '',
    },
    collection_visibility: 'private',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const specialtyOptions = [
    'terrestrial',
    'arboreal',
    'fossorial',
    'new_world',
    'old_world',
    'breeding',
    'slings',
    'large_species',
  ]

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchProfile(token)
  }, [authLoading, isAuthenticated, token])

  const fetchProfile = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch profile')
      }

      const data = await response.json()
      setFormData({
        display_name: data.display_name || '',
        avatar_url: data.avatar_url || '',
        profile_bio: data.profile_bio || '',
        profile_location: data.profile_location || '',
        profile_experience_level: data.profile_experience_level || '',
        profile_years_keeping: data.profile_years_keeping ? String(data.profile_years_keeping) : '',
        profile_specialties: data.profile_specialties || [],
        social_links: {
          instagram: data.social_links?.instagram || '',
          youtube: data.social_links?.youtube || '',
          website: data.social_links?.website || '',
        },
        collection_visibility: data.collection_visibility || 'private',
      })
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSpecialtyToggle = (specialty: string) => {
    if (formData.profile_specialties.includes(specialty)) {
      setFormData({
        ...formData,
        profile_specialties: formData.profile_specialties.filter(s => s !== specialty),
      })
    } else {
      setFormData({
        ...formData,
        profile_specialties: [...formData.profile_specialties, specialty],
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSubmitting(true)

    try {
      if (!token) {
        setError('No authentication token found. Please log in again.')
        router.push('/login')
        return
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      // Build social links object only if at least one link is provided
      const socialLinksData = {
        instagram: formData.social_links.instagram || undefined,
        youtube: formData.social_links.youtube || undefined,
        website: formData.social_links.website || undefined,
      }
      const hasSocialLinks = Object.values(socialLinksData).some(v => v !== undefined)

      const submitData: any = {
        collection_visibility: formData.collection_visibility,
      }

      // Only include fields that have values
      if (formData.display_name) submitData.display_name = formData.display_name
      if (formData.avatar_url) submitData.avatar_url = formData.avatar_url
      if (formData.profile_bio) submitData.profile_bio = formData.profile_bio
      if (formData.profile_location) submitData.profile_location = formData.profile_location
      if (formData.profile_experience_level) submitData.profile_experience_level = formData.profile_experience_level
      if (formData.profile_years_keeping) {
        const years = parseInt(formData.profile_years_keeping)
        if (!isNaN(years)) submitData.profile_years_keeping = years
      }
      if (formData.profile_specialties.length > 0) submitData.profile_specialties = formData.profile_specialties
      if (hasSocialLinks) submitData.social_links = socialLinksData

      const response = await fetch(`${API_URL}/api/v1/auth/me/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to update profile')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">👤 Profile Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">Manage your public profile and privacy settings</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            Profile updated successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="bg-surface border border-theme rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-theme-primary">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="How you want to be known"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Avatar URL</label>
                <input
                  type="url"
                  value={formData.avatar_url}
                  onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  value={formData.profile_bio}
                  onChange={(e) => setFormData({ ...formData, profile_bio: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="Tell us about yourself and your tarantula keeping journey..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input
                  type="text"
                  value={formData.profile_location}
                  onChange={(e) => setFormData({ ...formData, profile_location: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="City, Country"
                />
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="bg-surface border border-theme rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-theme-primary">Experience</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Experience Level</label>
                <select
                  value={formData.profile_experience_level}
                  onChange={(e) => setFormData({ ...formData, profile_experience_level: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                >
                  <option value="">Select...</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Years Keeping</label>
                <input
                  type="number"
                  min="0"
                  value={formData.profile_years_keeping}
                  onChange={(e) => setFormData({ ...formData, profile_years_keeping: e.target.value })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Specialties</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {specialtyOptions.map((specialty) => (
                  <label key={specialty} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.profile_specialties.includes(specialty)}
                      onChange={() => handleSpecialtyToggle(specialty)}
                      className="w-4 h-4 text-primary-600 border-theme rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-theme-secondary capitalize">{specialty.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="bg-surface border border-theme rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-theme-primary">Social Links</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Instagram</label>
                <input
                  type="url"
                  value={formData.social_links.instagram}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: { ...formData.social_links, instagram: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="https://instagram.com/username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">YouTube</label>
                <input
                  type="url"
                  value={formData.social_links.youtube}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: { ...formData.social_links, youtube: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="https://youtube.com/@channel"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Website</label>
                <input
                  type="url"
                  value={formData.social_links.website}
                  onChange={(e) => setFormData({
                    ...formData,
                    social_links: { ...formData.social_links, website: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-theme-primary bg-surface-elevated"
                  placeholder="https://yourwebsite.com"
                />
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="bg-surface border border-theme rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-theme-primary">Privacy Settings</h2>

            <div className="bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <strong>Collection Visibility:</strong> When your collection is public, other keepers can view your profile and your tarantulas.
                Your email, prices paid, and private notes will never be shared.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 p-4 border-2 border-theme rounded-lg cursor-pointer hover:bg-surface-elevated transition">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={formData.collection_visibility === 'private'}
                  onChange={(e) => setFormData({ ...formData, collection_visibility: e.target.value })}
                  className="w-5 h-5 text-primary-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-theme-primary">🔒 Private</div>
                  <div className="text-sm text-theme-secondary">Only you can see your collection</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 border-2 border-theme rounded-lg cursor-pointer hover:bg-surface-elevated transition">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={formData.collection_visibility === 'public'}
                  onChange={(e) => setFormData({ ...formData, collection_visibility: e.target.value })}
                  className="w-5 h-5 text-primary-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-theme-primary">🌍 Public</div>
                  <div className="text-sm text-theme-secondary">Share your collection with the community</div>
                </div>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {submitting ? 'Saving...' : 'Save Profile'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 border border-theme rounded-lg hover:bg-surface-elevated transition font-semibold text-theme-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
