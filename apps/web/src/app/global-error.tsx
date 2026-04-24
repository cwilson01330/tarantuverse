'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary — invoked when an error occurs inside the root
 * layout itself (e.g. a Providers component throws). Must render its
 * own <html> + <body> since the normal layout never mounted.
 *
 * Keep this file dependency-free — no Tailwind utilities, no hooks
 * from app providers — because those may be the source of the crash.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[Tarantuverse global error]', error)
  }, [error])

  return (
    <html>
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fafafa',
          color: '#111827',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            padding: '32px',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }} aria-hidden="true">
            🕸️
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            Tarantuverse crashed
          </h1>
          <p style={{ color: '#4b5563', marginBottom: 24, lineHeight: 1.5 }}>
            A fatal error stopped the app from loading. Try again, or reload the page.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                background: '#8B4513',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign('/')}
              style={{
                padding: '10px 20px',
                background: '#fff',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
