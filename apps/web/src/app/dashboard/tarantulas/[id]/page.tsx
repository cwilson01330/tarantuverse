'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
  source?: string
  price_paid?: number
  notes?: string
  created_at: string
}

export default function TarantulaDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [tarantula, setTarantula] = useState<Tarantula | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchTarantula(token)
  }, [id, router])

  const fetchTarantula = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tarantula')
      }

      const data = await response.json()
      setTarantula(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${API_URL}/api/v1/tarantulas/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete tarantula')
      }

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to delete')
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (error && !tarantula) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Dashboard
            </button>
          </div>
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (!tarantula) {
    return null
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Dashboard
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold mb-2">{tarantula.common_name}</h1>
                <p className="text-xl italic text-gray-600">{tarantula.scientific_name}</p>
              </div>
              <div className="text-8xl">🕷️</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {tarantula.sex && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Sex</h3>
                  <p className="text-lg capitalize">{tarantula.sex}</p>
                </div>
              )}

              {tarantula.date_acquired && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Acquired</h3>
                  <p className="text-lg">{new Date(tarantula.date_acquired).toLocaleDateString()}</p>
                </div>
              )}

              {tarantula.source && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Source</h3>
                  <p className="text-lg capitalize">{tarantula.source.replace('_', ' ')}</p>
                </div>
              )}

              {tarantula.price_paid !== null && tarantula.price_paid !== undefined && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-1">Price Paid</h3>
                  <p className="text-lg">${tarantula.price_paid.toFixed(2)}</p>
                </div>
              )}
            </div>

            {tarantula.notes && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{tarantula.notes}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold mb-4">Care Logs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-left">
                  <h4 className="font-semibold mb-1">Feeding Logs</h4>
                  <p className="text-sm text-gray-500">0 records</p>
                </button>
                <button className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-left">
                  <h4 className="font-semibold mb-1">Molt Logs</h4>
                  <p className="text-sm text-gray-500">0 records</p>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-8 py-4 flex gap-4">
            <button
              onClick={() => router.push(`/dashboard/tarantulas/${id}/edit`)}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              Edit
            </button>

            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="px-6 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition"
              >
                Delete
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-600">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
