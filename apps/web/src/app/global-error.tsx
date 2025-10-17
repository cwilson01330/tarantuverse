'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>500</h1>
          <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Global Error</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>A critical error occurred.</p>
          <button
            onClick={() => reset()}
            style={{
              color: 'white',
              backgroundColor: '#8B4513',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}