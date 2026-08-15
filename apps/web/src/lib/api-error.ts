/**
 * Turn any FastAPI error body into a sentence a person can act on.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * On a 422 the API returns `detail` as an ARRAY of validation objects, not a
 * string. Roughly thirty call sites do `new Error(data.detail || '…')`, which
 * stringifies that array to the literal text **"[object Object]"**.
 *
 * On most of those screens it never fires, because an authenticated form sends
 * well-formed data. On the two that take a password from a stranger it fires
 * constantly:
 *
 *   - Registration. The password validator requires upper, lower, a digit and
 *     a symbol. Anyone typing `password123` was told "[object Object]" and had
 *     no way to discover the real rule. Reported via TikTok 2026-08-09 as
 *     "signups are blocked".
 *   - Password reset, which runs the same validator.
 *
 * USE THIS instead of reading `.detail` directly, on anything a signed-out
 * person can reach.
 */

/** Shapes the API can return in an error body. */
type ApiErrorBody = { detail?: unknown } | null | undefined;

export function readApiError(data: ApiErrorBody, fallback = 'Something went wrong. Please try again.'): string {
  const detail = data?.detail;

  // 4xx with a hand-written message — already a sentence.
  if (typeof detail === 'string' && detail.trim()) return detail;

  // 422 — an array of Pydantic validation errors.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const msg = (item as { msg?: unknown })?.msg;
        if (typeof msg !== 'string') return null;
        // Pydantic prefixes custom validator errors with "Value error, ",
        // which is noise to someone trying to pick a password.
        return msg.replace(/^Value error,\s*/i, '').trim();
      })
      .filter((m): m is string => Boolean(m));

    if (messages.length) {
      // Several rules can fail at once; join them into one readable line
      // rather than showing only the first.
      return messages.join(' ');
    }
  }

  // Some errors carry a structured object (the collection-cap 402, for one).
  // Prefer a named message over stringifying an object.
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return fallback;
}
