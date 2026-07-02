'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

// ── API shapes ──────────────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low' | 'none'
type RowStatus = 'new' | 'duplicate' | 'error'
type TaxonSource = 'column' | 'species' | 'default'
type DuplicateMode = 'skip' | 'update'

interface AnalyzeColumn {
  header: string
  suggested_field: string | null
  confidence: Confidence
  sample_values: string[]
}

interface AnalyzeField {
  field: string
  label: string
  type: string
}

interface PreviewRow {
  row: number
  display_name: string
  taxon: string
  taxon_source: TaxonSource
  species_matched: boolean
  species_name: string | null
  status: RowStatus
  errors: string[]
}

interface AnalyzeSummary {
  new: number
  duplicate: number
  error_rows: number
  species_matched: number
  unmapped_columns: string[]
}

interface AnalyzeResponse {
  row_count: number
  columns: AnalyzeColumn[]
  fields: AnalyzeField[]
  taxa: string[]
  default_taxon: string
  preview: PreviewRow[]
  summary: AnalyzeSummary
}

interface CommitResponse {
  imported: number
  updated: number
  skipped_duplicates: number
  error_rows: number
  errors: string[]
  cap_reached: boolean
}

type Step = 'source' | 'confirm' | 'result'
type SourceKind = 'file' | 'sheet'

// ── Helpers ──────────────────────────────────────────────────────────────────

function titleCaseTaxon(taxon: string): string {
  return taxon
    .split('_')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ')
}

function confidenceClasses(confidence: Confidence): string {
  switch (confidence) {
    case 'high':
      return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
    case 'medium':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
  }
}

function statusClasses(status: RowStatus): string {
  switch (status) {
    case 'new':
      return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
    case 'duplicate':
      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
    case 'error':
      return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
  }
}

