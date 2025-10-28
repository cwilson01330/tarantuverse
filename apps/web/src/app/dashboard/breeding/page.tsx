"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface Pairing {
  id: string
  male_id: string
  female_id: string
  paired_date: string
  separated_date: string | null
  pairing_type: string
  outcome: string
  notes: string | null
  created_at: string
}

interface EggSac {
  id: string
  pairing_id: string
  laid_date: string
  pulled_date: string | null
  hatch_date: string | null
  spiderling_count: number | null
  viable_count: number | null
  notes: string | null
  created_at: string
}

interface Offspring {
  id: string
  egg_sac_id: string
  tarantula_id: string | null
  status: string
  status_date: string | null
  buyer_info: string | null
  price_sold: number | null
  notes: string | null
  created_at: string
}

export default function BreedingPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<'pairings' | 'egg-sacs' | 'offspring'>('pairings')
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [eggSacs, setEggSacs] = useState<EggSac[]>([])
  const [offspring, setOffspring] = useState<Offspring[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    fetchBreedingData()
  }, [router, isAuthenticated, isLoading, token])

  const fetchBreedingData = async () => {
    if (!token) return

    try {
      setLoading(true)
      setError('')

      // Fetch pairings
      const pairingsRes = await fetch(`${API_URL}/api/v1/pairings/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (pairingsRes.ok) {
        const pairingsData = await pairingsRes.json()
        setPairings(pairingsData)
      }

      // Fetch egg sacs
      const eggSacsRes = await fetch(`${API_URL}/api/v1/egg-sacs/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (eggSacsRes.ok) {
        const eggSacsData = await eggSacsRes.json()
        setEggSacs(eggSacsData)
      }

      // Fetch offspring
      const offspringRes = await fetch(`${API_URL}/api/v1/offspring/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (offspringRes.ok) {
        const offspringData = await offspringRes.json()
        setOffspring(offspringData)
      }

    } catch (err) {
      console.error('Error fetching breeding data:', err)
      setError('Failed to load breeding data')
    } finally {
      setLoading(false)
    }
  }

  if (isLoading || loading) {
    return (
      <DashboardLayout userName="Loading..." userEmail="">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-900 dark:text-white">Loading breeding data...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Breeding Records</h1>
          <p className="text-gray-600 dark:text-gray-400">Track pairings, egg sacs, and offspring</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Total Pairings</h3>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{pairings.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Egg Sacs</h3>
            <p className="text-4xl font-bold text-green-600 dark:text-green-400">{eggSacs.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Offspring</h3>
            <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{offspring.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('pairings')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'pairings'
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Pairings ({pairings.length})
            </button>
            <button
              onClick={() => setActiveTab('egg-sacs')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'egg-sacs'
                  ? 'border-green-600 text-green-600 dark:border-green-400 dark:text-green-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Egg Sacs ({eggSacs.length})
            </button>
            <button
              onClick={() => setActiveTab('offspring')}
              className={`py-2 px-4 font-medium border-b-2 transition ${
                activeTab === 'offspring'
                  ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Offspring ({offspring.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Pairings Tab */}
          {activeTab === 'pairings' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Pairing Records</h2>
                <Link
                  href="/dashboard/breeding/pairings/add"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  + New Pairing
                </Link>
              </div>
              {pairings.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No pairings recorded yet. Create your first pairing to start tracking breeding.</p>
              ) : (
                <div className="space-y-4">
                  {pairings.map((pairing) => (
                    <div key={pairing.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Paired: {new Date(pairing.paired_date).toLocaleDateString()}</p>
                          <p className="text-sm text-gray-900 dark:text-white">Type: <span className="capitalize">{pairing.pairing_type}</span></p>
                          <p className="text-sm text-gray-900 dark:text-white">Outcome: <span className="capitalize">{pairing.outcome}</span></p>
                          {pairing.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{pairing.notes}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Egg Sacs Tab */}
          {activeTab === 'egg-sacs' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Egg Sac Records</h2>
                <Link
                  href="/dashboard/breeding/egg-sacs/add"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  + New Egg Sac
                </Link>
              </div>
              {eggSacs.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No egg sacs recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {eggSacs.map((sac) => (
                    <div key={sac.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Laid: {new Date(sac.laid_date).toLocaleDateString()}</p>
                      {sac.spiderling_count && <p className="text-sm text-gray-900 dark:text-white">Count: {sac.spiderling_count} spiderlings</p>}
                      {sac.viable_count && <p className="text-sm text-gray-900 dark:text-white">Viable: {sac.viable_count}</p>}
                      {sac.hatch_date && <p className="text-sm text-gray-600 dark:text-gray-400">Hatched: {new Date(sac.hatch_date).toLocaleDateString()}</p>}
                      {sac.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{sac.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Offspring Tab */}
          {activeTab === 'offspring' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Offspring Records</h2>
                <Link
                  href="/dashboard/breeding/offspring/add"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  + New Offspring
                </Link>
              </div>
              {offspring.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No offspring recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {offspring.map((child) => (
                    <div key={child.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                      <p className="text-sm text-gray-900 dark:text-white">Status: <span className="capitalize">{child.status.replace('_', ' ')}</span></p>
                      {child.status_date && <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(child.status_date).toLocaleDateString()}</p>}
                      {child.price_sold && <p className="text-sm text-gray-900 dark:text-white">Sold for: ${child.price_sold}</p>}
                      {child.buyer_info && <p className="text-sm text-gray-600 dark:text-gray-400">Buyer: {child.buyer_info}</p>}
                      {child.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{child.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
