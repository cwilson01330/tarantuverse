/**
 * Achievement client.
 *
 * The badge system lives on the shared backend that powers both
 * Tarantuverse and Herpetoverse — so a keeper's earned badges follow
 * them across brands. Categories: collection, feeding, molts,
 * community, breeding. The "molts" category is tarantula-flavored on
 * the backend today; reptile-specific milestones (sheds, weight
 * targets, pairings) are queued for v1.x.
 *
 * The GET /achievements/ endpoint runs an incremental "check + award"
 * pass server-side before responding — so opening the page is enough
 * to surface anything the keeper has earned since last visit.
 */
import { apiFetch } from './apiClient'

export type AchievementCategory =
  | 'collection'
  | 'feeding'
  | 'molts'
  | 'community'
  | 'breeding'

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface Achievement {
  id: string
  key: string
  name: string
  description: string
  icon: string
  category: AchievementCategory | string
  tier: AchievementTier | string
  requirement_count: number
  /** ISO timestamp when earned, null when still unearned. */
  earned_at: string | null
}

export interface AchievementSummary {
  total_available: number
  total_earned: number
  achievements: Achievement[]
  recently_earned: Achievement[]
}

export async function getAchievements(): Promise<AchievementSummary> {
  return apiFetch<AchievementSummary>('/api/v1/achievements/')
}
