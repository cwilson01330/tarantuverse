'use client'

/**
 * Import Collection — 3-step source → confirm → result flow.
 *
 * Ported from the proven Tarantuverse screen
 * (apps/web/src/app/dashboard/tarantulas/import/page.tsx), restyled into
 * the Herpetoverse dark theme (herp-* + neutral-* tokens) and pointed at
 * the shared FastAPI import endpoints with `target=animal` so rows land in
 * the unified `animals` table instead of `inverts`.
 *
 * The mapping table, duplicate handling, preview, and result screens are
 * all data-driven from the /import/analyze response, so they carry over
 * almost verbatim — only the theme classes, taxon labels/defaults, the
 * `target` form field, and the collection routes change.
 *
 * Auth + JSON error normalization go through apiClient's apiFetch, which
 * attaches the bearer token and throws ApiError on non-2xx. FormData bodies
 * pass through untouched (apiFetch only sets Content-Type when `json` is
 * given, so the browser adds the multipart boundary).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/apiClient'
import { ANIMAL_TAXA, type AnimalTaxon, ANIMAL_TAXON_ORDER } from '@/lib/animals'

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

/** Human label for a taxon. Prefers the ANIMAL_TAXA registry label
 *  (HV taxa have no underscores); falls back to a simple capitalize for
 *  any taxon the backend returns that isn't in the registry. */
function taxonLabel(taxon: string): string {
  const meta = ANIMAL_TAXA[taxon as AnimalTaxon]
  if (meta) return meta.label
  return taxon ? taxon[0].toUpperCase() + taxon.slice(1) : taxon
}

function confidenceClasses(confidence: Confidence): string {
  switch (confidence) {
    case 'high':
      return 'bg-herp-teal/15 text-herp-lime'
    case 'medium':
      return 'bg-amber-500/15 text-amber-300'
    default:
      return 'bg-neutral-800 text-neutral-300'
  }
}

