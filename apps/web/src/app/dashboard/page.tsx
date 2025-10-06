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
  photo_url?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [tarantulas, setTarantulas] = useState<Tarantula[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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

  const filteredTarantulas = searchQuery
    ? tarantulas.filter(t =>
        t.common_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.scientific_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tarantulas

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Welcome back, {user.display_name || user.username}! 🕷️</h1>
              <p className="text-purple-100 mt-1">Manage your tarantula collection</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/community')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium"
              >
                🌐 Community
              </button>
              <button
                onClick={() => router.push('/community/board')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium"
              >
                💬 Message Board
              </button>
              <button
                onClick={() => router.push('/dashboard/settings/profile')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium"
              >
                ⚙️ Settings
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-2xl">
                🕷️
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">My Collection</p>
                <p className="text-3xl font-bold text-gray-900">{tarantulas.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-2xl">
                🍴
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Recent Feedings</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-2xl">
                📊
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Upcoming Molts</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {tarantulas.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your collection..."
                className="w-full px-6 py-4 pl-12 bg-white rounded-2xl shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
                🔍
              </div>
            </div>
          </div>
        )}

        {/* Collection Grid */}
        {tarantulas.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="text-6xl mb-4">🕷️</div>
            <h2 className="text-2xl font-bold mb-3 text-gray-900">Your Collection is Empty</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Start tracking your tarantulas by adding your first one! Keep detailed records of feedings, molts, and husbandry.
            </p>
            <button
              onClick={() => router.push('/dashboard/tarantulas/add')}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 font-semibold shadow-lg shadow-purple-500/30"
            >
              ➕ Add First Tarantula
            </button>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {searchQuery ? `Search Results (${filteredTarantulas.length})` : 'My Collection'}
              </h2>
              <button
                onClick={() => router.push('/dashboard/tarantulas/add')}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 font-semibold shadow-lg shadow-purple-500/20"
              >
                ➕ Add Tarantula
              </button>
            </div>

            {filteredTarantulas.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-gray-600">No tarantulas match your search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTarantulas.map((tarantula) => (
                  <div
                    key={tarantula.id}
                    onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                    className="group relative overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
                  >
                    {/* Image with gradient overlay */}
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-purple-100 to-blue-100">
                      {tarantula.photo_url ? (
                        <>
                          <img
                            src={tarantula.photo_url}
                            alt={tarantula.common_name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-7xl">
                          🕷️
                        </div>
                      )}

                      {/* Status badge */}
                      <div className="absolute top-3 right-3">
                        <span className="px-3 py-1 rounded-full bg-green-500/90 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                          ✓ Active
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-1">
                        {tarantula.common_name}
                      </h3>
                      <p className="text-sm italic text-gray-600 mb-3 line-clamp-1">
                        {tarantula.scientific_name}
                      </p>

                      {/* Quick stats */}
                      <div className="flex flex-wrap gap-2">
                        {tarantula.sex && (
                          <span className="px-3 py-1 rounded-lg bg-purple-100 text-purple-700 text-xs font-semibold">
                            {tarantula.sex === 'male' ? '♂️' : tarantula.sex === 'female' ? '♀️' : '⚧'} {tarantula.sex}
                          </span>
                        )}
                        {tarantula.date_acquired && (
                          <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">
                            📅 {new Date(tarantula.date_acquired).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-purple-600/0 to-purple-600/0 group-hover:from-purple-600/10 group-hover:to-transparent transition-all duration-300 pointer-events-none" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button (Mobile-friendly) */}
      {tarantulas.length > 0 && (
        <button
          onClick={() => router.push('/dashboard/tarantulas/add')}
          className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-2xl hover:scale-110 transition-transform duration-200 flex items-center justify-center text-2xl sm:text-3xl z-50 shadow-purple-500/40"
          aria-label="Add tarantula"
        >
          ➕
        </button>
      )}
    </div>
  )
}
