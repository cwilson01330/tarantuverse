"use client"

import { useEffect, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface PricingCardProps {
  tarantulaId: string
  token: string | null
}

interface PriceEstimate {
  estimated_low: number
  estimated_high: number
  confidence: "low" | "medium" | "high"
  data_points: number
  factors_used?: string[]
}

export default function PricingCard({ tarantulaId, token }: PricingCardProps) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPricing = async () => {
      if (!token) return

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/pricing/tarantulas/${tarantulaId}/value`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            setError("Pricing data not available")
          } else {
            setError("Failed to fetch pricing")
          }
          return
        }

        const data = await response.json()
        setEstimate(data)
      } catch (err) {
        console.error("Error fetching pricing:", err)
        setError("Failed to load pricing")
      } finally {
        setLoading(false)
      }
    }

    fetchPricing()
  }, [tarantulaId, token])

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
      low: {
        bg: "bg-yellow-100 dark:bg-yellow-900/30",
        text: "text-yellow-800 dark:text-yellow-200",
        icon: "⚠️",
      },
      medium: {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-800 dark:text-blue-200",
        icon: "ℹ️",
      },
      high: {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-800 dark:text-green-200",
        icon: "✅",
      },
    }

    const badge = badges[confidence]

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <span>{badge.icon}</span>
        <span>{confidence} confidence</span>
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (error || !estimate) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Estimated Value</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {error || "No pricing data available"}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const avgValue = (estimate.estimated_low + estimate.estimated_high) / 2

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-sm border border-green-200 dark:border-green-800 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">💰</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Estimated Value</h3>
        </div>
        {getConfidenceBadge(estimate.confidence)}
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-3xl font-bold text-green-700 dark:text-green-400">
            {formatCurrency(avgValue)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Range: {formatCurrency(estimate.estimated_low)} - {formatCurrency(estimate.estimated_high)}
          </div>
        </div>

        {estimate.data_points > 0 && (
          <div className="text-xs text-gray-600 dark:text-gray-400 pt-3 border-t border-green-200 dark:border-green-800">
            Based on {estimate.data_points} community submission{estimate.data_points !== 1 ? "s" : ""}
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-500 italic pt-2">
          💡 Estimate based on species, size, sex, and market data
        </div>
      </div>
    </div>
  )
}
