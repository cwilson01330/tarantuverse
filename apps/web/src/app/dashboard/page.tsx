'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  username: string
  display_name: string
}

interface Tarantula {
  id: string
  common_name: string
  scientific_name: string
  sex?: string
  date_acquired?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      router.push('/login')
      return
    }

    setUser(JSON.parse(userData))
    fetchTarantulas(token)
  }, [router])

  const fetchTarantulas = async (token: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/tarantulas/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setTarantulas(data)
      }
    } catch (error) {
      console.error('Failed to fetch tarantulas:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    router.push('/')
  }

  if (!user || loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Welcome, {user.display_name || user.username}! 🕷️</h1>
            <p className="text-gray-600 mt-2">{user.email}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/dashboard/settings/profile')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              ⚙️ Settings
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">My Collection</h3>
            <p className="text-3xl font-bold text-primary-600">{tarantulas.length}</p>
            <p className="text-sm text-gray-500">tarantulas</p>
          </div>

          <div className="p-6 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Recent Feedings</h3>
            <p className="text-3xl font-bold text-primary-600">0</p>
            <p className="text-sm text-gray-500">this week</p>
          </div>

          <div className="p-6 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Upcoming Molts</h3>
            <p className="text-3xl font-bold text-primary-600">0</p>
            <p className="text-sm text-gray-500">predicted</p>
          </div>
        </div>

        {tarantulas.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Your Collection is Empty</h2>
            <p className="text-gray-600 mb-6">
              Start tracking your tarantulas by adding your first one!
            </p>
            <button
              onClick={() => router.push('/dashboard/tarantulas/add')}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              Add First Tarantula
            </button>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">My Tarantulas</h2>
              <button
                onClick={() => router.push('/dashboard/tarantulas/add')}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                + Add Tarantula
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tarantulas.map((tarantula) => (
                <div
                  key={tarantula.id}
                  onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition cursor-pointer"
                >
                  <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-6xl">
                    🕷️
                  </div>
                  <h3 className="font-bold text-lg">{tarantula.common_name}</h3>
                  <p className="text-sm italic text-gray-600">{tarantula.scientific_name}</p>
                  {tarantula.sex && (
                    <p className="text-sm text-gray-500 mt-1">{tarantula.sex}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
