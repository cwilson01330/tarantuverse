/**
 * Safe error-message extraction for the mobile app.
 *
 * The API returns structured error bodies. For 402 (PAYMENT_REQUIRED) and many
 * 422 (validation) responses, `response.data.detail` is an OBJECT, not a string
 * (e.g. `{ message, feature, is_premium }` or `{ message, current_count, limit }`).
 *
 * Passing that object straight into `setError(...)` / `Alert.alert(..., detail)`
 * lands a non-string in a <Text> node, which renders as "[object Object]" and
 * can throw the Hermes "Objects are not valid as a React child" crash in prod.
 *
 * Always funnel axios errors through `getErrorMessage` before they reach a
 * <Text>/Alert. Use `isPaymentRequired` to branch to the UpgradeModal first.
 */

/** True when an axios error is an HTTP 402 (premium gate). */
export function isPaymentRequired(err: any): boolean {
  return err?.response?.status === 402;
}

/**
 * Pull a human-readable string out of any axios/Error/unknown value.
 * Never returns an object — guaranteed safe for a <Text> node.
 */
export function getErrorMessage(err: any, fallback = 'Something went wrong.'): string {
  const detail = err?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') {
    // Structured detail (402 gate, some 422s) — prefer the message field.
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }

  if (typeof err?.response?.data?.message === 'string' && err.response.data.message.trim()) {
    return err.response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;

  return fallback;
}
