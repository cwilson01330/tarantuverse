'use client'

import { useEffect } from 'react'

export default function Error() {
  useEffect(() => {
    window.location.href = '/500.html'
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">500 - Server Error</h1>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}