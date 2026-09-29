/**
 * Only follow same-site paths after sign-in.
 *
 * `?redirect=` / `?next=` come from the URL, so anyone can craft them. Without
 * this check a link like /login?redirect=https://evil.example sends a keeper to
 * another site right after they've typed their password — a classic phishing
 * setup.
 *
 * Prefix checks alone aren't enough: browsers strip tabs and newlines from
 * URLs and treat "\" like "/", so "/\t/evil.example" or "/\evil.example"
 * become "//evil.example" — another host. So: refuse control characters and
 * backslashes outright, then resolve against a placeholder origin and accept
 * the result only if it stayed on that origin. (Security review 2026-09-29.)
 */
const PLACEHOLDER = 'https://same-origin.invalid'

export function safeRedirect(value: string | null | undefined, fallback: string): string {
  const v = (value || '').trim()
  // eslint-disable-next-line no-control-regex
  if (!v.startsWith('/') || v.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(v)) return fallback
  try {
    const u = new URL(v, PLACEHOLDER)
    if (u.origin !== PLACEHOLDER) return fallback
    const out = `${u.pathname}${u.search}${u.hash}`
    // Dot segments can normalise into a protocol-relative path ("/..//x" → "//x").
    return out.startsWith('//') ? fallback : out
  } catch {
    return fallback
  }
}
