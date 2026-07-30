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
  // Per-animal rows only ever appear here when they have a band, so the
  // emerging state never reaches this type — but the union must still admit
  // it if the collection endpoint ever starts listing sub-threshold animals.
  evidence_quality: "limited" | "moderate"
  data_points: number
  contributor_count: number
}

interface CollectionValue {
  total_low: number | null
  total_high: number | null
  total_tarantulas: number
  valued_tarantulas: number
  most_valuable: TarantulaValue | null
  by_species: TarantulaValue[]
  evidence_status: "insufficient_evidence" | "partial_observed_range" | "observed_range"
  evidence_quality: "insufficient" | "limited" | "moderate"
  limitations: string[]
}

export default function CollectionValuePage() {
  const router = useRouter()
  const { user, token, isLoading } = useAuth()
  const [collectionValue, setCollectionValue] = useState<CollectionValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !user) router.push("/login")
  }, [user, isLoading, router])

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`${API_URL}/api/v1/pricing/market-signals/collection`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error("Market evidence could not be loaded.")
        setCollectionValue(await response.json())
      } catch (loadError) {
        console.error("Error fetching collection market signals:", loadError)
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Market evidence could not be loaded.",
        )
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const evidenceBadge = (quality: "insufficient" | "limited" | "moderate") => {
    const styles = {
      insufficient: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
      limited: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
      moderate: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
    }
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${styles[quality]}`}>
        {quality} evidence
      </span>
    )
  }

  const layoutProps = {
    userName: user?.name || user?.username || "User",
    userEmail: user?.email || undefined,
    userAvatar: user?.image || undefined,
  }

  if (isLoading || loading) {
    return (
      <DashboardLayout {...layoutProps}>
        <div className="space-y-4 p-6 animate-pulse">
          <div className="h-8 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-64 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout {...layoutProps}>
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!collectionValue || collectionValue.total_tarantulas === 0) {
    return (
      <DashboardLayout {...layoutProps}>
        <div className="p-6">
          <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
            Collection market signals
          </h1>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Add a tarantula before exploring collection market signals.
            </p>
            <button
              onClick={() => router.push("/dashboard/tarantulas/add")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Add your first tarantula
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const hasRange =
    collectionValue.total_low !== null &&
    collectionValue.total_high !== null &&
    collectionValue.valued_tarantulas > 0
  const coverage =
    (collectionValue.valued_tarantulas / collectionValue.total_tarantulas) * 100

  return (
    <DashboardLayout {...layoutProps}>
      <div className="max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Collection market signals
          </h1>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Experimental
          </span>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              Supported observed range
            </p>
            {hasRange ? (
              <>
                <p className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(Number(collectionValue.total_low))}–
                  {formatCurrency(Number(collectionValue.total_high))}
                </p>
                {evidenceBadge(collectionValue.evidence_quality)}
              </>
            ) : (
              <>
                <p className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                  Insufficient evidence
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No total is shown when none of the animals meets the evidence threshold.
                </p>
              </>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">
              Evidence coverage
            </p>
            <p className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
              {collectionValue.valued_tarantulas}/{collectionValue.total_tarantulas}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              animals with supported ranges
            </p>
            <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-2 rounded-full bg-blue-600"
                style={{ width: coverage + "%" }}
              />
            </div>
          </section>

          {collectionValue.most_valuable && (
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">
                Highest observed upper bound
              </p>
              <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                {collectionValue.most_valuable.name}
              </p>
              <p className="mb-2 truncate text-sm italic text-gray-600 dark:text-gray-400">
                {collectionValue.most_valuable.scientific_name}
              </p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(collectionValue.most_valuable.value_high)}
              </p>
            </section>
          )}
        </div>

        <section className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <h2 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
            How these signals work
          </h2>
          <div className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
            <p>• Only public USD purchase reports from the last two years are eligible.</p>
            <p>• One recent report per contributor is retained; statistical outliers are excluded.</p>
            <p>• At least five independent contributors are required for an individual range.</p>
            <p>• Life stage must be keeper-recorded and is never inferred from time owned.</p>
            <p>• Reports are self-reported prices paid, not confirmed sales or appraisals.</p>
          </div>
        </section>

        {collectionValue.by_species.length > 0 ? (
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 p-6 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Supported individual ranges
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {["Name", "Species", "Observed low", "Observed high", "Evidence"].map((heading) => (
                      <th key={heading} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {collectionValue.by_species.map((tarantula) => (
                    <tr
                      key={tarantula.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                      onClick={() => router.push("/dashboard/tarantulas/" + tarantula.id)}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{tarantula.name}</td>
                      <td className="px-6 py-4 text-sm italic text-gray-600 dark:text-gray-400">{tarantula.scientific_name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatCurrency(tarantula.value_low)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">{formatCurrency(tarantula.value_high)}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {evidenceBadge(tarantula.evidence_quality)}
                        <p className="mt-1 text-xs text-gray-500">
                          {tarantula.contributor_count} contributors
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">No supported ranges yet</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              A range will appear when enough comparable, recent reports exist.
            </p>
          </section>
        )}

        <section className="mt-8 rounded-lg border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <p className="font-medium text-slate-800 dark:text-slate-100">
            Not for insurance, tax, sale guarantees, or financial decisions.
          </p>
          <ul className="mt-2 space-y-1">
            {collectionValue.limitations?.map((limitation) => (
              <li key={limitation}>• {limitation}</li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  )
}
