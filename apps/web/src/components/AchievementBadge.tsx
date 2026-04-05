'use client'

import { useState } from 'react'

interface AchievementBadgeProps {
  id: string
  icon: string
  name: string
  description: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  earned: boolean
  earnedAt?: string
  size?: 'small' | 'large'
}

const TIER_COLORS = {
  bronze: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-800 dark:text-yellow-300',
    border: 'border-yellow-300 dark:border-yellow-700',
    hex: '#CD7F32',
  },
  silver: {
    bg: 'bg-gray-100 dark:bg-gray-700/30',
    text: 'text-gray-800 dark:text-gray-300',
    border: 'border-gray-300 dark:border-gray-600',
    hex: '#C0C0C0',
  },
  gold: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
    hex: '#FFD700',
  },
  platinum: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
    hex: '#E5E4E2',
  },
}

export default function AchievementBadge({
  id,
  icon,
  name,
  description,
  tier,
  earned,
  earnedAt,
  size = 'large',
}: AchievementBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const colors = TIER_COLORS[tier]

  const iconSize = size === 'small' ? 'text-2xl' : 'text-5xl'
  const containerSize = size === 'small' ? 'w-20 h-20' : 'w-32 h-32'
  const padding = size === 'small' ? 'p-2' : 'p-4'

  const formattedDate = earnedAt
    ? new Date(earnedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="relative inline-block">
      <div
        className={`
          relative
          ${containerSize}
          ${padding}
          rounded-lg
          border-2
          ${colors.border}
          ${earned ? colors.bg : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'}
          flex items-center justify-center
          transition-all duration-300
          ${earned ? 'hover:shadow-lg hover:scale-105' : 'hover:opacity-80'}
          cursor-pointer
          group
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Icon */}
        <div className={`${iconSize} ${earned ? '' : 'opacity-40'} transition-opacity`}>
          {icon}
        </div>

        {/* Lock overlay for locked achievements */}
        {!earned && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
            <div className="text-xl">🔒</div>
          </div>
        )}

        {/* Glow effect for earned */}
        {earned && (
          <div
            className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 transition-opacity"
            style={{
              background: `radial-gradient(circle, ${colors.hex}40 0%, transparent 70%)`,
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-52 bg-gray-900 dark:bg-gray-950 text-white dark:text-gray-100 rounded-lg p-3 shadow-xl z-10 border border-gray-700 dark:border-gray-600">
          <div className="flex items-center gap-1.5 mb-1">
            {!earned && <span className="text-xs">🔒</span>}
            <p className="font-bold text-sm">{name}</p>
          </div>
          <p className="text-xs text-gray-300 dark:text-gray-400 mb-2">{description}</p>
          {earned && formattedDate ? (
            <p className="text-xs text-green-400">
              ✓ Earned {formattedDate}
            </p>
          ) : !earned ? (
            <p className="text-xs text-gray-500 dark:text-gray-500 italic">
              Keep going — you haven't earned this yet
            </p>
          ) : null}
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-950" />
        </div>
      )}

      {/* Label for small version */}
      {size === 'small' && (
        <div className="mt-1 text-center">
          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate w-20">
            {name}
          </p>
        </div>
      )}
    </div>
  )
}
