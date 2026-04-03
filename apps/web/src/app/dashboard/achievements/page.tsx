'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'
import AchievementBadge from '@/components/AchievementBadge'

interface Achievement {
  id: string
  key: string
  name: string
  description: string
  icon: string
  category: 'collection' | 'feeding' | 'molts' | 'community' | 'breeding'
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  earned: boolean
  earned_at?: string
}

interface AchievementsResponse {
  total_available: number
  total_earned: number
  achievements: Achievement[]
}

const CATEGORY_LABELS: Record<string, string> = {
  collection: '🕷️ Collection',
  feeding: '🍽️ Feeding',
  molts: '🔄 Molts',
  community: '🌐 Community',
  breeding: '🥚 Breeding',
}

const CATEGORY_ORDER = ['collection', 'feeding', 'molts', 'breeding', 'community']

export default function AchievementsPage() {
  const router = useRouter()
  const { user, token, isLoading } = useAuth()
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (token) {
      fetchAchievements()
    }
  }, [token])

  const fetchAchievements = async () => {
    try {
      setPageLoading(true)
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/achievements/`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch achievements')
      }

      const data: AchievementsResponse = await response.json()
      setAchievements(data)

      // Set first category with achievements as default
      const firstCategoryWithAchievements = CATEGORY_ORDER.find((cat) =>
        data.achievements.some((a) => a.category === cat)
      )
      setSelectedCategory(firstCategoryWithAchievements || null)
    } catch (err: any) {
      setError(err.message || 'Failed to load achievements')
    } finally {
      setPageLoading(false)
    }
  }

  if (isLoading || pageLoading) {
    return (
      <DashboardLayout userName={user?.name} userEmail={user?.email} userAvatar={user?.image}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-gray-600 dark:text-gray-400">Loading achievements...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !achievements) {
    return (
      <DashboardLayout userName={user?.name} userEmail={user?.email} userAvatar={user?.image}>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Error Loading Achievements
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
            <button
              onClick={fetchAchievements}
              className="mt-6 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-semibold"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const filteredAchievements = selectedCategory
    ? achievements.achievements.filter((a) => a.category === selectedCategory)
    : achievements.achievements

  const earnedCount = filteredAchievements.filter((a) => a.earned).length
  const totalInCategory = filteredAchievements.length

  const categories = CATEGORY_ORDER.filter((cat) =>
    achievements.achievements.some((a) => a.category === cat)
  )

  return (
    <DashboardLayout userName={user?.name} userEmail={user?.email} userAvatar={user?.image}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-3">
            <span>🏆</span> Achievements
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Unlock badges as you progress through your tarantula keeping journey.
          </p>
        </div>

        {/* Overall Progress */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 rounded-xl shadow-lg p-8 mb-8 text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Overall Progress</h2>
            <span className="text-4xl font-bold">{achievements.total_earned}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-white h-full transition-all duration-500"
                  style={{
                    width: `${(achievements.total_earned / achievements.total_available) * 100}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-lg font-semibold whitespace-nowrap">
              {achievements.total_earned} / {achievements.total_available}
            </span>
          </div>
        </div>

        {/* Category Filters */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex gap-2 min-w-min pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`
                  px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap
                  ${
                    selectedCategory === category
                      ? 'bg-primary-600 text-white shadow-lg'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }
                `}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>

        {/* Category Progress */}
        {selectedCategory && (
          <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                {CATEGORY_LABELS[selectedCategory]}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                {earnedCount} / {totalInCategory}
              </span>
            </div>
            <div className="mt-2 bg-gray-300 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary-600 h-full transition-all duration-500"
                style={{
                  width: `${totalInCategory > 0 ? (earnedCount / totalInCategory) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Achievements Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredAchievements.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <div className="text-5xl mb-4">😴</div>
              <p className="text-gray-600 dark:text-gray-400">
                No achievements in this category yet
              </p>
            </div>
          ) : (
            filteredAchievements.map((achievement) => (
              <div key={achievement.id} className="flex justify-center">
                <AchievementBadge
                  id={achievement.id}
                  icon={achievement.icon}
                  name={achievement.name}
                  description={achievement.description}
                  tier={achievement.tier}
                  earned={achievement.earned}
                  earnedAt={achievement.earned_at}
                  size="large"
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-gray-600 dark:text-gray-400">
          <p>Keep exploring and unlocking new achievements!</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