function extractDetail(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object') {
      const msg = (detail as { message?: unknown }).message
      if (typeof msg === 'string') return msg
      return JSON.stringify(detail)
    }
  }
  return fallback
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportCollectionPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()

  const [step, setStep] = useState<Step>('source')

  // Source step state (retained so we can re-send on commit)
  const [sourceKind, setSourceKind] = useState<SourceKind>('file')
  const [file, setFile] = useState<File | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [defaultTaxon, setDefaultTaxon] = useState('tarantula')

  // Analyze results / confirm step state
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')

  // Result step state
  const [result, setResult] = useState<CommitResponse | null>(null)

  // Loading / error
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [router, isAuthenticated, isLoading])

  const newCount = analysis?.summary.new ?? 0

  const sourceReady = useMemo(() => {
    return sourceKind === 'file' ? !!file : sheetUrl.trim().length > 0
  }, [sourceKind, file, sheetUrl])

  // Builds the FormData for the source portion shared by analyze + commit.
  const appendSource = (fd: FormData) => {
    if (sourceKind === 'file' && file) {
      fd.append('file', file)
    } else if (sourceKind === 'sheet' && sheetUrl.trim()) {
      fd.append('sheet_url', sheetUrl.trim())
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError('')
    }
  }

  const resetToSource = () => {
    setStep('source')
    setError('')
  }

  const startOver = () => {
    setStep('source')
    setSourceKind('file')
    setFile(null)
    setSheetUrl('')
    setDefaultTaxon('tarantula')
    setAnalysis(null)
    setMapping({})
    setDuplicateMode('skip')
    setResult(null)
    setError('')
  }

  const handleAnalyze = async () => {
    if (!token || !sourceReady) return
    setError('')
    setAnalyzing(true)
    try {
      const fd = new FormData()
      appendSource(fd)
      fd.append('default_taxon', defaultTaxon)

      const res = await fetch(`${API_URL}/api/v1/import/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(extractDetail(data, 'Failed to analyze the file'))
      }

      const analyzed = data as AnalyzeResponse
      setAnalysis(analyzed)

      // Seed the mapping from the backend's suggestions.
      const seed: Record<string, string | null> = {}
      analyzed.columns.forEach((col) => {
        seed[col.header] = col.suggested_field
      })
      setMapping(seed)
      setDefaultTaxon(analyzed.default_taxon || defaultTaxon)
      setStep('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCommit = async () => {
    if (!token || !analysis) return
    setError('')
    setCommitting(true)
    try {
      const fd = new FormData()
      appendSource(fd)
      fd.append('mapping', JSON.stringify(mapping))
      fd.append('default_taxon', defaultTaxon)
      fd.append('duplicate_mode', duplicateMode)
      fd.append('unmapped_to_notes', 'true')

      const res = await fetch(`${API_URL}/api/v1/import/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(extractDetail(data, 'Failed to import your collection'))
      }

      setResult(data as CommitResponse)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setCommitting(false)
    }
  }

  const setColumnMapping = (header: string, value: string) => {
    setMapping((prev) => ({ ...prev, [header]: value === '' ? null : value }))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link
          href="/dashboard/tarantulas"
          className="text-sm text-theme-secondary hover:text-theme-primary transition"
        >
          ← Back to Collection
        </Link>

        <h1 className="text-3xl font-bold text-theme-primary mt-2 mb-1">
          Import Collection
        </h1>
        <p className="text-theme-secondary mb-6">
          Upload a spreadsheet or link a Google Sheet — we&apos;ll auto-map your
          columns, then you confirm before anything is saved.
        </p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8" aria-hidden="true">
          {(['source', 'confirm', 'result'] as Step[]).map((s, idx) => {
            const active = step === s
            const done =
              (step === 'confirm' && s === 'source') ||
              (step === 'result' && (s === 'source' || s === 'confirm'))
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                    active
                      ? 'bg-gradient-brand text-white shadow-gradient-brand'
                      : done
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                        : 'bg-surface-elevated text-theme-tertiary border border-theme'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </span>
                <span
                  className={`text-sm capitalize ${
                    active ? 'text-theme-primary font-medium' : 'text-theme-tertiary'
                  }`}
                >
                  {s === 'source' ? 'Source' : s === 'confirm' ? 'Confirm' : 'Result'}
                </span>
                {idx < 2 && <span className="text-theme-tertiary px-1">›</span>}
              </div>
            )
          })}
        </div>

        {/* Global error */}
        {error && (
          <div
            role="alert"
            className="mb-6 p-3 rounded-xl border border-red-300 dark:border-red-600/60 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm"
          >
            {error}
          </div>
        )}

        {/* ── STEP 1: SOURCE ────────────────────────────────────────────── */}
        {step === 'source' && (
          <div className="space-y-6">
            {/* Source kind toggle */}
            <div
              role="group"
              aria-label="Import source"
              className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-theme bg-surface-elevated"
            >
              {(
                [
                  { kind: 'file' as SourceKind, label: 'Upload a file' },
                  { kind: 'sheet' as SourceKind, label: 'Link a Google Sheet' },
                ]
              ).map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => {
                    setSourceKind(opt.kind)
                    setError('')
                  }}
                  aria-pressed={sourceKind === opt.kind}
                  className={`py-2 rounded-lg text-sm font-medium transition ${
                    sourceKind === opt.kind
                      ? 'bg-gradient-brand text-white shadow-gradient-brand'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* File upload */}
            {sourceKind === 'file' && (
              <div className="border-2 border-dashed border-theme rounded-2xl p-8 text-center hover:border-primary-500 transition-colors bg-surface">
                <input
                  type="file"
                  id="file-upload"
                  accept=".csv,.json,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <svg
                    className="w-12 h-12 text-theme-tertiary mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-lg font-medium text-theme-primary">
                    {file ? file.name : 'Click to upload file'}
                  </span>
                  <span className="text-sm text-theme-tertiary mt-1">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV, JSON, or Excel (.xlsx)'}
                  </span>
                </label>
              </div>
            )}

            {/* Google Sheet link */}
            {sourceKind === 'sheet' && (
              <div className="p-6 rounded-2xl border border-theme bg-surface">
                <label
                  htmlFor="sheet-url"
                  className="block text-sm font-medium text-theme-primary mb-1"
                >
                  Google Sheet link
                </label>
                <input
                  id="sheet-url"
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => {
                    setSheetUrl(e.target.value)
                    setError('')
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
                />
                <p className="text-xs text-theme-tertiary mt-2">
                  Share the sheet as &quot;Anyone with the link → Viewer&quot;, or File → Share → Publish to web.
                </p>
              </div>
            )}

            {/* Default taxon */}
            <div className="p-6 rounded-2xl border border-theme bg-surface">
              <label
                htmlFor="default-taxon"
                className="block text-sm font-medium text-theme-primary mb-1"
              >
                Default type
              </label>
              <select
                id="default-taxon"
                value={defaultTaxon}
                onChange={(e) => setDefaultTaxon(e.target.value)}
                className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary"
              >
                {/* Backend supplies the canonical list on analyze; before that,
                    offer tarantula as a sensible default. */}
                {(analysis?.taxa && analysis.taxa.length > 0
                  ? analysis.taxa
                  : ['tarantula']
                ).map((t) => (
                  <option key={t} value={t}>
                    {titleCaseTaxon(t)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-theme-tertiary mt-2">
                Used for rows where the type can&apos;t be inferred from a column or matched species.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || !sourceReady}
                className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? 'Analyzing…' : 'Analyze'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/tarantulas')}
                className="px-6 py-3 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: CONFIRM ───────────────────────────────────────────── */}
        {step === 'confirm' && analysis && (
          <div className="space-y-6">
            {/* Summary line */}
            <div className="p-4 rounded-2xl border border-theme bg-surface">
              <p className="text-sm text-theme-secondary">
                <span className="font-semibold text-theme-primary">
                  {analysis.summary.new}
                </span>{' '}
                new ·{' '}
                <span className="font-semibold text-theme-primary">
                  {analysis.summary.duplicate}
                </span>{' '}
                duplicates ·{' '}
                <span className="font-semibold text-theme-primary">
                  {analysis.summary.error_rows}
                </span>{' '}
                errors ·{' '}
                <span className="font-semibold text-theme-primary">
                  {analysis.summary.species_matched}
                </span>{' '}
                matched to a species
              </p>
              <p className="text-xs text-theme-tertiary mt-1">
                {analysis.row_count.toLocaleString()} row
                {analysis.row_count === 1 ? '' : 's'} found.
                {analysis.summary.unmapped_columns.length > 0 && (
                  <>
                    {' '}Unmapped columns will be saved to notes:{' '}
                    <span className="text-theme-secondary">
                      {analysis.summary.unmapped_columns.join(', ')}
                    </span>
                    .
                  </>
                )}
              </p>
            </div>

            {/* Mapping table */}
            <section aria-labelledby="mapping-heading">
              <h2
                id="mapping-heading"
                className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
              >
                Column mapping
              </h2>
              <div className="rounded-2xl border border-theme bg-surface overflow-hidden">
                <ul className="divide-y divide-theme">
                  {analysis.columns.map((col) => (
                    <li
                      key={col.header}
                      className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-theme-primary truncate">
                            {col.header}
                          </span>
                          <span
                            className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${confidenceClasses(
                              col.confidence,
                            )}`}
                          >
                            {col.confidence}
                          </span>
                        </div>
                        {col.sample_values.length > 0 && (
                          <div className="text-xs text-theme-tertiary mt-1 truncate">
                            {col.sample_values.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="sm:w-56 flex-shrink-0">
                        <label className="sr-only" htmlFor={`map-${col.header}`}>
                          Map column {col.header}
                        </label>
                        <select
                          id={`map-${col.header}`}
                          value={mapping[col.header] ?? ''}
                          onChange={(e) => setColumnMapping(col.header, e.target.value)}
                          className="w-full px-3 py-2 border border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-theme-primary text-sm"
                        >
                          <option value="">Ignore</option>
                          {analysis.fields.map((f) => (
                            <option key={f.field} value={f.field}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Duplicate handling */}
            <section aria-labelledby="dupe-heading">
              <h2
                id="dupe-heading"
                className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
              >
                Duplicate handling
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    {
                      mode: 'skip' as DuplicateMode,
                      title: 'Skip duplicates',
                      desc: 'Leave existing animals untouched.',
                    },
                    {
                      mode: 'update' as DuplicateMode,
                      title: 'Update existing',
                      desc: 'Overwrite matched animals with imported values.',
                    },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setDuplicateMode(opt.mode)}
                    aria-pressed={duplicateMode === opt.mode}
                    className={`p-4 rounded-xl border text-left transition ${
                      duplicateMode === opt.mode
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-theme bg-surface hover:bg-surface-elevated'
                    }`}
                  >
                    <div className="font-medium text-theme-primary">{opt.title}</div>
                    <div className="text-xs text-theme-tertiary mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Preview */}
            <section aria-labelledby="preview-heading">
              <h2
                id="preview-heading"
                className="text-sm font-semibold text-theme-tertiary uppercase tracking-wide mb-3"
              >
                Preview
                {analysis.preview.length < analysis.row_count && (
                  <span className="ml-2 font-normal normal-case text-theme-tertiary">
                    (first {analysis.preview.length} of {analysis.row_count})
                  </span>
                )}
              </h2>
              <ul className="rounded-2xl border border-theme bg-surface overflow-hidden divide-y divide-theme">
                {analysis.preview.map((row) => (
                  <li key={row.row} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-theme-primary truncate">
                          {row.display_name || <span className="italic text-theme-tertiary">(no name)</span>}
                        </span>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-elevated border border-theme text-theme-secondary"
                          title={
                            row.taxon_source === 'column'
                              ? 'From a column'
                              : row.taxon_source === 'species'
                                ? 'From matched species'
                                : 'Default type'
                          }
                        >
                          {titleCaseTaxon(row.taxon)}
                          {row.taxon_source !== 'column' && (
                            <span className="text-theme-tertiary ml-1">
                              · {row.taxon_source === 'species' ? 'inferred' : 'default'}
                            </span>
                          )}
                        </span>
                        {row.species_matched && (
                          <span
                            className="text-xs text-green-700 dark:text-green-400"
                            title={row.species_name ?? undefined}
                          >
                            ✓ species
                          </span>
                        )}
                      </div>
                      {row.status === 'error' && row.errors.length > 0 && (
                        <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                          {row.errors.join('; ')}
                        </div>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusClasses(
                        row.status,
                      )}`}
                    >
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetToSource}
                disabled={committing}
                className="px-6 py-3 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing || newCount === 0}
                className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {committing
                  ? 'Importing…'
                  : newCount === 0 && duplicateMode === 'skip'
                    ? 'Nothing new to import'
                    : `Import ${newCount} animal${newCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: RESULT ────────────────────────────────────────────── */}
        {step === 'result' && result && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl border border-theme bg-surface text-center">
              <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
              <h2 className="text-2xl font-bold text-theme-primary mb-1">
                Import complete
              </h2>
              <p className="text-theme-secondary">
                Here&apos;s how it went.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Imported', value: result.imported },
                { label: 'Updated', value: result.updated },
                { label: 'Skipped', value: result.skipped_duplicates },
                { label: 'Errors', value: result.error_rows },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 rounded-2xl border border-theme bg-surface text-center"
                >
                  <div className="text-3xl font-bold text-theme-primary">
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-theme-tertiary mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {result.cap_reached && (
              <div
                role="status"
                className="p-4 rounded-xl border border-amber-300 dark:border-amber-600/60 bg-amber-50 dark:bg-amber-900/20 flex items-start gap-3"
              >
                <span aria-hidden="true" className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="font-semibold text-amber-900 dark:text-amber-100">
                    Free-tier limit reached
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200/80">
                    Some rows weren&apos;t imported because you hit the free-tier
                    animal cap.{' '}
                    <Link href="/pricing" className="font-medium underline">
                      Upgrade
                    </Link>{' '}
                    to import the rest.
                  </p>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="p-4 rounded-xl border border-theme bg-surface">
                <h3 className="text-sm font-semibold text-theme-primary mb-2">
                  Errors ({result.errors.length})
                </h3>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="list-disc list-inside text-sm text-theme-secondary space-y-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/tarantulas')}
                className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-medium shadow-gradient-brand hover:opacity-90 transition"
              >
                Done
              </button>
              <button
                type="button"
                onClick={startOver}
                className="px-6 py-3 rounded-xl border border-theme bg-surface text-theme-primary hover:bg-surface-elevated transition"
              >
                Import more
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
