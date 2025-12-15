"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/DashboardLayout"
import { useAuth } from "@/hooks/useAuth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface TarantulaValue {
  id: string
  name: string
  scientific_name: string
  value_low: number
  value_high: number
  confidence: "low" | "medium" | "high"
}

interface CollectionValue {
  total_low: number
  total_high: number
  total_tarantulas: number
  valued_tarantulas: number
  most_valuable: TarantulaValue | null
  by_species: TarantulaValue[]
  confidence: "low" | "medium" | "high"
}

export default function CollectionValuePage() {
  const router = useRouter()
  const { user, token, isLoading } = useAuth()
  const [collectionValue, setCollectionValue] = useState<CollectionValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [user, isLoading, router])

  useEffect(() => {
    const fetchCollectionValue = async () => {
      if (!token) return

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/pricing/collection/value`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error("Failed to fetch collection value")
        }

        const data = await response.json()
        setCollectionValue(data)
      } catch (err) {
        console.error("Error fetching collection value:", err)
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchCollectionValue()
    }
  }, [token])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getConfidenceBadge = (confidence: "low" | "medium" | "high") => {
    const badges = {
      low: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      medium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[confidence]}`}>
        {confidence} confidence
      </span>
    )
  }

  if (isLoading || loading) {
    return (
      <DashboardLayout
        userName={user?.name || user?.username || "Loading..."}
        userEmail={user?.email || undefined}
        userAvatar={user?.image || undefined}
      >
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout
        userName={user?.name || user?.username || "User"}
        userEmail={user?.email || undefined}
        userAvatar={user?.image || undefined}
      >
        <div className="p-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">Error: {error}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!collectionValue || collectionValue.total_tarantulas === 0) {
    return (
      <DashboardLayout
        userName={user?.name || user?.username || "User"}
        userEmail={user?.email || undefined}
        userAvatar={user?.image || undefined}
      >
        <div className="p-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Collection Value</h1>
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You don't have any tarantulas in your collection yet.
            </p>
            <button
              onClick={() => router.push("/dashboard/tarantulas/add")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Add Your First Tarantula
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const avgValue = (collectionValue.total_low + collectionValue.total_high) / 2
  const coveragePercentage = (collectionValue.valued_tarantulas / collectionValue.total_tarantulas) * 100

  return (
    <DashboardLayout
      userName={user?.name || user?.username || "User"}
      userEmail={user?.email || undefined}
      userAvatar={user?.image || undefined}
    >
      <div className="p-6 max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Collection Value</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Value */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
            <div className="text-sm font-medium opacity-90 mb-1">Estimated Value</div>
            <div className="text-3xl font-bold mb-2">{formatCurrency(avgValue)}</div>
            <div className="text-sm opacity-75">
              {formatCurrency(collectionValue.total_low)} - {formatCurrency(collectionValue.total_high)}
            </div>
            <div className="mt-3">{getConfidenceBadge(collectionValue.confidence)}</div>
          </div>

          {/* Collection Coverage */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Coverage</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {collectionValue.valued_tarantulas}/{collectionValue.total_tarantulas}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">tarantulas valued</div>
            <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${coveragePercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Most Valuable */}
          {collectionValue.most_valuable && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Most Valuable</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate">
                {collectionValue.most_valuable.name}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2 italic truncate">
                {collectionValue.most_valuable.scientific_name}
              </div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(collectionValue.most_valuable.value_high)}
              </div>
            </div>
          )}
        </div>

        {/* Valuation Notes */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
            💡 How Valuation Works
          </h3>
          <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p>• Values are estimated based on species, size, sex, and market data</p>
            <p>• Confidence levels depend on available pricing submissions and data quality</p>
            <p>
              • Adult females are typically worth more than males due to longer lifespan and breeding
              potential
            </p>
            <p>• Rare or threatened species may have higher valuations</p>
          </div>
        </div>

        {/* Individual Tarantulas Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Individual Valuations</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Species
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Low Est.
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    High Est.
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {collectionValue.by_species.map((tarantula) => (
                  <tr
                    key={tarantula.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition"
                    onClick={() => router.push(`/dashboard/tarantulas/${tarantula.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {tarantula.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                        {tarantula.scientific_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatCurrency(tarantula.value_low)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(tarantula.value_high)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getConfidenceBadge(tarantula.confidence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            ⚠️ These valuations are estimates only and should not be used for insurance or tax purposes.
          </p>
          <p className="mt-1">
            Actual market values may vary based on location, vendor, condition, and market demand.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}
