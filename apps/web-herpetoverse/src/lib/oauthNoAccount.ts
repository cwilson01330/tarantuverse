/**
 * Reading the API's "no account for this social sign-in" refusal
 * (sign-in fixes, Task 3).
 *
 * `/auth/oauth-login` called with `allow_create: false` answers 409 with
 * `detail = {code: "oauth_no_account", provider, email}` (an OBJECT). The other
 * 409 on that route, "account exists but is not verified", has a STRING detail
 * and must keep surfacing as an ordinary error.
 *
 * Herpetoverse web signs in with Google entirely in the page, so the email
 * stays in memory — unlike Tarantuverse web it never crosses a redirect.
 */

export function noAccountFromDetail(detail: unknown): { email: string; provider: string } | null {
  if (!detail || typeof detail !== 'object') return null
  const d = detail as { code?: unknown; email?: unknown; provider?: unknown }
  if (d.code !== 'oauth_no_account') return null
  return {
    email: typeof d.email === 'string' ? d.email : '',
    provider: typeof d.provider === 'string' ? d.provider : '',
  }
}

/** The `detail` of an ApiError body (FastAPI `{detail: ...}`), or undefined. */
export function detailOfBody(body: unknown): unknown {
  if (body && typeof body === 'object' && 'detail' in body) {
    return (body as { detail?: unknown }).detail
  }
  return undefined
}
