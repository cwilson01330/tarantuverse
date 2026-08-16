/**
 * Safe error-message extraction. Ported from the Tarantuverse app after the
 * same bug was found in both.
 *
 * The API returns structured error bodies, and `response.data.detail` is not
 * always a string:
 *
 *   - **422 validation** — an ARRAY of `{ loc, msg, type }`. This is the one
 *     that bites: passing it to `new Error()` produces the literal text
 *     "[object Object]", which is what a keeper saw when their password was
 *     missing a symbol. Registration became impossible for anyone who didn't
 *     already know the undocumented rules.
 *   - **402 payment gate** — an OBJECT like `{ message, limit, current_count }`.
 *   - **Most 4xx** — a plain sentence.
 *
 * A non-string in a <Text> node also risks the Hermes "Objects are not valid as
 * a React child" crash in production builds.
 *
 * Never returns an object — guaranteed safe for a <Text> node or an Alert.
 */
export function getErrorMessage(err: any, fallback = 'Something went wrong.'): string {
  const detail = err?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail;

  // Pydantic 422 — surface every failed rule, not just the first, so someone
  // fixing a password isn't sent round the loop once per missing character
  // class.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: any) =>
        typeof item?.msg === 'string'
          ? item.msg.replace(/^Value error,\s*/i, '').trim()
          : null,
      )
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message;
    }
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
