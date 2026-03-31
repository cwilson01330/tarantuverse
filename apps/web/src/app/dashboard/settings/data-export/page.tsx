'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

interface ExportPreview {
  username: string
  counts: {
    tarantulas: number
    feeding_logs: number
    molt_logs: number
    substrate_changes: number
    photos: number
    enclosures: number
    pairings: number
    egg_sacs: number
    offspring: number
  }
  formats_available: string[]
}

export default function DataExportPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }
    fetchPreview()
  }, [authLoading, isAuthenticated, token])

  const fetchPreview = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/export/preview`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setPreview(data)
      }
    } catch {
      // Preview failed — still show page
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: string) => {
    if (!token) return
    setExporting(format)
    setExportSuccess(null)

    try {
      const response = await fetch(`${API_URL}/api/v1/export/${format}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Get filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition')
      const filenameMatch = disposition?.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] || `tarantuverse_export.${format === 'json' ? 'json' : 'zip'}`

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setExportSuccess(format)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const totalRecords = preview
    ? Object.values(preview.counts).reduce((a, b) => a + b, 0)
    : 0

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="text-theme-secondary hover:text-theme-primary transition-colors mb-4"
          >
            ← Back to Settings
          </button>
          <h1 className="text-3xl font-bold text-theme-primary">Data Export</h1>
          <p className="text-theme-secondary mt-2">
            Download your data in the format that works best for you. All exports are free and available instantly.
          </p>
        </div>

        {/* Data Summary */}
        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
            <div className="animate-pulse space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            </div>
          </div>
        ) : preview ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
            <h2 className="text-lg font-semibold text-theme-primary mb-4">Your Data Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Tarantulas', count: preview.counts.tarantulas, icon: '🕷️' },
                { label: 'Feeding Logs', count: preview.counts.feeding_logs, icon: '🦗' },
                { label: 'Molt Logs', count: preview.counts.molt_logs, icon: '📋' },
                { label: 'Substrate Changes', count: preview.counts.substrate_changes, icon: '🌿' },
                { label: 'Photos', count: preview.counts.photos, icon: '📸' },
                { label: 'Enclosures', count: preview.counts.enclosures, icon: '🏠' },
                { label: 'Pairings', count: preview.counts.pairings, icon: '🧬' },
                { label: 'Egg Sacs', count: preview.counts.egg_sacs, icon: '🥚' },
                { label: 'Offspring', count: preview.counts.offspring, icon: '🕸️' },
              ].map(({ label, count, icon }) => (
                <div key={label} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <p className="text-xl font-bold text-theme-primary">{count}</p>
                    <p className="text-xs text-theme-tertiary">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-theme-tertiary mt-4">
              Total: {totalRecords.toLocaleString()} records across all categories
            </p>
          </div>
        ) : null}

        {/* Export Options */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-theme-primary">Choose Export Format</h2>

          {/* JSON Export */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">📄</span>
                  <h3 className="text-lg font-semibold text-theme-primary">JSON Export</h3>
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full font-medium">
                    Best for re-import
                  </span>
                </div>
                <p className="text-sm text-theme-secondary">
                  A single structured file with all your data, preserving relationships between tarantulas, logs, and breeding records. Ideal for backing up and restoring your collection.
                </p>
              </div>
              <button
                onClick={() => handleExport('json')}
                disabled={exporting !== null}
                className="shrink-0 px-5 py-2.5 bg-gradient-brand text-white rounded-xl hover:brightness-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === 'json' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Exporting...
                  </span>
                ) : exportSuccess === 'json' ? '✓ Downloaded' : 'Download .json'}
              </button>
            </div>
          </div>

          {/* CSV Export */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">📊</span>
                  <h3 className="text-lg font-semibold text-theme-primary">CSV Spreadsheets</h3>
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-medium">
                    Best for Excel / Sheets
                  </span>
                </div>
                <p className="text-sm text-theme-secondary">
                  A ZIP file with one CSV per data type — tarantulas, feeding logs, molt logs, and more. Opens directly in Excel, Google Sheets, or Numbers.
                </p>
              </div>
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting !== null}
                className="shrink-0 px-5 py-2.5 bg-gradient-brand text-white rounded-xl hover:brightness-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === 'csv' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Exporting...
                  </span>
                ) : exportSuccess === 'csv' ? '✓ Downloaded' : 'Download .zip'}
              </button>
            </div>
          </div>

          {/* Full Backup */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">💾</span>
                  <h3 className="text-lg font-semibold text-theme-primary">Complete Backup</h3>
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs rounded-full font-medium">
                    Includes photos
                  </span>
                </div>
                <p className="text-sm text-theme-secondary">
                  Everything in one archive — data organized by tarantula with downloaded photos, plus CSV files for spreadsheets. May take longer for large collections.
                </p>
                {preview && preview.counts.photos > 0 && (
                  <p className="text-xs text-theme-tertiary mt-1">
                    Includes {preview.counts.photos} photo{preview.counts.photos !== 1 ? 's' : ''} — download time depends on your collection size.
                  </p>
                )}
              </div>
              <button
                onClick={() => handleExport('full')}
                disabled={exporting !== null}
                className="shrink-0 px-5 py-2.5 bg-gradient-brand text-white rounded-xl hover:brightness-90 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === 'full' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Preparing...
                  </span>
                ) : exportSuccess === 'full' ? '✓ Downloaded' : 'Download backup'}
              </button>
            </div>
          </div>
        </div>

        {/* Info section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
          <h3 className="font-semibold text-theme-primary mb-2">About Your Data</h3>
          <div className="space-y-2 text-sm text-theme-secondary">
            <p>
              Your data is always yours. Exports are free for all users and include everything you've added to Tarantuverse — collection info, all logs, photos, enclosures, and breeding records.
            </p>
            <p>
              JSON exports can be re-imported into Tarantuverse or used with other tools. CSV files work with any spreadsheet application. The complete backup includes your actual photo files.
            </p>
            <p>
              Exports do not include derived data like feeding predictions or premolt probability scores, as these are calculated on-the-fly from your logs.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
