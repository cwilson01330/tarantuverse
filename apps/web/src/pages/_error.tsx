function Error({ statusCode }: { statusCode: number }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#111827',
      color: '#fff'
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold' }}>{statusCode}</h1>
      <p style={{ marginTop: '1rem', fontSize: '1.5rem' }}>
        {statusCode
          ? `An error ${statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
      <a
        href="/"
        style={{
          marginTop: '2rem',
          padding: '0.75rem 1.5rem',
          backgroundColor: '#8B4513',
          color: '#fff',
          borderRadius: '0.5rem',
          textDecoration: 'none'
        }}
      >
        Go Home
      </a>
    </div>
  )
}

Error.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error