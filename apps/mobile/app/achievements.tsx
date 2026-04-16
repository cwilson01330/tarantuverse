import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SectionList,
} from 'react-native'
import { useAuth } from '../src/contexts/AuthContext'
import { useTheme } from '../src/contexts/ThemeContext'
import { apiClient } from '../src/services/api'
import AchievementBadge from '../src/components/AchievementBadge'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'

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

interface AchievementSection {
  title: string
  data: Achievement[]
  icon: string
}

const CATEGORY_LABELS: Record<string, string> = {
  collection: 'Collection',
  feeding: 'Feeding',
  molts: 'Molts',
  community: 'Community',
  breeding: 'Breeding',
}

const CATEGORY_ICONS: Record<string, string> = {
  collection: '🕷️',
  feeding: '🍽️',
  molts: '🔄',
  community: '🌐',
  breeding: '🥚',
}

const CATEGORY_ORDER = ['collection', 'feeding', 'molts', 'breeding', 'community']

export default function AchievementsScreen() {
  const { user } = useAuth()
  const { colors, isDark } = useTheme()
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchAchievements()
      }
    }, [user])
  )

  const fetchAchievements = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/achievements/')
      setAchievements(response.data)
    } catch (err: any) {
      setError(err.message || 'Failed to load achievements')
      console.error('Failed to fetch achievements:', err)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchAchievements()
    } finally {
      setRefreshing(false)
    }
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    progressContainer: {
      marginTop: 16,
      padding: 16,
      backgroundColor: colors.primary,
      borderRadius: 12,
    },
    progressLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
      marginBottom: 8,
    },
    progressBar: {
      height: 8,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 8,
      alignSelf: 'stretch',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#fff',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.9)',
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sectionContent: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    achievementGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    achievementItem: {
      alignItems: 'center',
      width: 88,
    },
    achievementName: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      width: 88,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 12,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      paddingHorizontal: 16,
      paddingVertical: 24,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      margin: 16,
    },
    errorText: {
      fontSize: 16,
      color: colors.error,
      marginBottom: 12,
    },
    retryButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      alignItems: 'center',
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  })

  if (loading && !achievements) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
          Loading achievements...
        </Text>
      </View>
    )
  }

  if (!achievements) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🏆 Achievements</Text>
          <Text style={styles.headerSubtitle}>
            Unlock badges as you progress
          </Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Failed to load achievements'}</Text>
          <View style={styles.retryButton}>
            <Text style={styles.retryButtonText} onPress={fetchAchievements}>
              Try Again
            </Text>
          </View>
        </View>
      </View>
    )
  }

  // Group achievements by category in order
  const sections: AchievementSection[] = CATEGORY_ORDER
    .filter((cat) => achievements.achievements.some((a) => a.category === cat))
    .map((cat) => ({
      title: `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]}`,
      icon: CATEGORY_ICONS[cat],
      data: achievements.achievements.filter((a) => a.category === cat),
    }))

  const earnedPercentage =
    achievements.total_available > 0
      ? Math.round((achievements.total_earned / achievements.total_available) * 100)
      : 0

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏆 Achievements</Text>
        <Text style={styles.headerSubtitle}>
          Unlock badges as you progress through your keeper journey
        </Text>

        {/* Overall Progress */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>
            Overall Progress
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${earnedPercentage}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {achievements.total_earned} / {achievements.total_available}
          </Text>
        </View>
      </View>

      {/* Achievement Sections */}
      {sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 32 }}>😴</Text>
          <Text style={styles.emptyText}>
            No achievements yet. Start exploring to unlock your first badge!
          </Text>
        </View>
      ) : (
        sections.map((section) => {
          const earnedInSection = section.data.filter((a) => a.earned).length
          const totalInSection = section.data.length

          return (
            <View key={section.title}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                  {earnedInSection} / {totalInSection}
                </Text>
              </View>

              <View style={styles.sectionContent}>
                <View style={styles.achievementGrid}>
                  {section.data.map((achievement) => (
                    <View key={achievement.id} style={styles.achievementItem}>
                      <AchievementBadge
                        icon={achievement.icon}
                        name={achievement.name}
                        description={achievement.description}
                        tier={achievement.tier}
                        earned={achievement.earned}
                        earnedAt={achievement.earned_at}
                        size="small"
                      />
                      <Text style={styles.achievementName} numberOfLines={2}>
                        {achievement.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )
        })
      )}

      {/* Footer */}
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
          }}
        >
          Keep exploring and unlocking new achievements!
        </Text>
      </View>
    </ScrollView>
  )
}
