'use client'

import { useEffect } from 'react'

export default function NotFound() {
  useEffect(() => {
    window.location.href = '/404.html'
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}