/**
 * Thin fetch wrapper for authenticated Herpetoverse requests.
 *
 * Attaches `Authorization: Bearer <token>` when available, parses JSON on
 * success, and normalizes errors so callers can render a simple string.
 *
 * On 401 it clears the local session and throws `UnauthorizedError` — the
 * /app/reptiles/layout.tsx client guard listens for that signal via the
 * `hv-auth-change` event that `clearSession()` emits.
 */
'use client'

import { clearSession, getToken } from './auth'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://tarantuverse-api.onrender.com'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export class UnauthorizedError extends ApiError {
  constructor(body: unknown) {
    super('Your session has expired. Please sign in again.', 401, body)
    this.name = 'UnauthorizedError'
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Set false to skip the auth header (e.g. for public endpoints). Default true. */
  auth?: boolean
  /** Parsed as JSON and set as the body with correct Content-Type. */
  json?: unknown
}

/**
 * Fetch + auth + JSON parsing in one call.
 *
 * Usage:
 *   const snakes = await apiFetch<Snake[]>('/api/v1/snakes/')
 *   const created = await apiFetch<Snake>('/api/v1/snakes/', { method: 'POST', json: payload })
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { auth = true, json, headers, body, ...rest } = options

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  }

  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path}`

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : body,
  })

  // Try to pull a structured error body; fall back to text on non-JSON
  // (FastAPI validation errors are always JSON; SlowAPI 429 is plain text).
  const contentType = res.headers.get('content-type') || ''
  const payload: unknown = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (res.status === 401) {
    clearSession()
    throw new UnauthorizedError(payload)
  }

  if (!res.ok) {
    const msg = extractMessage(payload) || `Request failed (${res.status})`
    throw new ApiError(msg, res.status, payload)
  }

  // 204 No Content — return undefined as T
  if (res.status === 204) return undefined as T
  return payload as T
}

function extractMessage(payload: unknown): string | null {
  if (!payload) return null
  if (typeof payload === 'string') return payload
  if (typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.detail === 'string') return p.detail
  if (Array.isArray(p.detail)) {
    // FastAPI 422 validation error shape
    const first = p.detail[0] as { msg?: string; loc?: unknown[] } | undefined
    if (first?.msg) return first.msg
  }
  if (typeof p.message === 'string') return p.message
  return null
}

export { API_URL }
