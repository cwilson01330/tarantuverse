"use client"

import { type FormEvent, useCallback, useEffect, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type LifeStage = "sling" | "juvenile" | "adult"

interface PricingCardProps {
  tarantulaId: string
  speciesId: string
  lifeStage?: LifeStage
  token: string | null
}

/**
 * Mirrors PricingEstimator.MIN_CONTRIBUTORS / MIN_NUMERIC_CONTRIBUTORS.
 *
 * Duplicated rather than fetched because they only ever appear in copy, and a
 * stale number here is a wrong sentence rather than a wrong calculation. They
 * were previously inlined as a literal "5" in the empty state, which silently
 * became wrong the moment the numeric threshold moved to 12. If these drift
 * again, the copy misleads — so keep them next to the type they describe.
 */
const MIN_THRESHOLD = 5
const NUMERIC_THRESHOLD = 12

interface PriceEstimate {
  estimated_low: number | null
  estimated_high: number | null
  // emerging_evidence = 5–11 contributors: real evidence exists, but not
  // enough to publish a band. low/high are null in this state (ADR-014).
  evidence_status: "insufficient_evidence" | "emerging_evidence" | "observed_range"
  evidence_quality: "insufficient" | "limited" | "moderate"
  data_points: number
  contributor_count: number
  vendor_count: number
  verified_points: number
  observation_start: string | null
  observation_end: string | null
  limitations: string[]
}

export default function PricingCard({
  tarantulaId,
  speciesId,
  lifeStage,
  token,
}: PricingCardProps) {
  const [signal, setSignal] = useState<PriceEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showContribution, setShowContribution] = useState(false)
  const [price, setPrice] = useState("")
  const [purchaseDate, setPurchaseDate] = useState("")
  const [vendorName, setVendorName] = useState("")
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null)

  const loadSignal = useCallback(
    async (showSpinner = true) => {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        if (showSpinner) setLoading(true)
        setError(null)
        const response = await fetch(
          `${API_URL}/api/v1/pricing/market-signals/tarantulas/${tarantulaId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok) throw new Error("Market evidence could not be loaded.")
        setSignal(await response.json())
      } catch (fetchError) {
        console.error("Error fetching market signals:", fetchError)
        setError("Market evidence could not be loaded.")
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [tarantulaId, token],
  )

  useEffect(() => {
    loadSignal()
  }, [loadSignal])

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token || !lifeStage || !consent) return

    try {
      setSubmitting(true)
      setSubmissionError(null)
      setSubmissionNotice(null)
      const response = await fetch(`${API_URL}/api/v1/pricing/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          species_id: speciesId,
          tarantula_id: tarantulaId,
          size_category: lifeStage,
          price_paid: Number(price),
          currency: "USD",
          purchase_date: purchaseDate,
          vendor_name: vendorName.trim() || null,
          is_public: true,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "The purchase report could not be saved.",
        )
      }

      setPrice("")
      setPurchaseDate("")
      setVendorName("")
      setConsent(false)
      setShowContribution(false)
      setSubmissionNotice(
        "Report saved. It will affect a range only when enough independent evidence exists.",
      )
      await loadSignal(false)
    } catch (submitError) {
      setSubmissionError(
        submitError instanceof Error
          ? submitError.message
          : "The purchase report could not be saved.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  const hasRange =
    signal?.evidence_status === "observed_range" &&
    signal.estimated_low !== null &&
    signal.estimated_high !== null
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-gray-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Market signals
            </h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              Experimental
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Community-reported prices paid, not an appraisal.
          </p>
        </div>
        {hasRange && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {signal.evidence_quality} evidence
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : signal?.evidence_status === "emerging_evidence" ? (
        /* Distinct from "insufficient". Evidence exists and is accumulating —
           saying "insufficient" here would be both wrong and discouraging, and
           this is the state where a keeper is most likely to contribute. Still
           NO numbers: 5–11 self-reported prices can't carry a band. */
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/40">
          <p className="font-medium text-gray-900 dark:text-white">
            Evidence is building
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {signal.contributor_count} of {NUMERIC_THRESHOLD} independent contributors
            reported so far. A reported-price band appears once there are enough
            to be meaningful.
          </p>
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={signal.contributor_count}
            aria-valuemin={0}
            aria-valuemax={NUMERIC_THRESHOLD}
            aria-label="Contributors toward a reported-price band"
          >
            <div
              className="h-full rounded-full bg-slate-500 dark:bg-slate-400"
              style={{
                width: `${Math.min(100, (signal.contributor_count / NUMERIC_THRESHOLD) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : !signal || !hasRange ? (
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/40">
          <p className="font-medium text-gray-900 dark:text-white">
            Insufficient market evidence
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {signal?.limitations?.[0] ??
              "There is not enough comparable purchase data to show a responsible range."}
          </p>
          {signal && signal.contributor_count > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {signal.contributor_count} independent contributor
              {signal.contributor_count === 1 ? "" : "s"} after quality checks;{" "}
              {MIN_THRESHOLD} required before evidence is reported at all.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(Number(signal.estimated_low))}–
              {formatCurrency(Number(signal.estimated_high))}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Observed 20th–80th percentile range
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Contributors</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">
                {signal.contributor_count}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Named vendors</dt>
              <dd className="font-semibold text-gray-900 dark:text-white">
                {signal.vendor_count || "Unknown"}
              </dd>
            </div>
          </dl>
          {signal.observation_start && signal.observation_end && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reports dated {signal.observation_start} through {signal.observation_end}.
            </p>
          )}
          <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
            {signal.limitations.map((limitation) => (
              <li key={limitation}>• {limitation}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
        {submissionNotice && (
          <p className="mb-3 text-sm text-green-700 dark:text-green-300">
            {submissionNotice}
          </p>
        )}

        {!showContribution ? (
          <button
            type="button"
            onClick={() => {
              setShowContribution(true)
              setSubmissionNotice(null)
            }}
            className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
          >
            Contribute a purchase report
          </button>
        ) : !lifeStage ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            Record this animal&apos;s life stage before contributing so unlike animals are
            not compared.{" "}
            <a
              className="font-semibold underline"
              href={"/dashboard/tarantulas/" + tarantulaId + "/edit"}
            >
              Edit animal
            </a>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submitReport}>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Share a {lifeStage} purchase
              </h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the actual USD price paid. Do not enter an asking price or an
                estimate.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Price paid (USD)
                <input
                  required
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  type="number"
                />
              </label>
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Purchase date
                <input
                  required
                  max={today}
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  type="date"
                />
              </label>
            </div>
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              Vendor name (optional)
              <input
                maxLength={255}
                value={vendorName}
                onChange={(event) => setVendorName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5"
                type="checkbox"
              />
              <span>
                Include this report in anonymous market aggregates. The report remains
                individually viewable only by me; my private animal price is not read or
                submitted automatically.
              </span>
            </label>
            {submissionError && (
              <p className="text-sm text-red-700 dark:text-red-300">{submissionError}</p>
            )}
            <div className="flex gap-3">
              <button
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                type="submit"
              >
                {submitting ? "Saving…" : "Submit report"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowContribution(false)
                  setSubmissionError(null)
                }}
                className="px-2 py-2 text-sm text-gray-600 hover:underline dark:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