function statusClasses(status: RowStatus): string {
  switch (status) {
    case 'new':
      return 'bg-herp-teal/15 text-herp-lime'
    case 'duplicate':
      return 'bg-amber-500/15 text-amber-300'
    case 'error':
      return 'bg-red-500/15 text-red-300'
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportCollectionPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('source')

  // Source step state (retained so we can re-send on commit)
  const [sourceKind, setSourceKind] = useState<SourceKind>('file')
  const [file, setFile] = useState<File | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [defaultTaxon, setDefaultTaxon] = useState('snake')

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

  const newCount = analysis?.summary.new ?? 0

  const sourceReady = useMemo(() => {
    return sourceKind === 'file' ? !!file : sheetUrl.trim().length > 0
  }, [sourceKind, file, sheetUrl])

  // Builds the FormData for the source portion shared by analyze + commit.
  // `target=animal` routes rows into the unified animals table (HV).
  const appendSource = (fd: FormData) => {
    fd.append('target', 'animal')
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
    setDefaultTaxon('snake')
    setAnalysis(null)
    setMapping({})
    setDuplicateMode('skip')
    setResult(null)
    setError('')
  }

  const handleAnalyze = async () => {
    if (!sourceReady) return
    setError('')
    setAnalyzing(true)
    try {
      const fd = new FormData()
      appendSource(fd)
      fd.append('default_taxon', defaultTaxon)

      const analyzed = await apiFetch<AnalyzeResponse>(
        '/api/v1/import/analyze',
        { method: 'POST', body: fd },
      )
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
      setError(
        e instanceof ApiError ? e.message : 'Failed to analyze the file',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCommit = async () => {
    if (!analysis) return
    setError('')
    setCommitting(true)
    try {
      const fd = new FormData()
      appendSource(fd)
      fd.append('mapping', JSON.stringify(mapping))
      fd.append('default_taxon', defaultTaxon)
      fd.append('duplicate_mode', duplicateMode)
      fd.append('unmapped_to_notes', 'true')

      const committed = await apiFetch<CommitResponse>(
        '/api/v1/import/commit',
        { method: 'POST', body: fd },
      )
      setResult(committed)
      setStep('result')
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Failed to import your collection',
      )
    } finally {
      setCommitting(false)
    }
  }

  const setColumnMapping = (header: string, value: string) => {
    setMapping((prev) => ({ ...prev, [header]: value === '' ? null : value }))
  }

  // Taxon options for the "Default type" select before analyze returns the
  // canonical list — HV's registry order (snake, lizard, turtle, …, other).
  const fallbackTaxa = ANIMAL_TAXON_ORDER as readonly string[]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/app/reptiles"
        className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        ← Back to collection
      </Link>

      <h1 className="text-3xl font-bold tracking-wide text-white mt-2 mb-1">
        Import Collection
      </h1>
      <p className="text-neutral-400 mb-6">
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
                    ? 'herp-gradient-bg text-herp-dark'
                    : done
                      ? 'bg-herp-teal/15 text-herp-lime'
                      : 'bg-neutral-900/60 text-neutral-500 border border-neutral-800'
                }`}
              >
                {done ? '✓' : idx + 1}
              </span>
              <span
                className={`text-sm capitalize ${
                  active ? 'text-white font-medium' : 'text-neutral-500'
                }`}
              >
                {s === 'source' ? 'Source' : s === 'confirm' ? 'Confirm' : 'Result'}
              </span>
              {idx < 2 && <span className="text-neutral-600 px-1">›</span>}
            </div>
          )
        })}
      </div>

      {/* Global error */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-sm"
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
            className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-neutral-800 bg-neutral-900/40"
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
                className={`py-2 rounded-md text-sm font-medium transition-colors ${
                  sourceKind === opt.kind
                    ? 'herp-gradient-bg text-herp-dark'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* File upload */}
          {sourceKind === 'file' && (
            <div className="border-2 border-dashed border-neutral-800 rounded-lg p-8 text-center hover:border-herp-teal/50 transition-colors bg-neutral-900/40">
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
                  className="w-12 h-12 text-neutral-600 mb-3"
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
                <span className="text-lg font-medium text-white">
                  {file ? file.name : 'Click to upload file'}
                </span>
                <span className="text-sm text-neutral-500 mt-1">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV, JSON, or Excel (.xlsx)'}
                </span>
              </label>
            </div>
          )}

          {/* Google Sheet link */}
          {sourceKind === 'sheet' && (
            <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
              <label
                htmlFor="sheet-url"
                className="block text-sm font-medium text-white mb-1"
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
                className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/60 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-herp-teal/50"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Share the sheet as &quot;Anyone with the link → Viewer&quot;, or File → Share → Publish to web.
              </p>
            </div>
          )}

          {/* Default taxon */}
          <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40">
            <label
              htmlFor="default-taxon"
              className="block text-sm font-medium text-white mb-1"
            >
              Default type
            </label>
            <select
              id="default-taxon"
              value={defaultTaxon}
              onChange={(e) => setDefaultTaxon(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/60 text-white focus:outline-none focus:ring-2 focus:ring-herp-teal/50"
            >
              {/* Backend supplies the canonical list on analyze; before that,
                  offer the HV registry taxa (snake default). */}
              {(analysis?.taxa && analysis.taxa.length > 0
                ? analysis.taxa
                : fallbackTaxa
              ).map((t) => (
                <option key={t} value={t}>
                  {taxonLabel(t)}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-2">
              Used for rows where the type can&apos;t be inferred from a column or matched species.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !sourceReady}
              className="flex-1 py-3 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? 'Analyzing…' : 'Analyze'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/app/reptiles')}
              className="px-6 py-3 rounded-md border border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
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
          <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40">
            <p className="text-sm text-neutral-300">
              <span className="font-semibold text-white">
                {analysis.summary.new}
              </span>{' '}
              new ·{' '}
              <span className="font-semibold text-white">
                {analysis.summary.duplicate}
              </span>{' '}
              duplicates ·{' '}
              <span className="font-semibold text-white">
                {analysis.summary.error_rows}
              </span>{' '}
              errors ·{' '}
              <span className="font-semibold text-white">
                {analysis.summary.species_matched}
              </span>{' '}
              matched to a species
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {analysis.row_count.toLocaleString()} row
              {analysis.row_count === 1 ? '' : 's'} found.
              {analysis.summary.unmapped_columns.length > 0 && (
                <>
                  {' '}Unmapped columns will be saved to notes:{' '}
                  <span className="text-neutral-300">
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
              className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3"
            >
              Column mapping
            </h2>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <ul className="divide-y divide-neutral-800">
                {analysis.columns.map((col) => (
                  <li
                    key={col.header}
                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">
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
                        <div className="text-xs text-neutral-500 mt-1 truncate">
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
                        className="w-full px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-herp-teal/50"
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
              className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3"
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
                  className={`p-4 rounded-md border text-left transition-colors ${
                    duplicateMode === opt.mode
                      ? 'border-herp-teal/60 bg-herp-teal/10'
                      : 'border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="font-medium text-white">{opt.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Preview */}
          <section aria-labelledby="preview-heading">
            <h2
              id="preview-heading"
              className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3"
            >
              Preview
              {analysis.preview.length < analysis.row_count && (
                <span className="ml-2 font-normal normal-case text-neutral-500">
                  (first {analysis.preview.length} of {analysis.row_count})
                </span>
              )}
            </h2>
            <ul className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden divide-y divide-neutral-800">
              {analysis.preview.map((row) => (
                <li key={row.row} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">
                        {row.display_name || <span className="italic text-neutral-500">(no name)</span>}
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300"
                        title={
                          row.taxon_source === 'column'
                            ? 'From a column'
                            : row.taxon_source === 'species'
                              ? 'From matched species'
                              : 'Default type'
                        }
                      >
                        {taxonLabel(row.taxon)}
                        {row.taxon_source !== 'column' && (
                          <span className="text-neutral-500 ml-1">
                            · {row.taxon_source === 'species' ? 'inferred' : 'default'}
                          </span>
                        )}
                      </span>
                      {row.species_matched && (
                        <span
                          className="text-xs text-herp-lime"
                          title={row.species_name ?? undefined}
                        >
                          ✓ species
                        </span>
                      )}
                    </div>
                    {row.status === 'error' && row.errors.length > 0 && (
                      <div className="text-xs text-red-300 mt-1">
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
              className="px-6 py-3 rounded-md border border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || newCount === 0}
              className="flex-1 py-3 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/40 text-center">
            <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-1">
              Import complete
            </h2>
            <p className="text-neutral-400">
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
                className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40 text-center"
              >
                <div className="text-3xl font-bold text-white">
                  {stat.value.toLocaleString()}
                </div>
                <div className="text-xs text-neutral-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/40">
              <h3 className="text-sm font-semibold text-white mb-2">
                Errors ({result.errors.length})
              </h3>
              <div className="max-h-48 overflow-y-auto">
                <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
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
              onClick={() => router.push('/app/reptiles')}
              className="flex-1 py-3 rounded-md herp-gradient-bg text-herp-dark font-bold tracking-wide transition-opacity hover:opacity-90"
            >
              Done
            </button>
            <button
              type="button"
              onClick={startOver}
              className="px-6 py-3 rounded-md border border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:text-white hover:border-neutral-700 transition-colors"
            >
              Import more
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
