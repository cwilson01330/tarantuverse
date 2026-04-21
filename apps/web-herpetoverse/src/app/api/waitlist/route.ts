import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Server-side proxy to the Tarantuverse waitlist endpoint.
 * Avoids browser CORS and hides the backend URL from the client bundle.
 */
export async function POST(request: NextRequest) {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://localhost:8000'

  let payload: { email?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        brand: 'herpetoverse',
        source: 'landing_page',
      }),
    })

    if (!res.ok) {
      // Don't leak upstream error bodies — map to a generic message.
      return NextResponse.json(
        { error: 'Signup failed. Please try again.' },
        { status: res.status >= 500 ? 503 : res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, id: data.id })
  } catch {
    return NextResponse.json(
      { error: 'Upstream service unavailable.' },
      { status: 503 }
    )
  }
}
