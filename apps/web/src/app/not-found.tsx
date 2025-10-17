export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>404</h1>
      <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Page Not Found</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>The page you are looking for does not exist.</p>
      <a href="/dashboard" style={{
        color: '#8B4513',
        textDecoration: 'none',
        padding: '8px 16px',
        border: '1px solid #8B4513',
        borderRadius: '4px'
      }}>
        Go to Dashboard
      </a>
    </div>
  )
}