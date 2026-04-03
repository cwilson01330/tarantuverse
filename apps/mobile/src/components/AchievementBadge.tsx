import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface AchievementBadgeProps {
  icon: string
  name: string
  description: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  earned: boolean
  earnedAt?: string
  size?: 'small' | 'large'
}

const TIER_COLORS = {
  bronze: { hex: '#CD7F32', label: 'Bronze' },
  silver: { hex: '#C0C0C0', label: 'Silver' },
  gold: { hex: '#FFD700', label: 'Gold' },
  platinum: { hex: '#E5E4E2', label: 'Platinum' },
}

export default function AchievementBadge({
  icon,
  name,
  description,
  tier,
  earned,
  earnedAt,
  size = 'large',
}: AchievementBadgeProps) {
  const { colors, isDark } = useTheme()
  const tierColor = TIER_COLORS[tier]

  const iconSize = size === 'small' ? 24 : 48
  const containerSize = size === 'small' ? 80 : 140
  const padding = size === 'small' ? 8 : 16

  const formattedDate = earnedAt
    ? new Date(earnedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  const styles = StyleSheet.create({
    container: {
      width: containerSize,
      height: containerSize,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: earned ? tierColor.hex : colors.textTertiary,
      padding,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: earned
        ? isDark
          ? `${tierColor.hex}20`
          : `${tierColor.hex}15`
        : colors.surfaceElevated,
      opacity: earned ? 1 : 0.5,
    },
    icon: {
      fontSize: iconSize,
    },
    label: {
      marginTop: 8,
      textAlign: 'center',
    },
    labelText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    tooltip: {
      backgroundColor: isDark ? colors.background : '#1a1a1a',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    tooltipTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? colors.textPrimary : '#fff',
      marginBottom: 4,
    },
    tooltipDescription: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#ccc',
      marginBottom: 4,
    },
    tooltipDate: {
      fontSize: 11,
      color: isDark ? colors.textTertiary : '#999',
    },
  })

  return (
    <Pressable style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      {size === 'small' && (
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>
            {name}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
