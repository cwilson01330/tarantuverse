/**
 * Premolt card view logic (premolt v2) — see the shared half below the marker.
 * Web transport: fetch with the bearer token.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/** Answer the premolt card. Resolves to the fresh prediction; throws an Error carrying the API's `detail`. */
export async function answerPremolt(token: string, invertId: string, answer: PremoltAnswer): Promise<PremoltPrediction> {
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/v1/premolt/inverts/${invertId}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    })
  } catch {
    throw new Error('Could not save your answer. Please try again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : 'Could not save your answer. Please try again.')
  }
  return (await res.json()) as PremoltPrediction
}

// ---- shared below: keep identical in both copies ----

export type PremoltAnswer = 'yes' | 'not_yet';

/** One animal's prediction. Mirrors apps/api/app/schemas/premolt.py; the premolt v2 fields are optional so an
 *  older API response still renders. */
export interface PremoltPrediction {
  tarantula_id: string;
  tarantula_name: string;
  is_premolt_likely: boolean;
  confidence: string;
  days_since_last_molt?: number | null;
  average_molt_interval?: number | null;
  molt_interval_progress?: number | null;
  recent_refusal_streak: number;
  refusal_rate_last_30_days?: number | null;
  estimated_molt_window_days?: number | null;
  data_quality: string;
  has_matured?: boolean;
  matured_at?: string | null;
  days_since_matured?: number | null;
  last_molt_date?: string | null;
  last_feeding_date?: string | null;
  feeding_count: number;
  molt_count: number;
  invert_id?: string | null;
  taxon?: string | null;
  eligible?: boolean;
  ineligible_reason?: 'closed' | 'grazer' | 'matured' | null;
  branch?: string;
  days_fasting?: number | null;
  usual_gap_days?: number | null;
  reason?: string | null;
  keeper_answer?: 'yes' | 'not_yet' | null;
  premolt_snoozed_until?: string | null;
  paused_for_premolt?: boolean;
  /** Feeding-paused for a reason other than premolt: no answer buttons (the API refuses them). */
  paused_other?: boolean;
  show_alert?: boolean;
}

export type PremoltCardState = 'hidden' | 'matured' | 'insufficient' | 'paused' | 'snoozed' | 'alert' | 'clear';

export const PREMOLT_COPY = {
  headline: 'May be in premolt',
  yes: 'Yes, pause feeding',
  notYet: 'Not yet',
  snoozedToast: 'Hidden for 2 weeks',
  paused: 'Paused · premolt',
  clear: 'No premolt signs',
};

/** What the premolt card shows. The server decides; this only maps its answer to a state. */
export function premoltCardState(p: PremoltPrediction | null): PremoltCardState {
  if (!p) return 'hidden';
  if (p.ineligible_reason === 'closed') return 'hidden';
  if (p.has_matured || p.ineligible_reason === 'matured') return 'matured';
  if (p.eligible === false) return 'hidden';
  if (p.paused_for_premolt) return 'paused';
  const likely = !!p.is_premolt_likely;
  if (p.data_quality === 'insufficient' && !likely) return 'insufficient';
  const showAlert = p.show_alert === undefined ? likely : p.show_alert;
  if (showAlert) return 'alert';
  if (likely) return 'snoozed';
  return 'clear';
}

/** Show the "Yes, pause feeding" / "Not yet" buttons? Only on an alert card, and never while the animal is
 *  feeding-paused for another reason: "Yes" would overwrite the keeper's reason. (Callers also check the
 *  viewer's role.) */
export function premoltAnswerable(p: PremoltPrediction | null): boolean {
  return !!p && premoltCardState(p) === 'alert' && !p.paused_other;
}

/** How many animals have an alert to show. Falls back to `is_premolt_likely` for responses without `show_alert`. */
export function alertCount(predictions: PremoltPrediction[]): number {
  return predictions.filter((p) => (p.show_alert === undefined ? !!p.is_premolt_likely : p.show_alert)).length;
}
