'use client'

import { useAuth } from '@/hooks/useAuth'
import { useEffect, useRef, useState } from 'react'
import {
  PREMOLT_COPY,
  answerPremolt,
  premoltAnswerable,
  premoltCardState,
  type PremoltAnswer,
  type PremoltPrediction,
} from '@/lib/premoltView'

interface Props {
  invertId: string
  /** Keeper-or-owner on an open animal: shows the Yes / Not yet buttons. */
  canAnswer?: boolean
  /** Called after a "Yes" or "Not yet" is saved, so the page can refresh pause state. */
  onAnswered?: () => void | Promise<void>
}

export default function PremoltPredictionSection({ invertId, canAnswer = false, onAnswered }: Props) {
  const { token } = useAuth()
  const [prediction, setPrediction] = useState<PremoltPrediction | null>(null)
  const [loading, setLoading] = useState(true)
  // Which answer is being saved; both buttons are disabled meanwhile, but only
  // the pressed one says "Saving...".
  const [pending, setPending] = useState<PremoltAnswer | null>(null)
  const inFlight = useRef(false)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [hiddenNote, setHiddenNote] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchPrediction()
  }, [invertId, token])

  const fetchPrediction = async () => {
    if (!token) return
    try {
      const response = await fetch(`${API_URL}/api/v1/premolt/inverts/${invertId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setPrediction(data)
      }
    } catch (err) {
      console.error('Failed to fetch premolt prediction:', err)
    } finally {
      setLoading(false)
    }
  }

  const answer = async (choice: PremoltAnswer) => {
    if (!token || inFlight.current) return
    inFlight.current = true
    setPending(choice)
    setAnswerError(null)
    try {
      const fresh = await answerPremolt(token, invertId, choice)
      setPrediction(fresh)
      if (choice === 'not_yet') setHiddenNote(PREMOLT_COPY.snoozedToast)
      await onAnswered?.()
    } catch (e) {
      setAnswerError(e instanceof Error ? e.message : 'Could not save your answer. Please try again.')
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (!prediction) {
    return null
  }

  const state = premoltCardState(prediction)
  if (state === 'hidden') return null

  // Matured (ult_20260911). Checked BEFORE data quality, because maturity is a
  // fact about the animal while data quality is a fact about the logs — a
  // matured male with thin records is still matured, and "log more feedings to
  // enable predictions" is the wrong sentence for an animal with no molts left.
  //
  // Elapsed only. No countdown, no "expect X months": the API returns no such
  // figure and shouldn't, and inventing one for an animal a keeper may be
  // about to sell or loan would be worse than saying nothing.
  if (state === 'matured') {
    const since = prediction.days_since_matured
    const elapsed =
      since == null
        ? null
        : since < 31
        ? `${since} day${since === 1 ? '' : 's'} ago`
        : since < 365
        ? `${Math.round(since / 30)} months ago`
        : `${(since / 365).toFixed(1)} years ago`
    return (
      <div className="bg-gray-50 dark:bg-gray-900/20 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Matured</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {/* has_matured = a final molt was logged. Otherwise the server
              decided from the life stage (adults of taxa that stop molting,
              adult male tarantulas) — don't claim a molt nobody recorded. */}
          {!prediction.has_matured
            ? prediction.taxon === 'tarantula'
              ? "Mature males don't molt again, so premolt predictions stop here."
              : "Adults of this kind don't molt again, so premolt predictions stop here."
            : elapsed
            ? `Ultimate molt recorded ${elapsed}. No further molts expected, so premolt predictions stop here.`
            : 'Ultimate molt recorded. No further molts expected, so premolt predictions stop here.'}
        </p>
      </div>
    )
  }

  // Insufficient data state
  if (state === 'insufficient') {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-800 p-6">
        <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
          Premolt Prediction
        </h2>
        <p className="text-blue-800 dark:text-blue-200">
          Need more data — log feedings and molts to enable predictions
        </p>
      </div>
    )
  }

  const alert = state === 'alert'
  const paused = state === 'paused'
  const snoozed = state === 'snoozed'
  const attention = alert || paused

  const box = attention
    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    : snoozed
    ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700'
    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  const titleColor = attention
    ? 'text-amber-900 dark:text-amber-100'
    : snoozed
    ? 'text-gray-900 dark:text-gray-100'
    : 'text-green-900 dark:text-green-100'
  const indicator = attention
    ? 'bg-amber-100 dark:bg-amber-900/30'
    : snoozed
    ? 'bg-gray-100 dark:bg-gray-900/30'
    : 'bg-green-100 dark:bg-green-900/30'
  const statusLine = alert
    ? PREMOLT_COPY.headline
    : paused
    ? PREMOLT_COPY.paused
    : snoozed
    ? PREMOLT_COPY.snoozedToast
    : PREMOLT_COPY.clear
  const likely = !!prediction.is_premolt_likely

  return (
    <div className={`rounded-2xl shadow-sm border p-6 ${box}`}>
      <div className="flex items-start justify-between mb-4">
        <h2 className={`text-2xl font-bold flex items-center gap-2 ${titleColor}`}>
          Premolt
        </h2>
        {alert && prediction.confidence !== 'none' && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
            prediction.confidence === 'high' ? 'bg-red-600' : prediction.confidence === 'medium' ? 'bg-amber-600' : 'bg-gray-600'
          }`}>
            {prediction.confidence}
          </span>
        )}
      </div>

      {/* Status Message */}
      <div className={`mb-4 p-3 rounded-xl ${indicator}`}>
        <p className="font-semibold text-gray-900 dark:text-white">{statusLine}</p>
        {alert && prediction.reason && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{prediction.reason}</p>
        )}
      </div>

      {canAnswer && premoltAnswerable(prediction) && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => answer('yes')}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 transition"
          >
            {pending === 'yes' ? 'Saving...' : PREMOLT_COPY.yes}
          </button>
          <button
            type="button"
            onClick={() => answer('not_yet')}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition"
          >
            {pending === 'not_yet' ? 'Saving...' : PREMOLT_COPY.notYet}
          </button>
        </div>
      )}
      {answerError && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{answerError}</p>
      )}
      {/* Announces the hide to screen readers; the status line above already
          shows "Hidden for 2 weeks", so it isn't shown twice. */}
      {hiddenNote && snoozed && (
        <p role="status" className="sr-only">{hiddenNote}</p>
      )}

      {/* Key Metrics */}
      <div className="space-y-3">
        {/* Refusal Streak */}
        {prediction.recent_refusal_streak > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Feeding refusals</span>
            <span className="text-lg font-bold text-red-600 dark:text-red-400">{prediction.recent_refusal_streak}</span>
          </div>
        )}

        {/* Days Since Last Molt */}
        {prediction.days_since_last_molt != null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Days since last molt</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{prediction.days_since_last_molt}</span>
          </div>
        )}

        {/* Molt Interval Progress */}
        {prediction.molt_interval_progress != null && prediction.average_molt_interval && (
          <div className="p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Molt interval progress</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {Math.round(prediction.molt_interval_progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  likely ? 'bg-red-500' :
                  prediction.confidence === 'medium' ? 'bg-amber-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(prediction.molt_interval_progress, 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Avg interval: {prediction.average_molt_interval.toFixed(0)} days
            </p>
          </div>
        )}

        {/* Refusal Rate */}
        {prediction.refusal_rate_last_30_days != null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Refusal rate (30d)</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {prediction.refusal_rate_last_30_days.toFixed(0)}%
            </span>
          </div>
        )}

        {/* Estimated Molt Window */}
        {prediction.estimated_molt_window_days != null && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 bg-opacity-50">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated molt window</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              ~{prediction.estimated_molt_window_days} days
            </span>
          </div>
        )}
      </div>

      {/* Data Quality Note */}
      {prediction.data_quality === 'fair' && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-4 pt-4 border-t border-gray-300 dark:border-gray-700">
          Log more feedings and molts to improve prediction accuracy
        </p>
      )}
    </div>
  )
}
